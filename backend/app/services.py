from __future__ import annotations

import re
from copy import deepcopy
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from uuid import uuid4

TWOPLACES = Decimal("0.01")
GUEST_COUNT_CATEGORIES = {
    "hot entree", "cold entree", "sides", "salads", "appetizers", "desserts", "fruits",
}


def to_decimal(value: Any) -> Decimal:
    try:
        amount = Decimal(str(value).replace(",", "")).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, AttributeError):
        return Decimal("0.00")
    return amount if amount.is_finite() else Decimal("0.00")


def money(value: Any) -> str:
    return f"${to_decimal(value):,.2f}"


def clean_filename(value: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_-]+", "-", value.strip())
    return clean.strip("-") or "estimate"


def infer_product_rules(product: dict[str, Any]) -> dict[str, Any]:
    """Add explicit pricing metadata to a legacy catalog product."""
    item = dict(product)
    category_value = str(item.get("category", item.get("Category", ""))).strip()
    description_value = str(item.get("name", item.get("Description", ""))).strip()
    customer_description = str(item.get("customer_description", item.get("Notes", ""))).strip()
    if "price_cents" in item:
        unit_price = float(max(int(item.get("price_cents", 0) or 0), 0) / 100)
    else:
        unit_price = float(to_decimal(item.get("Unit Price", item.get("unit_price", 0))))
    item.setdefault("Category", category_value)
    item.setdefault("Description", description_value)
    item.setdefault("Notes", customer_description)
    item.setdefault("Unit Price", unit_price)
    category = category_value.casefold()
    description = description_value.casefold()
    if category == "staff":
        charge_group = "staff"
    elif category == "service":
        charge_group = "service"
    elif category == "delivery":
        charge_group = "delivery"
    elif category == "gratuity":
        charge_group = "gratuity"
    else:
        charge_group = "item"

    if description == "servers":
        quantity_rule, pricing_unit = "server_hours", "hour"
    elif description == "kitchen staff":
        quantity_rule, pricing_unit = "kitchen_staff_hours", "hour"
    elif category == "utensils":
        quantity_rule, pricing_unit = "guest_plus_buffer", "each"
    elif category in GUEST_COUNT_CATEGORIES:
        quantity_rule, pricing_unit = "guest_count", "guest"
    elif charge_group in {"service", "delivery", "gratuity"}:
        quantity_rule, pricing_unit = "manual", "flat"
    else:
        quantity_rule, pricing_unit = "manual", "each"

    item.setdefault("pricing_unit", pricing_unit)
    item.setdefault("quantity_rule", quantity_rule)
    item.setdefault("charge_group", charge_group)
    item.setdefault("tax_class", "taxable")
    item.setdefault("archived", item.get("status") == "archived")
    return item


def default_quantity(product: dict[str, Any], event: dict[str, Any]) -> float:
    rule = str(infer_product_rules(product).get("quantity_rule", "manual"))
    guests = int(event.get("guest_count", 50) or 50)
    if rule == "guest_count":
        return float(guests)
    if rule == "guest_plus_buffer":
        return float(guests + int(event.get("utensils_buffer", 0) or 0))
    if rule == "server_hours":
        return float(int(event.get("servers_count", 0) or 0) * int(event.get("servers_hours", 0) or 0))
    if rule == "kitchen_staff_hours":
        return float(
            int(event.get("kitchen_staff_count", 0) or 0)
            * int(event.get("kitchen_staff_hours", 0) or 0)
        )
    return 1.0


