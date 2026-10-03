import type {
  ChargeGroup,
  Company,
  CompanyStore,
  Customer,
  DraftLineItem,
  Estimate,
  EstimateDraft,
  EstimateLineItem,
  EstimateRecord,
  EstimateSummary,
  Event,
  PricingUnit,
  Product,
  QuantityRule,
  TaxClass,
} from "./types";

type LegacyClient = {
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  event_type?: string;
  event_date?: string;
  venue?: string;
  guest_count?: number;
  servers_count?: number;
  servers_hours?: number;
  kitchen_staff_count?: number;
  kitchen_staff_hours?: number;
  deposit_amount?: number;
  utensils_buffer?: number;
  charge_tax?: boolean;
  tax_percent?: number;
};

const guestCategories = ["hot entree", "cold entree", "sides", "salads", "appetizers", "desserts", "fruits"];
const moneyValue = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function validProductId(value: unknown): string {
  const productId = String(value ?? "").trim();
  return ["", "none", "null", "undefined"].includes(productId.toLowerCase()) ? "" : productId;
}

export function inferProductRules(raw: Partial<Product> & Record<string, unknown>): Product {
  const category = String(raw.Category ?? raw.category ?? "").trim();
  const description = String(raw.Description ?? raw.name ?? "").trim();
  const notes = String(raw.Notes ?? raw.customer_description ?? "").trim();
  const normalizedCategory = category.toLowerCase();
  const normalizedDescription = description.toLowerCase();
  let chargeGroup: ChargeGroup = "item";
  if (normalizedCategory === "staff") chargeGroup = "staff";
  if (normalizedCategory === "service") chargeGroup = "service";
  if (normalizedCategory === "delivery") chargeGroup = "delivery";
  if (normalizedCategory === "gratuity") chargeGroup = "gratuity";
  let quantityRule: QuantityRule = "manual";
  let pricingUnit: PricingUnit = "each";
  if (normalizedDescription === "servers") [quantityRule, pricingUnit] = ["server_hours", "hour"];
  else if (normalizedDescription === "kitchen staff") [quantityRule, pricingUnit] = ["kitchen_staff_hours", "hour"];
  else if (normalizedCategory === "utensils") [quantityRule, pricingUnit] = ["guest_plus_buffer", "each"];
  else if (guestCategories.includes(normalizedCategory)) [quantityRule, pricingUnit] = ["guest_count", "guest"];
  else if (["service", "delivery", "gratuity"].includes(chargeGroup)) pricingUnit = "flat";
  const canonicalPrice = raw.price_cents == null ? undefined : Number(raw.price_cents) / 100;
  const archived = raw.status === "archived" || Boolean(raw.archived);
  return {
    product_id: validProductId(raw.product_id),
    Category: category,
    Description: description,
    Notes: notes,
    "Unit Price": Math.max(moneyValue(canonicalPrice ?? raw["Unit Price"]), 0),
    pricing_unit: (raw.pricing_unit as PricingUnit) || pricingUnit,
    quantity_rule: (raw.quantity_rule as QuantityRule) || quantityRule,
    charge_group: (raw.charge_group as ChargeGroup) || chargeGroup,
    tax_class: (raw.tax_class as TaxClass) || "taxable",
    archived,
    version: Math.max(Number(raw.version || 1), 1),
    sku: String(raw.sku || "").trim(),
    internal_notes: String(raw.internal_notes || "").trim(),
    category_id: String(raw.category_id || (category ? category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "uncategorized")),
    currency: String(raw.currency || "USD").toUpperCase(),
    default_quantity: Math.max(Number(raw.default_quantity ?? 1), 0),
    minimum_quantity: Math.max(Number(raw.minimum_quantity ?? 0), 0),
    quantity_step: Math.max(Number(raw.quantity_step ?? 1), 0.01),
    status: archived ? "archived" : "active",
    sort_order: Math.max(Number(raw.sort_order ?? 0), 0),
    created_at: String(raw.created_at || ""),
    updated_at: String(raw.updated_at || ""),
  };
}

