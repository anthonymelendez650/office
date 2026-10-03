from __future__ import annotations

import hashlib
from copy import deepcopy
from typing import Any

from .catalog import PRODUCT_FIELDS, normalize_product, utc_now, valid_identifier
from .legacy_storage import DEFAULT_COMPANY
from .services import clean_filename
from .storage import MutationContext, SqliteRepository, _bool, _from_json, _json

COMPANY_FIELDS = (
    "business_name",
    "business_email",
    "business_phone",
    "business_address",
    "default_service_charge_percent",
    "default_gratuity_percent",
    "payment_terms",
    "estimate_notes",
    "archived",
)
CUSTOMER_FIELDS = (
    "customer_name",
    "organization",
    "customer_email",
    "customer_phone",
    "billing_address",
    "internal_notes",
    "archived",
)
EVENT_FIELDS = (
    "customer_id",
    "event_name",
    "event_type",
    "event_date",
    "venue",
    "guest_count",
    "servers_count",
    "servers_hours",
    "kitchen_staff_count",
    "kitchen_staff_hours",
    "utensils_buffer",
    "charge_tax",
    "tax_percent",
    "default_deposit_amount",
    "archived",
)


def _stable_identifier(prefix: str, *parts: Any) -> str:
    source = "\n".join(str(part or "") for part in parts)
    return f"{prefix}-{hashlib.sha256(source.encode('utf-8')).hexdigest()[:14]}"


def _same(left: dict[str, Any], right: dict[str, Any], fields: tuple[str, ...]) -> bool:
    return all(left.get(field) == right.get(field) for field in fields)


def _bounded_float(value: Any, default: float = 0.0, maximum: float | None = None) -> float:
    try:
        result = max(float(value or default), 0.0)
    except (TypeError, ValueError):
        result = default
    return min(result, maximum) if maximum is not None else result


def _bounded_int(value: Any, default: int = 0, minimum: int = 0) -> int:
    try:
        return max(int(value if value is not None else default), minimum)
    except (TypeError, ValueError):
        return max(default, minimum)


