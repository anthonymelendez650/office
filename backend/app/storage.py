from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import sqlite3
import tempfile
from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from .catalog import (
    normalize_product,
    product_changed,
    product_compatibility_view,
    utc_now,
    valid_identifier,
    validate_product_collection,
)
from .legacy_storage import DEFAULT_COMPANY, JsonRepository as LegacyJsonRepository
from .services import clean_filename

SCHEMA_VERSION = 5
DATABASE_FILENAME = "office.sqlite3"
ALL_SCOPES = {
    "office.read",
    "office.internal.read",
    "office.pii.read",
    "office.catalog.write",
    "office.crm.write",
    "office.estimates.write",
    "office.archive",
    "office.mcp.connect",
    "office.admin",
}


@dataclass(frozen=True)
class MutationContext:
    actor: str = "system"
    request_id: str = ""
    idempotency_key: str = ""


def _context(value: MutationContext | None) -> MutationContext:
    return value or MutationContext()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _from_json(value: str | None, default: Any) -> Any:
    if not value:
        return deepcopy(default)
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return deepcopy(default)


def _bool(value: Any) -> bool:
    return bool(int(value or 0))


class SqliteRepository:
    """Transactional SQLite repository and one-time legacy JSON importer."""

    def __init__(
        self,
        data_dir: Path | None = None,
        database_path: Path | None = None,
        initialize_data: bool = True,
    ) -> None:
        configured = os.getenv("OFFICE_DATABASE_PATH")
        if database_path:
            self.database_path = Path(database_path)
            self.data_dir = self.database_path.parent
        elif configured:
            self.database_path = Path(configured)
            self.data_dir = self.database_path.parent
        else:
            candidate = data_dir or Path(__file__).parents[1] / "data"
            candidate = Path(candidate)
            if candidate.suffix in {".db", ".sqlite", ".sqlite3"}:
                self.database_path = candidate
                self.data_dir = candidate.parent
            else:
                self.data_dir = candidate
                self.database_path = candidate / DATABASE_FILENAME
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()
        if initialize_data:
            self._initialize_data()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        connection.execute("PRAGMA synchronous = FULL")
        return connection

    @contextmanager
    def _connection(self, write: bool = False) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            if write:
                connection.execute("BEGIN IMMEDIATE")
            yield connection
            if write:
                connection.commit()
        except Exception:
            if write:
                connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize_schema(self) -> None:
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS companies (
                    company_id TEXT PRIMARY KEY,
                    business_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    business_email TEXT NOT NULL DEFAULT '',
                    business_phone TEXT NOT NULL DEFAULT '',
                    business_address TEXT NOT NULL DEFAULT '',
                    default_service_charge_percent REAL NOT NULL DEFAULT 0,
                    default_gratuity_percent REAL NOT NULL DEFAULT 0,
                    payment_terms TEXT NOT NULL DEFAULT '',
                    estimate_notes TEXT NOT NULL DEFAULT '',
                    product_catalog_version INTEGER NOT NULL DEFAULT 0,
                    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
                    version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS products (
                    product_id TEXT PRIMARY KEY,
                    company_id TEXT NOT NULL REFERENCES companies(company_id),
                    sku TEXT NOT NULL DEFAULT '',
                    name TEXT NOT NULL,
                    customer_description TEXT NOT NULL DEFAULT '',
                    internal_notes TEXT NOT NULL DEFAULT '',
                    category_id TEXT NOT NULL DEFAULT 'uncategorized',
                    category TEXT NOT NULL DEFAULT '',
                    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
                    currency TEXT NOT NULL DEFAULT 'USD',
                    pricing_unit TEXT NOT NULL DEFAULT 'each',
                    quantity_rule TEXT NOT NULL DEFAULT 'manual',
                    default_quantity REAL NOT NULL DEFAULT 1,
                    minimum_quantity REAL NOT NULL DEFAULT 0,
                    quantity_step REAL NOT NULL DEFAULT 1,
                    charge_group TEXT NOT NULL DEFAULT 'item',
                    tax_class TEXT NOT NULL DEFAULT 'taxable',
                    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_unique
                    ON products(company_id, lower(sku)) WHERE sku <> '';
                CREATE INDEX IF NOT EXISTS products_company_status_order
                    ON products(company_id, status, sort_order, name);

                CREATE TABLE IF NOT EXISTS customers (
                    customer_id TEXT PRIMARY KEY,
                    company_id TEXT NOT NULL REFERENCES companies(company_id),
                    customer_name TEXT NOT NULL,
                    organization TEXT NOT NULL DEFAULT '',
                    customer_email TEXT NOT NULL DEFAULT '',
                    customer_phone TEXT NOT NULL DEFAULT '',
                    billing_address TEXT NOT NULL DEFAULT '',
                    internal_notes TEXT NOT NULL DEFAULT '',
                    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
                    version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS customers_company_status_name
                    ON customers(company_id, archived, customer_name);

                CREATE TABLE IF NOT EXISTS events (
                    event_id TEXT PRIMARY KEY,
                    company_id TEXT NOT NULL REFERENCES companies(company_id),
                    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
                    event_name TEXT NOT NULL DEFAULT '',
                    event_type TEXT NOT NULL DEFAULT 'Private Event',
                    event_date TEXT NOT NULL DEFAULT '',
                    venue TEXT NOT NULL DEFAULT '',
                    guest_count INTEGER NOT NULL DEFAULT 50,
                    servers_count INTEGER NOT NULL DEFAULT 0,
                    servers_hours INTEGER NOT NULL DEFAULT 0,
                    kitchen_staff_count INTEGER NOT NULL DEFAULT 0,
                    kitchen_staff_hours INTEGER NOT NULL DEFAULT 0,
                    utensils_buffer INTEGER NOT NULL DEFAULT 0,
                    charge_tax INTEGER NOT NULL DEFAULT 0 CHECK (charge_tax IN (0, 1)),
                    tax_percent REAL NOT NULL DEFAULT 0,
                    default_deposit_amount REAL NOT NULL DEFAULT 0,
                    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
                    version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS events_company_customer_date
                    ON events(company_id, customer_id, archived, event_date);

                CREATE TABLE IF NOT EXISTS entity_revisions (
                    revision_id TEXT PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    company_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    change_reason TEXT NOT NULL,
                    changed_at TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    request_id TEXT NOT NULL DEFAULT '',
                    snapshot_json TEXT NOT NULL,
                    UNIQUE(entity_type, entity_id, version)
                );
                CREATE INDEX IF NOT EXISTS entity_revisions_lookup
                    ON entity_revisions(entity_type, entity_id, version DESC);

                CREATE TABLE IF NOT EXISTS estimates (
                    estimate_number TEXT PRIMARY KEY,
                    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
                    current_revision INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS estimate_revisions (
                    revision_id TEXT PRIMARY KEY,
                    estimate_number TEXT NOT NULL REFERENCES estimates(estimate_number),
                    revision_number INTEGER NOT NULL,
                    revision_reason TEXT NOT NULL,
                    company_id TEXT NOT NULL,
                    customer_id TEXT NOT NULL,
                    customer_name TEXT NOT NULL DEFAULT '',
                    event_id TEXT NOT NULL,
                    event_name TEXT NOT NULL DEFAULT '',
                    event_date TEXT NOT NULL DEFAULT '',
                    total REAL NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    request_id TEXT NOT NULL DEFAULT '',
                    payload_json TEXT NOT NULL,
                    UNIQUE(estimate_number, revision_number)
                );
                CREATE INDEX IF NOT EXISTS estimate_revisions_filters
                    ON estimate_revisions(company_id, customer_id, event_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS estimate_line_items (
                    revision_id TEXT NOT NULL REFERENCES estimate_revisions(revision_id) ON DELETE CASCADE,
                    line_position INTEGER NOT NULL,
                    line_id TEXT NOT NULL,
                    source_product_id TEXT,
                    source_product_version INTEGER,
                    description TEXT NOT NULL DEFAULT '',
                    quantity REAL NOT NULL DEFAULT 0,
                    unit_price REAL NOT NULL DEFAULT 0,
                    line_total REAL NOT NULL DEFAULT 0,
                    charge_group TEXT NOT NULL DEFAULT 'item',
                    tax_class TEXT NOT NULL DEFAULT 'taxable',
                    payload_json TEXT NOT NULL,
                    PRIMARY KEY (revision_id, line_position)
                );
                CREATE INDEX IF NOT EXISTS estimate_line_product_usage
                    ON estimate_line_items(source_product_id, revision_id);

                CREATE TABLE IF NOT EXISTS audit_log (
                    audit_id TEXT PRIMARY KEY,
                    occurred_at TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    company_id TEXT NOT NULL DEFAULT '',
                    reason TEXT NOT NULL DEFAULT '',
                    request_id TEXT NOT NULL DEFAULT '',
                    idempotency_key TEXT NOT NULL DEFAULT '',
                    before_json TEXT,
                    after_json TEXT
                );
                CREATE INDEX IF NOT EXISTS audit_log_entity_time
                    ON audit_log(entity_type, entity_id, occurred_at DESC);
                CREATE INDEX IF NOT EXISTS audit_log_actor_time
                    ON audit_log(actor, occurred_at DESC);

                CREATE TABLE IF NOT EXISTS idempotency_records (
                    actor TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    request_hash TEXT NOT NULL,
                    response_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    PRIMARY KEY (actor, idempotency_key)
                );

                CREATE TABLE IF NOT EXISTS api_tokens (
                    token_id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL UNIQUE,
                    scopes TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
                    created_at TEXT NOT NULL,
                    last_used_at TEXT
                );

                CREATE TABLE IF NOT EXISTS import_jobs (
                    job_id TEXT PRIMARY KEY,
                    import_type TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    committed_at TEXT,
                    summary_json TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );
                """
            )
            connection.execute(
                "INSERT INTO metadata(key, value) VALUES('schema_version', ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(SCHEMA_VERSION),),
            )
            connection.commit()

    def _initialize_data(self) -> None:
        with self._connection() as connection:
            count = int(connection.execute("SELECT count(*) FROM companies").fetchone()[0])
        if count:
            return
        legacy_file = self.data_dir / "companies.json"
        if legacy_file.exists():
            # The legacy normalizer can rewrite old schemas. Work only on copies;
            # the verified migration command archives originals after SQLite passes.
            with tempfile.TemporaryDirectory(prefix="office-legacy-import-") as temporary_name:
                staging = Path(temporary_name)
                for source in (
                    legacy_file,
                    self.data_dir / "counter.json",
                    self.data_dir / "settings.json",
                    *sorted((self.data_dir / "estimates").glob("*.json")),
                ):
                    if not source.is_file():
                        continue
                    destination = staging / source.relative_to(self.data_dir)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, destination)
                self.import_legacy_json(staging)
        else:
            with self._connection(write=True) as connection:
                self._insert_default_company(connection)
                self._set_metadata(connection, "selected_company", DEFAULT_COMPANY["business_name"])
                self._set_metadata(connection, "next_estimate_number", "1001")
                self._set_metadata(connection, "legacy_import_completed", "not_required")

    @staticmethod
    def _set_metadata(connection: sqlite3.Connection, key: str, value: str) -> None:
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )

    @staticmethod
    def _metadata(connection: sqlite3.Connection, key: str, default: str = "") -> str:
        row = connection.execute("SELECT value FROM metadata WHERE key = ?", (key,)).fetchone()
        return str(row[0]) if row else default

    def _insert_default_company(self, connection: sqlite3.Connection) -> dict[str, Any]:
        now = utc_now()
        company = {
            **DEFAULT_COMPANY,
            "company_id": "company-1",
            "product_catalog_version": 0,
            "archived": False,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        }
        self._insert_company(connection, company)
        self._append_entity_revision(connection, "company", company["company_id"], company, "Initial company", MutationContext())
        return company

    @staticmethod
    def _company_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "company_id": row["company_id"],
            "business_name": row["business_name"],
            "business_email": row["business_email"],
            "business_phone": row["business_phone"],
            "business_address": row["business_address"],
            "default_service_charge_percent": float(row["default_service_charge_percent"]),
            "default_gratuity_percent": float(row["default_gratuity_percent"]),
            "payment_terms": row["payment_terms"],
            "estimate_notes": row["estimate_notes"],
            "product_catalog_version": int(row["product_catalog_version"]),
            "archived": _bool(row["archived"]),
            "version": int(row["version"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _product_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "product_id": row["product_id"],
            "company_id": row["company_id"],
            "sku": row["sku"],
            "name": row["name"],
            "customer_description": row["customer_description"],
            "internal_notes": row["internal_notes"],
            "category_id": row["category_id"],
            "category": row["category"],
            "price_cents": int(row["price_cents"]),
            "currency": row["currency"],
            "pricing_unit": row["pricing_unit"],
            "quantity_rule": row["quantity_rule"],
            "default_quantity": float(row["default_quantity"]),
            "minimum_quantity": float(row["minimum_quantity"]),
            "quantity_step": float(row["quantity_step"]),
            "charge_group": row["charge_group"],
            "tax_class": row["tax_class"],
            "status": row["status"],
            "sort_order": int(row["sort_order"]),
            "version": int(row["version"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _customer_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "customer_id": row["customer_id"],
            "customer_name": row["customer_name"],
            "organization": row["organization"],
            "customer_email": row["customer_email"],
            "customer_phone": row["customer_phone"],
            "billing_address": row["billing_address"],
            "internal_notes": row["internal_notes"],
            "archived": _bool(row["archived"]),
            "version": int(row["version"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _event_from_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "event_id": row["event_id"],
            "customer_id": row["customer_id"],
            "event_name": row["event_name"],
            "event_type": row["event_type"],
            "event_date": row["event_date"],
            "venue": row["venue"],
            "guest_count": int(row["guest_count"]),
            "servers_count": int(row["servers_count"]),
            "servers_hours": int(row["servers_hours"]),
            "kitchen_staff_count": int(row["kitchen_staff_count"]),
            "kitchen_staff_hours": int(row["kitchen_staff_hours"]),
            "utensils_buffer": int(row["utensils_buffer"]),
            "charge_tax": _bool(row["charge_tax"]),
            "tax_percent": float(row["tax_percent"]),
            "default_deposit_amount": float(row["default_deposit_amount"]),
            "archived": _bool(row["archived"]),
            "version": int(row["version"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _insert_company(connection: sqlite3.Connection, company: dict[str, Any]) -> None:
        connection.execute(
            """
            INSERT INTO companies(
                company_id, business_name, business_email, business_phone, business_address,
                default_service_charge_percent, default_gratuity_percent, payment_terms,
                estimate_notes, product_catalog_version, archived, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                company["company_id"], company["business_name"], company.get("business_email", ""),
                company.get("business_phone", ""), company.get("business_address", ""),
                float(company.get("default_service_charge_percent", 0) or 0),
                float(company.get("default_gratuity_percent", 0) or 0), company.get("payment_terms", ""),
                company.get("estimate_notes", ""), int(company.get("product_catalog_version", 0) or 0),
                int(bool(company.get("archived", False))), int(company.get("version", 1) or 1),
                company.get("created_at") or utc_now(), company.get("updated_at") or utc_now(),
            ),
        )

    @staticmethod
    def _insert_product(connection: sqlite3.Connection, product: dict[str, Any]) -> None:
        connection.execute(
            """
            INSERT INTO products(
                product_id, company_id, sku, name, customer_description, internal_notes,
                category_id, category, price_cents, currency, pricing_unit, quantity_rule,
                default_quantity, minimum_quantity, quantity_step, charge_group, tax_class,
                status, sort_order, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                product["product_id"], product["company_id"], product.get("sku", ""), product["name"],
                product.get("customer_description", ""), product.get("internal_notes", ""),
                product.get("category_id", "uncategorized"), product.get("category", ""),
                int(product.get("price_cents", 0) or 0), product.get("currency", "USD"),
                product.get("pricing_unit", "each"), product.get("quantity_rule", "manual"),
                float(product.get("default_quantity", 1) or 0), float(product.get("minimum_quantity", 0) or 0),
                float(product.get("quantity_step", 1) or 1), product.get("charge_group", "item"),
                product.get("tax_class", "taxable"), product.get("status", "active"),
                int(product.get("sort_order", 0) or 0), int(product.get("version", 1) or 1),
                product.get("created_at") or utc_now(), product.get("updated_at") or utc_now(),
            ),
        )

    @staticmethod
    def _insert_customer(connection: sqlite3.Connection, company_id: str, customer: dict[str, Any]) -> None:
        connection.execute(
            """
            INSERT INTO customers(
                customer_id, company_id, customer_name, organization, customer_email,
                customer_phone, billing_address, internal_notes, archived, version,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                customer["customer_id"], company_id, customer["customer_name"], customer.get("organization", ""),
                customer.get("customer_email", ""), customer.get("customer_phone", ""),
                customer.get("billing_address", ""), customer.get("internal_notes", ""),
                int(bool(customer.get("archived", False))), int(customer.get("version", 1) or 1),
                customer.get("created_at") or utc_now(), customer.get("updated_at") or utc_now(),
            ),
        )

    @staticmethod
    def _insert_event(connection: sqlite3.Connection, company_id: str, event: dict[str, Any]) -> None:
        connection.execute(
            """
            INSERT INTO events(
                event_id, company_id, customer_id, event_name, event_type, event_date, venue,
                guest_count, servers_count, servers_hours, kitchen_staff_count, kitchen_staff_hours,
                utensils_buffer, charge_tax, tax_percent, default_deposit_amount, archived,
                version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event["event_id"], company_id, event["customer_id"], event.get("event_name", ""),
                event.get("event_type", "Private Event"), event.get("event_date", ""), event.get("venue", ""),
                max(int(event.get("guest_count", 50) or 50), 1), max(int(event.get("servers_count", 0) or 0), 0),
                max(int(event.get("servers_hours", 0) or 0), 0),
                max(int(event.get("kitchen_staff_count", 0) or 0), 0),
                max(int(event.get("kitchen_staff_hours", 0) or 0), 0),
                max(int(event.get("utensils_buffer", 0) or 0), 0), int(bool(event.get("charge_tax", False))),
                max(float(event.get("tax_percent", 0) or 0), 0),
                max(float(event.get("default_deposit_amount", 0) or 0), 0),
                int(bool(event.get("archived", False))), int(event.get("version", 1) or 1),
                event.get("created_at") or utc_now(), event.get("updated_at") or utc_now(),
            ),
        )

    def _append_entity_revision(
        self,
        connection: sqlite3.Connection,
        entity_type: str,
        entity_id: str,
        snapshot: dict[str, Any],
        reason: str,
        context: MutationContext,
        revision_id: str | None = None,
        changed_at: str | None = None,
    ) -> None:
        connection.execute(
            """
            INSERT OR IGNORE INTO entity_revisions(
                revision_id, entity_type, entity_id, company_id, version, change_reason,
                changed_at, actor, request_id, snapshot_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                revision_id or f"{entity_type}-revision-{uuid4().hex[:12]}", entity_type, entity_id,
                str(snapshot.get("company_id", "")), int(snapshot.get("version", 1) or 1),
                reason.strip() or f"{entity_type.title()} updated", changed_at or snapshot.get("updated_at") or utc_now(),
                context.actor, context.request_id, _json(snapshot),
            ),
        )

    @staticmethod
    def _audit(
        connection: sqlite3.Connection,
        action: str,
        entity_type: str,
        entity_id: str,
        company_id: str,
        reason: str,
        context: MutationContext,
        before: Any = None,
        after: Any = None,
    ) -> None:
        connection.execute(
            """
            INSERT INTO audit_log(
                audit_id, occurred_at, actor, action, entity_type, entity_id, company_id,
                reason, request_id, idempotency_key, before_json, after_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"audit-{uuid4().hex[:16]}", utc_now(), context.actor, action, entity_type, entity_id,
                company_id, reason, context.request_id, context.idempotency_key,
                _json(before) if before is not None else None,
                _json(after) if after is not None else None,
            ),
        )

    def import_legacy_json(self, source_dir: Path) -> dict[str, int]:
        """Import legacy JSON exactly once into an empty SQLite database."""
        source_dir = Path(source_dir)
        legacy = LegacyJsonRepository(source_dir)
        store = legacy.store()
        estimate_paths = sorted((source_dir / "estimates").glob("*.json"))
        counts = {"companies": 0, "products": 0, "customers": 0, "events": 0, "estimates": 0, "revisions": 0}
        with self._connection(write=True) as connection:
            if int(connection.execute("SELECT count(*) FROM companies").fetchone()[0]):
                raise ValueError("SQLite database already contains company data")
            now = utc_now()
            for raw_company in store.get("companies", []):
                company = {
                    **DEFAULT_COMPANY,
                    **{key: value for key, value in raw_company.items() if key not in {"products", "customers", "events", "product_revisions"}},
                    "version": int(raw_company.get("version", 1) or 1),
                    "created_at": raw_company.get("created_at") or now,
                    "updated_at": raw_company.get("updated_at") or now,
                }
                self._insert_company(connection, company)
                self._append_entity_revision(
                    connection, "company", company["company_id"], company,
                    "Imported legacy company", MutationContext(actor="legacy-json-import"),
                )
                counts["companies"] += 1

                histories = raw_company.get("product_revisions", {})
                for product in raw_company.get("products", []):
                    self._insert_product(connection, product)
                    revisions = histories.get(product["product_id"], [])
                    if revisions:
                        for revision in revisions:
                            snapshot = {**revision.get("snapshot", product), "company_id": company["company_id"]}
                            self._append_entity_revision(
                                connection,
                                "product",
                                product["product_id"],
                                snapshot,
                                str(revision.get("change_reason", "Imported legacy product")),
                                MutationContext(actor="legacy-json-import"),
                                str(revision.get("revision_id") or f"product-revision-{uuid4().hex[:12]}"),
                                str(revision.get("changed_at") or snapshot.get("updated_at") or now),
                            )
                    else:
                        self._append_entity_revision(
                            connection, "product", product["product_id"], product,
                            "Imported legacy product", MutationContext(actor="legacy-json-import"),
                        )
                    counts["products"] += 1

                for raw_customer in raw_company.get("customers", []):
                    customer = {
                        **raw_customer,
                        "company_id": company["company_id"],
                        "version": int(raw_customer.get("version", 1) or 1),
                        "created_at": raw_customer.get("created_at") or now,
                        "updated_at": raw_customer.get("updated_at") or now,
                    }
                    self._insert_customer(connection, company["company_id"], customer)
                    self._append_entity_revision(
                        connection, "customer", customer["customer_id"], customer,
                        "Imported legacy customer", MutationContext(actor="legacy-json-import"),
                    )
                    counts["customers"] += 1

                for raw_event in raw_company.get("events", []):
                    event = {
                        **raw_event,
                        "company_id": company["company_id"],
                        "version": int(raw_event.get("version", 1) or 1),
                        "created_at": raw_event.get("created_at") or now,
                        "updated_at": raw_event.get("updated_at") or now,
                    }
                    self._insert_event(connection, company["company_id"], event)
                    self._append_entity_revision(
                        connection, "event", event["event_id"], event,
                        "Imported legacy event", MutationContext(actor="legacy-json-import"),
                    )
                    counts["events"] += 1

            for path in estimate_paths:
                record = legacy.estimate_record(path.stem)
                if not record:
                    continue
                revisions = record.get("revisions", [])
                created_at = str((revisions[0] if revisions else {}).get("created_at") or now)
                updated_at = str((revisions[-1] if revisions else {}).get("updated_at") or created_at)
                connection.execute(
                    "INSERT INTO estimates(estimate_number, archived, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (
                        record.get("estimate_number", path.stem), int(bool(record.get("archived", False))),
                        int(record.get("current_revision", len(revisions)) or 0), created_at, updated_at,
                    ),
                )
                for revision in revisions:
                    self._insert_estimate_revision(
                        connection, revision, MutationContext(actor="legacy-json-import")
                    )
                    counts["revisions"] += 1
                counts["estimates"] += 1

            counter = LegacyJsonRepository._read(source_dir / "counter.json", {"next_number": 1001})
            self._set_metadata(connection, "next_estimate_number", str(int(counter.get("next_number", 1001))))
            self._set_metadata(connection, "selected_company", str(store.get("selected_company", "")))
            self._set_metadata(connection, "legacy_import_completed", utc_now())
            settings = LegacyJsonRepository._read(source_dir / "settings.json", {})
            if isinstance(settings, dict):
                for key, value in settings.items():
                    connection.execute(
                        "INSERT OR REPLACE INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)",
                        (str(key), _json(value), now),
                    )
            self._audit(
                connection, "import", "database", "legacy-json", "", "Imported legacy JSON stores",
                MutationContext(actor="legacy-json-import"), None, counts,
            )
        return counts

    def _insert_estimate_revision(
        self,
        connection: sqlite3.Connection,
        payload: dict[str, Any],
        context: MutationContext,
    ) -> None:
        revision_id = str(payload.get("revision_id") or f"revision-{uuid4().hex[:12]}")
        payload["revision_id"] = revision_id
        connection.execute(
            """
            INSERT INTO estimate_revisions(
                revision_id, estimate_number, revision_number, revision_reason, company_id,
                customer_id, customer_name, event_id, event_name, event_date, total,
                updated_at, actor, request_id, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                revision_id, payload["estimate_number"], int(payload.get("revision_number", 1) or 1),
                str(payload.get("revision_reason", "Updated estimate")), str(payload.get("company_id", "")),
                str(payload.get("customer_id", "")), str(payload.get("customer_name", "")),
                str(payload.get("event_id", "")), str(payload.get("event_name", "")),
                str(payload.get("event_date", "")), float(payload.get("total", 0) or 0),
                str(payload.get("updated_at") or utc_now()), context.actor, context.request_id, _json(payload),
            ),
        )
        for position, line in enumerate(payload.get("line_items", [])):
            connection.execute(
                """
                INSERT INTO estimate_line_items(
                    revision_id, line_position, line_id, source_product_id, source_product_version,
                    description, quantity, unit_price, line_total, charge_group, tax_class, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    revision_id, position, str(line.get("line_id") or f"line-{uuid4().hex[:12]}"),
                    line.get("source_product_id") or line.get("product_id"), line.get("source_product_version"),
                    str(line.get("Description", line.get("description", ""))),
                    float(line.get("Qty", line.get("qty", 0)) or 0),
                    float(line.get("Unit Price", line.get("unit_price", 0)) or 0),
                    float(line.get("Line Total", line.get("line_total", 0)) or 0),
                    str(line.get("charge_group", "item")), str(line.get("tax_class", "taxable")), _json(line),
                ),
            )

    def _hydrate_company(self, connection: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
        company = self._company_from_row(row)
        company_id = company["company_id"]
        company["products"] = [
            self._product_from_row(item)
            for item in connection.execute(
                "SELECT * FROM products WHERE company_id = ? ORDER BY sort_order, lower(name)", (company_id,)
            )
        ]
        company["customers"] = [
            self._customer_from_row(item)
            for item in connection.execute(
                "SELECT * FROM customers WHERE company_id = ? ORDER BY lower(customer_name)", (company_id,)
            )
        ]
        company["events"] = [
            self._event_from_row(item)
            for item in connection.execute(
                "SELECT * FROM events WHERE company_id = ? ORDER BY event_date, lower(event_name)", (company_id,)
            )
        ]
        return company

    def store(self) -> dict[str, Any]:
        with self._connection() as connection:
            companies = [
                self._hydrate_company(connection, row)
                for row in connection.execute("SELECT * FROM companies ORDER BY lower(business_name)")
            ]
            return {
                "schema_version": SCHEMA_VERSION,
                "selected_company": self._metadata(connection, "selected_company", companies[0]["business_name"] if companies else ""),
                "companies": companies,
            }

    def bootstrap_store(self, include_internal: bool = True, include_pii: bool = True) -> dict[str, Any]:
        store = deepcopy(self.store())
        for company in store.get("companies", []):
            products = []
            for item in company.get("products", []):
                product = product_compatibility_view(item)
                if not include_internal:
                    product["internal_notes"] = ""
                products.append(product)
            company["products"] = products
            for customer in company.get("customers", []):
                if not include_internal:
                    customer["internal_notes"] = ""
                if not include_pii:
                    customer["customer_email"] = ""
                    customer["customer_phone"] = ""
                    customer["billing_address"] = ""
        return store

    def list_companies(self, include_archived: bool = False, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        where = "" if include_archived else "WHERE archived = 0"
        with self._connection() as connection:
            return [
                self._company_from_row(row)
                for row in connection.execute(
                    f"SELECT * FROM companies {where} ORDER BY lower(business_name) LIMIT ? OFFSET ?",
                    (min(max(limit, 1), 500), max(offset, 0)),
                )
            ]

    def company(self, company_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM companies WHERE company_id = ?", (company_id,)).fetchone()
            return self._hydrate_company(connection, row) if row else None

    def create_company(
        self,
        values: dict[str, Any],
        change_reason: str = "Created company",
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        now = utc_now()
        company = {
            **DEFAULT_COMPANY,
            **values,
            "company_id": f"company-{uuid4().hex[:10]}",
            "product_catalog_version": 0,
            "archived": False,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        }
        try:
            with self._connection(write=True) as connection:
                self._insert_company(connection, company)
                self._append_entity_revision(connection, "company", company["company_id"], company, change_reason, ctx)
                self._set_metadata(connection, "selected_company", company["business_name"])
                self._audit(connection, "create", "company", company["company_id"], company["company_id"], change_reason, ctx, None, company)
        except sqlite3.IntegrityError as error:
            raise ValueError("A company with that name already exists") from error
        return deepcopy(company)

    def update_company(
        self,
        company_id: str,
        values: dict[str, Any],
        expected_version: int | None = None,
        change_reason: str = "Updated company",
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        with self._connection(write=True) as connection:
            row = connection.execute("SELECT * FROM companies WHERE company_id = ?", (company_id,)).fetchone()
            if not row:
                raise KeyError(company_id)
            current = self._company_from_row(row)
            if expected_version is not None and expected_version != current["version"]:
                raise ValueError(f"Company changed since version {expected_version}; current version is {current['version']}")
            allowed = {
                "business_name", "business_email", "business_phone", "business_address",
                "default_service_charge_percent", "default_gratuity_percent", "payment_terms", "estimate_notes",
            }
            candidate = {**current, **{key: value for key, value in values.items() if key in allowed}}
            candidate["version"] = current["version"] + 1
            candidate["updated_at"] = utc_now()
            try:
                connection.execute(
                    """
                    UPDATE companies SET business_name=?, business_email=?, business_phone=?, business_address=?,
                        default_service_charge_percent=?, default_gratuity_percent=?, payment_terms=?, estimate_notes=?,
                        version=?, updated_at=? WHERE company_id=?
                    """,
                    (
                        candidate["business_name"], candidate["business_email"], candidate["business_phone"],
                        candidate["business_address"], candidate["default_service_charge_percent"],
                        candidate["default_gratuity_percent"], candidate["payment_terms"], candidate["estimate_notes"],
                        candidate["version"], candidate["updated_at"], company_id,
                    ),
                )
            except sqlite3.IntegrityError as error:
                raise ValueError("A company with that name already exists") from error
            if self._metadata(connection, "selected_company") == current["business_name"]:
                self._set_metadata(connection, "selected_company", candidate["business_name"])
            self._append_entity_revision(connection, "company", company_id, candidate, change_reason, ctx)
            self._audit(connection, "update", "company", company_id, company_id, change_reason, ctx, current, candidate)
            return candidate

    def delete_company(
        self,
        company_id: str,
        expected_version: int | None = None,
        change_reason: str = "Archived company",
        context: MutationContext | None = None,
    ) -> None:
        self.set_company_status(company_id, True, expected_version, change_reason, context)

    def set_company_status(
        self,
        company_id: str,
        archived: bool,
        expected_version: int | None,
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        with self._connection(write=True) as connection:
            row = connection.execute("SELECT * FROM companies WHERE company_id = ?", (company_id,)).fetchone()
            if not row:
                raise KeyError(company_id)
            current = self._company_from_row(row)
            if expected_version is not None and expected_version != current["version"]:
                raise ValueError(f"Company changed since version {expected_version}; current version is {current['version']}")
            if current["archived"] == archived:
                return current
            updated = {**current, "archived": archived, "version": current["version"] + 1, "updated_at": utc_now()}
            connection.execute(
                "UPDATE companies SET archived=?, version=?, updated_at=? WHERE company_id=?",
                (int(archived), updated["version"], updated["updated_at"], company_id),
            )
            if archived:
                selected = connection.execute(
                    "SELECT business_name FROM companies WHERE archived=0 ORDER BY lower(business_name) LIMIT 1"
                ).fetchone()
                self._set_metadata(connection, "selected_company", str(selected[0]) if selected else "")
            elif not self._metadata(connection, "selected_company"):
                self._set_metadata(connection, "selected_company", updated["business_name"])
            self._append_entity_revision(connection, "company", company_id, updated, change_reason, ctx)
            action = "archive" if archived else "restore"
            self._audit(connection, action, "company", company_id, company_id, change_reason, ctx, current, updated)
            return updated

    def company_revisions(self, company_id: str) -> list[dict[str, Any]]:
        if not self.company(company_id):
            raise KeyError(company_id)
        return self.entity_revisions("company", company_id)

    @staticmethod
    def _require_company_row(connection: sqlite3.Connection, company_id: str) -> sqlite3.Row:
        row = connection.execute("SELECT * FROM companies WHERE company_id = ?", (company_id,)).fetchone()
        if not row:
            raise KeyError(company_id)
        return row

    def list_products(
        self,
        company_id: str,
        include_archived: bool = False,
        query: str = "",
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        with self._connection() as connection:
            self._require_company_row(connection, company_id)
            clauses = ["company_id = ?"]
            parameters: list[Any] = [company_id]
            if not include_archived:
                clauses.append("status = 'active'")
            if query.strip():
                clauses.append("(lower(name) LIKE ? OR lower(sku) LIKE ? OR lower(category) LIKE ?)")
                needle = f"%{query.strip().casefold()}%"
                parameters.extend([needle, needle, needle])
            parameters.extend([min(max(limit, 1), 500), max(offset, 0)])
            rows = connection.execute(
                f"SELECT * FROM products WHERE {' AND '.join(clauses)} "
                "ORDER BY sort_order, lower(name) LIMIT ? OFFSET ?",
                parameters,
            )
            return [self._product_from_row(row) for row in rows]

    def product(self, company_id: str, product_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            self._require_company_row(connection, company_id)
            row = connection.execute(
                "SELECT * FROM products WHERE company_id = ? AND product_id = ?", (company_id, product_id)
            ).fetchone()
            return self._product_from_row(row) if row else None

    def _update_product_row(self, connection: sqlite3.Connection, product: dict[str, Any]) -> None:
        connection.execute(
            """
            UPDATE products SET sku=?, name=?, customer_description=?, internal_notes=?, category_id=?,
                category=?, price_cents=?, currency=?, pricing_unit=?, quantity_rule=?, default_quantity=?,
                minimum_quantity=?, quantity_step=?, charge_group=?, tax_class=?, status=?, sort_order=?,
                version=?, updated_at=? WHERE company_id=? AND product_id=?
            """,
            (
                product["sku"], product["name"], product["customer_description"], product["internal_notes"],
                product["category_id"], product["category"], product["price_cents"], product["currency"],
                product["pricing_unit"], product["quantity_rule"], product["default_quantity"],
                product["minimum_quantity"], product["quantity_step"], product["charge_group"],
                product["tax_class"], product["status"], product["sort_order"], product["version"],
                product["updated_at"], product["company_id"], product["product_id"],
            ),
        )

    def create_product(
        self,
        company_id: str,
        values: dict[str, Any],
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        with self._connection(write=True) as connection:
            self._require_company_row(connection, company_id)
            next_order = connection.execute(
                "SELECT coalesce(max(sort_order), -1) + 1 FROM products WHERE company_id = ?", (company_id,)
            ).fetchone()[0]
            position = values.get("sort_order")
            now = utc_now()
            product = normalize_product(
                {**values, "product_id": "", "version": 1, "created_at": now, "updated_at": now, "status": "active"},
                company_id,
                position=int(next_order if position is None else position),
                timestamp=now,
            )
            try:
                self._insert_product(connection, product)
            except sqlite3.IntegrityError as error:
                if "sku" in str(error).casefold() or "products_company_sku_unique" in str(error):
                    raise ValueError(f"SKU {product['sku']} is already used by another product") from error
                raise ValueError(str(error)) from error
            connection.execute(
                "UPDATE companies SET product_catalog_version=product_catalog_version+1, updated_at=? WHERE company_id=?",
                (now, company_id),
            )
            self._append_entity_revision(connection, "product", product["product_id"], product, change_reason or "Created product", ctx)
            self._audit(
                connection, "create", "product", product["product_id"], company_id,
                change_reason or "Created product", ctx, None, product,
            )
            return deepcopy(product)

    def update_product(
        self,
        company_id: str,
        product_id: str,
        values: dict[str, Any],
        expected_version: int,
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        with self._connection(write=True) as connection:
            self._require_company_row(connection, company_id)
            row = connection.execute(
                "SELECT * FROM products WHERE company_id=? AND product_id=?", (company_id, product_id)
            ).fetchone()
            if not row:
                raise KeyError(product_id)
            current = self._product_from_row(row)
            if expected_version != current["version"]:
                raise ValueError(f"Product changed since version {expected_version}; current version is {current['version']}")
            now = utc_now()
            candidate = normalize_product(values, company_id, existing=current, timestamp=now)
            candidate.update(
                product_id=current["product_id"], company_id=company_id, created_at=current["created_at"]
            )
            if not product_changed(current, candidate):
                return deepcopy(current)
            candidate["version"] = current["version"] + 1
            candidate["updated_at"] = now
            all_products = [
                candidate if item["product_id"] == product_id else item
                for item in [
                    self._product_from_row(product_row)
                    for product_row in connection.execute("SELECT * FROM products WHERE company_id=?", (company_id,))
                ]
            ]
            validate_product_collection(all_products)
            try:
                self._update_product_row(connection, candidate)
            except sqlite3.IntegrityError as error:
                raise ValueError(f"SKU {candidate['sku']} is already used by another product") from error
            connection.execute(
                "UPDATE companies SET product_catalog_version=product_catalog_version+1, updated_at=? WHERE company_id=?",
                (now, company_id),
            )
            self._append_entity_revision(connection, "product", product_id, candidate, change_reason, ctx)
            self._audit(connection, "update", "product", product_id, company_id, change_reason, ctx, current, candidate)
            return deepcopy(candidate)

    def set_product_status(
        self,
        company_id: str,
        product_id: str,
        status: str,
        expected_version: int,
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        if status not in {"active", "archived"}:
            raise ValueError("Product status must be active or archived")
        product = self.product(company_id, product_id)
        if not product:
            raise KeyError(product_id)
        if product["status"] == status:
            if product["version"] != expected_version:
                raise ValueError(f"Product changed since version {expected_version}; current version is {product['version']}")
            return product
        return self.update_product(
            company_id, product_id, {"status": status}, expected_version, change_reason, context
        )

    def entity_revisions(self, entity_type: str, entity_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT * FROM entity_revisions WHERE entity_type=? AND entity_id=? ORDER BY version DESC",
                (entity_type, entity_id),
            )
            return [
                {
                    "revision_id": row["revision_id"],
                    f"{entity_type}_id": entity_id,
                    "company_id": row["company_id"],
                    "version": int(row["version"]),
                    "change_reason": row["change_reason"],
                    "changed_at": row["changed_at"],
                    "actor": row["actor"],
                    "request_id": row["request_id"],
                    "snapshot": _from_json(row["snapshot_json"], {}),
                }
                for row in rows
            ]

    def product_revisions(self, company_id: str, product_id: str) -> list[dict[str, Any]]:
        product = self.product(company_id, product_id)
        if not product:
            raise KeyError(product_id)
        return self.entity_revisions("product", product_id)

    def product_usage(self, company_id: str, product_id: str) -> dict[str, Any]:
        if not self.product(company_id, product_id):
            raise KeyError(product_id)
        with self._connection() as connection:
            rows = list(
                connection.execute(
                    """
                    SELECT er.estimate_number, er.revision_number, er.customer_name, er.event_name,
                           er.updated_at, count(*) AS line_count
                    FROM estimate_line_items li
                    JOIN estimate_revisions er ON er.revision_id = li.revision_id
                    WHERE li.source_product_id=? AND er.company_id=?
                    GROUP BY er.revision_id
                    ORDER BY er.updated_at DESC
                    """,
                    (product_id, company_id),
                )
            )
        references = [
            {
                "estimate_number": row["estimate_number"],
                "revision_number": int(row["revision_number"]),
                "customer_name": row["customer_name"],
                "event_name": row["event_name"],
                "used_at": row["updated_at"],
                "line_count": int(row["line_count"]),
            }
            for row in rows
        ]
        return {
            "product_id": product_id,
            "estimate_count": len({item["estimate_number"] for item in references}),
            "revision_count": len(references),
            "line_count": sum(item["line_count"] for item in references),
            "latest_used_at": references[0]["used_at"] if references else None,
            "references": references[:25],
        }

    def replace_products(
        self,
        company_id: str,
        products: list[dict[str, Any]],
        expected_catalog_version: int | None = None,
        context: MutationContext | None = None,
    ) -> list[dict[str, Any]]:
        ctx = _context(context)
        with self._connection(write=True) as connection:
            company_row = self._require_company_row(connection, company_id)
            catalog_version = int(company_row["product_catalog_version"])
            if expected_catalog_version is not None and expected_catalog_version != catalog_version:
                raise ValueError(
                    f"Catalog changed since version {expected_catalog_version}; current version is {catalog_version}"
                )
            existing = [
                self._product_from_row(row)
                for row in connection.execute("SELECT * FROM products WHERE company_id=? ORDER BY sort_order", (company_id,))
            ]
            existing_by_id = {item["product_id"]: item for item in existing}
            request_ids = [valid_identifier(item.get("product_id")) for item in products]
            nonempty_ids = [identifier for identifier in request_ids if identifier]
            if len(nonempty_ids) != len(set(nonempty_ids)):
                raise ValueError("The catalog payload contains duplicate product ids")
            full_sync = set(existing_by_id).issubset(nonempty_ids)
            next_order = max((item["sort_order"] for item in existing), default=-1) + 1
            now = utc_now()
            merged_by_id: dict[str, dict[str, Any]] = {}
            changed: list[tuple[dict[str, Any] | None, dict[str, Any]]] = []
            for position, raw in enumerate(products):
                requested_id = valid_identifier(raw.get("product_id"))
                current = existing_by_id.get(requested_id)
                target_order = position if full_sync else (current["sort_order"] if current else next_order)
                if not current:
                    next_order += 1
                candidate = normalize_product(
                    raw, company_id, existing=current, position=target_order, timestamp=now
                )
                if current:
                    candidate.update(product_id=current["product_id"], created_at=current["created_at"], version=current["version"])
                    if product_changed(current, candidate):
                        candidate["version"] += 1
                        candidate["updated_at"] = now
                        changed.append((current, candidate))
                    else:
                        candidate = current
                else:
                    candidate.update(version=1, created_at=now, updated_at=now)
                    changed.append((None, candidate))
                merged_by_id[candidate["product_id"]] = candidate
            merged = list(merged_by_id.values()) + [item for item in existing if item["product_id"] not in merged_by_id]
            validate_product_collection(merged)
            for before, product in changed:
                try:
                    if before:
                        self._update_product_row(connection, product)
                    else:
                        self._insert_product(connection, product)
                except sqlite3.IntegrityError as error:
                    raise ValueError(f"SKU {product['sku']} is already used by another product") from error
                reason = "Updated through legacy catalog sync"
                self._append_entity_revision(connection, "product", product["product_id"], product, reason, ctx)
                self._audit(
                    connection, "update" if before else "create", "product", product["product_id"], company_id,
                    reason, ctx, before, product,
                )
            if changed:
                connection.execute(
                    "UPDATE companies SET product_catalog_version=?, updated_at=? WHERE company_id=?",
                    (catalog_version + 1, now, company_id),
                )
            return [product_compatibility_view(item) for item in merged]

    def list_customers(
        self,
        company_id: str,
        include_archived: bool = False,
        query: str = "",
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        with self._connection() as connection:
            self._require_company_row(connection, company_id)
            clauses = ["company_id=?"]
            parameters: list[Any] = [company_id]
            if not include_archived:
                clauses.append("archived=0")
            if query.strip():
                clauses.append("(lower(customer_name) LIKE ? OR lower(organization) LIKE ? OR lower(customer_email) LIKE ?)")
                needle = f"%{query.strip().casefold()}%"
                parameters.extend([needle, needle, needle])
            parameters.extend([min(max(limit, 1), 500), max(offset, 0)])
            rows = connection.execute(
                f"SELECT * FROM customers WHERE {' AND '.join(clauses)} "
                "ORDER BY lower(customer_name) LIMIT ? OFFSET ?",
                parameters,
            )
            return [self._customer_from_row(row) for row in rows]

    def customer(self, company_id: str, customer_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            self._require_company_row(connection, company_id)
            row = connection.execute(
                "SELECT * FROM customers WHERE company_id=? AND customer_id=?", (company_id, customer_id)
            ).fetchone()
            return self._customer_from_row(row) if row else None

    def create_customer(
        self,
        company_id: str,
        values: dict[str, Any],
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        name = str(values.get("customer_name", "")).strip()
        if not name:
            raise ValueError("Customer name is required")
        now = utc_now()
        customer = {
            "customer_id": str(values.get("customer_id") or f"customer-{uuid4().hex[:10]}"),
            "company_id": company_id,
            "customer_name": name,
            "organization": str(values.get("organization", "")).strip(),
            "customer_email": str(values.get("customer_email", "")).strip(),
            "customer_phone": str(values.get("customer_phone", "")).strip(),
            "billing_address": str(values.get("billing_address", "")).strip(),
            "internal_notes": str(values.get("internal_notes", "")).strip(),
            "archived": False,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        }
        with self._connection(write=True) as connection:
            self._require_company_row(connection, company_id)
            try:
                self._insert_customer(connection, company_id, customer)
            except sqlite3.IntegrityError as error:
                raise ValueError("Customer id already exists") from error
            self._append_entity_revision(connection, "customer", customer["customer_id"], customer, change_reason, ctx)
            self._audit(
                connection, "create", "customer", customer["customer_id"], company_id,
                change_reason, ctx, None, customer,
            )
        return deepcopy(customer)

    def update_customer(
        self,
        company_id: str,
        customer_id: str,
        values: dict[str, Any],
        expected_version: int,
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        with self._connection(write=True) as connection:
            row = connection.execute(
                "SELECT * FROM customers WHERE company_id=? AND customer_id=?", (company_id, customer_id)
            ).fetchone()
            if not row:
                raise KeyError(customer_id)
            current = {**self._customer_from_row(row), "company_id": company_id}
            if expected_version != current["version"]:
                raise ValueError(f"Customer changed since version {expected_version}; current version is {current['version']}")
            allowed = {
                "customer_name", "organization", "customer_email", "customer_phone", "billing_address", "internal_notes"
            }
            candidate = {**current, **{key: str(value or "").strip() for key, value in values.items() if key in allowed}}
            if not candidate["customer_name"]:
                raise ValueError("Customer name is required")
            if all(candidate.get(key) == current.get(key) for key in allowed):
                return current
            candidate["version"] = current["version"] + 1
            candidate["updated_at"] = utc_now()
            connection.execute(
                """
                UPDATE customers SET customer_name=?, organization=?, customer_email=?, customer_phone=?,
                    billing_address=?, internal_notes=?, version=?, updated_at=?
                WHERE company_id=? AND customer_id=?
                """,
                (
                    candidate["customer_name"], candidate["organization"], candidate["customer_email"],
                    candidate["customer_phone"], candidate["billing_address"], candidate["internal_notes"],
                    candidate["version"], candidate["updated_at"], company_id, customer_id,
                ),
            )
            self._append_entity_revision(connection, "customer", customer_id, candidate, change_reason, ctx)
            self._audit(connection, "update", "customer", customer_id, company_id, change_reason, ctx, current, candidate)
            return candidate

    def set_customer_status(
        self,
        company_id: str,
        customer_id: str,
        archived: bool,
        expected_version: int,
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        with self._connection(write=True) as connection:
            row = connection.execute(
                "SELECT * FROM customers WHERE company_id=? AND customer_id=?", (company_id, customer_id)
            ).fetchone()
            if not row:
                raise KeyError(customer_id)
            current = {**self._customer_from_row(row), "company_id": company_id}
            if expected_version != current["version"]:
                raise ValueError(f"Customer changed since version {expected_version}; current version is {current['version']}")
            if current["archived"] == archived:
                return current
            candidate = {**current, "archived": archived, "version": current["version"] + 1, "updated_at": utc_now()}
            connection.execute(
                "UPDATE customers SET archived=?, version=?, updated_at=? WHERE company_id=? AND customer_id=?",
                (int(archived), candidate["version"], candidate["updated_at"], company_id, customer_id),
            )
            action = "archive" if archived else "restore"
            self._append_entity_revision(connection, "customer", customer_id, candidate, change_reason, ctx)
            self._audit(connection, action, "customer", customer_id, company_id, change_reason, ctx, current, candidate)
            return candidate

    def customer_revisions(self, company_id: str, customer_id: str) -> list[dict[str, Any]]:
        if not self.customer(company_id, customer_id):
            raise KeyError(customer_id)
        return self.entity_revisions("customer", customer_id)

    def replace_customers(
        self,
        company_id: str,
        customers: list[dict[str, Any]],
        context: MutationContext | None = None,
    ) -> list[dict[str, Any]]:
        """Compatibility sync that versions changes and archives omissions."""
        ctx = _context(context)
        incoming = [item for item in customers if str(item.get("customer_name", "")).strip()]
        with self._connection(write=True) as connection:
            self._require_company_row(connection, company_id)
            existing_rows = list(connection.execute("SELECT * FROM customers WHERE company_id=?", (company_id,)))
            existing = {row["customer_id"]: {**self._customer_from_row(row), "company_id": company_id} for row in existing_rows}
            seen: set[str] = set()
            results: list[dict[str, Any]] = []
            for raw in incoming:
                customer_id = str(raw.get("customer_id") or f"customer-{uuid4().hex[:10]}")
                if customer_id in seen:
                    raise ValueError(f"Duplicate customer id: {customer_id}")
                seen.add(customer_id)
                current = existing.get(customer_id)
                if current:
                    supplied_version = int(raw.get("version", current["version"]) or current["version"])
                    if supplied_version != current["version"]:
                        raise ValueError(
                            f"Customer changed since version {supplied_version}; current version is {current['version']}"
                        )
                    fields = {
                        key: str(raw.get(key, current.get(key, "")) or "").strip()
                        for key in (
                            "customer_name", "organization", "customer_email", "customer_phone",
                            "billing_address", "internal_notes",
                        )
                    }
                    candidate = {**current, **fields, "archived": bool(raw.get("archived", False))}
                    changed = any(candidate.get(key) != current.get(key) for key in (*fields.keys(), "archived"))
                    if changed:
                        candidate["version"] = current["version"] + 1
                        candidate["updated_at"] = utc_now()
                        connection.execute(
                            """
                            UPDATE customers SET customer_name=?, organization=?, customer_email=?, customer_phone=?,
                                billing_address=?, internal_notes=?, archived=?, version=?, updated_at=?
                            WHERE company_id=? AND customer_id=?
                            """,
                            (
                                candidate["customer_name"], candidate["organization"], candidate["customer_email"],
                                candidate["customer_phone"], candidate["billing_address"], candidate["internal_notes"],
                                int(candidate["archived"]), candidate["version"], candidate["updated_at"],
                                company_id, customer_id,
                            ),
                        )
                        reason = "Updated through customer compatibility sync"
                        self._append_entity_revision(connection, "customer", customer_id, candidate, reason, ctx)
                        self._audit(connection, "update", "customer", customer_id, company_id, reason, ctx, current, candidate)
                    results.append(candidate)
                else:
                    now = utc_now()
                    candidate = {
                        "customer_id": customer_id,
                        "company_id": company_id,
                        "customer_name": str(raw.get("customer_name", "")).strip(),
                        "organization": str(raw.get("organization", "")).strip(),
                        "customer_email": str(raw.get("customer_email", "")).strip(),
                        "customer_phone": str(raw.get("customer_phone", "")).strip(),
                        "billing_address": str(raw.get("billing_address", "")).strip(),
                        "internal_notes": str(raw.get("internal_notes", "")).strip(),
                        "archived": bool(raw.get("archived", False)),
                        "version": 1,
                        "created_at": now,
                        "updated_at": now,
                    }
                    self._insert_customer(connection, company_id, candidate)
                    reason = "Created through customer compatibility sync"
                    self._append_entity_revision(connection, "customer", customer_id, candidate, reason, ctx)
                    self._audit(connection, "create", "customer", customer_id, company_id, reason, ctx, None, candidate)
                    results.append(candidate)
            for customer_id, current in existing.items():
                if customer_id in seen or current["archived"]:
                    continue
                candidate = {**current, "archived": True, "version": current["version"] + 1, "updated_at": utc_now()}
                connection.execute(
                    "UPDATE customers SET archived=1, version=?, updated_at=? WHERE customer_id=?",
                    (candidate["version"], candidate["updated_at"], customer_id),
                )
                reason = "Archived after omission from customer compatibility sync"
                self._append_entity_revision(connection, "customer", customer_id, candidate, reason, ctx)
                self._audit(connection, "archive", "customer", customer_id, company_id, reason, ctx, current, candidate)
            return [item for item in results if not item["archived"]]

    def list_events(
        self,
        company_id: str,
        customer_id: str | None = None,
        include_archived: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        with self._connection() as connection:
            self._require_company_row(connection, company_id)
            clauses = ["company_id=?"]
            parameters: list[Any] = [company_id]
            if customer_id:
                clauses.append("customer_id=?")
                parameters.append(customer_id)
            if not include_archived:
                clauses.append("archived=0")
            parameters.extend([min(max(limit, 1), 500), max(offset, 0)])
            rows = connection.execute(
                f"SELECT * FROM events WHERE {' AND '.join(clauses)} "
                "ORDER BY event_date DESC, lower(event_name) LIMIT ? OFFSET ?",
                parameters,
            )
            return [self._event_from_row(row) for row in rows]

    def event(self, company_id: str, event_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            self._require_company_row(connection, company_id)
            row = connection.execute(
                "SELECT * FROM events WHERE company_id=? AND event_id=?", (company_id, event_id)
            ).fetchone()
            return self._event_from_row(row) if row else None

    @staticmethod
    def _event_values(values: dict[str, Any], current: dict[str, Any] | None = None) -> dict[str, Any]:
        base = current or {}
        event_type = str(values.get("event_type", base.get("event_type", "Private Event")) or "Private Event").strip()
        return {
            "customer_id": str(values.get("customer_id", base.get("customer_id", "")) or "").strip(),
            "event_name": str(values.get("event_name", base.get("event_name", event_type)) or event_type).strip(),
            "event_type": event_type,
            "event_date": str(values.get("event_date", base.get("event_date", "")) or "").strip(),
            "venue": str(values.get("venue", base.get("venue", "")) or "").strip(),
            "guest_count": max(int(values.get("guest_count", base.get("guest_count", 50)) or 50), 1),
            "servers_count": max(int(values.get("servers_count", base.get("servers_count", 0)) or 0), 0),
            "servers_hours": max(int(values.get("servers_hours", base.get("servers_hours", 0)) or 0), 0),
            "kitchen_staff_count": max(int(values.get("kitchen_staff_count", base.get("kitchen_staff_count", 0)) or 0), 0),
            "kitchen_staff_hours": max(int(values.get("kitchen_staff_hours", base.get("kitchen_staff_hours", 0)) or 0), 0),
            "utensils_buffer": max(int(values.get("utensils_buffer", base.get("utensils_buffer", 0)) or 0), 0),
            "charge_tax": bool(values.get("charge_tax", base.get("charge_tax", False))),
            "tax_percent": max(float(values.get("tax_percent", base.get("tax_percent", 0)) or 0), 0),
            "default_deposit_amount": max(
                float(values.get("default_deposit_amount", base.get("default_deposit_amount", 0)) or 0), 0
            ),
        }

    def create_event(
        self,
        company_id: str,
        values: dict[str, Any],
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        fields = self._event_values(values)
        if not fields["customer_id"]:
            raise ValueError("Customer id is required")
        now = utc_now()
        event = {
            "event_id": str(values.get("event_id") or f"event-{uuid4().hex[:10]}"),
            "company_id": company_id,
            **fields,
            "archived": False,
            "version": 1,
            "created_at": now,
            "updated_at": now,
        }
        with self._connection(write=True) as connection:
            self._require_company_row(connection, company_id)
            customer = connection.execute(
                "SELECT 1 FROM customers WHERE company_id=? AND customer_id=? AND archived=0",
                (company_id, fields["customer_id"]),
            ).fetchone()
            if not customer:
                raise ValueError("Active customer not found")
            try:
                self._insert_event(connection, company_id, event)
            except sqlite3.IntegrityError as error:
                raise ValueError("Event id already exists") from error
            self._append_entity_revision(connection, "event", event["event_id"], event, change_reason, ctx)
            self._audit(connection, "create", "event", event["event_id"], company_id, change_reason, ctx, None, event)
        return deepcopy(event)

    def update_event(
        self,
        company_id: str,
        event_id: str,
        values: dict[str, Any],
        expected_version: int,
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        with self._connection(write=True) as connection:
            row = connection.execute(
                "SELECT * FROM events WHERE company_id=? AND event_id=?", (company_id, event_id)
            ).fetchone()
            if not row:
                raise KeyError(event_id)
            current = {**self._event_from_row(row), "company_id": company_id}
            if expected_version != current["version"]:
                raise ValueError(f"Event changed since version {expected_version}; current version is {current['version']}")
            fields = self._event_values(values, current)
            customer = connection.execute(
                "SELECT 1 FROM customers WHERE company_id=? AND customer_id=? AND archived=0",
                (company_id, fields["customer_id"]),
            ).fetchone()
            if not customer:
                raise ValueError("Active customer not found")
            candidate = {**current, **fields}
            if all(candidate.get(key) == current.get(key) for key in fields):
                return current
            candidate["version"] = current["version"] + 1
            candidate["updated_at"] = utc_now()
            connection.execute(
                """
                UPDATE events SET customer_id=?, event_name=?, event_type=?, event_date=?, venue=?, guest_count=?,
                    servers_count=?, servers_hours=?, kitchen_staff_count=?, kitchen_staff_hours=?, utensils_buffer=?,
                    charge_tax=?, tax_percent=?, default_deposit_amount=?, version=?, updated_at=?
                WHERE company_id=? AND event_id=?
                """,
                (
                    candidate["customer_id"], candidate["event_name"], candidate["event_type"], candidate["event_date"],
                    candidate["venue"], candidate["guest_count"], candidate["servers_count"], candidate["servers_hours"],
                    candidate["kitchen_staff_count"], candidate["kitchen_staff_hours"], candidate["utensils_buffer"],
                    int(candidate["charge_tax"]), candidate["tax_percent"], candidate["default_deposit_amount"],
                    candidate["version"], candidate["updated_at"], company_id, event_id,
                ),
            )
            self._append_entity_revision(connection, "event", event_id, candidate, change_reason, ctx)
            self._audit(connection, "update", "event", event_id, company_id, change_reason, ctx, current, candidate)
            return candidate

    def set_event_status(
        self,
        company_id: str,
        event_id: str,
        archived: bool,
        expected_version: int,
        change_reason: str,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        with self._connection(write=True) as connection:
            row = connection.execute(
                "SELECT * FROM events WHERE company_id=? AND event_id=?", (company_id, event_id)
            ).fetchone()
            if not row:
                raise KeyError(event_id)
            current = {**self._event_from_row(row), "company_id": company_id}
            if expected_version != current["version"]:
                raise ValueError(f"Event changed since version {expected_version}; current version is {current['version']}")
            if current["archived"] == archived:
                return current
            candidate = {**current, "archived": archived, "version": current["version"] + 1, "updated_at": utc_now()}
            connection.execute(
                "UPDATE events SET archived=?, version=?, updated_at=? WHERE company_id=? AND event_id=?",
                (int(archived), candidate["version"], candidate["updated_at"], company_id, event_id),
            )
            action = "archive" if archived else "restore"
            self._append_entity_revision(connection, "event", event_id, candidate, change_reason, ctx)
            self._audit(connection, action, "event", event_id, company_id, change_reason, ctx, current, candidate)
            return candidate

    def event_revisions(self, company_id: str, event_id: str) -> list[dict[str, Any]]:
        if not self.event(company_id, event_id):
            raise KeyError(event_id)
        return self.entity_revisions("event", event_id)

    def replace_events(
        self,
        company_id: str,
        events: list[dict[str, Any]],
        context: MutationContext | None = None,
    ) -> list[dict[str, Any]]:
        """Compatibility sync that versions changes and archives omissions."""
        ctx = _context(context)
        with self._connection(write=True) as connection:
            self._require_company_row(connection, company_id)
            valid_customers = {
                row[0]
                for row in connection.execute(
                    "SELECT customer_id FROM customers WHERE company_id=? AND archived=0", (company_id,)
                )
            }
            existing_rows = list(connection.execute("SELECT * FROM events WHERE company_id=?", (company_id,)))
            existing = {row["event_id"]: {**self._event_from_row(row), "company_id": company_id} for row in existing_rows}
            seen: set[str] = set()
            results: list[dict[str, Any]] = []
            for raw in events:
                event_id = str(raw.get("event_id") or f"event-{uuid4().hex[:10]}")
                if event_id in seen:
                    raise ValueError(f"Duplicate event id: {event_id}")
                seen.add(event_id)
                current = existing.get(event_id)
                fields = self._event_values(raw, current)
                if fields["customer_id"] not in valid_customers:
                    raise ValueError(f"Active customer not found: {fields['customer_id']}")
                if current:
                    supplied_version = int(raw.get("version", current["version"]) or current["version"])
                    if supplied_version != current["version"]:
                        raise ValueError(
                            f"Event changed since version {supplied_version}; current version is {current['version']}"
                        )
                    candidate = {**current, **fields, "archived": bool(raw.get("archived", False))}
                    changed = any(candidate.get(key) != current.get(key) for key in (*fields.keys(), "archived"))
                    if changed:
                        candidate["version"] = current["version"] + 1
                        candidate["updated_at"] = utc_now()
                        connection.execute(
                            """
                            UPDATE events SET customer_id=?, event_name=?, event_type=?, event_date=?, venue=?, guest_count=?,
                                servers_count=?, servers_hours=?, kitchen_staff_count=?, kitchen_staff_hours=?, utensils_buffer=?,
                                charge_tax=?, tax_percent=?, default_deposit_amount=?, archived=?, version=?, updated_at=?
                            WHERE company_id=? AND event_id=?
                            """,
                            (
                                candidate["customer_id"], candidate["event_name"], candidate["event_type"],
                                candidate["event_date"], candidate["venue"], candidate["guest_count"],
                                candidate["servers_count"], candidate["servers_hours"], candidate["kitchen_staff_count"],
                                candidate["kitchen_staff_hours"], candidate["utensils_buffer"], int(candidate["charge_tax"]),
                                candidate["tax_percent"], candidate["default_deposit_amount"], int(candidate["archived"]),
                                candidate["version"], candidate["updated_at"], company_id, event_id,
                            ),
                        )
                        reason = "Updated through event compatibility sync"
                        self._append_entity_revision(connection, "event", event_id, candidate, reason, ctx)
                        self._audit(connection, "update", "event", event_id, company_id, reason, ctx, current, candidate)
                    results.append(candidate)
                else:
                    now = utc_now()
                    candidate = {
                        "event_id": event_id,
                        "company_id": company_id,
                        **fields,
                        "archived": bool(raw.get("archived", False)),
                        "version": 1,
                        "created_at": now,
                        "updated_at": now,
                    }
                    self._insert_event(connection, company_id, candidate)
                    reason = "Created through event compatibility sync"
                    self._append_entity_revision(connection, "event", event_id, candidate, reason, ctx)
                    self._audit(connection, "create", "event", event_id, company_id, reason, ctx, None, candidate)
                    results.append(candidate)
            for event_id, current in existing.items():
                if event_id in seen or current["archived"]:
                    continue
                candidate = {**current, "archived": True, "version": current["version"] + 1, "updated_at": utc_now()}
                connection.execute(
                    "UPDATE events SET archived=1, version=?, updated_at=? WHERE event_id=?",
                    (candidate["version"], candidate["updated_at"], event_id),
                )
                reason = "Archived after omission from event compatibility sync"
                self._append_entity_revision(connection, "event", event_id, candidate, reason, ctx)
                self._audit(connection, "archive", "event", event_id, company_id, reason, ctx, current, candidate)
            return [item for item in results if not item["archived"]]

    def next_estimate_number(self) -> str:
        with self._connection(write=True) as connection:
            number = int(self._metadata(connection, "next_estimate_number", "1001"))
            self._set_metadata(connection, "next_estimate_number", str(number + 1))
            return f"EST-{number}"

    def estimate_record(self, estimate_number: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            record = connection.execute(
                "SELECT * FROM estimates WHERE estimate_number=?", (clean_filename(estimate_number),)
            ).fetchone()
            if not record:
                return None
            revisions = [
                _from_json(row["payload_json"], {})
                for row in connection.execute(
                    "SELECT payload_json FROM estimate_revisions WHERE estimate_number=? ORDER BY revision_number",
                    (record["estimate_number"],),
                )
            ]
            return {
                "estimate_number": record["estimate_number"],
                "archived": _bool(record["archived"]),
                "current_revision": int(record["current_revision"]),
                "revisions": revisions,
            }

    def estimate(self, estimate_number: str, revision_number: int | None = None) -> dict[str, Any] | None:
        with self._connection() as connection:
            if revision_number is None:
                row = connection.execute(
                    """
                    SELECT er.payload_json FROM estimates e
                    JOIN estimate_revisions er ON er.estimate_number=e.estimate_number
                        AND er.revision_number=e.current_revision
                    WHERE e.estimate_number=?
                    """,
                    (clean_filename(estimate_number),),
                ).fetchone()
            else:
                row = connection.execute(
                    "SELECT payload_json FROM estimate_revisions WHERE estimate_number=? AND revision_number=?",
                    (clean_filename(estimate_number), revision_number),
                ).fetchone()
            return _from_json(row[0], {}) if row else None

    def list_revisions(self, estimate_number: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            exists = connection.execute(
                "SELECT 1 FROM estimates WHERE estimate_number=?", (clean_filename(estimate_number),)
            ).fetchone()
            if not exists:
                raise KeyError(estimate_number)
            return [
                {
                    "revision_number": int(row["revision_number"]),
                    "revision_id": row["revision_id"],
                    "revision_reason": row["revision_reason"],
                    "updated_at": row["updated_at"],
                    "total": float(row["total"]),
                    "actor": row["actor"],
                    "request_id": row["request_id"],
                }
                for row in connection.execute(
                    "SELECT * FROM estimate_revisions WHERE estimate_number=? ORDER BY revision_number DESC",
                    (clean_filename(estimate_number),),
                )
            ]

    def save_estimate(
        self,
        payload: dict[str, Any],
        base_revision: int | None = None,
        context: MutationContext | None = None,
    ) -> dict[str, Any]:
        ctx = _context(context)
        number = clean_filename(str(payload["estimate_number"]))
        with self._connection(write=True) as connection:
            row = connection.execute("SELECT * FROM estimates WHERE estimate_number=?", (number,)).fetchone()
            before = None
            if row:
                current_revision = int(row["current_revision"])
                if base_revision is None:
                    raise ValueError("base_revision is required when revising an existing estimate")
                if base_revision != current_revision:
                    raise ValueError(f"Estimate changed since revision {base_revision}; reload before saving")
                before_row = connection.execute(
                    "SELECT payload_json FROM estimate_revisions WHERE estimate_number=? AND revision_number=?",
                    (number, current_revision),
                ).fetchone()
                before = _from_json(before_row[0], {}) if before_row else None
                next_revision = current_revision + 1
            else:
                next_revision = 1
                created_at = str(payload.get("created_at") or utc_now())
                connection.execute(
                    "INSERT INTO estimates(estimate_number, archived, current_revision, created_at, updated_at) VALUES (?, 0, 0, ?, ?)",
                    (number, created_at, created_at),
                )
            saved = deepcopy(payload)
            saved["estimate_number"] = number
            saved["revision_number"] = next_revision
            saved["revision_id"] = str(saved.get("revision_id") or f"revision-{uuid4().hex[:12]}")
            saved["updated_at"] = str(saved.get("updated_at") or utc_now())
            self._insert_estimate_revision(connection, saved, ctx)
            connection.execute(
                "UPDATE estimates SET archived=0, current_revision=?, updated_at=? WHERE estimate_number=?",
                (next_revision, saved["updated_at"], number),
            )
            reason = str(saved.get("revision_reason", "Updated estimate"))
            self._audit(
                connection, "create" if before is None else "revise", "estimate", number,
                str(saved.get("company_id", "")), reason, ctx, before, saved,
            )
            return saved

    def list_estimates(
        self,
        company_id: str | None = None,
        customer_id: str | None = None,
        event_id: str | None = None,
        include_archived: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        clauses = ["er.revision_number=e.current_revision"]
        parameters: list[Any] = []
        if not include_archived:
            clauses.append("e.archived=0")
        for field, value in (("er.company_id", company_id), ("er.customer_id", customer_id), ("er.event_id", event_id)):
            if value:
                clauses.append(f"{field}=?")
                parameters.append(value)
        parameters.extend([min(max(limit, 1), 500), max(offset, 0)])
        with self._connection() as connection:
            rows = connection.execute(
                f"""
                SELECT e.archived, er.* FROM estimates e
                JOIN estimate_revisions er ON er.estimate_number=e.estimate_number
                WHERE {' AND '.join(clauses)}
                ORDER BY er.updated_at DESC, er.estimate_number DESC LIMIT ? OFFSET ?
                """,
                parameters,
            )
            return [
                {
                    "file": f"{row['estimate_number']}.json",
                    "estimate_number": row["estimate_number"],
                    "revision_number": int(row["revision_number"]),
                    "company_id": row["company_id"],
                    "customer_id": row["customer_id"],
                    "customer_name": row["customer_name"],
                    "event_id": row["event_id"],
                    "event_name": row["event_name"],
                    "event_date": row["event_date"],
                    "total": float(row["total"]),
                    "updated_at": row["updated_at"],
                    "archived": _bool(row["archived"]),
                }
                for row in rows
            ]

    def archive_estimate(
        self,
        estimate_number: str,
        base_revision: int | None = None,
        change_reason: str = "Archived estimate",
        context: MutationContext | None = None,
    ) -> None:
        self._set_estimate_archived(estimate_number, True, base_revision, change_reason, context)

    def restore_estimate(
        self,
        estimate_number: str,
        base_revision: int,
        change_reason: str,
        context: MutationContext | None = None,
    ) -> None:
        self._set_estimate_archived(estimate_number, False, base_revision, change_reason, context)

    def _set_estimate_archived(
        self,
        estimate_number: str,
        archived: bool,
        base_revision: int | None,
        change_reason: str,
        context: MutationContext | None,
    ) -> None:
        ctx = _context(context)
        number = clean_filename(estimate_number)
        with self._connection(write=True) as connection:
            row = connection.execute("SELECT * FROM estimates WHERE estimate_number=?", (number,)).fetchone()
            if not row:
                raise KeyError(estimate_number)
            current_revision = int(row["current_revision"])
            if base_revision is not None and base_revision != current_revision:
                raise ValueError(f"Estimate changed since revision {base_revision}; current revision is {current_revision}")
            before = {"archived": _bool(row["archived"]), "current_revision": current_revision}
            connection.execute(
                "UPDATE estimates SET archived=?, updated_at=? WHERE estimate_number=?",
                (int(archived), utc_now(), number),
            )
            after = {"archived": archived, "current_revision": current_revision}
            self._audit(
                connection, "archive" if archived else "restore", "estimate", number, "",
                change_reason, ctx, before, after,
            )

    def delete_estimate(self, estimate_number: str) -> None:
        self.archive_estimate(estimate_number)

    def idempotency_lookup(
        self,
        actor: str,
        idempotency_key: str,
        operation: str,
        request_hash: str,
    ) -> Any | None:
        if not idempotency_key:
            return None
        with self._connection(write=True) as connection:
            connection.execute("DELETE FROM idempotency_records WHERE expires_at < ?", (utc_now(),))
            row = connection.execute(
                "SELECT * FROM idempotency_records WHERE actor=? AND idempotency_key=?",
                (actor, idempotency_key),
            ).fetchone()
            if not row:
                return None
            if row["operation"] != operation or row["request_hash"] != request_hash:
                raise ValueError("Idempotency key was already used for a different request")
            return _from_json(row["response_json"], None)

    def idempotency_store(
        self,
        actor: str,
        idempotency_key: str,
        operation: str,
        request_hash: str,
        response: Any,
        ttl_hours: int = 24,
    ) -> None:
        if not idempotency_key:
            return
        now = datetime.now(timezone.utc)
        expires = now + timedelta(hours=max(ttl_hours, 1))
        with self._connection(write=True) as connection:
            existing = connection.execute(
                "SELECT operation, request_hash FROM idempotency_records WHERE actor=? AND idempotency_key=?",
                (actor, idempotency_key),
            ).fetchone()
            if existing:
                if existing["operation"] != operation or existing["request_hash"] != request_hash:
                    raise ValueError("Idempotency key was already used for a different request")
                return
            connection.execute(
                """
                INSERT INTO idempotency_records(
                    actor, idempotency_key, operation, request_hash, response_json, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    actor, idempotency_key, operation, request_hash, _json(response),
                    now.isoformat().replace("+00:00", "Z"), expires.isoformat().replace("+00:00", "Z"),
                ),
            )

    @staticmethod
    def request_hash(operation: str, payload: Any) -> str:
        return hashlib.sha256(f"{operation}\n{_json(payload)}".encode("utf-8")).hexdigest()

    def create_api_token(self, name: str, scopes: set[str]) -> tuple[dict[str, Any], str]:
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Token name is required")
        invalid = set(scopes) - ALL_SCOPES
        if invalid:
            raise ValueError(f"Unknown scopes: {', '.join(sorted(invalid))}")
        raw_token = f"office_{secrets.token_urlsafe(32)}"
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        record = {
            "token_id": f"token-{uuid4().hex[:12]}",
            "name": normalized_name,
            "scopes": sorted(scopes),
            "active": True,
            "created_at": utc_now(),
            "last_used_at": None,
        }
        try:
            with self._connection(write=True) as connection:
                connection.execute(
                    """
                    INSERT INTO api_tokens(token_id, token_hash, name, scopes, active, created_at)
                    VALUES (?, ?, ?, ?, 1, ?)
                    """,
                    (record["token_id"], token_hash, normalized_name, " ".join(record["scopes"]), record["created_at"]),
                )
                self._audit(
                    connection, "create", "api_token", record["token_id"], "", "Created API token",
                    MutationContext(actor="token-admin"), None, record,
                )
        except sqlite3.IntegrityError as error:
            raise ValueError("A token with that name already exists") from error
        return record, raw_token

    def list_api_tokens(self) -> list[dict[str, Any]]:
        with self._connection() as connection:
            return [
                {
                    "token_id": row["token_id"],
                    "name": row["name"],
                    "scopes": sorted(set(str(row["scopes"]).split())),
                    "active": _bool(row["active"]),
                    "created_at": row["created_at"],
                    "last_used_at": row["last_used_at"],
                }
                for row in connection.execute(
                    "SELECT token_id, name, scopes, active, created_at, last_used_at FROM api_tokens ORDER BY name"
                )
            ]

    def authenticate_api_token(self, raw_token: str) -> dict[str, Any] | None:
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        with self._connection(write=True) as connection:
            row = connection.execute(
                "SELECT * FROM api_tokens WHERE token_hash=? AND active=1", (token_hash,)
            ).fetchone()
            if not row:
                return None
            used_at = utc_now()
            connection.execute("UPDATE api_tokens SET last_used_at=? WHERE token_id=?", (used_at, row["token_id"]))
            return {
                "token_id": row["token_id"],
                "name": row["name"],
                "scopes": set(str(row["scopes"]).split()),
                "last_used_at": used_at,
            }

    def revoke_api_token(self, token_id: str, actor: str = "token-admin") -> None:
        with self._connection(write=True) as connection:
            row = connection.execute("SELECT * FROM api_tokens WHERE token_id=?", (token_id,)).fetchone()
            if not row:
                raise KeyError(token_id)
            connection.execute("UPDATE api_tokens SET active=0 WHERE token_id=?", (token_id,))
            self._audit(
                connection, "revoke", "api_token", token_id, "", "Revoked API token",
                MutationContext(actor=actor), {"active": _bool(row["active"])}, {"active": False},
            )

    def list_audit_log(
        self,
        entity_type: str | None = None,
        entity_id: str | None = None,
        actor: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        parameters: list[Any] = []
        for field, value in (("entity_type", entity_type), ("entity_id", entity_id), ("actor", actor)):
            if value:
                clauses.append(f"{field}=?")
                parameters.append(value)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        parameters.extend([min(max(limit, 1), 500), max(offset, 0)])
        with self._connection() as connection:
            rows = connection.execute(
                f"SELECT * FROM audit_log {where} ORDER BY occurred_at DESC LIMIT ? OFFSET ?", parameters
            )
            return [
                {
                    "audit_id": row["audit_id"],
                    "occurred_at": row["occurred_at"],
                    "actor": row["actor"],
                    "action": row["action"],
                    "entity_type": row["entity_type"],
                    "entity_id": row["entity_id"],
                    "company_id": row["company_id"],
                    "reason": row["reason"],
                    "request_id": row["request_id"],
                    "idempotency_key": row["idempotency_key"],
                    "before": _from_json(row["before_json"], None),
                    "after": _from_json(row["after_json"], None),
                }
                for row in rows
            ]

    def create_import_job(self, import_type: str, actor: str, payload: dict[str, Any], summary: dict[str, Any]) -> str:
        job_id = f"import-{uuid4().hex[:16]}"
        with self._connection(write=True) as connection:
            connection.execute(
                """
                INSERT INTO import_jobs(job_id, import_type, actor, status, created_at, summary_json, payload_json)
                VALUES (?, ?, ?, 'previewed', ?, ?, ?)
                """,
                (job_id, import_type, actor, utc_now(), _json(summary), _json(payload)),
            )
        return job_id

    def import_job(self, job_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM import_jobs WHERE job_id=?", (job_id,)).fetchone()
            if not row:
                return None
            return {
                "job_id": row["job_id"],
                "import_type": row["import_type"],
                "actor": row["actor"],
                "status": row["status"],
                "created_at": row["created_at"],
                "committed_at": row["committed_at"],
                "summary": _from_json(row["summary_json"], {}),
                "payload": _from_json(row["payload_json"], {}),
            }

    def complete_import_job(self, job_id: str, result: dict[str, Any], context: MutationContext) -> None:
        with self._connection(write=True) as connection:
            row = connection.execute("SELECT * FROM import_jobs WHERE job_id=?", (job_id,)).fetchone()
            if not row:
                raise KeyError(job_id)
            if row["status"] != "previewed":
                raise ValueError("Import job was already committed")
            connection.execute(
                "UPDATE import_jobs SET status='committed', committed_at=?, summary_json=? WHERE job_id=?",
                (utc_now(), _json(result), job_id),
            )
            self._audit(
                connection, "commit", "import_job", job_id, "", "Committed browser demo import",
                context, _from_json(row["summary_json"], {}), result,
            )

    def database_health(self) -> dict[str, Any]:
        with self._connection() as connection:
            integrity = str(connection.execute("PRAGMA integrity_check").fetchone()[0])
            counts = {
                table: int(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0])
                for table in ("companies", "products", "customers", "events", "estimates", "estimate_revisions")
            }
            return {
                "status": "ok" if integrity == "ok" else "error",
                "integrity": integrity,
                "schema_version": int(self._metadata(connection, "schema_version", "0")),
                "legacy_import_completed": self._metadata(connection, "legacy_import_completed", ""),
                "counts": counts,
            }

    def backup_to(self, target: Path) -> dict[str, Any]:
        target = Path(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            raise FileExistsError(target)
        source = self._connect()
        destination = sqlite3.connect(target)
        try:
            source.backup(destination)
            integrity = str(destination.execute("PRAGMA integrity_check").fetchone()[0])
            if integrity != "ok":
                raise RuntimeError(f"Backup integrity check failed: {integrity}")
        finally:
            destination.close()
            source.close()
        os.chmod(target, 0o640)
        return {"path": str(target), "size": target.stat().st_size, "integrity": "ok"}


# Keep the historical import name for callers while all active persistence is SQLite.
JsonRepository = SqliteRepository