def calculate_totals(
    line_items: list[dict[str, Any]],
    tax_percent: float,
    service_percent: float = 0,
    gratuity_percent: float = 0,
    deposit_amount: float = 0,
    service_charge_taxable: bool = True,
    gratuity_taxable: bool = True,
) -> dict[str, float]:
    groups = {
        "item": Decimal("0.00"),
        "staff": Decimal("0.00"),
        "service": Decimal("0.00"),
        "delivery": Decimal("0.00"),
        "gratuity": Decimal("0.00"),
    }
    taxable_lines = Decimal("0.00")
    for item in line_items:
        total = to_decimal(item.get("Line Total"))
        if total == 0:
            total = (to_decimal(item.get("Qty")) * to_decimal(item.get("Unit Price"))).quantize(
                TWOPLACES, rounding=ROUND_HALF_UP
            )
        group = str(item.get("charge_group", "item"))
        groups[group if group in groups else "item"] += total
        if str(item.get("tax_class", "taxable")) == "taxable":
            taxable_lines += total

    service_charge = (groups["item"] * to_decimal(service_percent) / Decimal("100")).quantize(TWOPLACES)
    gratuity = (groups["item"] * to_decimal(gratuity_percent) / Decimal("100")).quantize(TWOPLACES)
    taxable_subtotal = taxable_lines
    if service_charge_taxable:
        taxable_subtotal += service_charge
    if gratuity_taxable:
        taxable_subtotal += gratuity
    tax = (taxable_subtotal * to_decimal(tax_percent) / Decimal("100")).quantize(TWOPLACES)
    line_subtotal = sum(groups.values(), Decimal("0.00"))
    total = line_subtotal + service_charge + gratuity + tax
    deposit = min(max(to_decimal(deposit_amount), Decimal("0.00")), total)

    return {
        "items_subtotal": float(groups["item"]),
        "staff_total": float(groups["staff"]),
        "service_items_total": float(groups["service"]),
        "delivery_charge": float(groups["delivery"]),
        "gratuity_items_total": float(groups["gratuity"]),
        "subtotal": float(line_subtotal),
        "service_charge": float(service_charge),
        "gratuity": float(gratuity),
        "taxable_subtotal": float(taxable_subtotal),
        "tax": float(tax),
        "total": float(total),
        "deposit": float(deposit),
        "balance_due": float(total - deposit),
    }