function legacyCustomer(client: LegacyClient, index: number): Customer {
  const customerId = String(client.client_id || `customer-legacy-${index + 1}`);
  return {
    customer_id: customerId,
    customer_name: String(client.client_name || "Unnamed customer"),
    organization: "",
    customer_email: String(client.client_email || ""),
    customer_phone: String(client.client_phone || ""),
    billing_address: "",
    internal_notes: "",
    archived: false,
    version: 1,
    created_at: "",
    updated_at: "",
  };
}

function legacyEvent(client: LegacyClient, index: number): Event {
  const customerId = String(client.client_id || `customer-legacy-${index + 1}`);
  const eventType = String(client.event_type || "Private Event");
  const suffix = customerId.replace(/^client-|^customer-/, "");
  return {
    event_id: `event-${suffix}`,
    customer_id: customerId,
    event_name: eventType,
    event_type: eventType,
    event_date: String(client.event_date || ""),
    venue: String(client.venue || ""),
    guest_count: Math.max(Number(client.guest_count || 50), 1),
    servers_count: Math.max(Number(client.servers_count || 0), 0),
    servers_hours: Math.max(Number(client.servers_hours || 0), 0),
    kitchen_staff_count: Math.max(Number(client.kitchen_staff_count || 0), 0),
    kitchen_staff_hours: Math.max(Number(client.kitchen_staff_hours || 0), 0),
    utensils_buffer: Math.max(Number(client.utensils_buffer || 0), 0),
    charge_tax: Boolean(client.charge_tax),
    tax_percent: Math.max(Number(client.tax_percent || 0), 0),
    default_deposit_amount: Math.max(Number(client.deposit_amount || 0), 0),
    archived: false,
    version: 1,
    created_at: "",
    updated_at: "",
  };
}

function normalizeCustomer(raw: Partial<Customer>, index: number): Customer {
  return {
    customer_id: String(raw.customer_id || `customer-${index + 1}`),
    customer_name: String(raw.customer_name || "Unnamed customer"),
    organization: String(raw.organization || ""),
    customer_email: String(raw.customer_email || ""),
    customer_phone: String(raw.customer_phone || ""),
    billing_address: String(raw.billing_address || ""),
    internal_notes: String(raw.internal_notes || ""),
    archived: Boolean(raw.archived),
    version: Math.max(Number(raw.version || 1), 1),
    created_at: String(raw.created_at || ""),
    updated_at: String(raw.updated_at || ""),
  };
}

function normalizeEvent(raw: Partial<Event>, index: number): Event {
  const eventType = String(raw.event_type || "Private Event");
  return {
    event_id: String(raw.event_id || `event-${index + 1}`),
    customer_id: String(raw.customer_id || ""),
    event_name: String(raw.event_name || eventType),
    event_type: eventType,
    event_date: String(raw.event_date || ""),
    venue: String(raw.venue || ""),
    guest_count: Math.max(Number(raw.guest_count || 50), 1),
    servers_count: Math.max(Number(raw.servers_count || 0), 0),
    servers_hours: Math.max(Number(raw.servers_hours || 0), 0),
    kitchen_staff_count: Math.max(Number(raw.kitchen_staff_count || 0), 0),
    kitchen_staff_hours: Math.max(Number(raw.kitchen_staff_hours || 0), 0),
    utensils_buffer: Math.max(Number(raw.utensils_buffer || 0), 0),
    charge_tax: Boolean(raw.charge_tax),
    tax_percent: Math.max(Number(raw.tax_percent || 0), 0),
    default_deposit_amount: Math.max(Number(raw.default_deposit_amount || 0), 0),
    archived: Boolean(raw.archived),
    version: Math.max(Number(raw.version || 1), 1),
    created_at: String(raw.created_at || ""),
    updated_at: String(raw.updated_at || ""),
  };
}

