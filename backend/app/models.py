from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PricingUnit = Literal["each", "guest", "hour", "flat"]
QuantityRule = Literal["manual", "guest_count", "guest_plus_buffer", "server_hours", "kitchen_staff_hours"]
ChargeGroup = Literal["item", "staff", "service", "delivery", "gratuity"]
TaxClass = Literal["taxable", "non_taxable"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Product(BaseModel):
    """Compatibility payload accepted by the legacy whole-catalog endpoint."""
    model_config = ConfigDict(populate_by_name=True)

    product_id: str = ""
    category: str = Field(default="", alias="Category")
    description: str = Field(alias="Description", min_length=1)
    notes: str = Field(default="", alias="Notes")
    unit_price: float = Field(default=0.0, alias="Unit Price", ge=0)
    pricing_unit: PricingUnit = "each"
    quantity_rule: QuantityRule = "manual"
    charge_group: ChargeGroup = "item"
    tax_class: TaxClass = "taxable"
    archived: bool = False
    status: Literal["active", "archived"] = "active"
    sort_order: int = Field(default=0, ge=0)
    version: int = Field(default=1, ge=1)
    sku: str = ""
    internal_notes: str = ""
    category_id: str = ""
    currency: str = "USD"
    default_quantity: float = Field(default=1.0, ge=0)
    minimum_quantity: float = Field(default=0.0, ge=0)
    quantity_step: float = Field(default=1.0, gt=0)
    created_at: str = ""
    updated_at: str = ""

    @field_validator(
        "product_id", "category", "description", "notes", "sku", "internal_notes",
        "category_id", "currency", "created_at", "updated_at", mode="before",
    )
    @classmethod
    def stringify(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("description")
    @classmethod
    def require_description(cls, value: str) -> str:
        if not value:
            raise ValueError("Product name is required")
        return value

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        value = value.upper()
        if len(value) != 3 or not value.isalpha():
            raise ValueError("Currency must be a three-letter ISO code")
        return value


class ProductCreate(StrictModel):

    sku: str = ""
    name: str
    customer_description: str = ""
    internal_notes: str = ""
    category_id: str = ""
    category: str = ""
    price_cents: int = Field(default=0, ge=0)
    currency: str = "USD"
    pricing_unit: PricingUnit = "each"
    quantity_rule: QuantityRule = "manual"
    default_quantity: float = Field(default=1.0, ge=0)
    minimum_quantity: float = Field(default=0.0, ge=0)
    quantity_step: float = Field(default=1.0, gt=0)
    charge_group: ChargeGroup = "item"
    tax_class: TaxClass = "taxable"
    sort_order: int | None = Field(default=None, ge=0)
    change_reason: str = "Created product"

    @field_validator(
        "sku", "name", "customer_description", "internal_notes", "category_id",
        "category", "currency", "change_reason", mode="before",
    )
    @classmethod
    def stringify_create(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("name")
    @classmethod
    def require_name(cls, value: str) -> str:
        if not value:
            raise ValueError("Product name is required")
        return value

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        value = value.upper()
        if len(value) != 3 or not value.isalpha():
            raise ValueError("Currency must be a three-letter ISO code")
        return value


class ProductPatch(StrictModel):

    expected_version: int = Field(ge=1)
    change_reason: str
    sku: str | None = None
    name: str | None = None
    customer_description: str | None = None
    internal_notes: str | None = None
    category_id: str | None = None
    category: str | None = None
    price_cents: int | None = Field(default=None, ge=0)
    currency: str | None = None
    pricing_unit: PricingUnit | None = None
    quantity_rule: QuantityRule | None = None
    default_quantity: float | None = Field(default=None, ge=0)
    minimum_quantity: float | None = Field(default=None, ge=0)
    quantity_step: float | None = Field(default=None, gt=0)
    charge_group: ChargeGroup | None = None
    tax_class: TaxClass | None = None
    sort_order: int | None = Field(default=None, ge=0)

    @field_validator(
        "change_reason", "sku", "name", "customer_description", "internal_notes",
        "category_id", "category", "currency", mode="before",
    )
    @classmethod
    def stringify_patch(cls, value: Any) -> Any:
        return None if value is None else str(value).strip()

    @field_validator("change_reason")
    @classmethod
    def require_change_reason(cls, value: str) -> str:
        if not value:
            raise ValueError("Change reason is required")
        return value

    @field_validator("name")
    @classmethod
    def reject_blank_name(cls, value: str | None) -> str | None:
        if value is not None and not value:
            raise ValueError("Product name cannot be blank")
        return value

    @field_validator("currency")
    @classmethod
    def validate_optional_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.upper()
        if len(value) != 3 or not value.isalpha():
            raise ValueError("Currency must be a three-letter ISO code")
        return value

    @model_validator(mode="after")
    def require_change(self) -> "ProductPatch":
        changed_fields = self.model_fields_set - {"expected_version", "change_reason"}
        if not changed_fields:
            raise ValueError("At least one product field must be supplied")
        return self


class ProductStateChange(StrictModel):
    expected_version: int = Field(ge=1)
    change_reason: str

    @field_validator("change_reason", mode="before")
    @classmethod
    def require_reason(cls, value: Any) -> str:
        reason = str(value or "").strip()
        if not reason:
            raise ValueError("Change reason is required")
        return reason


class ProductResolveRequest(StrictModel):
    event_id: str
    product_ids: list[str] = Field(min_length=1, max_length=100)

    @field_validator("event_id", mode="before")
    @classmethod
    def require_event_id(cls, value: Any) -> str:
        event_id = str(value or "").strip()
        if not event_id:
            raise ValueError("Event id is required")
        return event_id

    @field_validator("product_ids", mode="before")
    @classmethod
    def normalize_product_ids(cls, value: Any) -> list[str]:
        product_ids = [str(item or "").strip() for item in (value or [])]
        if any(not item for item in product_ids):
            raise ValueError("Product ids cannot be blank")
        return product_ids


class Customer(StrictModel):
    customer_id: str = ""
    customer_name: str
    organization: str = ""
    customer_email: str = ""
    customer_phone: str = ""
    billing_address: str = ""
    internal_notes: str = ""
    archived: bool = False
    version: int = Field(default=1, ge=1)
    created_at: str = ""
    updated_at: str = ""

    @field_validator(
        "customer_id", "customer_name", "organization", "customer_email",
        "customer_phone", "billing_address", "internal_notes", "created_at", "updated_at", mode="before",
    )
    @classmethod
    def stringify(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("customer_name")
    @classmethod
    def require_customer_name(cls, value: str) -> str:
        if not value:
            raise ValueError("Customer name is required")
        return value


class CustomerCreate(StrictModel):
    customer_name: str
    organization: str = ""
    customer_email: str = ""
    customer_phone: str = ""
    billing_address: str = ""
    internal_notes: str = ""
    change_reason: str = "Created customer"

    @field_validator(
        "customer_name", "organization", "customer_email", "customer_phone",
        "billing_address", "internal_notes", "change_reason", mode="before",
    )
    @classmethod
    def normalize_strings(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("customer_name", "change_reason")
    @classmethod
    def require_nonempty(cls, value: str) -> str:
        if not value:
            raise ValueError("Value cannot be blank")
        return value


class CustomerPatch(StrictModel):
    expected_version: int = Field(ge=1)
    change_reason: str
    customer_name: str | None = None
    organization: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    billing_address: str | None = None
    internal_notes: str | None = None

    @field_validator(
        "change_reason", "customer_name", "organization", "customer_email",
        "customer_phone", "billing_address", "internal_notes", mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: Any) -> Any:
        return None if value is None else str(value).strip()

    @field_validator("change_reason")
    @classmethod
    def require_customer_reason(cls, value: str) -> str:
        if not value:
            raise ValueError("Change reason is required")
        return value

    @model_validator(mode="after")
    def require_customer_change(self) -> "CustomerPatch":
        if not (self.model_fields_set - {"expected_version", "change_reason"}):
            raise ValueError("At least one customer field must be supplied")
        if self.customer_name is not None and not self.customer_name:
            raise ValueError("Customer name cannot be blank")
        return self


class CustomerStateChange(ProductStateChange):
    pass


class Event(StrictModel):
    event_id: str = ""
    customer_id: str
    event_name: str = ""
    event_type: str = "Private Event"
    event_date: str = ""
    venue: str = ""
    guest_count: int = Field(default=50, ge=1)
    servers_count: int = Field(default=0, ge=0)
    servers_hours: int = Field(default=0, ge=0)
    kitchen_staff_count: int = Field(default=0, ge=0)
    kitchen_staff_hours: int = Field(default=0, ge=0)
    utensils_buffer: int = Field(default=0, ge=0)
    charge_tax: bool = False
    tax_percent: float = Field(default=0.0, ge=0, le=100)
    default_deposit_amount: float = Field(default=0.0, ge=0)
    archived: bool = False
    version: int = Field(default=1, ge=1)
    created_at: str = ""
    updated_at: str = ""

    @field_validator(
        "event_id", "customer_id", "event_name", "event_type", "event_date", "venue",
        "created_at", "updated_at", mode="before",
    )
    @classmethod
    def stringify(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("customer_id")
    @classmethod
    def require_customer_id(cls, value: str) -> str:
        if not value:
            raise ValueError("Customer id is required")
        return value


class EventCreate(StrictModel):
    customer_id: str
    event_name: str = ""
    event_type: str = "Private Event"
    event_date: str = ""
    venue: str = ""
    guest_count: int = Field(default=50, ge=1)
    servers_count: int = Field(default=0, ge=0)
    servers_hours: int = Field(default=0, ge=0)
    kitchen_staff_count: int = Field(default=0, ge=0)
    kitchen_staff_hours: int = Field(default=0, ge=0)
    utensils_buffer: int = Field(default=0, ge=0)
    charge_tax: bool = False
    tax_percent: float = Field(default=0.0, ge=0, le=100)
    default_deposit_amount: float = Field(default=0.0, ge=0)
    change_reason: str = "Created event"

    @field_validator("customer_id", "event_name", "event_type", "event_date", "venue", "change_reason", mode="before")
    @classmethod
    def normalize_event_strings(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("customer_id", "change_reason")
    @classmethod
    def require_event_values(cls, value: str) -> str:
        if not value:
            raise ValueError("Value cannot be blank")
        return value


class EventPatch(StrictModel):
    expected_version: int = Field(ge=1)
    change_reason: str
    customer_id: str | None = None
    event_name: str | None = None
    event_type: str | None = None
    event_date: str | None = None
    venue: str | None = None
    guest_count: int | None = Field(default=None, ge=1)
    servers_count: int | None = Field(default=None, ge=0)
    servers_hours: int | None = Field(default=None, ge=0)
    kitchen_staff_count: int | None = Field(default=None, ge=0)
    kitchen_staff_hours: int | None = Field(default=None, ge=0)
    utensils_buffer: int | None = Field(default=None, ge=0)
    charge_tax: bool | None = None
    tax_percent: float | None = Field(default=None, ge=0, le=100)
    default_deposit_amount: float | None = Field(default=None, ge=0)

    @field_validator(
        "change_reason", "customer_id", "event_name", "event_type", "event_date", "venue", mode="before",
    )
    @classmethod
    def normalize_event_patch_strings(cls, value: Any) -> Any:
        return None if value is None else str(value).strip()

    @field_validator("change_reason")
    @classmethod
    def require_event_reason(cls, value: str) -> str:
        if not value:
            raise ValueError("Change reason is required")
        return value

    @model_validator(mode="after")
    def require_event_change(self) -> "EventPatch":
        if not (self.model_fields_set - {"expected_version", "change_reason"}):
            raise ValueError("At least one event field must be supplied")
        if self.customer_id is not None and not self.customer_id:
            raise ValueError("Customer id cannot be blank")
        return self


class EventStateChange(ProductStateChange):
    pass


class CompanyCreate(StrictModel):
    business_name: str
    business_email: str = ""
    business_phone: str = ""
    business_address: str = ""
    default_service_charge_percent: float = Field(default=0.0, ge=0, le=100)
    default_gratuity_percent: float = Field(default=0.0, ge=0, le=100)
    payment_terms: str = ""
    estimate_notes: str = ""
    change_reason: str = "Created company"

    @field_validator("business_name")
    @classmethod
    def require_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Business name is required")
        return value


class CompanyUpdate(StrictModel):
    business_name: str
    business_email: str = ""
    business_phone: str = ""
    business_address: str = ""
    default_service_charge_percent: float = Field(default=0.0, ge=0, le=100)
    default_gratuity_percent: float = Field(default=0.0, ge=0, le=100)
    payment_terms: str = ""
    estimate_notes: str = ""
    expected_version: int = Field(ge=1)
    change_reason: str

    @field_validator("business_name", "change_reason")
    @classmethod
    def require_company_update_values(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value cannot be blank")
        return value


class CompanyPatch(StrictModel):
    expected_version: int = Field(ge=1)
    change_reason: str
    business_name: str | None = None
    business_email: str | None = None
    business_phone: str | None = None
    business_address: str | None = None
    default_service_charge_percent: float | None = Field(default=None, ge=0, le=100)
    default_gratuity_percent: float | None = Field(default=None, ge=0, le=100)
    payment_terms: str | None = None
    estimate_notes: str | None = None

    @field_validator(
        "change_reason", "business_name", "business_email", "business_phone", "business_address",
        "payment_terms", "estimate_notes", mode="before",
    )
    @classmethod
    def normalize_company_patch_strings(cls, value: Any) -> Any:
        return None if value is None else str(value).strip()

    @field_validator("change_reason")
    @classmethod
    def require_company_patch_reason(cls, value: str) -> str:
        if not value:
            raise ValueError("Change reason is required")
        return value

    @model_validator(mode="after")
    def require_company_change(self) -> "CompanyPatch":
        if not (self.model_fields_set - {"expected_version", "change_reason"}):
            raise ValueError("At least one company field must be supplied")
        if self.business_name is not None and not self.business_name:
            raise ValueError("Business name cannot be blank")
        return self


class CompanyStateChange(ProductStateChange):
    pass


class LineItemDraft(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    line_id: str = ""
    source_product_id: str | None = None
    product_id: str | None = None  # Legacy draft compatibility.
    category: str = Field(default="", alias="Category")
    description: str = Field(default="", alias="Description")
    notes: str = Field(default="", alias="Notes")
    qty: float = Field(default=1.0, alias="Qty", ge=0)
    unit_price: float | None = Field(default=None, alias="Unit Price", ge=0)
    sku: str = ""
    category_id: str = ""
    currency: str = "USD"
    pricing_unit: PricingUnit = "each"
    charge_group: ChargeGroup = "item"
    tax_class: TaxClass = "taxable"
    source_product_version: int | None = Field(default=None, ge=1)
    catalog_price_cents_at_selection: int | None = Field(default=None, ge=0)
    quantity_rule: QuantityRule | None = None
    suggested_quantity: float | None = Field(default=None, ge=0)
    selected_at: str = ""
    is_custom: bool = False
    override_reason: str = ""


class EstimateDraft(StrictModel):
    company_id: str
    customer_id: str = ""
    event_id: str = ""
    client_id: str = ""  # Legacy draft compatibility.
    estimate_number: str | None = None
    base_revision: int | None = None
    line_items: list[LineItemDraft] = Field(default_factory=list)
    service_charge_percent: float = Field(default=0.0, ge=0, le=100)
    service_charge_taxable: bool = True
    gratuity_percent: float = Field(default=0.0, ge=0, le=100)
    gratuity_taxable: bool = True
    deposit_amount: float = Field(default=0.0, ge=0)
    notes: str = ""
    revision_reason: str = "Updated estimate"

    @model_validator(mode="after")
    def require_estimate_base_revision(self) -> "EstimateDraft":
        if self.estimate_number and self.base_revision is None:
            raise ValueError("base_revision is required when revising an estimate")
        if not self.revision_reason.strip():
            raise ValueError("Revision reason is required")
        return self


class ProductsUpdate(StrictModel):
    products: list[Product]
    expected_catalog_version: int | None = Field(default=None, ge=0)


class CustomersUpdate(StrictModel):
    customers: list[Customer]


class EventsUpdate(StrictModel):
    events: list[Event]


class EstimateStateChange(StrictModel):
    base_revision: int = Field(ge=1)
    change_reason: str

    @field_validator("change_reason", mode="before")
    @classmethod
    def require_estimate_reason(cls, value: Any) -> str:
        reason = str(value or "").strip()
        if not reason:
            raise ValueError("Change reason is required")
        return reason


class BrowserDemoImport(StrictModel):
    state: dict[str, Any]


class BrowserDemoCommit(StrictModel):
    job_id: str
    change_reason: str = "Imported browser-local workspace"
    strategy: Literal["safe_merge", "preserve_copy"] = "safe_merge"

    @field_validator("job_id", "change_reason", mode="before")
    @classmethod
    def require_import_values(cls, value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError("Value cannot be blank")
        return text


class ApiTokenCreate(StrictModel):
    name: str
    scopes: set[str] = Field(min_length=1)

    @field_validator("name", mode="before")
    @classmethod
    def require_token_name(cls, value: Any) -> str:
        name = str(value or "").strip()
        if not name:
            raise ValueError("Token name is required")
        return name
