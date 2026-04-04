from __future__ import annotations

import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

APP_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = APP_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
ESTIMATES_DIR = DATA_DIR / "estimates"
SETTINGS_FILE = DATA_DIR / "settings.json"
COMPANIES_FILE = DATA_DIR / "companies.json"
COUNTER_FILE = DATA_DIR / "counter.json"
HEADER_LOGO_FILE = PROJECT_ROOT / "images" / "logo_header.png"

TWOPLACES = Decimal("0.01")
NEW_COMPANY_OPTION = "Create new company"
GUEST_COUNT_DEFAULT_CATEGORIES = {
    "hot entree",
    "cold entree",
    "sides",
    "salads",
    "appetizers",
    "desserts",
    "fruits",
}

DEFAULT_SETTINGS = {
    "business_name": "Premium Dynasty Catering",
    "business_email": "office@premiumdynasty.com",
    "business_phone": "",
    "business_address": "",
    "default_tax_percent": 0.0,
    "default_service_charge_percent": 0.0,
    "default_gratuity_percent": 0.0,
    "payment_terms": "50% deposit due upon approval. Final balance due before the event.",
    "estimate_notes": "Thank you for the opportunity to cater your event.",
}

DEFAULT_LINE_ITEMS = [
    {
        "product_id": "",
        "Category": "",
        "Description": "Catering package",
        "Notes": "",
        "Qty": 1,
        "Unit Price": 0.00,
    },
    {
        "product_id": "",
        "Category": "",
        "Description": "Service staff",
        "Notes": "",
        "Qty": 1,
        "Unit Price": 0.00,
    },
]


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def normalize_company_name(value: str) -> str:
    return value.strip().casefold()


def normalize_product_name(value: str) -> str:
    return value.strip().casefold()


def normalize_client_name(value: str) -> str:
    return value.strip().casefold()