export function normalizeStore(input: unknown): CompanyStore {
  const raw = clone(input || {}) as { selected_company?: string; companies?: Array<Record<string, unknown>> };
  const companies = (raw.companies || []).map((rawCompany) => {
    const legacyClients = (rawCompany.clients || []) as LegacyClient[];
    const hasNormalizedRecords = Array.isArray(rawCompany.customers) && Array.isArray(rawCompany.events);
    return {
      company_id: String(rawCompany.company_id || ""),
      business_name: String(rawCompany.business_name || "New catering company"),
      business_email: String(rawCompany.business_email || ""),
      business_phone: String(rawCompany.business_phone || ""),
      business_address: String(rawCompany.business_address || ""),
      default_service_charge_percent: Math.max(Number(rawCompany.default_service_charge_percent || 0), 0),
      default_gratuity_percent: Math.max(Number(rawCompany.default_gratuity_percent || 0), 0),
      payment_terms: String(rawCompany.payment_terms || ""),
      estimate_notes: String(rawCompany.estimate_notes || ""),
      products: ((rawCompany.products || []) as Array<Partial<Product> & Record<string, unknown>>).map((rawProduct, index) => {
        const product = inferProductRules(rawProduct);
        return {
          ...product,
          product_id: product.product_id || `product-legacy-${index + 1}`,
          sort_order: rawProduct.sort_order == null ? index : product.sort_order,
        };
      }),
      customers: hasNormalizedRecords
        ? ((rawCompany.customers || []) as Partial<Customer>[]).map(normalizeCustomer)
        : legacyClients.map(legacyCustomer),
      events: hasNormalizedRecords
        ? ((rawCompany.events || []) as Partial<Event>[]).map(normalizeEvent)
        : legacyClients.map(legacyEvent),
      product_catalog_version: Math.max(Number(rawCompany.product_catalog_version || 0), 0),
      archived: Boolean(rawCompany.archived),
      version: Math.max(Number(rawCompany.version || 1), 1),
      created_at: String(rawCompany.created_at || ""),
      updated_at: String(rawCompany.updated_at || ""),
    } satisfies Company;
  });
  return { schema_version: 4, selected_company: String(raw.selected_company || companies[0]?.business_name || ""), companies };
}

export function defaultProductQuantity(product: Product, event: Event): number {
  if (product.quantity_rule === "guest_count") return event.guest_count;
  if (product.quantity_rule === "guest_plus_buffer") return event.guest_count + event.utensils_buffer;
  if (product.quantity_rule === "server_hours") return event.servers_count * event.servers_hours;
  if (product.quantity_rule === "kitchen_staff_hours") return event.kitchen_staff_count * event.kitchen_staff_hours;
  return Math.max(product.default_quantity || 1, product.minimum_quantity || 0);
}

function totals(lineItems: EstimateLineItem[], draft: EstimateDraft, event: Event) {
  const groups: Record<ChargeGroup, number> = { item: 0, staff: 0, service: 0, delivery: 0, gratuity: 0 };
  let taxableLines = 0;
  lineItems.forEach((item) => {
    groups[item.charge_group] += item["Line Total"];
    if (item.tax_class === "taxable") taxableLines += item["Line Total"];
  });
  const serviceCharge = moneyValue(groups.item * draft.service_charge_percent / 100);
  const gratuity = moneyValue(groups.item * draft.gratuity_percent / 100);
  const taxableSubtotal = moneyValue(taxableLines + (draft.service_charge_taxable ? serviceCharge : 0) + (draft.gratuity_taxable ? gratuity : 0));
  const taxPercent = event.charge_tax ? event.tax_percent : 0;
  const tax = moneyValue(taxableSubtotal * taxPercent / 100);
  const subtotal = moneyValue(Object.values(groups).reduce((sum, value) => sum + value, 0));
  const total = moneyValue(subtotal + serviceCharge + gratuity + tax);
  const deposit = Math.min(Math.max(moneyValue(draft.deposit_amount), 0), total);
  return {
    items_subtotal: moneyValue(groups.item), staff_total: moneyValue(groups.staff),
    service_items_total: moneyValue(groups.service), delivery_charge: moneyValue(groups.delivery),
    gratuity_items_total: moneyValue(groups.gratuity), subtotal, service_charge: serviceCharge,
    gratuity, taxable_subtotal: taxableSubtotal, tax, total, deposit, balance_due: moneyValue(total - deposit),
  };
}

