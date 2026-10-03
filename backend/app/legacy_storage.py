"""Legacy JSON schema reader used only on disposable migration copies.

Runtime CRUD imports ``SqliteRepository`` from ``storage.py``. This module is
retained solely to normalize historical v1-v4 files during one-time migration.
"""

from __future__ import annotations

import json
import os
from copy import deepcopy
from pathlib import Path
from threading import RLock
from typing import Any
from uuid import uuid4

from .catalog import (
    money_to_cents,
    normalize_product,
    product_changed,
    product_compatibility_view,
    product_revision,
    utc_now,
    valid_identifier,
    validate_product_collection,
)
from .services import build_estimate, clean_filename, default_quantity, infer_product_rules

SCHEMA_VERSION = 4
DEFAULT_COMPANY = {
    "business_name": "Premium Dynasty Catering",
    "business_email": "office@premiumdynasty.com",
    "business_phone": "",
    "business_address": "",
    "default_service_charge_percent": 0.0,
    "default_gratuity_percent": 0.0,
    "payment_terms": "50% deposit due upon approval. Final balance due before the event.",
    "estimate_notes": "Thank you for the opportunity to cater your event.",
}


class JsonRepository:
    """Historical normalizer; never instantiate this against active source files."""

    def __init__(self, data_dir: Path | None = None) -> None:
        configured = os.getenv("OFFICE_DATA_DIR")
        self.data_dir = Path(configured) if configured else (data_dir or Path(__file__).parents[1] / "data")
        self.estimates_dir = self.data_dir / "estimates"
        self.companies_file = self.data_dir / "companies.json"
        self.counter_file = self.data_dir / "counter.json"
        self._lock = RLock()
        self._initialize()

    @staticmethod
    def _read(path: Path, default: Any) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return default

    @staticmethod
    def _write(path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(f"{path.suffix}.tmp")
        temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        temporary.replace(path)

    @staticmethod
    def _customer_from_legacy(client: dict[str, Any]) -> dict[str, Any]:
        identifier = str(client.get("client_id") or f"customer-{uuid4().hex[:10]}")
        return {
            "customer_id": identifier,
            "customer_name": str(client.get("client_name", "")).strip() or "Unnamed customer",
            "organization": "",
            "customer_email": str(client.get("client_email", "")).strip(),
            "customer_phone": str(client.get("client_phone", "")).strip(),
            "billing_address": "",
            "internal_notes": "",
            "archived": False,
        }

    @staticmethod
    def _event_from_legacy(client: dict[str, Any]) -> dict[str, Any]:
        customer_id = str(client.get("client_id") or f"customer-{uuid4().hex[:10]}")
        suffix = customer_id.removeprefix("client-").removeprefix("customer-")
        event_type = str(client.get("event_type", "Private Event")).strip() or "Private Event"
        return {
            "event_id": f"event-{suffix}",
            "customer_id": customer_id,
            "event_name": event_type,
            "event_type": event_type,
            "event_date": str(client.get("event_date", "")).strip(),
            "venue": str(client.get("venue", "")).strip(),
            "guest_count": max(int(client.get("guest_count", 50) or 50), 1),
            "servers_count": max(int(client.get("servers_count", 0) or 0), 0),
            "servers_hours": max(int(client.get("servers_hours", 0) or 0), 0),
            "kitchen_staff_count": max(int(client.get("kitchen_staff_count", 0) or 0), 0),
            "kitchen_staff_hours": max(int(client.get("kitchen_staff_hours", 0) or 0), 0),
            "utensils_buffer": max(int(client.get("utensils_buffer", 0) or 0), 0),
            "charge_tax": bool(client.get("charge_tax", False)),
            "tax_percent": max(float(client.get("tax_percent", 0) or 0), 0),
            "default_deposit_amount": max(float(client.get("deposit_amount", 0) or 0), 0),
            "archived": False,
        }

    @staticmethod
    def _normalize_customer(customer: dict[str, Any]) -> dict[str, Any]:
        return {
            "customer_id": str(customer.get("customer_id") or f"customer-{uuid4().hex[:10]}"),
            "customer_name": str(customer.get("customer_name", "")).strip() or "Unnamed customer",
            "organization": str(customer.get("organization", "")).strip(),
            "customer_email": str(customer.get("customer_email", "")).strip(),
            "customer_phone": str(customer.get("customer_phone", "")).strip(),
            "billing_address": str(customer.get("billing_address", "")).strip(),
            "internal_notes": str(customer.get("internal_notes", "")).strip(),
            "archived": bool(customer.get("archived", False)),
        }

    @staticmethod
    def _normalize_event(event: dict[str, Any]) -> dict[str, Any]:
        event_type = str(event.get("event_type", "Private Event")).strip() or "Private Event"
        return {
            "event_id": str(event.get("event_id") or f"event-{uuid4().hex[:10]}"),
            "customer_id": str(event.get("customer_id", "")).strip(),
            "event_name": str(event.get("event_name", "")).strip() or event_type,
            "event_type": event_type,
            "event_date": str(event.get("event_date", "")).strip(),
            "venue": str(event.get("venue", "")).strip(),
            "guest_count": max(int(event.get("guest_count", 50) or 50), 1),
            "servers_count": max(int(event.get("servers_count", 0) or 0), 0),
            "servers_hours": max(int(event.get("servers_hours", 0) or 0), 0),
            "kitchen_staff_count": max(int(event.get("kitchen_staff_count", 0) or 0), 0),
            "kitchen_staff_hours": max(int(event.get("kitchen_staff_hours", 0) or 0), 0),
            "utensils_buffer": max(int(event.get("utensils_buffer", 0) or 0), 0),
            "charge_tax": bool(event.get("charge_tax", False)),
            "tax_percent": max(float(event.get("tax_percent", 0) or 0), 0),
            "default_deposit_amount": max(float(event.get("default_deposit_amount", 0) or 0), 0),
            "archived": bool(event.get("archived", False)),
        }

    def _migrate_store(self, store: dict[str, Any]) -> dict[str, Any]:
        companies: list[dict[str, Any]] = []
        for raw_company in store.get("companies", []):
            company = {**DEFAULT_COMPANY, **raw_company}
            company["archived"] = bool(company.get("archived", False))
            company_id = str(company.get("company_id") or f"company-{uuid4().hex[:10]}")
            company["company_id"] = company_id
            timestamp = utc_now()
            normalized_products: list[dict[str, Any]] = []
            seen_product_ids: set[str] = set()
            seen_skus: set[str] = set()
            for position, raw_product in enumerate(company.get("products", [])):
                values = dict(raw_product)
                identifier = valid_identifier(values.get("product_id"))
                if not identifier or identifier in seen_product_ids:
                    values["product_id"] = ""
                normalized = normalize_product(values, company_id, position=position, timestamp=timestamp)
                sku_key = normalized.get("sku", "").casefold()
                if sku_key and sku_key in seen_skus:
                    normalized["sku"] = ""
                seen_product_ids.add(normalized["product_id"])
                if normalized.get("sku"):
                    seen_skus.add(normalized["sku"].casefold())
                normalized_products.append(normalized)
            validate_product_collection(normalized_products)
            company["products"] = normalized_products
            histories = company.get("product_revisions")
            if not isinstance(histories, dict):
                histories = {}
            for product in normalized_products:
                revisions = histories.get(product["product_id"])
                if not isinstance(revisions, list):
                    revisions = []
                if not any(int(item.get("version", 0)) == product["version"] for item in revisions):
                    revisions.append(product_revision(product, "Imported legacy product", product["updated_at"]))
                histories[product["product_id"]] = revisions
            company["product_revisions"] = histories
            company["product_catalog_version"] = max(
                int(company.get("product_catalog_version", 0) or 0),
                1 if normalized_products else 0,
            )
            if "customers" not in company or "events" not in company:
                legacy_clients = company.get("clients", [])
                company["customers"] = [self._customer_from_legacy(item) for item in legacy_clients]
                company["events"] = [self._event_from_legacy(item) for item in legacy_clients]
            else:
                company["customers"] = [self._normalize_customer(item) for item in company.get("customers", [])]
                company["events"] = [self._normalize_event(item) for item in company.get("events", [])]
            company.pop("clients", None)
            companies.append(company)
        return {
            "schema_version": SCHEMA_VERSION,
            "selected_company": store.get("selected_company", companies[0]["business_name"] if companies else ""),
            "companies": companies,
        }

    @staticmethod
    def _product_for_legacy_line(company: dict[str, Any], line: dict[str, Any]) -> dict[str, Any] | None:
        if line.get("is_custom") is True:
            return None
        if "source_product_id" not in line and "product_id" not in line:
            return None
        products = company.get("products", [])
        source_id = valid_identifier(line.get("source_product_id") or line.get("product_id"))
        if source_id:
            product = next((item for item in products if item.get("product_id") == source_id), None)
            if product:
                return product
        name = str(line.get("Description") or line.get("description") or "").strip().casefold()
        category = str(line.get("Category") or line.get("category") or "").strip().casefold()
        candidates = [item for item in products if str(item.get("name", "")).strip().casefold() == name]
        categorized = [
            item for item in candidates
            if str(item.get("category", "")).strip().casefold() == category
        ]
        if len(categorized) == 1:
            return categorized[0]
        return candidates[0] if len(candidates) == 1 else None

    @staticmethod
    def _revision_for_legacy_line(
        company: dict[str, Any],
        product: dict[str, Any],
        line: dict[str, Any],
    ) -> dict[str, Any]:
        revisions = company.get("product_revisions", {}).get(product["product_id"], [])
        line_price_cents = money_to_cents(line.get("Unit Price", line.get("unit_price", 0)))
        matching = [
            item for item in revisions
            if int(item.get("snapshot", {}).get("price_cents", -1)) == line_price_cents
        ]
        if matching:
            return matching[0]
        if revisions:
            return revisions[0]
        return {"version": product.get("version", 1), "snapshot": product}

    def _migrate_estimate_record(self, payload: dict[str, Any], store: dict[str, Any]) -> dict[str, Any]:
        record = deepcopy(payload)
        companies = {str(item.get("company_id")): item for item in store.get("companies", [])}
        for revision in record.get("revisions", []):
            company = companies.get(str(revision.get("company_id")))
            if not company:
                continue
            event = revision.get("event") if isinstance(revision.get("event"), dict) else revision
            for line in revision.get("line_items", []):
                product = self._product_for_legacy_line(company, line)
                if not product:
                    if line.get("source_product_id") or line.get("product_id"):
                        line["source_product_id"] = None
                        line["source_product_version"] = None
                        line["catalog_price_cents_at_selection"] = None
                        line["selected_at"] = ""
                        line["is_custom"] = True
                    continue
                selected_revision = self._revision_for_legacy_line(company, product, line)
                snapshot = selected_revision.get("snapshot", product)
                line["source_product_id"] = product["product_id"]
                if line.get("source_product_version") is None:
                    line["source_product_version"] = int(selected_revision.get("version", product.get("version", 1)))
                if line.get("catalog_price_cents_at_selection") is None:
                    line["catalog_price_cents_at_selection"] = int(snapshot.get("price_cents", 0) or 0)
                if not line.get("selected_at"):
                    line["selected_at"] = str(revision.get("created_at", revision.get("updated_at", "")))
                if not line.get("quantity_rule"):
                    line["quantity_rule"] = product.get("quantity_rule", "manual")
                if line.get("suggested_quantity") is None:
                    line["suggested_quantity"] = default_quantity(product, event)
        return record

    def _migrate_legacy_estimate(self, payload: dict[str, Any], store: dict[str, Any]) -> dict[str, Any]:
        company = next(
            (item for item in store["companies"] if item.get("company_id") == payload.get("company_id")),
            store["companies"][0],
        )
        legacy_client_id = str(payload.get("client_id", ""))
        customer = next(
            (item for item in company.get("customers", []) if item.get("customer_id") == legacy_client_id),
            company.get("customers", [{}])[0],
        )
        event = next(
            (item for item in company.get("events", []) if item.get("customer_id") == customer.get("customer_id")),
            company.get("events", [{}])[0],
        )
        drafts = []
        has_service_item = False
        has_staff_item = False
        for line in payload.get("line_items", []):
            rules = infer_product_rules(line)
            has_service_item = has_service_item or rules["charge_group"] == "service"
            has_staff_item = has_staff_item or rules["charge_group"] == "staff"
            product = self._product_for_legacy_line(company, line)
            drafts.append(
                {
                    "line_id": f"line-{uuid4().hex[:12]}",
                    "source_product_id": product.get("product_id") if product else None,
                    **rules,
                    "Qty": line.get("Qty", 0),
                    "is_custom": not bool(product),
                    "override_reason": "",
                }
            )
        revision = build_estimate(
            company=company,
            customer=customer,
            event=event,
            draft_items=drafts,
            estimate_number=str(payload.get("estimate_number", "EST-IMPORT")),
            revision_number=1,
            notes=str(payload.get("notes", "")),
            revision_reason="Imported legacy estimate",
            service_charge_percent=0 if has_service_item else float(payload.get("service_charge_percent", 0) or 0),
            gratuity_percent=0 if has_staff_item else float(payload.get("gratuity_percent", 0) or 0),
            deposit_amount=float(payload.get("deposit", 0) or 0),
        )
        revision["created_at"] = payload.get("created_at", revision["created_at"])
        revision["updated_at"] = payload.get("updated_at", revision["updated_at"])
        revision["issue_date"] = payload.get("issue_date", revision["issue_date"])
        return {
            "estimate_number": revision["estimate_number"],
            "archived": False,
            "current_revision": 1,
            "revisions": [revision],
        }

    def _initialize(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.estimates_dir.mkdir(parents=True, exist_ok=True)
        if not self.companies_file.exists():
            company = {
                **DEFAULT_COMPANY,
                "company_id": "company-1",
                "products": [],
                "product_revisions": {},
                "product_catalog_version": 0,
                "customers": [],
                "events": [],
                "archived": False,
            }
            self._write(self.companies_file, {"schema_version": SCHEMA_VERSION, "selected_company": company["business_name"], "companies": [company]})
        store = self._migrate_store(self._read(self.companies_file, {"selected_company": "", "companies": []}))
        self._write(self.companies_file, store)
        for path in self.estimates_dir.glob("*.json"):
            payload = self._read(path, {})
            if payload and not isinstance(payload.get("revisions"), list):
                self._write(path, self._migrate_legacy_estimate(payload, store))
            elif payload:
                migrated = self._migrate_estimate_record(payload, store)
                if migrated != payload:
                    self._write(path, migrated)
        if not self.counter_file.exists():
            self._write(self.counter_file, {"next_number": 1001})

    def store(self) -> dict[str, Any]:
        with self._lock:
            return self._read(self.companies_file, {"schema_version": SCHEMA_VERSION, "selected_company": "", "companies": []})

    def bootstrap_store(self) -> dict[str, Any]:
        """Return a frontend-safe store without product audit history or canonical-field mirrors."""
        store = deepcopy(self.store())
        for company in store.get("companies", []):
            company.pop("product_revisions", None)
            company["products"] = [product_compatibility_view(item) for item in company.get("products", [])]
        return store

    def _save_store(self, store: dict[str, Any]) -> dict[str, Any]:
        self._write(self.companies_file, store)
        return store

    def company(self, company_id: str) -> dict[str, Any] | None:
        return next((company for company in self.store()["companies"] if str(company.get("company_id")) == company_id), None)

    def create_company(self, values: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            store = self.store()
            normalized = values["business_name"].strip().casefold()
            if any(company.get("business_name", "").strip().casefold() == normalized for company in store["companies"]):
                raise ValueError("A company with that name already exists")
            company = {
                **DEFAULT_COMPANY,
                **values,
                "company_id": f"company-{uuid4().hex[:10]}",
                "products": [],
                "product_revisions": {},
                "product_catalog_version": 0,
                "customers": [],
                "events": [],
                "archived": False,
            }
            store["companies"].append(company)
            store["selected_company"] = company["business_name"]
            self._save_store(store)
            return company

    def update_company(self, company_id: str, values: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            store = self.store()
            company = next((item for item in store["companies"] if item.get("company_id") == company_id), None)
            if not company:
                raise KeyError(company_id)
            normalized = values["business_name"].strip().casefold()
            if any(item.get("company_id") != company_id and item.get("business_name", "").strip().casefold() == normalized for item in store["companies"]):
                raise ValueError("A company with that name already exists")
            old_name = company["business_name"]
            company.update(values)
            if store.get("selected_company") == old_name:
                store["selected_company"] = company["business_name"]
            self._save_store(store)
            return company

    def delete_company(self, company_id: str) -> None:
        with self._lock:
            store = self.store()
            company = next((item for item in store["companies"] if item.get("company_id") == company_id), None)
            if not company:
                raise KeyError(company_id)
            company["archived"] = True
            active = [item for item in store["companies"] if not item.get("archived")]
            store["selected_company"] = active[0]["business_name"] if active else ""
            self._save_store(store)

    @staticmethod
    def _company_from_store(store: dict[str, Any], company_id: str) -> dict[str, Any]:
        company = next((item for item in store["companies"] if item.get("company_id") == company_id), None)
        if not company:
            raise KeyError(company_id)
        return company

    @staticmethod
    def _append_product_revision(company: dict[str, Any], product: dict[str, Any], reason: str) -> None:
        histories = company.setdefault("product_revisions", {})
        histories.setdefault(product["product_id"], []).append(product_revision(product, reason))

    def list_products(self, company_id: str, include_archived: bool = False) -> list[dict[str, Any]]:
        company = self.company(company_id)
        if not company:
            raise KeyError(company_id)
        products = company.get("products", [])
        if not include_archived:
            products = [item for item in products if item.get("status") != "archived"]
        return sorted(deepcopy(products), key=lambda item: (int(item.get("sort_order", 0)), item.get("name", "").casefold()))

    def product(self, company_id: str, product_id: str) -> dict[str, Any] | None:
        company = self.company(company_id)
        if not company:
            raise KeyError(company_id)
        product = next((item for item in company.get("products", []) if item.get("product_id") == product_id), None)
        return deepcopy(product) if product else None

    def create_product(self, company_id: str, values: dict[str, Any], change_reason: str) -> dict[str, Any]:
        with self._lock:
            store = self.store()
            company = self._company_from_store(store, company_id)
            now = utc_now()
            position = values.get("sort_order")
            if position is None:
                position = max((int(item.get("sort_order", 0)) for item in company.get("products", [])), default=-1) + 1
            product = normalize_product(
                {**values, "product_id": "", "version": 1, "created_at": now, "updated_at": now, "status": "active"},
                company_id,
                position=int(position),
                timestamp=now,
            )
            products = [*company.get("products", []), product]
            validate_product_collection(products)
            company["products"] = products
            company["product_catalog_version"] = int(company.get("product_catalog_version", 0) or 0) + 1
            self._append_product_revision(company, product, change_reason or "Created product")
            self._save_store(store)
            return deepcopy(product)

    def update_product(
        self,
        company_id: str,
        product_id: str,
        values: dict[str, Any],
        expected_version: int,
        change_reason: str,
    ) -> dict[str, Any]:
        with self._lock:
            store = self.store()
            company = self._company_from_store(store, company_id)
            products = company.get("products", [])
            index = next((index for index, item in enumerate(products) if item.get("product_id") == product_id), None)
            if index is None:
                raise KeyError(product_id)
            current = products[index]
            current_version = int(current.get("version", 1))
            if expected_version != current_version:
                raise ValueError(f"Product changed since version {expected_version}; current version is {current_version}")
            now = utc_now()
            candidate = normalize_product(values, company_id, existing=current, timestamp=now)
            candidate["product_id"] = current["product_id"]
            candidate["company_id"] = company_id
            candidate["created_at"] = current["created_at"]
            if not product_changed(current, candidate):
                return deepcopy(current)
            candidate["version"] = current_version + 1
            candidate["updated_at"] = now
            updated_products = [*products]
            updated_products[index] = candidate
            validate_product_collection(updated_products)
            company["products"] = updated_products
            company["product_catalog_version"] = int(company.get("product_catalog_version", 0) or 0) + 1
            self._append_product_revision(company, candidate, change_reason)
            self._save_store(store)
            return deepcopy(candidate)

    def set_product_status(
        self,
        company_id: str,
        product_id: str,
        status: str,
        expected_version: int,
        change_reason: str,
    ) -> dict[str, Any]:
        product = self.product(company_id, product_id)
        if not product:
            raise KeyError(product_id)
        if product.get("status") == status:
            if int(product.get("version", 1)) != expected_version:
                raise ValueError(
                    f"Product changed since version {expected_version}; current version is {product.get('version', 1)}"
                )
            return product
        return self.update_product(
            company_id,
            product_id,
            {"status": status},
            expected_version,
            change_reason,
        )

    def product_revisions(self, company_id: str, product_id: str) -> list[dict[str, Any]]:
        company = self.company(company_id)
        if not company:
            raise KeyError(company_id)
        if not any(item.get("product_id") == product_id for item in company.get("products", [])):
            raise KeyError(product_id)
        revisions = company.get("product_revisions", {}).get(product_id, [])
        return list(reversed(deepcopy(revisions)))

    def product_usage(self, company_id: str, product_id: str) -> dict[str, Any]:
        if not self.product(company_id, product_id):
            raise KeyError(product_id)
        estimate_numbers: set[str] = set()
        revision_count = 0
        line_count = 0
        references: list[dict[str, Any]] = []
        for path in self.estimates_dir.glob("*.json"):
            record = self._read(path, {})
            for revision in record.get("revisions", []):
                if str(revision.get("company_id")) != company_id:
                    continue
                matching_lines = [
                    item for item in revision.get("line_items", [])
                    if str(item.get("source_product_id") or item.get("product_id") or "") == product_id
                ]
                if not matching_lines:
                    continue
                number = str(revision.get("estimate_number", record.get("estimate_number", path.stem)))
                estimate_numbers.add(number)
                revision_count += 1
                line_count += len(matching_lines)
                references.append(
                    {
                        "estimate_number": number,
                        "revision_number": int(revision.get("revision_number", 0) or 0),
                        "customer_name": revision.get("customer_name", ""),
                        "event_name": revision.get("event_name", ""),
                        "used_at": revision.get("updated_at", revision.get("created_at", "")),
                        "line_count": len(matching_lines),
                    }
                )
        references.sort(key=lambda item: item["used_at"], reverse=True)
        return {
            "product_id": product_id,
            "estimate_count": len(estimate_numbers),
            "revision_count": revision_count,
            "line_count": line_count,
            "latest_used_at": references[0]["used_at"] if references else None,
            "references": references[:25],
        }

    def replace_products(
        self,
        company_id: str,
        products: list[dict[str, Any]],
        expected_catalog_version: int | None = None,
    ) -> list[dict[str, Any]]:
        """Backward-compatible batch upsert; omitted products are never deleted."""
        with self._lock:
            store = self.store()
            company = self._company_from_store(store, company_id)
            catalog_version = int(company.get("product_catalog_version", 0) or 0)
            if expected_catalog_version is not None and expected_catalog_version != catalog_version:
                raise ValueError(
                    f"Catalog changed since version {expected_catalog_version}; current version is {catalog_version}"
                )
            existing_products = company.get("products", [])
            existing_by_id = {item["product_id"]: item for item in existing_products}
            request_ids = [valid_identifier(item.get("product_id")) for item in products]
            nonempty_request_ids = [identifier for identifier in request_ids if identifier]
            if len(nonempty_request_ids) != len(set(nonempty_request_ids)):
                raise ValueError("The catalog payload contains duplicate product ids")
            full_catalog_sync = set(existing_by_id).issubset(nonempty_request_ids)
            next_sort_order = max(
                (int(item.get("sort_order", 0)) for item in existing_products),
                default=-1,
            ) + 1

            now = utc_now()
            updated_by_id: dict[str, dict[str, Any]] = {}
            changed: list[dict[str, Any]] = []
            for position, raw in enumerate(products):
                requested_id = valid_identifier(raw.get("product_id"))
                current = existing_by_id.get(requested_id)
                candidate_position = position if full_catalog_sync else (
                    int(current.get("sort_order", 0)) if current else next_sort_order
                )
                if not current:
                    next_sort_order += 1
                candidate = normalize_product(
                    raw,
                    company_id,
                    existing=current,
                    position=candidate_position,
                    timestamp=now,
                )
                if current:
                    candidate["product_id"] = current["product_id"]
                    candidate["created_at"] = current["created_at"]
                    candidate["version"] = int(current.get("version", 1))
                    if product_changed(current, candidate):
                        candidate["version"] += 1
                        candidate["updated_at"] = now
                        changed.append(candidate)
                    else:
                        candidate = current
                else:
                    candidate["version"] = 1
                    candidate["created_at"] = now
                    candidate["updated_at"] = now
                    changed.append(candidate)
                updated_by_id[candidate["product_id"]] = candidate

            merged = list(updated_by_id.values())
            merged.extend(item for item in existing_products if item["product_id"] not in updated_by_id)
            validate_product_collection(merged)
            if changed:
                company["products"] = merged
                company["product_catalog_version"] = catalog_version + 1
                for product in changed:
                    self._append_product_revision(company, product, "Updated through legacy catalog sync")
            else:
                company["products"] = merged
            self._save_store(store)
            return [product_compatibility_view(item) for item in merged]

    def replace_customers(self, company_id: str, customers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        with self._lock:
            store = self.store()
            company = next((item for item in store["companies"] if item.get("company_id") == company_id), None)
            if not company:
                raise KeyError(company_id)
            normalized = [self._normalize_customer(item) for item in customers if str(item.get("customer_name", "")).strip()]
            company["customers"] = normalized
            self._save_store(store)
            return normalized

    def replace_events(self, company_id: str, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        with self._lock:
            store = self.store()
            company = next((item for item in store["companies"] if item.get("company_id") == company_id), None)
            if not company:
                raise KeyError(company_id)
            customer_ids = {item["customer_id"] for item in company.get("customers", [])}
            normalized = [self._normalize_event(item) for item in events if str(item.get("customer_id", "")) in customer_ids]
            company["events"] = normalized
            self._save_store(store)
            return normalized

    def next_estimate_number(self) -> str:
        with self._lock:
            counter = self._read(self.counter_file, {"next_number": 1001})
            number = int(counter.get("next_number", 1001))
            self._write(self.counter_file, {"next_number": number + 1})
            return f"EST-{number}"

    def estimate_record(self, estimate_number: str) -> dict[str, Any] | None:
        return self._read(self.estimates_dir / f"{clean_filename(estimate_number)}.json", None)

    def estimate(self, estimate_number: str, revision_number: int | None = None) -> dict[str, Any] | None:
        record = self.estimate_record(estimate_number)
        if not record:
            return None
        target = revision_number or int(record.get("current_revision", 1))
        return next((item for item in record.get("revisions", []) if int(item.get("revision_number", 0)) == target), None)

    def list_revisions(self, estimate_number: str) -> list[dict[str, Any]]:
        record = self.estimate_record(estimate_number)
        if not record:
            raise KeyError(estimate_number)
        return [
            {
                "revision_number": item.get("revision_number", 0),
                "revision_id": item.get("revision_id", ""),
                "revision_reason": item.get("revision_reason", ""),
                "updated_at": item.get("updated_at", ""),
                "total": item.get("total", 0),
            }
            for item in reversed(record.get("revisions", []))
        ]

    def save_estimate(self, payload: dict[str, Any], base_revision: int | None = None) -> dict[str, Any]:
        with self._lock:
            path = self.estimates_dir / f"{clean_filename(payload['estimate_number'])}.json"
            record = self._read(path, None)
            if record:
                current_revision = int(record.get("current_revision", 0))
                if base_revision is not None and base_revision != current_revision:
                    raise ValueError(f"Estimate changed since revision {base_revision}; reload before saving")
                next_revision = current_revision + 1
            else:
                record = {"estimate_number": payload["estimate_number"], "archived": False, "current_revision": 0, "revisions": []}
                next_revision = 1
            payload["revision_number"] = next_revision
            record["current_revision"] = next_revision
            record["archived"] = False
            record["revisions"].append(payload)
            self._write(path, record)
            return payload

    def list_estimates(
        self,
        company_id: str | None = None,
        customer_id: str | None = None,
        event_id: str | None = None,
        include_archived: bool = False,
    ) -> list[dict[str, Any]]:
        summaries = []
        for path in sorted(self.estimates_dir.glob("*.json"), reverse=True):
            record = self._read(path, {})
            if not record or (record.get("archived") and not include_archived):
                continue
            revision = self.estimate(str(record.get("estimate_number", path.stem)))
            if not revision:
                continue
            if company_id and str(revision.get("company_id")) != company_id:
                continue
            if customer_id and str(revision.get("customer_id")) != customer_id:
                continue
            if event_id and str(revision.get("event_id")) != event_id:
                continue
            summaries.append(
                {
                    "file": path.name,
                    "estimate_number": revision.get("estimate_number", path.stem),
                    "revision_number": revision.get("revision_number", 1),
                    "company_id": revision.get("company_id", ""),
                    "customer_id": revision.get("customer_id", ""),
                    "customer_name": revision.get("customer_name", ""),
                    "event_id": revision.get("event_id", ""),
                    "event_name": revision.get("event_name", revision.get("event_type", "Event")),
                    "event_date": revision.get("event_date", ""),
                    "total": revision.get("total", 0),
                    "updated_at": revision.get("updated_at", ""),
                    "archived": bool(record.get("archived", False)),
                }
            )
        return summaries

    def archive_estimate(self, estimate_number: str) -> None:
        with self._lock:
            path = self.estimates_dir / f"{clean_filename(estimate_number)}.json"
            record = self._read(path, None)
            if not record:
                raise KeyError(estimate_number)
            record["archived"] = True
            self._write(path, record)

    def delete_estimate(self, estimate_number: str) -> None:
        self.archive_estimate(estimate_number)