def parse_flexible_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value

    raw = str(value or "").strip()
    if not raw:
        return None

    for fmt in ("%Y-%m-%d", "%m-%d-%Y", "%m/%d/%Y", "%m.%d.%Y", "%Y/%m/%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def normalize_date_string(value: Any) -> str:
    parsed = parse_flexible_date(value)
    return parsed.strftime("%m-%d-%Y") if parsed else str(value or "").strip()


def to_int(value: Any, default: int = 0) -> int:
    try:
        return int(to_decimal(value))
    except Exception:
        return default


def uses_guest_count_default(category: str) -> bool:
    return category.strip().casefold() in GUEST_COUNT_DEFAULT_CATEGORIES


def is_service_category(category: str) -> bool:
    return category.strip().casefold() == "service"


def is_staff_category(category: str) -> bool:
    return category.strip().casefold() == "staff"


def is_delivery_category(category: str) -> bool:
    return category.strip().casefold() == "delivery"


def is_utensils_category(category: str) -> bool:
    return category.strip().casefold() == "utensils"


def is_servers_product(product: dict[str, Any]) -> bool:
    return str(product.get("Description", "")).strip().casefold() == "servers"


def is_kitchen_staff_product(product: dict[str, Any]) -> bool:
    return str(product.get("Description", "")).strip().casefold() == "kitchen staff"


def default_estimate_qty(product: dict[str, Any], client: dict[str, Any], guest_count: int) -> float:
    if is_servers_product(product):
        return float(to_int(client.get("servers_count", 0), 0) * to_int(client.get("servers_hours", 0), 0))
    if is_kitchen_staff_product(product):
        return float(to_int(client.get("kitchen_staff_count", 0), 0) * to_int(client.get("kitchen_staff_hours", 0), 0))
    if is_utensils_category(str(product.get("Category", ""))):
        return float(guest_count + to_int(client.get("utensils_buffer", 0), 0))
    if uses_guest_count_default(str(product.get("Category", ""))):
        return float(guest_count)
    return 1.0


def next_product_id(products: list[dict[str, Any]]) -> str:
    highest = 0
    for product in products:
        product_id = str(product.get("product_id", ""))
        if product_id.startswith("product-"):
            suffix = product_id.removeprefix("product-")
            if suffix.isdigit():
                highest = max(highest, int(suffix))
    return f"product-{highest + 1}"


def next_client_id(clients: list[dict[str, Any]]) -> str:
    highest = 0
    for client in clients:
        client_id = str(client.get("client_id", ""))
        if client_id.startswith("client-"):
            suffix = client_id.removeprefix("client-")
            if suffix.isdigit():
                highest = max(highest, int(suffix))
    return f"client-{highest + 1}"


def build_product_record(source: dict[str, Any] | None = None, product_id: str | None = None) -> dict[str, Any]:
    product = {
        "product_id": product_id or "",
        "Category": "",
        "Description": "",
        "Notes": "",
        "Unit Price": 0.0,
    }
    if source:
        product.update(
            {
                "product_id": str(source.get("product_id", product["product_id"])).strip(),
                "Category": str(source.get("Category", "")).strip(),
                "Description": str(source.get("Description", "")).strip(),
                "Notes": str(source.get("Notes", source.get("notes", ""))).strip(),
                "Unit Price": float(to_decimal(source.get("Unit Price", 0.0))),
            }
        )
    return product


def build_client_record(source: dict[str, Any] | None = None, client_id: str | None = None) -> dict[str, Any]:
    client = {
        "client_id": client_id or "",
        "client_name": "",
        "client_email": "",
        "client_phone": "",
        "event_type": "Private Event",
        "event_date": "",
        "venue": "",
        "guest_count": 50,
        "servers_count": 0,
        "servers_hours": 0,
        "kitchen_staff_count": 0,
        "kitchen_staff_hours": 0,
        "deposit_amount": 0.0,
        "utensils_buffer": 0,
    }
    if source:
        client.update(
            {
                "client_id": str(source.get("client_id", client["client_id"])).strip(),
                "client_name": str(source.get("client_name", "")).strip(),
                "client_email": str(source.get("client_email", "")).strip(),
                "client_phone": str(source.get("client_phone", "")).strip(),
                "event_type": str(source.get("event_type", client["event_type"])).strip() or "Private Event",
                "event_date": normalize_date_string(source.get("event_date", "")),
                "venue": str(source.get("venue", "")).strip(),
                "guest_count": to_int(source.get("guest_count", client["guest_count"]) or client["guest_count"], client["guest_count"]),
                "servers_count": to_int(source.get("servers_count", source.get("Servers (#)", 0)), 0),
                "servers_hours": to_int(source.get("servers_hours", source.get("Servers (hrs)", 0)), 0),
                "kitchen_staff_count": to_int(source.get("kitchen_staff_count", source.get("Kitchen Staff (#)", 0)), 0),
                "kitchen_staff_hours": to_int(source.get("kitchen_staff_hours", source.get("Kitchen Staff (hrs)", 0)), 0),
                "deposit_amount": float(to_decimal(source.get("deposit_amount", source.get("Deposit ($)", 0.0)))),
                "utensils_buffer": to_int(source.get("utensils_buffer", source.get("Utensils Buffer", 0)), 0),
            }
        )
    return client


def normalize_products(products: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized_products: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for product in products or []:
        if not isinstance(product, dict):
            continue
        normalized = build_product_record(source=product)
        if not normalized["Description"]:
            continue
        product_id = normalized["product_id"] or next_product_id(normalized_products)
        if product_id in seen_ids:
            product_id = next_product_id(normalized_products)
        normalized["product_id"] = product_id
        normalized_products.append(normalized)
        seen_ids.add(product_id)
    return normalized_products


def normalize_clients(clients: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized_clients: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for client in clients or []:
        if not isinstance(client, dict):
            continue
        normalized = build_client_record(source=client)
        if not normalized["client_name"]:
            continue
        client_id = normalized["client_id"] or next_client_id(normalized_clients)
        if client_id in seen_ids:
            client_id = next_client_id(normalized_clients)
        normalized["client_id"] = client_id
        normalized_clients.append(normalized)
        seen_ids.add(client_id)
    return normalized_clients


def build_company_record(name: str | None = None, source: dict[str, Any] | None = None) -> dict[str, Any]:
    company = DEFAULT_SETTINGS.copy()
    if source:
        company.update({key: source.get(key, company[key]) for key in company})
    business_name = (name or company.get("business_name") or DEFAULT_SETTINGS["business_name"]).strip()
    company["business_name"] = business_name or DEFAULT_SETTINGS["business_name"]
    company["products"] = normalize_products(source.get("products") if source else [])
    company["clients"] = normalize_clients(source.get("clients") if source else [])
    return company


def default_company_store() -> dict[str, Any]:
    default_company = build_company_record()
    return {
        "selected_company": default_company["business_name"],
        "companies": [default_company],
    }


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ESTIMATES_DIR.mkdir(parents=True, exist_ok=True)
    if not SETTINGS_FILE.exists():
        save_json(SETTINGS_FILE, DEFAULT_SETTINGS)
    if not COUNTER_FILE.exists():
        save_json(COUNTER_FILE, {"next_number": 1001})
    if not COMPANIES_FILE.exists():
        legacy_settings = load_json(SETTINGS_FILE, DEFAULT_SETTINGS)
        seed_company = build_company_record(source=legacy_settings if isinstance(legacy_settings, dict) else None)
        save_json(
            COMPANIES_FILE,
            {
                "selected_company": seed_company["business_name"],
                "companies": [seed_company],
            },
        )


ensure_storage()


def load_company_store() -> dict[str, Any]:
    raw = load_json(COMPANIES_FILE, default_company_store())
    if isinstance(raw, list):
        raw = {"selected_company": "", "companies": raw}

    companies: list[dict[str, Any]] = []
    seen: set[str] = set()
    for company in raw.get("companies", []):
        if not isinstance(company, dict):
            continue
        normalized = normalize_company_name(company.get("business_name", ""))
        if not normalized or normalized in seen:
            continue
        companies.append(build_company_record(source=company))
        seen.add(normalized)

    if not companies:
        companies = default_company_store()["companies"]

    selected_company = raw.get("selected_company", "")
    if not find_company(companies, selected_company):
        selected_company = companies[0]["business_name"]

    return {
        "selected_company": selected_company,
        "companies": companies,
    }


def save_company_store(store: dict[str, Any]) -> None:
    save_json(COMPANIES_FILE, store)


def list_company_names(companies: list[dict[str, Any]]) -> list[str]:
    return [company["business_name"] for company in companies]


def find_company(companies: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    normalized = normalize_company_name(name)
    for company in companies:
        if normalize_company_name(company.get("business_name", "")) == normalized:
            return company
    return None


def company_name_exists(companies: list[dict[str, Any]], name: str, exclude_name: str | None = None) -> bool:
    normalized = normalize_company_name(name)
    excluded = normalize_company_name(exclude_name or "")
    for company in companies:
        current = normalize_company_name(company.get("business_name", ""))
        if current == normalized and current != excluded:
            return True
    return False


def save_company(
    store: dict[str, Any],
    company_data: dict[str, Any],
    original_name: str | None = None,
) -> tuple[dict[str, Any], str]:
    companies = store["companies"]
    original_normalized = normalize_company_name(original_name or "")
    updated_companies: list[dict[str, Any]] = []
    replaced = False

    for company in companies:
        current_normalized = normalize_company_name(company.get("business_name", ""))
        if original_name and current_normalized == original_normalized:
            updated_companies.append(company_data)
            replaced = True
        else:
            updated_companies.append(company)

    if not replaced:
        updated_companies.append(company_data)

    new_store = {
        "selected_company": company_data["business_name"],
        "companies": updated_companies,
    }
    save_company_store(new_store)
    return new_store, company_data["business_name"]


def delete_company(store: dict[str, Any], company_name: str) -> dict[str, Any]:
    remaining_companies = [
        company
        for company in store["companies"]
        if normalize_company_name(company.get("business_name", "")) != normalize_company_name(company_name)
    ]
    selected_company = remaining_companies[0]["business_name"] if remaining_companies else ""
    new_store = {
        "selected_company": selected_company,
        "companies": remaining_companies,
    }
    save_company_store(new_store)
    return new_store


def find_product(company: dict[str, Any], product_id: str) -> dict[str, Any] | None:
    for product in company.get("products", []):
        if str(product.get("product_id", "")) == str(product_id):
            return product
    return None


def product_label(product: dict[str, Any]) -> str:
    category = str(product.get("Category", "")).strip()
    description = str(product.get("Description", "")).strip()
    if category:
        return f"{category}: {description}"
    return description


def save_company_products(
    store: dict[str, Any],
    company_name: str,
    product_rows: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    company = find_company(store["companies"], company_name)
    assert company is not None

    updated_products: list[dict[str, Any]] = []
    next_id_source = normalize_products(company.get("products", []))
    for row in product_rows:
        normalized = build_product_record(source=row, product_id=str(row.get("product_id", "")).strip())
        if not any([normalized["Category"], normalized["Description"], normalized["Notes"], normalized["Unit Price"]]):
            continue
        if not normalized["Description"]:
            continue
        if not normalized["product_id"]:
            normalized["product_id"] = next_product_id(next_id_source + updated_products)
        updated_products.append(normalized)

    updated_company = build_company_record(name=company["business_name"], source={**company, "products": updated_products})
    updated_store, _ = save_company(store, updated_company, company_name)
    return updated_store, updated_company


def find_client(company: dict[str, Any], client_id: str) -> dict[str, Any] | None:
    for client in company.get("clients", []):
        if str(client.get("client_id", "")) == str(client_id):
            return client
    return None


def client_label(client: dict[str, Any]) -> str:
    name = str(client.get("client_name", "")).strip()
    email = str(client.get("client_email", "")).strip()
    if email:
        return f"{name} ({email})"
    return name


def save_company_clients(
    store: dict[str, Any],
    company_name: str,
    client_rows: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    company = find_company(store["companies"], company_name)
    assert company is not None

    updated_clients: list[dict[str, Any]] = []
    next_id_source = normalize_clients(company.get("clients", []))
    for row in client_rows:
        normalized = build_client_record(source=row, client_id=str(row.get("client_id", "")).strip())
        if not any(
            [
                normalized["client_name"],
                normalized["client_email"],
                normalized["client_phone"],
                normalized["event_type"],
                normalized["event_date"],
                normalized["venue"],
                normalized["guest_count"],
            ]
        ):
            continue
        if not normalized["client_name"]:
            continue
        if not normalized["client_id"]:
            normalized["client_id"] = next_client_id(next_id_source + updated_clients)
        updated_clients.append(normalized)

    updated_company = build_company_record(name=company["business_name"], source={**company, "clients": updated_clients})
    updated_store, _ = save_company(store, updated_company, company_name)
    return updated_store, updated_company


def money(value: Decimal | float | int | str) -> str:
    amount = to_decimal(value)
    return f"${amount:,.2f}"


def to_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value).replace(",", "")).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, AttributeError):
        return Decimal("0.00")


def sanitize_filename(value: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_-]+", "-", value.strip())
    return clean.strip("-") or "estimate"


def next_estimate_number() -> str:
    counter = load_json(COUNTER_FILE, {"next_number": 1001})
    current = int(counter.get("next_number", 1001))
    counter["next_number"] = current + 1
    save_json(COUNTER_FILE, counter)
    return f"EST-{current}"


def list_saved_estimates() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(ESTIMATES_DIR.glob("*.json"), reverse=True):
        data = load_json(path, {})
        if not data:
            continue
        items.append(
            {
                "file": path.name,
                "estimate_number": data.get("estimate_number", path.stem),
                "company_name": data.get("company_name", data.get("business", {}).get("business_name", "")),
                "client_name": data.get("client_name", ""),
                "event_date": data.get("event_date", ""),
                "total": data.get("total", 0),
                "updated_at": data.get("updated_at", ""),
            }
        )
    return items


def calculate_totals(
    line_items: list[dict[str, Any]],
    tax_pct: float,
    service_pct: float,
    gratuity_pct: float,
    deposit_amount: float,
) -> dict[str, Decimal]:
    subtotal = Decimal("0.00")
    service_items_total = Decimal("0.00")
    staff_items_total = Decimal("0.00")
    delivery_items_total = Decimal("0.00")
    for item in line_items:
        qty = to_decimal(item.get("Qty", 0))
        unit_price = to_decimal(item.get("Unit Price", 0))
        line_total = (qty * unit_price).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
        if is_service_category(str(item.get("Category", ""))):
            service_items_total += line_total
        elif is_staff_category(str(item.get("Category", ""))):
            staff_items_total += line_total
        elif is_delivery_category(str(item.get("Category", ""))):
            delivery_items_total += line_total
        else:
            subtotal += line_total

    if service_items_total > Decimal("0.00"):
        service_charge = service_items_total
    else:
        service_charge = (subtotal * to_decimal(service_pct) / Decimal("100")).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    if staff_items_total > Decimal("0.00"):
        gratuity = staff_items_total
    else:
        gratuity = (subtotal * to_decimal(gratuity_pct) / Decimal("100")).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    taxable_base = subtotal + service_charge + gratuity + delivery_items_total
    tax = (taxable_base * to_decimal(tax_pct) / Decimal("100")).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    total = subtotal + service_charge + gratuity + delivery_items_total + tax
    deposit = min(to_decimal(deposit_amount), total)
    balance_due = total - deposit

    return {
        "subtotal": subtotal,
        "service_charge": service_charge,
        "gratuity": gratuity,
        "delivery_charge": delivery_items_total,
        "tax": tax,
        "total": total,
        "deposit": deposit,
        "balance_due": balance_due,
    }


def build_estimate_payload(
    company: dict[str, Any],
    form_data: dict[str, Any],
    line_items: list[dict[str, Any]],
    totals: dict[str, Decimal],
    existing_number: str | None = None,
) -> dict[str, Any]:
    estimate_number = existing_number or next_estimate_number()
    now = datetime.now().isoformat(timespec="seconds")
    payload = {
        "estimate_number": estimate_number,
        "created_at": now,
        "updated_at": now,
        "company_name": company["business_name"],
        "business": company,
        **form_data,
        "line_items": line_items,
        **{key: float(value) for key, value in totals.items()},
    }
    return payload


def save_estimate(payload: dict[str, Any]) -> Path:
    client_slug = sanitize_filename(payload.get("client_name", "client"))
    company_slug = sanitize_filename(payload.get("company_name", "company"))
    path = ESTIMATES_DIR / f"{payload['estimate_number']}_{company_slug}_{client_slug}.json"
    existing = load_json(path, {})
    if existing:
        payload["created_at"] = existing.get("created_at", payload["created_at"])
    payload["updated_at"] = datetime.now().isoformat(timespec="seconds")
    save_json(path, payload)
    return path


def load_estimate_file(filename: str) -> dict[str, Any]:
    return load_json(ESTIMATES_DIR / filename, {})


def refresh_line_items_for_company(line_items: list[dict[str, Any]], company: dict[str, Any]) -> list[dict[str, Any]]:
    refreshed: list[dict[str, Any]] = []
    for item in line_items:
        product_id = str(item.get("product_id", "")).strip()
        qty = float(to_decimal(item.get("Qty", 0)))
        if product_id:
            product = find_product(company, product_id)
            if product:
                refreshed.append(
                    {
                        "product_id": product_id,
                        "Category": product.get("Category", ""),
                        "Description": product.get("Description", ""),
                        "Notes": product.get("Notes", ""),
                        "Qty": qty,
                        "Unit Price": float(to_decimal(product.get("Unit Price", 0))),
                    }
                )
                continue
        refreshed.append(
            {
                "product_id": "",
                "Category": str(item.get("Category", "")).strip(),
                "Description": str(item.get("Description", "")).strip(),
                "Notes": str(item.get("Notes", item.get("notes", ""))).strip(),
                "Qty": qty,
                "Unit Price": float(to_decimal(item.get("Unit Price", 0))),
            }
        )
    return refreshed


def build_estimate_editor_rows(
    company: dict[str, Any],
    selected_product_ids: list[str],
    seed_line_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    qty_map = {
        str(item.get("product_id", "")).strip(): float(to_decimal(item.get("Qty", 0)))
        for item in seed_line_items
        if str(item.get("product_id", "")).strip()
    }
    rows: list[dict[str, Any]] = []
    for product_id in selected_product_ids:
        product = find_product(company, product_id)
        if not product:
            continue
        qty = qty_map.get(product_id, 1.0)
        rows.append(
            {
                "product_id": product_id,
                "Category": product.get("Category", ""),
                "Description": product.get("Description", ""),
                "Notes": product.get("Notes", ""),
                "Qty": qty,
                "Unit Price": float(to_decimal(product.get("Unit Price", 0))),
            }
        )
    return rows


def line_item_qty_map(line_items: list[dict[str, Any]]) -> dict[str, float]:
    return {
        str(item.get("product_id", "")).strip(): float(to_decimal(item.get("Qty", 0)))
        for item in line_items
        if str(item.get("product_id", "")).strip()
    }


def line_items_to_rows(df: pd.DataFrame, company: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        product_id = str(row.get("product_id", "")).strip()
        category = str(row.get("Category", "")).strip()
        description = str(row.get("Description", "")).strip()
        notes = str(row.get("Notes", row.get("notes", ""))).strip()
        qty = to_decimal(row.get("Qty", 0))
        unit_price = to_decimal(row.get("Unit Price", 0))
        if product_id:
            product = find_product(company, product_id)
            if product:
                category = product.get("Category", "")
                description = product.get("Description", "")
                notes = product.get("Notes", "")
                unit_price = to_decimal(product.get("Unit Price", 0))
        if not description and qty == 0 and unit_price == 0:
            continue
        rows.append(
            {
                "product_id": product_id,
                "Category": category,
                "Description": description,
                "Notes": notes,
                "Qty": float(qty),
                "Unit Price": float(unit_price),
                "Line Total": float((qty * unit_price).quantize(TWOPLACES, rounding=ROUND_HALF_UP)),
            }
        )
    return rows


def estimate_to_pdf_bytes(payload: dict[str, Any]) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    title_style.fontName = "Helvetica-Bold"
    title_style.fontSize = 18
    title_style.alignment = 2
    normal = styles["BodyText"]
    normal.fontName = "Helvetica"
    normal.fontSize = 10
    small = ParagraphStyle("small", parent=normal, fontSize=9, leading=12)
    header_left = ParagraphStyle("header_left", parent=normal, fontName="Helvetica-Bold", fontSize=10, alignment=0)
    header_center = ParagraphStyle("header_center", parent=normal, fontName="Helvetica-Bold", fontSize=10, alignment=1)
    header_right = ParagraphStyle("header_right", parent=normal, fontName="Helvetica-Bold", fontSize=10, alignment=2)
    company_note_style = ParagraphStyle("company_note", parent=small, leftIndent=0, firstLineIndent=0)
    table_border_color = colors.HexColor("#cfc6bf")

    story = []
    if HEADER_LOGO_FILE.exists():
        story.append(Image(str(HEADER_LOGO_FILE), width=7.0 * inch, height=(7.0 * inch * 312) / 1592))
        story.append(Spacer(1, 0.5 * inch))
    business = payload.get("business", {})
    header_row = Table(
        [
            [
                Paragraph(f"Client: {payload.get('client_name', '')}", header_left),
                Paragraph(f"Issue Date: {payload.get('issue_date', '')}", header_center),
                Paragraph(f"Estimate {payload.get('estimate_number', '')}", header_right),
            ]
        ],
        colWidths=[2.6 * inch, 1.8 * inch, 2.4 * inch],
    )
    header_row.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(header_row)
    story.append(Spacer(1, 0.15 * inch))

    details_table = Table(
        [
            ["Contact", payload.get("client_email", ""), "Venue", payload.get("venue", "")],
            ["Phone", payload.get("client_phone", ""), "Guests", str(payload.get("guest_count", ""))],
            ["Event Type", payload.get("event_type", ""), "Event Date", payload.get("event_date", "")],
        ],
        colWidths=[1.1 * inch, 2.2 * inch, 1.1 * inch, 2.4 * inch],
    )
    details_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f6d7c3")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f6d7c3")),
                ("GRID", (0, 0), (-1, -1), 0.2, table_border_color),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(details_table)

    story.append(Spacer(1, 0.7 * inch))

    item_rows = [["Category", "Description", "Notes", "Qty", "Unit Price", "Line Total"]]
    for item in payload.get("line_items", []):
        qty_display = f"{to_decimal(item.get('Qty', 0)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)}"
        item_rows.append(
            [
                item.get("Category", ""),
                str(item.get("Description", "")).strip(),
                str(item.get("Notes", "")).strip(),
                qty_display,
                money(item.get("Unit Price", 0)),
                money(item.get("Line Total", 0)),
            ]
        )

    items_table = Table(
        item_rows,
        colWidths=[1.15 * inch, 2.55 * inch, 1.15 * inch, 0.45 * inch, 0.85 * inch, 0.85 * inch],
    )
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f6d7c3")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.2, table_border_color),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (3, 0), (3, 0), "CENTER"),
                ("ALIGN", (3, 1), (-1, -1), "CENTER"),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 0.25 * inch))

    company_default_note = str(business.get("estimate_notes", "")).strip()
    if company_default_note:
        company_note_table = Table(
            [[Paragraph(company_default_note.replace("\n", "<br/>"), company_note_style)]],
            colWidths=[7.0 * inch],
        )
        company_note_table.setStyle(
            TableStyle(
                [
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        story.append(company_note_table)
        story.append(Spacer(1, 0.25 * inch))

    totals_rows = [
        ["Type", "Amount"],
        ["Subtotal", money(payload.get("subtotal", 0))],
        ["Staff", money(payload.get("gratuity", 0))],
        ["Service", money(payload.get("service_charge", 0))],
        ["Delivery", money(payload.get("delivery_charge", 0))],
        ["Tax (9%)", money(payload.get("tax", 0))],
        ["Total", money(payload.get("total", 0))],
        ["Deposit", money(payload.get("deposit", 0))],
        ["Balance Due", money(payload.get("balance_due", 0))],
    ]
    totals_table = Table(totals_rows, colWidths=[1.8 * inch, 1.4 * inch], hAlign="RIGHT")
    totals_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f6d7c3")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.2, table_border_color),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("FONTNAME", (0, 6), (-1, 6), "Helvetica-Bold"),
                ("FONTNAME", (0, 8), (-1, 8), "Helvetica-Bold"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("ALIGN", (1, 1), (1, -1), "RIGHT"),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(totals_table)
    story.append(Spacer(1, 0.2 * inch))

    notes = payload.get("notes", "")
    payment_terms = business.get("payment_terms", "")
    if notes:
        story.append(Paragraph("<b>Notes</b>", normal))
        story.append(Paragraph(notes.replace("\n", "<br/>"), small))
        story.append(Spacer(1, 0.1 * inch))
    if payment_terms:
        story.append(Paragraph("<b>Payment Terms</b>", normal))
        story.append(Paragraph(payment_terms.replace("\n", "<br/>"), small))
        story.append(Spacer(1, 0.15 * inch))

    doc.build(story)
    return buffer.getvalue()


def render_saved_estimate_loader() -> None:
    load_saved = st.selectbox(
        "Saved estimate",
        options=["Start a new estimate", "Load saved estimate"],
        key="estimate_saved_mode",
    )
    if load_saved != "Load saved estimate":
        return

    records = list_saved_estimates()
    if not records:
        st.info("No estimates saved yet.")
        return

    selected = st.selectbox(
        "Load a saved estimate",
        options=[""] + [record["file"] for record in records],
        format_func=lambda x: "Select an estimate..." if x == "" else next(
            (
                f"{record['estimate_number']} | {record['company_name']} | {record['client_name']} | {record['event_date']}"
                for record in records
                if record["file"] == x
            ),
            x,
        ),
    )
    if selected and st.button("Load selected estimate"):
        loaded = load_estimate_file(selected)
        if loaded:
            st.session_state["loaded_estimate"] = loaded
            st.success(f"Loaded {loaded.get('estimate_number', selected)}. The page will refresh with its values.")
            st.rerun()


def sync_company_editor(company: dict[str, Any] | None, creating_new: bool) -> None:
    context = "new" if creating_new else f"existing:{company['business_name']}"
    if st.session_state.get("company_editor_context") == context:
        return

    source = build_company_record(source=company if company else None)
    st.session_state["company_business_name"] = "" if creating_new else source["business_name"]
    st.session_state["company_business_email"] = source["business_email"]
    st.session_state["company_business_phone"] = source["business_phone"]
    st.session_state["company_business_address"] = source["business_address"]
    st.session_state["company_default_tax"] = float(source["default_tax_percent"])
    st.session_state["company_default_service"] = float(source["default_service_charge_percent"])
    st.session_state["company_default_gratuity"] = float(source["default_gratuity_percent"])
    st.session_state["company_payment_terms"] = source["payment_terms"]
    st.session_state["company_estimate_notes"] = source["estimate_notes"]
    st.session_state["company_editor_context"] = context


def sync_estimate_form(company: dict[str, Any], loaded: dict[str, Any]) -> None:
    loaded_number = loaded.get("estimate_number", "")
    context = f"{loaded_number or 'new'}::{company['business_name']}"
    if st.session_state.get("estimate_form_context") == context:
        return

    loaded_client_id = str(loaded.get("client_id", "")).strip()
    loaded_client = find_client(company, loaded_client_id) if loaded_client_id else None
    if not loaded_client and loaded:
        loaded_client_name = str(loaded.get("client_name", "")).strip()
        for client in company.get("clients", []):
            if normalize_client_name(client.get("client_name", "")) == normalize_client_name(loaded_client_name):
                loaded_client = client
                loaded_client_id = client["client_id"]
                break
    st.session_state["estimate_client_id"] = loaded_client_id
    st.session_state["estimate_client_name"] = (
        loaded_client.get("client_name", "") if loaded_client else loaded.get("client_name", "")
    )
    st.session_state["estimate_client_email"] = (
        loaded_client.get("client_email", "") if loaded_client else loaded.get("client_email", "")
    )
    st.session_state["estimate_client_phone"] = (
        loaded_client.get("client_phone", "") if loaded_client else loaded.get("client_phone", "")
    )
    st.session_state["estimate_tax_percent"] = float(loaded.get("tax_percent", company.get("default_tax_percent", 0.0)))
    st.session_state["estimate_service_charge_percent"] = float(
        loaded.get("service_charge_percent", company.get("default_service_charge_percent", 0.0))
    )
    st.session_state["estimate_gratuity_percent"] = float(
        loaded.get("gratuity_percent", company.get("default_gratuity_percent", 0.0))
    )
    st.session_state["estimate_deposit_amount"] = float(loaded.get("deposit", 0.0))
    st.session_state["estimate_notes"] = loaded.get("notes", company.get("estimate_notes", ""))
    seed_line_items = refresh_line_items_for_company(loaded.get("line_items", []), company) if loaded else []
    st.session_state["estimate_line_items_seed"] = seed_line_items
    st.session_state["estimate_selected_products"] = [
        item["product_id"] for item in seed_line_items if str(item.get("product_id", "")).strip()
    ]
    st.session_state["estimate_form_context"] = context


def reset_estimate_state() -> None:
    st.session_state.pop("loaded_estimate", None)
    st.session_state.pop("estimate_form_context", None)
    st.session_state.pop("estimate_line_items_seed", None)
    st.session_state.pop("estimate_selected_products", None)
    st.session_state.pop("estimate_client_id", None)


st.set_page_config(page_title="Catering Estimate Maker", page_icon="🧾", layout="wide")
st.markdown(
    """
    <style>
    div[data-testid="stButton"] > button[kind="primary"] {
        background-color: #c62828;
        border-color: #c62828;
        color: white;
    }
    div[data-testid="stButton"] > button[kind="primary"]:hover {
        background-color: #b71c1c;
        border-color: #b71c1c;
        color: white;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

company_store = load_company_store()
companies = company_store["companies"]
company_names = list_company_names(companies)
loaded_estimate = st.session_state.get("loaded_estimate", {})

company_tab, products_tab, clients_tab, estimate_tab = st.tabs(
    ["Company", "Products", "Clients", "Estimate"]
)

with company_tab:
    st.subheader("Company settings")
    company_choice = st.selectbox(
        "Select a company",
        options=[NEW_COMPANY_OPTION] + company_names,
        index=0 if not company_store["selected_company"] else ([NEW_COMPANY_OPTION] + company_names).index(company_store["selected_company"]),
        key="company_page_choice",
    )
    creating_new_company = company_choice == NEW_COMPANY_OPTION
    selected_company = None if creating_new_company else find_company(companies, company_choice)
    sync_company_editor(selected_company, creating_new_company)
    current_delete_target = "" if creating_new_company or not selected_company else selected_company["business_name"]
    if st.session_state.get("company_delete_confirm_target", "") != current_delete_target:
        st.session_state["company_delete_confirm_target"] = ""

    c1, c2 = st.columns(2)
    with c1:
        business_name = st.text_input("Business name", key="company_business_name")
        business_email = st.text_input("Business email", key="company_business_email")
        business_phone = st.text_input("Business phone", key="company_business_phone")
        business_address = st.text_area("Business address", key="company_business_address", height=110)
    with c2:
        default_tax = st.number_input("Default tax %", min_value=0.0, step=0.25, key="company_default_tax")
        default_service = st.number_input(
            "Default service charge %",
            min_value=0.0,
            step=0.25,
            key="company_default_service",
        )
        default_gratuity = st.number_input(
            "Default gratuity %",
            min_value=0.0,
            step=0.25,
            key="company_default_gratuity",
        )

    payment_terms = st.text_area("Default payment terms", key="company_payment_terms", height=110)
    estimate_notes = st.text_area("Default note", key="company_estimate_notes", height=110)

    action_columns = st.columns([1, 4, 1, 1])
    save_label = "Create company" if creating_new_company else "Save company"
    with action_columns[0]:
        save_clicked = st.button(save_label, use_container_width=True)
    with action_columns[2]:
        request_delete_clicked = (
            st.button("Delete company", use_container_width=True, type="secondary")
            if not creating_new_company
            else False
        )
    with action_columns[3]:
        confirm_delete_clicked = (
            st.button("Confirm delete", use_container_width=True, type="primary")
            if st.session_state.get("company_delete_confirm_target", "") == current_delete_target and current_delete_target
            else False
        )

    if save_clicked:
        cleaned_name = business_name.strip()
        if not cleaned_name:
            st.error("Business name is required.")
        elif company_name_exists(companies, cleaned_name, exclude_name=None if creating_new_company else company_choice):
            st.error("Company names must be unique.")
        else:
            company_data = build_company_record(
                name=cleaned_name,
                source={
                    "products": selected_company.get("products", []) if selected_company else [],
                    "clients": selected_company.get("clients", []) if selected_company else [],
                    "business_email": business_email,
                    "business_phone": business_phone,
                    "business_address": business_address,
                    "default_tax_percent": default_tax,
                    "default_service_charge_percent": default_service,
                    "default_gratuity_percent": default_gratuity,
                    "payment_terms": payment_terms,
                    "estimate_notes": estimate_notes,
                },
            )
            _, saved_name = save_company(company_store, company_data, None if creating_new_company else company_choice)
            st.session_state["company_editor_context"] = f"existing:{saved_name}"
            st.success(f"Saved company: {saved_name}")
            st.rerun()

    if request_delete_clicked and selected_company:
        st.session_state["company_delete_confirm_target"] = selected_company["business_name"]
        st.rerun()

    if st.session_state.get("company_delete_confirm_target", "") == current_delete_target and current_delete_target:
        notice_columns = st.columns([5, 1])
        with notice_columns[0]:
            st.warning(f"Confirm deletion of {current_delete_target}. This cannot be undone.")
        with notice_columns[1]:
            if st.button("Cancel", use_container_width=True):
                st.session_state["company_delete_confirm_target"] = ""
                st.rerun()

    if confirm_delete_clicked and selected_company:
        delete_company(company_store, selected_company["business_name"])
        st.session_state["company_delete_confirm_target"] = ""
        st.session_state["company_editor_context"] = "new"
        st.success(f"Deleted company: {selected_company['business_name']}")
        st.rerun()

with products_tab:
    st.subheader("Products")
    if not company_names:
        st.warning("Create a company first before adding products.")
        st.stop()

    products_company_name = st.selectbox(
        "Company for products",
        options=company_names,
        index=company_names.index(company_store["selected_company"]) if company_store["selected_company"] in company_names else 0,
        key="products_company_name",
    )
    products_company = find_company(companies, products_company_name)
    assert products_company is not None

    products_df = pd.DataFrame(products_company.get("products", []))
    if products_df.empty:
        products_df = pd.DataFrame(columns=["product_id", "Category", "Description", "Notes", "Unit Price"])

    edited_products_df = st.data_editor(
        products_df,
        num_rows="dynamic",
        use_container_width=True,
        hide_index=True,
        key=f"products_editor_{products_company_name}",
        column_order=["Category", "Description", "Notes", "Unit Price"],
        column_config={
            "Category": st.column_config.TextColumn("Category"),
            "Description": st.column_config.TextColumn("Description", required=True),
            "Notes": st.column_config.TextColumn("Notes"),
            "Unit Price": st.column_config.NumberColumn("Unit Price", min_value=0.0, step=0.01, format="$%.2f"),
        },
    )

    if st.button("Save products", key="save_products_button"):
        product_rows = edited_products_df.to_dict("records")
        _, updated_company = save_company_products(company_store, products_company_name, product_rows)
        st.session_state["company_editor_context"] = f"existing:{updated_company['business_name']}"
        st.session_state.pop("estimate_form_context", None)
        st.success(f"Saved products for {updated_company['business_name']}.")
        st.rerun()

with clients_tab:
    st.subheader("Clients")
    if not company_names:
        st.warning("Create a company first before adding clients.")
        st.stop()

    clients_company_name = st.selectbox(
        "Company for clients",
        options=company_names,
        index=company_names.index(company_store["selected_company"]) if company_store["selected_company"] in company_names else 0,
        key="clients_company_name",
    )
    clients_company = find_company(companies, clients_company_name)
    assert clients_company is not None

    clients_df = pd.DataFrame(clients_company.get("clients", []))
    if clients_df.empty:
        clients_df = pd.DataFrame(
            columns=[
                "client_id",
                "client_name",
                "client_email",
                "client_phone",
                "event_type",
                "event_date",
                "venue",
                "guest_count",
                "servers_count",
                "servers_hours",
                "kitchen_staff_count",
                "kitchen_staff_hours",
                "deposit_amount",
                "utensils_buffer",
            ]
        )

    edited_clients_df = st.data_editor(
        clients_df,
        num_rows="dynamic",
        use_container_width=True,
        hide_index=True,
        key=f"clients_editor_{clients_company_name}",
        column_order=[
            "client_name",
            "client_email",
            "client_phone",
            "event_type",
            "event_date",
            "venue",
            "guest_count",
            "servers_count",
            "servers_hours",
            "kitchen_staff_count",
            "kitchen_staff_hours",
            "deposit_amount",
            "utensils_buffer",
        ],
        column_config={
            "client_name": st.column_config.TextColumn("Client name", required=True),
            "client_email": st.column_config.TextColumn("Client email"),
            "client_phone": st.column_config.TextColumn("Client phone"),
            "event_type": st.column_config.TextColumn("Event type"),
            "event_date": st.column_config.TextColumn("Event date"),
            "venue": st.column_config.TextColumn("Venue"),
            "guest_count": st.column_config.NumberColumn("Guest count", min_value=1, step=1, format="%d"),
            "servers_count": st.column_config.NumberColumn("Servers (#)", min_value=0, step=1, format="%d"),
            "servers_hours": st.column_config.NumberColumn("Servers (hrs)", min_value=0, step=1, format="%d"),
            "kitchen_staff_count": st.column_config.NumberColumn("Kitchen Staff (#)", min_value=0, step=1, format="%d"),
            "kitchen_staff_hours": st.column_config.NumberColumn("Kitchen Staff (hrs)", min_value=0, step=1, format="%d"),
            "deposit_amount": st.column_config.NumberColumn("Deposit ($)", min_value=0.0, step=25.0, format="$%.2f"),
            "utensils_buffer": st.column_config.NumberColumn("Utensils Buffer", min_value=0, step=1, format="%d"),
        },
    )

    if st.button("Save clients", key="save_clients_button"):
        client_rows = edited_clients_df.to_dict("records")
        _, updated_company = save_company_clients(company_store, clients_company_name, client_rows)
        st.session_state["company_editor_context"] = f"existing:{updated_company['business_name']}"
        st.session_state.pop("estimate_form_context", None)
        st.success(f"Saved clients for {updated_company['business_name']}.")
        st.rerun()

with estimate_tab:
    st.subheader("Estimate")
    st.caption("Clean estimate generator using the selected company, client, and products.")
    if not company_names:
        st.warning("Create a company first before building estimates.")
        st.stop()

    estimate_builder_company_name = st.selectbox(
        "Company",
        options=company_names,
        index=company_names.index(company_store["selected_company"]) if company_store["selected_company"] in company_names else 0,
        key="estimate_builder_company_name",
    )
    estimate_builder_company = find_company(companies, estimate_builder_company_name)
    assert estimate_builder_company is not None

    estimate_builder_clients = estimate_builder_company.get("clients", [])
    if not estimate_builder_clients:
        st.warning("Add at least one client in the Clients tab before building an estimate for this company.")
        st.stop()

    estimate_builder_client_lookup = {client["client_id"]: client for client in estimate_builder_clients}
    estimate_builder_client_options = [client["client_id"] for client in estimate_builder_clients]
    estimate_builder_client_id = st.selectbox(
        "Client",
        options=estimate_builder_client_options,
        index=0,
        key="estimate_builder_client_id",
        format_func=lambda client_id: client_label(estimate_builder_client_lookup[client_id]),
    )
    estimate_builder_client = estimate_builder_client_lookup[estimate_builder_client_id]

    estimate_builder_products = estimate_builder_company.get("products", [])
    if not estimate_builder_products:
        st.warning("Add at least one product in the Products tab before building an estimate for this company.")
        st.stop()

    estimate_builder_product_lookup = {product["product_id"]: product for product in estimate_builder_products}
    estimate_builder_product_options = [product["product_id"] for product in estimate_builder_products]
    estimate_builder_selected_products = st.multiselect(
        "Products",
        options=estimate_builder_product_options,
        key=f"estimate_builder_selected_products__{estimate_builder_company_name}__{estimate_builder_client_id}",
        format_func=lambda product_id: product_label(estimate_builder_product_lookup[product_id]),
    )

    event_date_raw = str(estimate_builder_client.get("event_date", "")).strip()
    estimate_builder_event_date = parse_flexible_date(event_date_raw) or date.today()
    estimate_builder_event_type = str(estimate_builder_client.get("event_type", "Private Event")).strip() or "Private Event"
    estimate_builder_venue = str(estimate_builder_client.get("venue", "")).strip()
    estimate_builder_guest_count = int(estimate_builder_client.get("guest_count", 50) or 50)
    estimate_builder_deposit_amount = float(to_decimal(estimate_builder_client.get("deposit_amount", 0.0)))

    estimate_builder_line_items: list[dict[str, Any]] = []
    if estimate_builder_selected_products:
        st.markdown("#### Products Table")
        estimate_builder_rows: list[dict[str, Any]] = []
        for product_id in estimate_builder_selected_products:
            product = estimate_builder_product_lookup[product_id]
            qty_key = f"estimate_builder_qty__{estimate_builder_company_name}__{estimate_builder_client_id}__{product_id}"
            if qty_key not in st.session_state:
                st.session_state[qty_key] = default_estimate_qty(product, estimate_builder_client, estimate_builder_guest_count)
            notes_key = f"estimate_builder_notes__{estimate_builder_company_name}__{estimate_builder_client_id}__{product_id}"
            if notes_key not in st.session_state:
                st.session_state[notes_key] = str(product.get("Notes", "")).strip()
            qty_decimal = to_decimal(st.session_state[qty_key])
            unit_price_decimal = to_decimal(product.get("Unit Price", 0))
            estimate_builder_rows.append(
                {
                    "product_id": product_id,
                    "Category": product.get("Category", ""),
                    "Description": product.get("Description", ""),
                    "Notes": st.session_state[notes_key],
                    "Qty": float(qty_decimal),
                    "Unit Price": float(unit_price_decimal),
                    "Line Total": float((qty_decimal * unit_price_decimal).quantize(TWOPLACES, rounding=ROUND_HALF_UP)),
                }
            )

        estimate_builder_df = pd.DataFrame(estimate_builder_rows)
        edited_estimate_builder_df = st.data_editor(
            estimate_builder_df[["Category", "Description", "Notes", "Qty", "Unit Price", "Line Total"]],
            use_container_width=True,
            hide_index=True,
            num_rows="fixed",
            key=f"estimate_builder_products_table__{estimate_builder_company_name}__{estimate_builder_client_id}",
            disabled=["Category", "Description", "Unit Price", "Line Total"],
            column_config={
                "Notes": st.column_config.TextColumn("Notes"),
                "Qty": st.column_config.NumberColumn("Qty", min_value=0.0, step=1.0, format="%.2f"),
                "Unit Price": st.column_config.NumberColumn("Unit Price", format="$%.2f"),
                "Line Total": st.column_config.NumberColumn("Line Total", format="$%.2f"),
            },
        )
        for index, product_id in enumerate(estimate_builder_selected_products):
            qty_key = f"estimate_builder_qty__{estimate_builder_company_name}__{estimate_builder_client_id}__{product_id}"
            notes_key = f"estimate_builder_notes__{estimate_builder_company_name}__{estimate_builder_client_id}__{product_id}"
            qty_value = to_decimal(edited_estimate_builder_df.iloc[index]["Qty"])
            notes_value = str(edited_estimate_builder_df.iloc[index]["Notes"]).strip()
            st.session_state[qty_key] = float(qty_value)
            st.session_state[notes_key] = notes_value
            product = estimate_builder_product_lookup[product_id]
            unit_price_decimal = to_decimal(product.get("Unit Price", 0))
            estimate_builder_line_items.append(
                {
                    "product_id": product_id,
                    "Category": product.get("Category", ""),
                    "Description": product.get("Description", ""),
                    "Notes": notes_value,
                    "Qty": float(qty_value),
                    "Unit Price": float(unit_price_decimal),
                    "Line Total": float((qty_value * unit_price_decimal).quantize(TWOPLACES, rounding=ROUND_HALF_UP)),
                }
            )
    estimate_builder_totals = calculate_totals(
        estimate_builder_line_items,
        0.0,
        0.0,
        0.0,
        estimate_builder_deposit_amount,
    )

    if "estimate_builder_number" not in st.session_state:
        st.session_state["estimate_builder_number"] = next_estimate_number()

    estimate_builder_form_data = {
        "client_id": estimate_builder_client_id,
        "issue_date": date.today().isoformat(),
        "client_name": estimate_builder_client.get("client_name", ""),
        "client_email": estimate_builder_client.get("client_email", ""),
        "client_phone": estimate_builder_client.get("client_phone", ""),
        "event_date": estimate_builder_event_date.strftime("%m-%d-%Y"),
        "event_type": estimate_builder_event_type,
        "venue": estimate_builder_venue,
        "guest_count": estimate_builder_guest_count,
        "tax_percent": 0.0,
        "service_charge_percent": 0.0,
        "gratuity_percent": 0.0,
        "notes": "",
    }
    estimate_builder_payload = build_estimate_payload(
        estimate_builder_company,
        estimate_builder_form_data,
        estimate_builder_line_items,
        estimate_builder_totals,
        existing_number=st.session_state["estimate_builder_number"],
    )
    estimate_builder_pdf_bytes = estimate_to_pdf_bytes(estimate_builder_payload)

    e2b1, e2b2 = st.columns([1, 1.4])
    with e2b1:
        if st.button("Start New Estimate", use_container_width=True):
            st.session_state["estimate_builder_number"] = next_estimate_number()
            st.rerun()
    with e2b2:
        st.download_button(
            "Download Estimate PDF",
            data=estimate_builder_pdf_bytes,
            file_name=f"{estimate_builder_payload['estimate_number']}_{sanitize_filename(estimate_builder_client.get('client_name', 'client'))}.pdf",
            mime="application/pdf",
            use_container_width=True,
            disabled=not bool(estimate_builder_line_items),
        )