export function calculateDraftSnapshot(
  store: CompanyStore,
  draft: EstimateDraft,
  estimateNumber = "DRAFT",
  revisionNumber = 0,
  previous?: Estimate,
): Estimate {
  const company = store.companies.find((item) => item.company_id === draft.company_id)!;
  const customer = company.customers.find((item) => item.customer_id === draft.customer_id)!;
  const event = company.events.find((item) => item.event_id === draft.event_id && item.customer_id === draft.customer_id)!;
  const products = new Map(company.products.map((item) => [item.product_id, item]));
  const lineItems = draft.line_items.filter((item) => item.Description.trim()).map((item) => {
    const product = item.source_product_id ? products.get(item.source_product_id) : undefined;
    const unitPrice = moneyValue(item["Unit Price"]);
    const baselinePrice = item.catalog_price_cents_at_selection == null
      ? product?.["Unit Price"]
      : item.catalog_price_cents_at_selection / 100;
    return {
      ...clone(item),
      "Unit Price": unitPrice,
      "Line Total": moneyValue(item.Qty * unitPrice),
      price_overridden: Boolean(product && moneyValue(baselinePrice) !== unitPrice),
    } satisfies EstimateLineItem;
  });
  const now = new Date().toISOString().slice(0, 19);
  return {
    estimate_number: estimateNumber,
    revision_id: `revision-${estimateNumber}-${revisionNumber || "preview"}`,
    revision_number: revisionNumber,
    revision_reason: draft.revision_reason || (revisionNumber <= 1 ? "Initial estimate" : "Updated estimate"),
    created_at: previous?.created_at || now,
    updated_at: now,
    issue_date: new Date().toISOString().slice(0, 10),
    company_id: company.company_id,
    company_name: company.business_name,
    business: {
      company_id: company.company_id, business_name: company.business_name, business_email: company.business_email,
      business_phone: company.business_phone, business_address: company.business_address,
      payment_terms: company.payment_terms, estimate_notes: company.estimate_notes,
    },
    customer_id: customer.customer_id,
    customer_name: customer.customer_name,
    customer_email: customer.customer_email,
    customer_phone: customer.customer_phone,
    billing_address: customer.billing_address,
    customer: clone(customer),
    event_id: event.event_id,
    event_name: event.event_name,
    event_date: event.event_date,
    event_type: event.event_type,
    venue: event.venue,
    guest_count: event.guest_count,
    event: clone(event),
    tax_percent: event.charge_tax ? event.tax_percent : 0,
    service_charge_percent: draft.service_charge_percent,
    service_charge_taxable: draft.service_charge_taxable,
    gratuity_percent: draft.gratuity_percent,
    gratuity_taxable: draft.gratuity_taxable,
    deposit: 0,
    notes: draft.notes,
    line_items: lineItems,
    ...totals(lineItems, draft, event),
  };
}