def build_estimate(
    *,
    company: dict[str, Any],
    customer: dict[str, Any],
    event: dict[str, Any],
    draft_items: list[dict[str, Any]],
    estimate_number: str,
    revision_number: int = 0,
    previous: dict[str, Any] | None = None,
    notes: str = "",
    revision_reason: str = "Updated estimate",
    service_charge_percent: float = 0,
    service_charge_taxable: bool = True,
    gratuity_percent: float = 0,
    gratuity_taxable: bool = True,
    deposit_amount: float = 0,
) -> dict[str, Any]:
    products = {str(item.get("product_id")): infer_product_rules(item) for item in company.get("products", [])}
    line_items: list[dict[str, Any]] = []
    now = datetime.now().isoformat(timespec="seconds")
    for raw in draft_items:
        item = dict(raw)
        source_id = str(item.get("source_product_id") or item.get("product_id") or "").strip() or None
        product = products.get(source_id or "")
        description = str(item.get("Description") or item.get("description") or (product or {}).get("Description", "")).strip()
        if not description:
            continue
        quantity = to_decimal(item.get("Qty", item.get("qty", default_quantity(product or item, event))))
        supplied_price = item.get("Unit Price", item.get("unit_price"))
        unit_price = to_decimal(supplied_price if supplied_price is not None else (product or {}).get("Unit Price", 0))
        selected_price_cents = item.get("catalog_price_cents_at_selection")
        if selected_price_cents is None:
            selected_price_cents = int((to_decimal((product or {}).get("Unit Price", unit_price)) * Decimal("100")).to_integral_value())
        catalog_price = to_decimal(Decimal(max(int(selected_price_cents or 0), 0)) / Decimal("100"))
        price_overridden = bool(product and unit_price != catalog_price)
        suggested_quantity = item.get("suggested_quantity")
        if suggested_quantity is None:
            suggested_quantity = default_quantity(product or item, event)
        line_items.append(
            {
                "line_id": str(item.get("line_id") or f"line-{uuid4().hex[:12]}"),
                "source_product_id": source_id,
                "source_product_version": (
                    int(item.get("source_product_version") or (product or {}).get("version", 1)) if source_id else None
                ),
                "catalog_price_cents_at_selection": max(int(selected_price_cents or 0), 0) if source_id else None,
                "selected_at": str(item.get("selected_at") or now) if source_id else "",
                "Category": str(item.get("Category") or item.get("category") or (product or {}).get("Category", "Custom")).strip(),
                "Description": description,
                "Notes": str(item.get("Notes", item.get("notes", (product or {}).get("Notes", "")))).strip(),
                "Qty": float(quantity),
                "Unit Price": float(unit_price),
                "Line Total": float((quantity * unit_price).quantize(TWOPLACES)),
                "pricing_unit": str(item.get("pricing_unit") or (product or {}).get("pricing_unit", "each")),
                "quantity_rule": str(item.get("quantity_rule") or (product or {}).get("quantity_rule", "manual")),
                "suggested_quantity": float(to_decimal(suggested_quantity)),
                "charge_group": str(item.get("charge_group") or (product or {}).get("charge_group", "item")),
                "tax_class": str(item.get("tax_class") or (product or {}).get("tax_class", "taxable")),
                "is_custom": bool(item.get("is_custom", not source_id)),
                "price_overridden": price_overridden,
                "override_reason": str(item.get("override_reason", "")).strip(),
            }
        )

    tax_percent = float(event.get("tax_percent", 0) or 0) if bool(event.get("charge_tax", False)) else 0.0
    totals = calculate_totals(
        line_items,
        tax_percent,
        service_charge_percent,
        gratuity_percent,
        deposit_amount,
        service_charge_taxable,
        gratuity_taxable,
    )
    business_snapshot = {
        key: deepcopy(company.get(key, ""))
        for key in (
            "company_id", "business_name", "business_email", "business_phone",
            "business_address", "payment_terms", "estimate_notes",
        )
    }
    return {
        "estimate_number": estimate_number,
        "revision_id": f"revision-{uuid4().hex[:12]}",
        "revision_number": revision_number,
        "revision_reason": revision_reason.strip() or ("Initial estimate" if revision_number <= 1 else "Updated estimate"),
        "created_at": (previous or {}).get("created_at", now),
        "updated_at": now,
        "issue_date": date.today().isoformat(),
        "company_id": company["company_id"],
        "company_name": company["business_name"],
        "business": business_snapshot,
        "customer_id": customer["customer_id"],
        "customer_name": customer.get("customer_name", ""),
        "customer_email": customer.get("customer_email", ""),
        "customer_phone": customer.get("customer_phone", ""),
        "billing_address": customer.get("billing_address", ""),
        "customer": deepcopy(customer),
        "event_id": event["event_id"],
        "event_name": event.get("event_name") or event.get("event_type", "Event"),
        "event_date": event.get("event_date", ""),
        "event_type": event.get("event_type", "Private Event"),
        "venue": event.get("venue", ""),
        "guest_count": int(event.get("guest_count", 50) or 50),
        "event": deepcopy(event),
        "tax_percent": tax_percent,
        "service_charge_percent": float(service_charge_percent),
        "service_charge_taxable": service_charge_taxable,
        "gratuity_percent": float(gratuity_percent),
        "gratuity_taxable": gratuity_taxable,
        "notes": notes.strip(),
        "line_items": line_items,
        **totals,
    }


def resolve_product_selection(product: dict[str, Any], event: dict[str, Any], selected_at: str) -> dict[str, Any]:
    """Create a version-aware, customer-safe estimate line snapshot."""
    item = infer_product_rules(product)
    suggested = default_quantity(item, event)
    price_cents = max(int(product.get("price_cents", 0) or 0), 0)
    return {
        "source_product_id": product["product_id"],
        "source_product_version": int(product.get("version", 1) or 1),
        "catalog_price_cents_at_selection": price_cents,
        "selected_at": selected_at,
        "sku": product.get("sku", ""),
        "category_id": product.get("category_id", "uncategorized"),
        "Category": item.get("Category", ""),
        "Description": item.get("Description", ""),
        "Notes": item.get("Notes", ""),
        "Qty": suggested,
        "suggested_quantity": suggested,
        "Unit Price": float(Decimal(price_cents) / Decimal("100")),
        "currency": product.get("currency", "USD"),
        "pricing_unit": item.get("pricing_unit", "each"),
        "quantity_rule": item.get("quantity_rule", "manual"),
        "charge_group": item.get("charge_group", "item"),
        "tax_class": item.get("tax_class", "taxable"),
        "is_custom": False,
        "override_reason": "",
    }
