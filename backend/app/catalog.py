from __future__ import annotations

import re
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
from math import isfinite
from typing import Any
from uuid import uuid4

from .services import infer_product_rules, to_decimal

PRODUCT_STATUSES = {"active", "archived"}
PRICING_UNITS = {"each", "guest", "hour", "flat"}
QUANTITY_RULES = {"manual", "guest_count", "guest_plus_buffer", "server_hours", "kitchen_staff_hours"}
CHARGE_GROUPS = {"item", "staff", "service", "delivery", "gratuity"}
TAX_CLASSES = {"taxable", "non_taxable"}
PRODUCT_FIELDS = (
    "sku",
    "name",
    "customer_description",
    "internal_notes",
    "category_id",
    "category",
    "price_cents",
    "currency",
    "pricing_unit",
    "quantity_rule",
    "default_quantity",
    "minimum_quantity",
    "quantity_step",
    "charge_group",
    "tax_class",
    "status",
    "sort_order",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def valid_identifier(value: Any) -> str:
    identifier = str(value or "").strip()
    return "" if identifier.casefold() in {"", "none", "null", "undefined"} else identifier


def new_product_id() -> str:
    return f"product-{uuid4().hex[:12]}"


def category_identifier(value: Any) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().casefold()).strip("-")
    return slug or "uncategorized"


def money_to_cents(value: Any) -> int:
    return max(int((to_decimal(value) * Decimal("100")).to_integral_value()), 0)


def cents_to_money(value: Any) -> float:
    try:
        cents = max(int(value or 0), 0)
    except (TypeError, ValueError):
        cents = 0
    return float(Decimal(cents) / Decimal("100"))