class BrowserDataImporter:
    """Preview and explicitly reconcile data left by the browser-only demo store."""

    def __init__(self, repository: SqliteRepository) -> None:
        self.repository = repository

    @staticmethod
    def _normalize_state(state: dict[str, Any]) -> dict[str, Any]:
        raw_store = state.get("store", state)
        if not isinstance(raw_store, dict):
            raise ValueError("Browser state must contain a store object")
        raw_companies = raw_store.get("companies", [])
        if not isinstance(raw_companies, list):
            raise ValueError("Browser store companies must be an array")

        now = utc_now()
        companies: list[dict[str, Any]] = []
        seen_company_ids: set[str] = set()
        seen_entity_ids: dict[str, set[str]] = {"product": set(), "customer": set(), "event": set()}
        for company_position, raw_company in enumerate(raw_companies):
            if not isinstance(raw_company, dict):
                raise ValueError("Every browser company must be an object")
            company_id = valid_identifier(raw_company.get("company_id")) or _stable_identifier(
                "browser-company", company_position, raw_company.get("business_name")
            )
            if company_id in seen_company_ids:
                raise ValueError(f"Duplicate browser company id: {company_id}")
            seen_company_ids.add(company_id)
            company = {
                **DEFAULT_COMPANY,
                "company_id": company_id,
                "business_name": str(raw_company.get("business_name") or "Recovered browser company").strip(),
                "business_email": str(raw_company.get("business_email") or "").strip(),
                "business_phone": str(raw_company.get("business_phone") or "").strip(),
                "business_address": str(raw_company.get("business_address") or "").strip(),
                "default_service_charge_percent": _bounded_float(
                    raw_company.get("default_service_charge_percent"), maximum=100
                ),
                "default_gratuity_percent": _bounded_float(
                    raw_company.get("default_gratuity_percent"), maximum=100
                ),
                "payment_terms": str(raw_company.get("payment_terms") or "").strip(),
                "estimate_notes": str(raw_company.get("estimate_notes") or "").strip(),
                "product_catalog_version": _bounded_int(raw_company.get("product_catalog_version")),
                "archived": bool(raw_company.get("archived", False)),
                "version": _bounded_int(raw_company.get("version"), 1, 1),
                "created_at": str(raw_company.get("created_at") or now),
                "updated_at": str(raw_company.get("updated_at") or now),
            }

            products: list[dict[str, Any]] = []
            for position, raw_product in enumerate(raw_company.get("products", [])):
                if not isinstance(raw_product, dict):
                    raise ValueError("Every browser product must be an object")
                product_id = valid_identifier(raw_product.get("product_id")) or _stable_identifier(
                    "browser-product", company_id, position, raw_product.get("Description", raw_product.get("name"))
                )
                if product_id in seen_entity_ids["product"]:
                    raise ValueError(f"Duplicate browser product id: {product_id}")
                seen_entity_ids["product"].add(product_id)
                products.append(
                    normalize_product(
                        {**raw_product, "product_id": product_id},
                        company_id,
                        position=position,
                        timestamp=now,
                    )
                )

            customers: list[dict[str, Any]] = []
            customer_ids: set[str] = set()
            for position, raw_customer in enumerate(raw_company.get("customers", [])):
                if not isinstance(raw_customer, dict):
                    raise ValueError("Every browser customer must be an object")
                customer_id = valid_identifier(raw_customer.get("customer_id")) or _stable_identifier(
                    "browser-customer", company_id, position, raw_customer.get("customer_name")
                )
                if customer_id in seen_entity_ids["customer"]:
                    raise ValueError(f"Duplicate browser customer id: {customer_id}")
                seen_entity_ids["customer"].add(customer_id)
                customer_ids.add(customer_id)
                customers.append(
                    {
                        "customer_id": customer_id,
                        "company_id": company_id,
                        "customer_name": str(raw_customer.get("customer_name") or "Unnamed customer").strip(),
                        "organization": str(raw_customer.get("organization") or "").strip(),
                        "customer_email": str(raw_customer.get("customer_email") or "").strip(),
                        "customer_phone": str(raw_customer.get("customer_phone") or "").strip(),
                        "billing_address": str(raw_customer.get("billing_address") or "").strip(),
                        "internal_notes": str(raw_customer.get("internal_notes") or "").strip(),
                        "archived": bool(raw_customer.get("archived", False)),
                        "version": _bounded_int(raw_customer.get("version"), 1, 1),
                        "created_at": str(raw_customer.get("created_at") or now),
                        "updated_at": str(raw_customer.get("updated_at") or now),
                    }
                )

            events: list[dict[str, Any]] = []
            for position, raw_event in enumerate(raw_company.get("events", [])):
                if not isinstance(raw_event, dict):
                    raise ValueError("Every browser event must be an object")
                event_id = valid_identifier(raw_event.get("event_id")) or _stable_identifier(
                    "browser-event", company_id, position, raw_event.get("event_name")
                )
                if event_id in seen_entity_ids["event"]:
                    raise ValueError(f"Duplicate browser event id: {event_id}")
                seen_entity_ids["event"].add(event_id)
                customer_id = valid_identifier(raw_event.get("customer_id"))
                if customer_id not in customer_ids:
                    raise ValueError(f"Browser event {event_id} references an unknown customer")
                event_type = str(raw_event.get("event_type") or "Private Event").strip()
                events.append(
                    {
                        "event_id": event_id,
                        "company_id": company_id,
                        "customer_id": customer_id,
                        "event_name": str(raw_event.get("event_name") or event_type).strip(),
                        "event_type": event_type,
                        "event_date": str(raw_event.get("event_date") or "").strip(),
                        "venue": str(raw_event.get("venue") or "").strip(),
                        "guest_count": _bounded_int(raw_event.get("guest_count"), 50, 1),
                        "servers_count": _bounded_int(raw_event.get("servers_count")),
                        "servers_hours": _bounded_int(raw_event.get("servers_hours")),
                        "kitchen_staff_count": _bounded_int(raw_event.get("kitchen_staff_count")),
                        "kitchen_staff_hours": _bounded_int(raw_event.get("kitchen_staff_hours")),
                        "utensils_buffer": _bounded_int(raw_event.get("utensils_buffer")),
                        "charge_tax": bool(raw_event.get("charge_tax", False)),
                        "tax_percent": _bounded_float(raw_event.get("tax_percent"), maximum=100),
                        "default_deposit_amount": _bounded_float(raw_event.get("default_deposit_amount")),
                        "archived": bool(raw_event.get("archived", False)),
                        "version": _bounded_int(raw_event.get("version"), 1, 1),
                        "created_at": str(raw_event.get("created_at") or now),
                        "updated_at": str(raw_event.get("updated_at") or now),
                    }
                )
            company.update(products=products, customers=customers, events=events)
            companies.append(company)

        raw_estimates = state.get("estimates", [])
        if not isinstance(raw_estimates, list):
            raise ValueError("Browser estimates must be an array")
        estimates: list[dict[str, Any]] = []
        seen_estimates: set[str] = set()
        for raw_record in raw_estimates:
            if not isinstance(raw_record, dict):
                raise ValueError("Every browser estimate must be an object")
            raw_revisions = raw_record.get("revisions")
            revisions = raw_revisions if isinstance(raw_revisions, list) else [raw_record]
            number = clean_filename(str(raw_record.get("estimate_number") or (revisions[0] if revisions else {}).get("estimate_number") or ""))
            if not number:
                raise ValueError("Every browser estimate needs an estimate number")
            if number in seen_estimates:
                raise ValueError(f"Duplicate browser estimate number: {number}")
            seen_estimates.add(number)
            normalized_revisions: list[dict[str, Any]] = []
            revision_numbers: set[int] = set()
            for position, raw_revision in enumerate(revisions, start=1):
                if not isinstance(raw_revision, dict):
                    raise ValueError(f"Every revision for {number} must be an object")
                revision = deepcopy(raw_revision)
                revision_number = _bounded_int(revision.get("revision_number"), position, 1)
                if revision_number in revision_numbers:
                    raise ValueError(f"Duplicate revision {revision_number} for {number}")
                revision_numbers.add(revision_number)
                revision.update(
                    estimate_number=number,
                    revision_number=revision_number,
                    revision_id=str(
                        revision.get("revision_id")
                        or _stable_identifier("browser-revision", number, revision_number)
                    ),
                    revision_reason=str(revision.get("revision_reason") or "Imported browser revision"),
                    updated_at=str(revision.get("updated_at") or revision.get("created_at") or now),
                )
                normalized_revisions.append(revision)
            normalized_revisions.sort(key=lambda item: int(item["revision_number"]))
            current_revision = _bounded_int(
                raw_record.get("current_revision"),
                int(normalized_revisions[-1]["revision_number"]) if normalized_revisions else 0,
            )
            if not normalized_revisions or current_revision not in revision_numbers:
                raise ValueError(f"Browser estimate {number} has an invalid current revision")
            estimates.append(
                {
                    "estimate_number": number,
                    "archived": bool(raw_record.get("archived", False)),
                    "current_revision": current_revision,
                    "revisions": normalized_revisions,
                }
            )
        return {
            "selected_company": str(raw_store.get("selected_company") or ""),
            "companies": companies,
            "estimates": estimates,
            "next_number": _bounded_int(state.get("nextNumber", state.get("next_number", 1001)), 1001, 1),
        }

    def _preview_normalized(self, normalized: dict[str, Any]) -> dict[str, Any]:
        source = {
            "companies": len(normalized["companies"]),
            "products": sum(len(item["products"]) for item in normalized["companies"]),
            "customers": sum(len(item["customers"]) for item in normalized["companies"]),
            "events": sum(len(item["events"]) for item in normalized["companies"]),
            "estimates": len(normalized["estimates"]),
            "revisions": sum(len(item["revisions"]) for item in normalized["estimates"]),
        }
        additions = {key: 0 for key in source}
        identical = {key: 0 for key in source}
        conflicts: list[dict[str, str]] = []
        with self.repository._connection() as connection:
            company_rows = {row["company_id"]: row for row in connection.execute("SELECT * FROM companies")}
            company_names = {str(row["business_name"]).casefold(): row["company_id"] for row in company_rows.values()}
            for company in normalized["companies"]:
                company_id = company["company_id"]
                row = company_rows.get(company_id)
                if row is None:
                    owner = company_names.get(company["business_name"].casefold())
                    if owner:
                        conflicts.append(
                            {"entity_type": "company", "entity_id": company_id, "reason": f"Business name belongs to {owner}"}
                        )
                    else:
                        additions["companies"] += 1
                else:
                    current = self.repository._company_from_row(row)
                    if _same(current, company, COMPANY_FIELDS):
                        identical["companies"] += 1
                    else:
                        conflicts.append(
                            {"entity_type": "company", "entity_id": company_id, "reason": "Server and browser fields differ"}
                        )

                for plural, entity_type, table, identifier, fields, from_row in (
                    ("products", "product", "products", "product_id", PRODUCT_FIELDS, self.repository._product_from_row),
                    ("customers", "customer", "customers", "customer_id", CUSTOMER_FIELDS, self.repository._customer_from_row),
                    ("events", "event", "events", "event_id", EVENT_FIELDS, self.repository._event_from_row),
                ):
                    for entity in company[plural]:
                        entity_row = connection.execute(
                            f"SELECT * FROM {table} WHERE {identifier}=?", (entity[identifier],)
                        ).fetchone()
                        if entity_row is None:
                            additions[plural] += 1
                            continue
                        current_entity = from_row(entity_row)
                        if str(entity_row["company_id"]) != company_id:
                            conflicts.append(
                                {"entity_type": entity_type, "entity_id": entity[identifier], "reason": "Identifier belongs to another company"}
                            )
                        elif _same(current_entity, entity, fields):
                            identical[plural] += 1
                        else:
                            conflicts.append(
                                {"entity_type": entity_type, "entity_id": entity[identifier], "reason": "Server and browser fields differ"}
                            )

            for record in normalized["estimates"]:
                row = connection.execute(
                    "SELECT * FROM estimates WHERE estimate_number=?", (record["estimate_number"],)
                ).fetchone()
                if row is None:
                    additions["estimates"] += 1
                    additions["revisions"] += len(record["revisions"])
                    continue
                server_revisions = {
                    int(revision_row["revision_number"]): _from_json(revision_row["payload_json"], {})
                    for revision_row in connection.execute(
                        "SELECT revision_number, payload_json FROM estimate_revisions WHERE estimate_number=?",
                        (record["estimate_number"],),
                    )
                }
                browser_revisions = {int(item["revision_number"]): item for item in record["revisions"]}
                if (
                    int(row["current_revision"]) == record["current_revision"]
                    and _bool(row["archived"]) == record["archived"]
                    and _json(server_revisions) == _json(browser_revisions)
                ):
                    identical["estimates"] += 1
                    identical["revisions"] += len(browser_revisions)
                else:
                    conflicts.append(
                        {"entity_type": "estimate", "entity_id": record["estimate_number"], "reason": "Revision history differs"}
                    )
        return {
            "source": source,
            "additions": additions,
            "identical": identical,
            "conflicts": conflicts,
            "conflict_count": len(conflicts),
            "can_safe_merge": not conflicts,
            "requires_action": any(additions.values()) or bool(conflicts),
            "strategies": ["safe_merge", "preserve_copy"],
        }

    def preview(self, state: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        normalized = self._normalize_state(state)
        if not normalized["companies"] and not normalized["estimates"]:
            raise ValueError("Browser state contains no data")
        return normalized, self._preview_normalized(normalized)

    def commit(self, job_id: str, strategy: str, change_reason: str, context: MutationContext) -> dict[str, Any]:
        job = self.repository.import_job(job_id)
        if not job:
            raise KeyError(job_id)
        if job["status"] != "previewed":
            raise ValueError("Import job was already committed")
        normalized = self._normalize_state(job["payload"])
        preview = self._preview_normalized(normalized)
        if strategy == "safe_merge" and preview["conflicts"]:
            raise ValueError("Safe merge is blocked by browser/server conflicts; use preserve_copy")
        if strategy not in {"safe_merge", "preserve_copy"}:
            raise ValueError("Unknown browser import strategy")
        if strategy == "safe_merge":
            result = self._safe_merge(normalized, change_reason, context)
        else:
            result = self._preserve_copy(normalized, job_id, change_reason, context)
        result.update(strategy=strategy, preview=preview)
        with self.repository._connection(write=True) as connection:
            row = connection.execute("SELECT status FROM import_jobs WHERE job_id=?", (job_id,)).fetchone()
            if not row or row["status"] != "previewed":
                raise ValueError("Import job was already committed")
            connection.execute(
                "UPDATE import_jobs SET status='committed', committed_at=?, summary_json=? WHERE job_id=?",
                (utc_now(), _json(result), job_id),
            )
            self.repository._audit(
                connection, "commit", "import_job", job_id, "", change_reason,
                context, preview, result,
            )
        return result

    def _safe_merge(
        self,
        normalized: dict[str, Any],
        change_reason: str,
        context: MutationContext,
    ) -> dict[str, Any]:
        inserted = {"companies": 0, "products": 0, "customers": 0, "events": 0, "estimates": 0, "revisions": 0}
        with self.repository._connection(write=True) as connection:
            for company in normalized["companies"]:
                company_id = company["company_id"]
                exists = connection.execute("SELECT 1 FROM companies WHERE company_id=?", (company_id,)).fetchone()
                if not exists:
                    self.repository._insert_company(connection, company)
                    self.repository._append_entity_revision(connection, "company", company_id, company, change_reason, context)
                    self.repository._audit(connection, "import", "company", company_id, company_id, change_reason, context, None, company)
                    inserted["companies"] += 1
                new_products = 0
                for product in company["products"]:
                    if connection.execute("SELECT 1 FROM products WHERE product_id=?", (product["product_id"],)).fetchone():
                        continue
                    self.repository._insert_product(connection, product)
                    self.repository._append_entity_revision(connection, "product", product["product_id"], product, change_reason, context)
                    self.repository._audit(connection, "import", "product", product["product_id"], company_id, change_reason, context, None, product)
                    inserted["products"] += 1
                    new_products += 1
                if exists and new_products:
                    connection.execute(
                        "UPDATE companies SET product_catalog_version=product_catalog_version+?, updated_at=? WHERE company_id=?",
                        (new_products, utc_now(), company_id),
                    )
                for customer in company["customers"]:
                    if connection.execute("SELECT 1 FROM customers WHERE customer_id=?", (customer["customer_id"],)).fetchone():
                        continue
                    self.repository._insert_customer(connection, company_id, customer)
                    self.repository._append_entity_revision(connection, "customer", customer["customer_id"], customer, change_reason, context)
                    self.repository._audit(connection, "import", "customer", customer["customer_id"], company_id, change_reason, context, None, customer)
                    inserted["customers"] += 1
                for event in company["events"]:
                    if connection.execute("SELECT 1 FROM events WHERE event_id=?", (event["event_id"],)).fetchone():
                        continue
                    self.repository._insert_event(connection, company_id, event)
                    self.repository._append_entity_revision(connection, "event", event["event_id"], event, change_reason, context)
                    self.repository._audit(connection, "import", "event", event["event_id"], company_id, change_reason, context, None, event)
                    inserted["events"] += 1
            for record in normalized["estimates"]:
                number = record["estimate_number"]
                if connection.execute("SELECT 1 FROM estimates WHERE estimate_number=?", (number,)).fetchone():
                    continue
                first = record["revisions"][0]
                latest = next(
                    item for item in record["revisions"] if int(item["revision_number"]) == record["current_revision"]
                )
                connection.execute(
                    "INSERT INTO estimates(estimate_number, archived, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (
                        number, int(record["archived"]), record["current_revision"],
                        str(first.get("created_at") or first.get("updated_at") or utc_now()),
                        str(latest.get("updated_at") or utc_now()),
                    ),
                )
                for revision in record["revisions"]:
                    self.repository._insert_estimate_revision(connection, revision, context)
                    inserted["revisions"] += 1
                self.repository._audit(connection, "import", "estimate", number, str(latest.get("company_id", "")), change_reason, context, None, latest)
                inserted["estimates"] += 1
            current_next = _bounded_int(self.repository._metadata(connection, "next_estimate_number", "1001"), 1001, 1)
            self.repository._set_metadata(connection, "next_estimate_number", str(max(current_next, normalized["next_number"])))
        return {"inserted": inserted}

    def _preserve_copy(
        self,
        normalized: dict[str, Any],
        job_id: str,
        change_reason: str,
        context: MutationContext,
    ) -> dict[str, Any]:
        suffix = hashlib.sha256(job_id.encode("utf-8")).hexdigest()[:8]
        inserted = {"companies": 0, "products": 0, "customers": 0, "events": 0, "estimates": 0, "revisions": 0}
        company_map: dict[str, str] = {}
        product_map: dict[tuple[str, str], str] = {}
        customer_map: dict[tuple[str, str], str] = {}
        event_map: dict[tuple[str, str], str] = {}
        recovered_names: dict[str, str] = {}
        with self.repository._connection(write=True) as connection:
            for position, source in enumerate(normalized["companies"], start=1):
                source_company_id = source["company_id"]
                company_id = _stable_identifier("browser-company", job_id, source_company_id, position)
                company_map[source_company_id] = company_id
                base_name = f"{source['business_name']} (Browser recovery {suffix})"
                business_name = base_name
                counter = 2
                while connection.execute(
                    "SELECT 1 FROM companies WHERE business_name=? COLLATE NOCASE", (business_name,)
                ).fetchone():
                    business_name = f"{base_name} {counter}"
                    counter += 1
                recovered_names[source_company_id] = business_name
                company = {
                    **source,
                    "company_id": company_id,
                    "business_name": business_name,
                    "version": 1,
                    "archived": False,
                    "created_at": utc_now(),
                    "updated_at": utc_now(),
                }
                self.repository._insert_company(connection, company)
                self.repository._append_entity_revision(connection, "company", company_id, company, change_reason, context)
                self.repository._audit(connection, "import", "company", company_id, company_id, change_reason, context, None, company)
                inserted["companies"] += 1

                for product_position, source_product in enumerate(source["products"]):
                    product_id = _stable_identifier("browser-product", job_id, source_company_id, source_product["product_id"])
                    product_map[(source_company_id, source_product["product_id"])] = product_id
                    product = {
                        **source_product,
                        "product_id": product_id,
                        "company_id": company_id,
                        "sort_order": product_position,
                        "version": 1,
                        "created_at": utc_now(),
                        "updated_at": utc_now(),
                    }
                    self.repository._insert_product(connection, product)
                    self.repository._append_entity_revision(connection, "product", product_id, product, change_reason, context)
                    self.repository._audit(connection, "import", "product", product_id, company_id, change_reason, context, None, product)
                    inserted["products"] += 1

                for source_customer in source["customers"]:
                    customer_id = _stable_identifier("browser-customer", job_id, source_company_id, source_customer["customer_id"])
                    customer_map[(source_company_id, source_customer["customer_id"])] = customer_id
                    customer = {
                        **source_customer,
                        "customer_id": customer_id,
                        "company_id": company_id,
                        "version": 1,
                        "created_at": utc_now(),
                        "updated_at": utc_now(),
                    }
                    self.repository._insert_customer(connection, company_id, customer)
                    self.repository._append_entity_revision(connection, "customer", customer_id, customer, change_reason, context)
                    self.repository._audit(connection, "import", "customer", customer_id, company_id, change_reason, context, None, customer)
                    inserted["customers"] += 1

                for source_event in source["events"]:
                    event_id = _stable_identifier("browser-event", job_id, source_company_id, source_event["event_id"])
                    event_map[(source_company_id, source_event["event_id"])] = event_id
                    event = {
                        **source_event,
                        "event_id": event_id,
                        "company_id": company_id,
                        "customer_id": customer_map[(source_company_id, source_event["customer_id"])],
                        "version": 1,
                        "created_at": utc_now(),
                        "updated_at": utc_now(),
                    }
                    self.repository._insert_event(connection, company_id, event)
                    self.repository._append_entity_revision(connection, "event", event_id, event, change_reason, context)
                    self.repository._audit(connection, "import", "event", event_id, company_id, change_reason, context, None, event)
                    inserted["events"] += 1

            first_company = normalized["companies"][0]["company_id"] if normalized["companies"] else ""
            for source_record in normalized["estimates"]:
                source_number = source_record["estimate_number"]
                number = clean_filename(f"BR-{suffix}-{source_number}")
                source_company_id = str(source_record["revisions"][0].get("company_id") or first_company)
                company_id = company_map.get(source_company_id, company_map.get(first_company, ""))
                revisions: list[dict[str, Any]] = []
                for source_revision in source_record["revisions"]:
                    revision = deepcopy(source_revision)
                    source_customer_id = str(revision.get("customer_id") or "")
                    source_event_id = str(revision.get("event_id") or "")
                    revision.update(
                        estimate_number=number,
                        revision_id=_stable_identifier(
                            "browser-revision", job_id, source_number, source_revision["revision_number"]
                        ),
                        company_id=company_id,
                        company_name=recovered_names.get(source_company_id, revision.get("company_name", "")),
                        customer_id=customer_map.get((source_company_id, source_customer_id), source_customer_id),
                        event_id=event_map.get((source_company_id, source_event_id), source_event_id),
                        import_source={
                            "type": "browser_demo",
                            "estimate_number": source_number,
                            "job_id": job_id,
                        },
                    )
                    if isinstance(revision.get("business"), dict):
                        revision["business"] = {
                            **revision["business"],
                            "company_id": company_id,
                            "business_name": recovered_names.get(source_company_id, revision["business"].get("business_name", "")),
                        }
                    if isinstance(revision.get("customer"), dict):
                        revision["customer"] = {**revision["customer"], "customer_id": revision["customer_id"]}
                    if isinstance(revision.get("event"), dict):
                        revision["event"] = {
                            **revision["event"],
                            "event_id": revision["event_id"],
                            "customer_id": revision["customer_id"],
                        }
                    for line in revision.get("line_items", []):
                        source_product_id = line.get("source_product_id") or line.get("product_id")
                        if source_product_id:
                            line["source_product_id"] = product_map.get(
                                (source_company_id, str(source_product_id)), str(source_product_id)
                            )
                    revisions.append(revision)
                first = revisions[0]
                latest = next(
                    item for item in revisions if int(item["revision_number"]) == source_record["current_revision"]
                )
                connection.execute(
                    "INSERT INTO estimates(estimate_number, archived, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (
                        number, int(source_record["archived"]), source_record["current_revision"],
                        str(first.get("created_at") or first.get("updated_at") or utc_now()),
                        str(latest.get("updated_at") or utc_now()),
                    ),
                )
                for revision in revisions:
                    self.repository._insert_estimate_revision(connection, revision, context)
                    inserted["revisions"] += 1
                self.repository._audit(connection, "import", "estimate", number, company_id, change_reason, context, None, latest)
                inserted["estimates"] += 1
        return {
            "inserted": inserted,
            "company_id_map": company_map,
            "estimate_prefix": f"BR-{suffix}-",
        }
