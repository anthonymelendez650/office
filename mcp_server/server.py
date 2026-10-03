from __future__ import annotations

import argparse
import os
from typing import Any, Literal
from urllib.parse import quote

from mcp.server import MCPServer

from .api import OfficeApiClient

PricingUnit = Literal["each", "guest", "hour", "flat"]
QuantityRule = Literal["manual", "guest_count", "guest_plus_buffer", "server_hours", "kitchen_staff_hours"]
ChargeGroup = Literal["item", "staff", "service", "delivery", "gratuity"]
TaxClass = Literal["taxable", "non_taxable"]

mcp = MCPServer(
    "Silverspoon Office",
    instructions=(
        "Manage catering companies, products, customers, events, and versioned estimates through the "
        "Silverspoon Office API. Read the current entity first, pass its version or revision to every "
        "mutation, provide a specific change reason, and reuse an idempotency key when retrying a write."
    ),
)


def _api() -> OfficeApiClient:
    return OfficeApiClient()


def _path(value: str) -> str:
    return quote(value, safe="")


def _defined(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value is not None}


@mcp.tool()
def office_status() -> dict[str, Any]:
    """Check API availability, schema version, actor, and granted scopes."""
    return {
        "health": _api().request("GET", "/health"),
        "capabilities": _api().request("GET", "/capabilities"),
    }


