from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from .services import infer_product_rules

GROUPS = (
    ("item", "Menu & Food"),
    ("staff", "Staffing"),
    ("service", "Service"),
    ("delivery", "Delivery"),
    ("gratuity", "Gratuity"),
)

UNIT_LABELS = {
    "each": "each",
    "guest": "guest",
    "hour": "hour",
    "flat": "flat",
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _number(value: Any) -> float:
    try:
        amount = Decimal(str(value or 0).replace(",", ""))
    except (InvalidOperation, AttributeError):
        return 0.0
    return float(amount) if amount.is_finite() else 0.0


def format_quantity(value: Any) -> str:
    quantity = _number(value)
    if quantity.is_integer():
        return f"{int(quantity):,}"
    return f"{quantity:,.2f}".rstrip("0").rstrip(".")


def format_date(value: Any) -> str:
    raw = _text(value)
    if not raw:
        return "Not set"
    for pattern in ("%Y-%m-%d", "%m-%d-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, pattern).strftime("%b %d, %Y").replace(" 0", " ")
        except ValueError:
            continue
    return raw


def _line_group(item: dict[str, Any]) -> str:
    explicit = _text(item.get("charge_group"))
    if explicit in {key for key, _ in GROUPS}:
        return explicit
    inferred = infer_product_rules(item)
    return _text(inferred.get("charge_group")) or "item"


def _summary_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    group_candidates = (
        ("Food & items", "items_subtotal"),
        ("Staffing", "staff_total"),
        ("Service items", "service_items_total"),
        ("Delivery", "delivery_charge"),
        ("Gratuity items", "gratuity_items_total"),
    )
    groups = [
        {"label": label, "amount": _number(payload.get(key)), "kind": "group"}
        for label, key in group_candidates
        if _number(payload.get(key)) != 0
    ]
    adjustments: list[dict[str, Any]] = []
    service = _number(payload.get("service_charge"))
    if service:
        rate = format_quantity(payload.get("service_charge_percent"))
        adjustments.append({"label": f"Service charge ({rate}%)", "amount": service, "kind": "adjustment"})
    gratuity = _number(payload.get("gratuity"))
    if gratuity:
        rate = format_quantity(payload.get("gratuity_percent"))
        adjustments.append({"label": f"Gratuity ({rate}%)", "amount": gratuity, "kind": "adjustment"})
    tax = _number(payload.get("tax"))
    if tax:
        rate = format_quantity(payload.get("tax_percent"))
        adjustments.append({"label": f"Tax ({rate}%)", "amount": tax, "kind": "adjustment"})

    rows = [*groups]
    if len(groups) > 1 or adjustments:
        rows.append({"label": "Line subtotal", "amount": _number(payload.get("subtotal")), "kind": "subtotal"})
    rows.extend(adjustments)
    rows.append({"label": "Total", "amount": _number(payload.get("total")), "kind": "total"})
    deposit = _number(payload.get("deposit"))
    if deposit:
        rows.append({"label": "Deposit", "amount": -deposit, "kind": "deposit"})
    rows.append({"label": "Balance due", "amount": _number(payload.get("balance_due")), "kind": "balance"})
    return rows


def estimate_document_view(payload: dict[str, Any]) -> dict[str, Any]:
    business = payload.get("business") if isinstance(payload.get("business"), dict) else {}
    customer = payload.get("customer") if isinstance(payload.get("customer"), dict) else {}
    event = payload.get("event") if isinstance(payload.get("event"), dict) else {}

    groups_by_key: dict[str, list[dict[str, Any]]] = {key: [] for key, _ in GROUPS}
    for raw in payload.get("line_items", []):
        item = raw if isinstance(raw, dict) else {}
        group_key = _line_group(item)
        if group_key not in groups_by_key:
            group_key = "item"
        unit = _text(item.get("pricing_unit")) or "each"
        groups_by_key[group_key].append(
            {
                "line_id": _text(item.get("line_id")),
                "category": _text(item.get("Category") or item.get("category")) or "Uncategorized",
                "name": _text(item.get("Description") or item.get("description")) or "Line item",
                "description": _text(item.get("Notes") or item.get("notes")),
                "quantity": _number(item.get("Qty", item.get("qty"))),
                "quantity_label": format_quantity(item.get("Qty", item.get("qty"))),
                "unit": UNIT_LABELS.get(unit, unit.replace("_", " ")),
                "unit_price": _number(item.get("Unit Price", item.get("unit_price"))),
                "line_total": _number(item.get("Line Total", item.get("line_total"))),
            }
        )

    line_groups = [
        {"key": key, "label": label, "items": groups_by_key[key]}
        for key, label in GROUPS
        if groups_by_key[key]
    ]

    customer_details = [
        _text(customer.get("organization")),
        _text(payload.get("customer_email") or customer.get("customer_email")),
        _text(payload.get("customer_phone") or customer.get("customer_phone")),
        _text(payload.get("billing_address") or customer.get("billing_address")),
    ]
    event_details = [
        format_date(payload.get("event_date") or event.get("event_date")),
        _text(payload.get("venue") or event.get("venue")),
        f"{format_quantity(payload.get('guest_count') or event.get('guest_count'))} guests",
    ]
    footer_parts = [
        _text(business.get("business_phone")),
        _text(business.get("business_email")),
        _text(business.get("business_address")),
    ]

    notes: list[dict[str, str]] = []
    default_note = _text(business.get("estimate_notes"))
    estimate_note = _text(payload.get("notes"))
    if default_note:
        notes.append({"label": "About this estimate", "text": default_note})
    if estimate_note and estimate_note != default_note:
        notes.append({"label": "Estimate notes", "text": estimate_note})

    revision_number = max(int(payload.get("revision_number", 0) or 0), 0)
    estimate_number = _text(payload.get("estimate_number")) or "DRAFT"
    business_name = _text(business.get("business_name") or payload.get("company_name")) or "Catering Company"
    return {
        "document": {
            "number": estimate_number,
            "revision_number": revision_number,
            "revision_label": f"Revision {revision_number}" if revision_number else "Draft",
            "issue_date": format_date(payload.get("issue_date")),
            "valid_until": format_date(payload.get("valid_until")) if payload.get("valid_until") else "",
            "currency": _text(payload.get("currency")) or "USD",
        },
        "business": {
            "name": business_name,
            "footer": [value for value in footer_parts if value],
        },
        "prepared_for": {
            "name": _text(payload.get("customer_name") or customer.get("customer_name")) or "Customer",
            "details": [value for value in customer_details if value],
        },
        "event": {
            "name": _text(payload.get("event_name") or payload.get("event_type") or event.get("event_name")) or "Event",
            "details": [value for value in event_details if value and value != "0 guests"],
        },
        "line_groups": line_groups,
        "summary_rows": _summary_rows(payload),
        "notes": notes,
        "payment_terms": _text(business.get("payment_terms")),
        "metadata": {
            "title": f"Estimate {estimate_number} - {_text(payload.get('customer_name')) or 'Customer'}",
            "author": business_name,
            "subject": f"Catering estimate {estimate_number}, {revision_number and f'revision {revision_number}' or 'draft'}",
        },
    }