def _pick(source: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in source and source[key] is not None:
            return source[key]
    return default


def _choice(value: Any, allowed: set[str], fallback: str) -> str:
    candidate = str(value or "").strip()
    return candidate if candidate in allowed else fallback


def normalize_product(
    raw: dict[str, Any],
    company_id: str,
    *,
    existing: dict[str, Any] | None = None,
    position: int | None = None,
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Return the single canonical product representation used by persistence."""
    current = existing or {}
    values = {**current, **raw}
    now = timestamp or utc_now()

    product_id = valid_identifier(_pick(values, "product_id")) or new_product_id()
    category = str(_pick(raw, "category", "Category", default=current.get("category", "")) or "").strip()
    name = str(_pick(raw, "name", "description", "Description", default=current.get("name", "")) or "").strip()
    customer_description = str(
        _pick(raw, "customer_description", "notes", "Notes", default=current.get("customer_description", "")) or ""
    ).strip()
    internal_notes = str(_pick(raw, "internal_notes", default=current.get("internal_notes", "")) or "").strip()

    explicit_price_cents = _pick(raw, "price_cents")
    if explicit_price_cents is None:
        supplied_price = _pick(raw, "unit_price", "Unit Price")
        if supplied_price is not None:
            price_cents = money_to_cents(supplied_price)
        else:
            try:
                price_cents = max(int(current.get("price_cents", 0) or 0), 0)
            except (TypeError, ValueError):
                price_cents = 0
    else:
        try:
            price_cents = max(int(explicit_price_cents), 0)
        except (TypeError, ValueError):
            price_cents = 0

    legacy_basis = {
        **values,
        "Category": category,
        "Description": name,
        "Notes": customer_description,
        "Unit Price": cents_to_money(price_cents),
    }
    rules = infer_product_rules(legacy_basis)
    archived = bool(_pick(raw, "archived", default=False))
    status = str(_pick(raw, "status", default=("archived" if archived else current.get("status", "active"))) or "active")
    status = status if status in PRODUCT_STATUSES else "active"

    try:
        default_quantity = max(float(_pick(raw, "default_quantity", default=current.get("default_quantity", 1)) or 0), 0)
        minimum_quantity = max(float(_pick(raw, "minimum_quantity", default=current.get("minimum_quantity", 0)) or 0), 0)
        quantity_step = float(_pick(raw, "quantity_step", default=current.get("quantity_step", 1)) or 1)
    except (TypeError, ValueError):
        default_quantity, minimum_quantity, quantity_step = 1.0, 0.0, 1.0
    default_quantity = default_quantity if isfinite(default_quantity) else 1.0
    minimum_quantity = minimum_quantity if isfinite(minimum_quantity) else 0.0
    quantity_step = quantity_step if isfinite(quantity_step) and quantity_step > 0 else 1.0

    try:
        sort_order = max(int(position if position is not None else _pick(raw, "sort_order", default=current.get("sort_order", 0))), 0)
    except (TypeError, ValueError):
        sort_order = 0
    try:
        version = max(int(_pick(raw, "version", default=current.get("version", 1)) or 1), 1)
    except (TypeError, ValueError):
        version = 1

    category_id = str(_pick(raw, "category_id", default=current.get("category_id", "")) or "").strip()
    if (
        category != str(current.get("category", ""))
        and ("category_id" not in raw or str(raw.get("category_id") or "") == str(current.get("category_id", "")))
    ):
        category_id = ""

    currency = str(_pick(raw, "currency", default=current.get("currency", "USD")) or "USD").strip().upper()
    currency = currency if len(currency) == 3 and currency.isalpha() else "USD"
    return {
        "product_id": product_id,
        "company_id": company_id,
        "sku": str(_pick(raw, "sku", default=current.get("sku", "")) or "").strip(),
        "name": name or "Unnamed product",
        "customer_description": customer_description,
        "internal_notes": internal_notes,
        "category_id": category_id or category_identifier(category),
        "category": category,
        "price_cents": price_cents,
        "currency": currency,
        "pricing_unit": _choice(
            _pick(raw, "pricing_unit", default=rules.get("pricing_unit", "each")),
            PRICING_UNITS,
            "each",
        ),
        "quantity_rule": _choice(
            _pick(raw, "quantity_rule", default=rules.get("quantity_rule", "manual")),
            QUANTITY_RULES,
            "manual",
        ),
        "default_quantity": default_quantity,
        "minimum_quantity": minimum_quantity,
        "quantity_step": quantity_step,
        "charge_group": _choice(
            _pick(raw, "charge_group", default=rules.get("charge_group", "item")),
            CHARGE_GROUPS,
            "item",
        ),
        "tax_class": _choice(
            _pick(raw, "tax_class", default=rules.get("tax_class", "taxable")),
            TAX_CLASSES,
            "taxable",
        ),
        "status": status,
        "sort_order": sort_order,
        "version": version,
        "created_at": str(_pick(raw, "created_at", default=current.get("created_at", now)) or now),
        "updated_at": str(_pick(raw, "updated_at", default=current.get("updated_at", now)) or now),
    }


def product_changed(before: dict[str, Any], after: dict[str, Any]) -> bool:
    return any(before.get(field) != after.get(field) for field in PRODUCT_FIELDS)


def product_compatibility_view(product: dict[str, Any]) -> dict[str, Any]:
    """Legacy field names for the current React catalog until its UI slice lands."""
    return {
        "product_id": product["product_id"],
        "Category": product.get("category", ""),
        "Description": product.get("name", ""),
        "Notes": product.get("customer_description", ""),
        "Unit Price": cents_to_money(product.get("price_cents", 0)),
        "pricing_unit": product.get("pricing_unit", "each"),
        "quantity_rule": product.get("quantity_rule", "manual"),
        "charge_group": product.get("charge_group", "item"),
        "tax_class": product.get("tax_class", "taxable"),
        "archived": product.get("status") == "archived",
        "status": product.get("status", "active"),
        "sort_order": product.get("sort_order", 0),
        "version": product.get("version", 1),
        "sku": product.get("sku", ""),
        "internal_notes": product.get("internal_notes", ""),
        "category_id": product.get("category_id", "uncategorized"),
        "currency": product.get("currency", "USD"),
        "default_quantity": product.get("default_quantity", 1),
        "minimum_quantity": product.get("minimum_quantity", 0),
        "quantity_step": product.get("quantity_step", 1),
        "created_at": product.get("created_at", ""),
        "updated_at": product.get("updated_at", ""),
    }


def product_revision(product: dict[str, Any], change_reason: str, changed_at: str | None = None) -> dict[str, Any]:
    return {
        "revision_id": f"product-revision-{uuid4().hex[:12]}",
        "product_id": product["product_id"],
        "company_id": product["company_id"],
        "version": product["version"],
        "change_reason": change_reason.strip() or "Product updated",
        "changed_at": changed_at or product.get("updated_at") or utc_now(),
        "snapshot": deepcopy(product),
    }


def validate_product_collection(products: list[dict[str, Any]]) -> None:
    seen_ids: set[str] = set()
    seen_skus: dict[str, str] = {}
    for product in products:
        product_id = product["product_id"]
        if product_id in seen_ids:
            raise ValueError(f"Duplicate product id: {product_id}")
        seen_ids.add(product_id)
        sku = str(product.get("sku", "")).strip()
        normalized_sku = sku.casefold()
        if normalized_sku and normalized_sku in seen_skus:
            raise ValueError(f"SKU {sku} is already used by another product")
        if normalized_sku:
            seen_skus[normalized_sku] = product_id