@mcp.tool()
def list_companies(include_archived: bool = False, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
    """List companies. Each result includes the version required for a safe update or archive."""
    return _api().request(
        "GET", "/companies", query={"include_archived": include_archived, "limit": limit, "offset": offset}
    )


@mcp.tool()
def get_company(company_id: str, include_archived: bool = False) -> dict[str, Any]:
    """Get one company with its products, customers, events, and current versions."""
    return _api().request(
        "GET", f"/companies/{_path(company_id)}", query={"include_archived": include_archived}
    )


@mcp.tool()
def create_company(
    business_name: str,
    change_reason: str,
    business_email: str = "",
    business_phone: str = "",
    business_address: str = "",
    default_service_charge_percent: float = 0,
    default_gratuity_percent: float = 0,
    payment_terms: str = "",
    estimate_notes: str = "",
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Create a company. Reuse idempotency_key if the caller retries this exact creation."""
    return _api().request(
        "POST",
        "/companies",
        payload={
            "business_name": business_name,
            "business_email": business_email,
            "business_phone": business_phone,
            "business_address": business_address,
            "default_service_charge_percent": default_service_charge_percent,
            "default_gratuity_percent": default_gratuity_percent,
            "payment_terms": payment_terms,
            "estimate_notes": estimate_notes,
            "change_reason": change_reason,
        },
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def update_company(
    company_id: str,
    expected_version: int,
    change_reason: str,
    business_name: str | None = None,
    business_email: str | None = None,
    business_phone: str | None = None,
    business_address: str | None = None,
    default_service_charge_percent: float | None = None,
    default_gratuity_percent: float | None = None,
    payment_terms: str | None = None,
    estimate_notes: str | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Update selected company fields with optimistic version checking."""
    payload = _defined(
        {
            "expected_version": expected_version,
            "change_reason": change_reason,
            "business_name": business_name,
            "business_email": business_email,
            "business_phone": business_phone,
            "business_address": business_address,
            "default_service_charge_percent": default_service_charge_percent,
            "default_gratuity_percent": default_gratuity_percent,
            "payment_terms": payment_terms,
            "estimate_notes": estimate_notes,
        }
    )
    return _api().request(
        "PATCH", f"/companies/{_path(company_id)}", payload=payload, idempotency_key=idempotency_key
    )


@mcp.tool()
def set_company_archived(
    company_id: str,
    expected_version: int,
    archived: bool,
    change_reason: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Archive or restore a company without deleting its history."""
    action = "archive" if archived else "restore"
    return _api().request(
        "POST",
        f"/companies/{_path(company_id)}/{action}",
        payload={"expected_version": expected_version, "change_reason": change_reason},
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def list_products(
    company_id: str,
    include_archived: bool = False,
    query: str = "",
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """List or search canonical catalog products and return the catalog version."""
    return _api().request(
        "GET",
        f"/companies/{_path(company_id)}/products",
        query={
            "include_archived": include_archived,
            "query": query,
            "limit": limit,
            "offset": offset,
        },
    )


@mcp.tool()
def get_product(company_id: str, product_id: str) -> dict[str, Any]:
    """Get one canonical product and its current version."""
    return _api().request(
        "GET", f"/companies/{_path(company_id)}/products/{_path(product_id)}"
    )


@mcp.tool()
def create_product(
    company_id: str,
    name: str,
    price_cents: int,
    change_reason: str,
    sku: str = "",
    customer_description: str = "",
    internal_notes: str = "",
    category: str = "",
    category_id: str = "",
    currency: str = "USD",
    pricing_unit: PricingUnit = "each",
    quantity_rule: QuantityRule = "manual",
    default_quantity: float = 1,
    minimum_quantity: float = 0,
    quantity_step: float = 1,
    charge_group: ChargeGroup = "item",
    tax_class: TaxClass = "taxable",
    sort_order: int | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Create a versioned catalog product using integer cents for price."""
    return _api().request(
        "POST",
        f"/companies/{_path(company_id)}/products",
        payload={
            "name": name,
            "price_cents": price_cents,
            "change_reason": change_reason,
            "sku": sku,
            "customer_description": customer_description,
            "internal_notes": internal_notes,
            "category": category,
            "category_id": category_id,
            "currency": currency,
            "pricing_unit": pricing_unit,
            "quantity_rule": quantity_rule,
            "default_quantity": default_quantity,
            "minimum_quantity": minimum_quantity,
            "quantity_step": quantity_step,
            "charge_group": charge_group,
            "tax_class": tax_class,
            "sort_order": sort_order,
        },
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def update_product(
    company_id: str,
    product_id: str,
    expected_version: int,
    change_reason: str,
    name: str | None = None,
    price_cents: int | None = None,
    sku: str | None = None,
    customer_description: str | None = None,
    internal_notes: str | None = None,
    category: str | None = None,
    category_id: str | None = None,
    currency: str | None = None,
    pricing_unit: PricingUnit | None = None,
    quantity_rule: QuantityRule | None = None,
    default_quantity: float | None = None,
    minimum_quantity: float | None = None,
    quantity_step: float | None = None,
    charge_group: ChargeGroup | None = None,
    tax_class: TaxClass | None = None,
    sort_order: int | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Update selected product fields; read the product first and pass its version."""
    payload = _defined(
        {
            "expected_version": expected_version,
            "change_reason": change_reason,
            "name": name,
            "price_cents": price_cents,
            "sku": sku,
            "customer_description": customer_description,
            "internal_notes": internal_notes,
            "category": category,
            "category_id": category_id,
            "currency": currency,
            "pricing_unit": pricing_unit,
            "quantity_rule": quantity_rule,
            "default_quantity": default_quantity,
            "minimum_quantity": minimum_quantity,
            "quantity_step": quantity_step,
            "charge_group": charge_group,
            "tax_class": tax_class,
            "sort_order": sort_order,
        }
    )
    return _api().request(
        "PATCH",
        f"/companies/{_path(company_id)}/products/{_path(product_id)}",
        payload=payload,
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def set_product_archived(
    company_id: str,
    product_id: str,
    expected_version: int,
    archived: bool,
    change_reason: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Archive or restore a product while preserving revisions and estimate references."""
    action = "archive" if archived else "restore"
    return _api().request(
        "POST",
        f"/companies/{_path(company_id)}/products/{_path(product_id)}/{action}",
        payload={"expected_version": expected_version, "change_reason": change_reason},
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def get_product_history(company_id: str, product_id: str) -> dict[str, Any]:
    """Get immutable product revisions and estimate usage references."""
    base = f"/companies/{_path(company_id)}/products/{_path(product_id)}"
    return {
        "revisions": _api().request("GET", f"{base}/revisions"),
        "usage": _api().request("GET", f"{base}/usage"),
    }


@mcp.tool()
def list_customers(
    company_id: str,
    include_archived: bool = False,
    query: str = "",
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List or search customers (clients), including versions needed for safe edits."""
    return _api().request(
        "GET",
        f"/companies/{_path(company_id)}/customers",
        query={"include_archived": include_archived, "query": query, "limit": limit, "offset": offset},
    )


@mcp.tool()
def get_customer(company_id: str, customer_id: str) -> dict[str, Any]:
    """Get one customer/client record and its current version."""
    return _api().request(
        "GET", f"/companies/{_path(company_id)}/customers/{_path(customer_id)}"
    )


@mcp.tool()
def create_customer(
    company_id: str,
    customer_name: str,
    change_reason: str,
    organization: str = "",
    customer_email: str = "",
    customer_phone: str = "",
    billing_address: str = "",
    internal_notes: str = "",
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Create a customer/client record."""
    return _api().request(
        "POST",
        f"/companies/{_path(company_id)}/customers",
        payload={
            "customer_name": customer_name,
            "organization": organization,
            "customer_email": customer_email,
            "customer_phone": customer_phone,
            "billing_address": billing_address,
            "internal_notes": internal_notes,
            "change_reason": change_reason,
        },
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def update_customer(
    company_id: str,
    customer_id: str,
    expected_version: int,
    change_reason: str,
    customer_name: str | None = None,
    organization: str | None = None,
    customer_email: str | None = None,
    customer_phone: str | None = None,
    billing_address: str | None = None,
    internal_notes: str | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Update selected customer/client fields with optimistic version checking."""
    payload = _defined(
        {
            "expected_version": expected_version,
            "change_reason": change_reason,
            "customer_name": customer_name,
            "organization": organization,
            "customer_email": customer_email,
            "customer_phone": customer_phone,
            "billing_address": billing_address,
            "internal_notes": internal_notes,
        }
    )
    return _api().request(
        "PATCH",
        f"/companies/{_path(company_id)}/customers/{_path(customer_id)}",
        payload=payload,
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def set_customer_archived(
    company_id: str,
    customer_id: str,
    expected_version: int,
    archived: bool,
    change_reason: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Archive or restore a customer/client without deleting estimate history."""
    action = "archive" if archived else "restore"
    return _api().request(
        "POST",
        f"/companies/{_path(company_id)}/customers/{_path(customer_id)}/{action}",
        payload={"expected_version": expected_version, "change_reason": change_reason},
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def list_events(
    company_id: str,
    customer_id: str | None = None,
    include_archived: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List events, optionally for one customer, with current versions."""
    return _api().request(
        "GET",
        f"/companies/{_path(company_id)}/events",
        query={
            "customer_id": customer_id,
            "include_archived": include_archived,
            "limit": limit,
            "offset": offset,
        },
    )


@mcp.tool()
def get_event(company_id: str, event_id: str) -> dict[str, Any]:
    """Get one event and its current version."""
    return _api().request("GET", f"/companies/{_path(company_id)}/events/{_path(event_id)}")


@mcp.tool()
def create_event(
    company_id: str,
    customer_id: str,
    change_reason: str,
    event_name: str = "",
    event_type: str = "Private Event",
    event_date: str = "",
    venue: str = "",
    guest_count: int = 50,
    servers_count: int = 0,
    servers_hours: int = 0,
    kitchen_staff_count: int = 0,
    kitchen_staff_hours: int = 0,
    utensils_buffer: int = 0,
    charge_tax: bool = False,
    tax_percent: float = 0,
    default_deposit_amount: float = 0,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Create an event owned by an active customer/client."""
    return _api().request(
        "POST",
        f"/companies/{_path(company_id)}/events",
        payload={
            "customer_id": customer_id,
            "event_name": event_name,
            "event_type": event_type,
            "event_date": event_date,
            "venue": venue,
            "guest_count": guest_count,
            "servers_count": servers_count,
            "servers_hours": servers_hours,
            "kitchen_staff_count": kitchen_staff_count,
            "kitchen_staff_hours": kitchen_staff_hours,
            "utensils_buffer": utensils_buffer,
            "charge_tax": charge_tax,
            "tax_percent": tax_percent,
            "default_deposit_amount": default_deposit_amount,
            "change_reason": change_reason,
        },
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def update_event(
    company_id: str,
    event_id: str,
    expected_version: int,
    change_reason: str,
    customer_id: str | None = None,
    event_name: str | None = None,
    event_type: str | None = None,
    event_date: str | None = None,
    venue: str | None = None,
    guest_count: int | None = None,
    servers_count: int | None = None,
    servers_hours: int | None = None,
    kitchen_staff_count: int | None = None,
    kitchen_staff_hours: int | None = None,
    utensils_buffer: int | None = None,
    charge_tax: bool | None = None,
    tax_percent: float | None = None,
    default_deposit_amount: float | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Update selected event fields with optimistic version checking."""
    payload = _defined(
        {
            "expected_version": expected_version,
            "change_reason": change_reason,
            "customer_id": customer_id,
            "event_name": event_name,
            "event_type": event_type,
            "event_date": event_date,
            "venue": venue,
            "guest_count": guest_count,
            "servers_count": servers_count,
            "servers_hours": servers_hours,
            "kitchen_staff_count": kitchen_staff_count,
            "kitchen_staff_hours": kitchen_staff_hours,
            "utensils_buffer": utensils_buffer,
            "charge_tax": charge_tax,
            "tax_percent": tax_percent,
            "default_deposit_amount": default_deposit_amount,
        }
    )
    return _api().request(
        "PATCH",
        f"/companies/{_path(company_id)}/events/{_path(event_id)}",
        payload=payload,
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def set_event_archived(
    company_id: str,
    event_id: str,
    expected_version: int,
    archived: bool,
    change_reason: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Archive or restore an event without deleting estimate history."""
    action = "archive" if archived else "restore"
    return _api().request(
        "POST",
        f"/companies/{_path(company_id)}/events/{_path(event_id)}/{action}",
        payload={"expected_version": expected_version, "change_reason": change_reason},
        idempotency_key=idempotency_key,
    )


@mcp.tool()
def get_entity_revisions(
    entity_type: Literal["company", "customer", "event"],
    company_id: str,
    entity_id: str,
) -> list[dict[str, Any]]:
    """Get immutable revisions for a company, customer, or event."""
    if entity_type == "company":
        path = f"/companies/{_path(company_id)}/revisions"
    else:
        path = f"/companies/{_path(company_id)}/{entity_type}s/{_path(entity_id)}/revisions"
    return _api().request("GET", path)


@mcp.tool()
def list_estimates(
    company_id: str | None = None,
    customer_id: str | None = None,
    event_id: str | None = None,
    include_archived: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """List current estimate revisions with optional company, customer, and event filters."""
    return _api().request(
        "GET",
        "/estimates",
        query={
            "company_id": company_id,
            "customer_id": customer_id,
            "event_id": event_id,
            "include_archived": include_archived,
            "limit": limit,
            "offset": offset,
        },
    )


@mcp.tool()
def get_estimate(estimate_number: str, revision: int | None = None) -> dict[str, Any]:
    """Get the current or a specific immutable estimate revision."""
    return _api().request(
        "GET", f"/estimates/{_path(estimate_number)}", query={"revision": revision}
    )


@mcp.tool()
def get_estimate_revisions(estimate_number: str) -> list[dict[str, Any]]:
    """List immutable revision metadata for an estimate."""
    return _api().request("GET", f"/estimates/{_path(estimate_number)}/revisions")


@mcp.tool()
def calculate_estimate(draft: dict[str, Any]) -> dict[str, Any]:
    """Calculate an estimate draft without saving. Draft line prices are decimal currency values."""
    return _api().request("POST", "/estimates/calculate", payload=draft)


@mcp.tool()
def save_estimate(
    draft: dict[str, Any],
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Create an estimate or append a revision. Existing estimates require base_revision and a reason."""
    return _api().request(
        "POST", "/estimates", payload=draft, idempotency_key=idempotency_key
    )


@mcp.tool()
def set_estimate_archived(
    estimate_number: str,
    base_revision: int,
    archived: bool,
    change_reason: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Archive or restore an estimate while preserving every immutable revision."""
    action = "archive" if archived else "restore"
    return _api().request(
        "POST",
        f"/estimates/{_path(estimate_number)}/{action}",
        payload={"base_revision": base_revision, "change_reason": change_reason},
        idempotency_key=idempotency_key,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Silverspoon Office MCP server")
    parser.add_argument(
        "--transport",
        choices=("stdio", "streamable-http"),
        default=os.getenv("OFFICE_MCP_TRANSPORT", "stdio"),
    )
    parser.add_argument("--host", default=os.getenv("OFFICE_MCP_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("OFFICE_MCP_PORT", "8010")))
    arguments = parser.parse_args()
    if arguments.transport == "stdio":
        mcp.run(transport="stdio")
    else:
        mcp.run(transport="streamable-http", host=arguments.host, port=arguments.port)


if __name__ == "__main__":
    main()
