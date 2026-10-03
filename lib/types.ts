export type PricingUnit = "each" | "guest" | "hour" | "flat";
export type QuantityRule = "manual" | "guest_count" | "guest_plus_buffer" | "server_hours" | "kitchen_staff_hours";
export type ChargeGroup = "item" | "staff" | "service" | "delivery" | "gratuity";
export type TaxClass = "taxable" | "non_taxable";
export type ProductStatus = "active" | "archived";

export type Product = {
  product_id: string;
  Category: string;
  Description: string;
  Notes: string;
  "Unit Price": number;
  pricing_unit: PricingUnit;
  quantity_rule: QuantityRule;
  charge_group: ChargeGroup;
  tax_class: TaxClass;
  archived: boolean;
  version: number;
  sku: string;
  internal_notes: string;
  category_id: string;
  currency: string;
  default_quantity: number;
  minimum_quantity: number;
  quantity_step: number;
  status: ProductStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CanonicalProduct = {
  product_id: string;
  company_id: string;
  sku: string;
  name: string;
  customer_description: string;
  internal_notes: string;
  category_id: string;
  category: string;
  price_cents: number;
  currency: string;
  pricing_unit: PricingUnit;
  quantity_rule: QuantityRule;
  default_quantity: number;
  minimum_quantity: number;
  quantity_step: number;
  charge_group: ChargeGroup;
  tax_class: TaxClass;
  status: ProductStatus;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ProductWriteFields = Pick<
  CanonicalProduct,
  | "sku"
  | "name"
  | "customer_description"
  | "internal_notes"
  | "category_id"
  | "category"
  | "price_cents"
  | "currency"
  | "pricing_unit"
  | "quantity_rule"
  | "default_quantity"
  | "minimum_quantity"
  | "quantity_step"
  | "charge_group"
  | "tax_class"
  | "sort_order"
>;

export type ProductRevision = {
  revision_id: string;
  product_id: string;
  company_id: string;
  version: number;
  change_reason: string;
  changed_at: string;
  snapshot: CanonicalProduct;
};

export type ProductUsageReference = {
  estimate_number: string;
  revision_number: number;
  customer_name: string;
  event_name: string;
  used_at: string;
  line_count: number;
};

export type ProductUsage = {
  product_id: string;
  estimate_count: number;
  revision_count: number;
  line_count: number;
  latest_used_at: string | null;
  references: ProductUsageReference[];
};

export type Customer = {
  customer_id: string;
  customer_name: string;
  organization: string;
  customer_email: string;
  customer_phone: string;
  billing_address: string;
  internal_notes: string;
  archived: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type Event = {
  event_id: string;
  customer_id: string;
  event_name: string;
  event_type: string;
  event_date: string;
  venue: string;
  guest_count: number;
  servers_count: number;
  servers_hours: number;
  kitchen_staff_count: number;
  kitchen_staff_hours: number;
  utensils_buffer: number;
  charge_tax: boolean;
  tax_percent: number;
  default_deposit_amount: number;
  archived: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type Company = {
  company_id: string;
  business_name: string;
  business_email: string;
  business_phone: string;
  business_address: string;
  default_service_charge_percent: number;
  default_gratuity_percent: number;
  payment_terms: string;
  estimate_notes: string;
  products: Product[];
  customers: Customer[];
  events: Event[];
  product_catalog_version?: number;
  archived?: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CompanyStore = {
  schema_version?: number;
  selected_company: string;
  companies: Company[];
};

export type BusinessSnapshot = Pick<
  Company,
  | "company_id"
  | "business_name"
  | "business_email"
  | "business_phone"
  | "business_address"
  | "payment_terms"
  | "estimate_notes"
>;

export type EstimateLineItem = {
  line_id: string;
  source_product_id: string | null;
  Category: string;
  Description: string;
  Notes: string;
  Qty: number;
  "Unit Price": number;
  "Line Total": number;
  pricing_unit: PricingUnit;
  charge_group: ChargeGroup;
  tax_class: TaxClass;
  source_product_version?: number | null;
  catalog_price_cents_at_selection?: number | null;
  quantity_rule?: QuantityRule;
  suggested_quantity?: number;
  selected_at?: string;
  is_custom: boolean;
  price_overridden: boolean;
  override_reason: string;
};

export type Estimate = {
  estimate_number: string;
  revision_id: string;
  revision_number: number;
  revision_reason: string;
  created_at: string;
  updated_at: string;
  issue_date: string;
  company_id: string;
  company_name: string;
  business: BusinessSnapshot;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  billing_address: string;
  customer: Customer;
  event_id: string;
  event_name: string;
  event_date: string;
  event_type: string;
  venue: string;
  guest_count: number;
  event: Event;
  tax_percent: number;
  service_charge_percent: number;
  service_charge_taxable: boolean;
  gratuity_percent: number;
  gratuity_taxable: boolean;
  deposit: number;
  notes: string;
  line_items: EstimateLineItem[];
  items_subtotal: number;
  staff_total: number;
  service_items_total: number;
  delivery_charge: number;
  gratuity_items_total: number;
  subtotal: number;
  service_charge: number;
  gratuity: number;
  taxable_subtotal: number;
  tax: number;
  total: number;
  balance_due: number;
};

export type EstimateSummary = Pick<
  Estimate,
  | "estimate_number"
  | "revision_number"
  | "company_id"
  | "customer_id"
  | "customer_name"
  | "event_id"
  | "event_name"
  | "event_date"
  | "total"
  | "updated_at"
> & { file: string; archived: boolean };

export type DraftLineItem = Omit<EstimateLineItem, "Line Total" | "price_overridden">;

export type EstimateDraft = {
  company_id: string;
  customer_id: string;
  event_id: string;
  estimate_number?: string | null;
  base_revision?: number | null;
  line_items: DraftLineItem[];
  service_charge_percent: number;
  service_charge_taxable: boolean;
  gratuity_percent: number;
  gratuity_taxable: boolean;
  deposit_amount: number;
  notes: string;
  revision_reason: string;
};

export type EstimateRecord = {
  estimate_number: string;
  archived: boolean;
  current_revision: number;
  revisions: Estimate[];
};

export type EstimateRevisionSummary = Pick<
  Estimate,
  "revision_number" | "revision_id" | "revision_reason" | "updated_at" | "total"
>;

export type Bootstrap = {
  store: CompanyStore;
  estimates: EstimateSummary[];
  mode: "api" | "demo";
};