function legacyEstimateRecord(raw: Record<string, unknown>, store: CompanyStore): EstimateRecord {
  const company = store.companies.find((item) => item.company_id === raw.company_id) || store.companies[0];
  const legacyCustomerId = String(raw.customer_id || raw.client_id || company.customers[0]?.customer_id || "");
  const customer = company.customers.find((item) => item.customer_id === legacyCustomerId) || company.customers[0];
  const event = company.events.find((item) => item.customer_id === customer.customer_id) || company.events[0];
  const rawLines = (raw.line_items || []) as Array<Record<string, unknown>>;
  const lines: DraftLineItem[] = rawLines.map((rawLine, index) => {
    const inferred = inferProductRules(rawLine as Partial<Product> & Record<string, unknown>);
    const sourceId = validProductId(rawLine.product_id || rawLine.source_product_id);
    const catalogProduct = company.products.find((item) => item.product_id === sourceId)
      || company.products.find((item) => (
        item.Description.trim().toLowerCase() === inferred.Description.trim().toLowerCase()
        && item.Category.trim().toLowerCase() === inferred.Category.trim().toLowerCase()
      ));
    const product = catalogProduct || inferred;
    return {
      line_id: `legacy-${String(raw.estimate_number)}-${index + 1}`,
      source_product_id: catalogProduct?.product_id || null,
      source_product_version: catalogProduct?.version ?? null,
      catalog_price_cents_at_selection: catalogProduct ? Math.round(product["Unit Price"] * 100) : null,
      selected_at: String(raw.updated_at || raw.created_at || new Date().toISOString()),
      quantity_rule: product.quantity_rule,
      suggested_quantity: Number(rawLine.Qty || 0),
      Category: inferred.Category || product.Category,
      Description: inferred.Description || product.Description,
      Notes: inferred.Notes || product.Notes,
      Qty: Number(rawLine.Qty || 0),
      "Unit Price": Number(rawLine["Unit Price"] || 0),
      pricing_unit: product.pricing_unit,
      charge_group: product.charge_group,
      tax_class: product.tax_class,
      is_custom: false,
      override_reason: "",
    };
  });
  const hasServiceItem = lines.some((item) => item.charge_group === "service");
  const hasStaffItem = lines.some((item) => item.charge_group === "staff");
  const draft: EstimateDraft = {
    company_id: company.company_id,
    customer_id: customer.customer_id,
    event_id: event.event_id,
    estimate_number: String(raw.estimate_number || "EST-IMPORT"),
    base_revision: null,
    line_items: lines,
    service_charge_percent: hasServiceItem ? 0 : Number(raw.service_charge_percent || 0),
    service_charge_taxable: true,
    gratuity_percent: hasStaffItem ? 0 : Number(raw.gratuity_percent || 0),
    gratuity_taxable: true,
    deposit_amount: Number(raw.deposit || 0),
    notes: String(raw.notes || ""),
    revision_reason: "Imported legacy estimate",
  };
  const estimate = calculateDraftSnapshot(store, draft, String(raw.estimate_number), 1);
  estimate.revision_id = `revision-${estimate.estimate_number}-1`;
  estimate.created_at = String(raw.created_at || estimate.created_at);
  estimate.updated_at = String(raw.updated_at || estimate.updated_at);
  estimate.issue_date = String(raw.issue_date || estimate.issue_date);
  return { estimate_number: estimate.estimate_number, archived: false, current_revision: 1, revisions: [estimate] };
}

export function normalizeEstimateRecords(input: unknown, store: CompanyStore): EstimateRecord[] {
  return ((clone(input || []) as Array<Record<string, unknown>>)).map((raw) => {
    if (Array.isArray(raw.revisions)) return raw as unknown as EstimateRecord;
    return legacyEstimateRecord(raw, store);
  });
}

export function estimateSummary(record: EstimateRecord): EstimateSummary {
  const estimate = record.revisions.find((item) => item.revision_number === record.current_revision) || record.revisions.at(-1)!;
  return {
    file: `${estimate.estimate_number}.json`, estimate_number: estimate.estimate_number,
    revision_number: estimate.revision_number, company_id: estimate.company_id,
    customer_id: estimate.customer_id, customer_name: estimate.customer_name,
    event_id: estimate.event_id, event_name: estimate.event_name, event_date: estimate.event_date,
    total: estimate.total, updated_at: estimate.updated_at, archived: record.archived,
  };
}
