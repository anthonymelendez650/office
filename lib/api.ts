import type {
  Bootstrap,
  CanonicalProduct,
  Company,
  CompanyStore,
  Customer,
  Estimate,
  EstimateDraft,
  EstimateRecord,
  EstimateRevisionSummary,
  Event,
  Product,
  ProductRevision,
  ProductUsage,
  ProductWriteFields,
} from "./types";
import {
  calculateDraftSnapshot,
  clone,
  defaultProductQuantity,
  estimateSummary,
  inferProductRules,
  normalizeEstimateRecords,
  normalizeStore,
} from "./domain";
import seedStore from "./demo-data/companies.json";
import seedCounter from "./demo-data/counter.json";
import estimate1269 from "./demo-data/estimates/EST-1269.json";
import estimate1321 from "./demo-data/estimates/EST-1321.json";
import estimate1337 from "./demo-data/estimates/EST-1337.json";
import estimate1338 from "./demo-data/estimates/EST-1338.json";

const CONFIGURED_API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const API_BASE = DEMO_MODE ? "" : (CONFIGURED_API_BASE || "__same_origin__");
const STORAGE_KEY = "silverspoon-office-demo-v4";
const LEGACY_STORAGE_KEYS = ["silverspoon-office-demo-v3", "silverspoon-office-demo-v2"];
const IMPORT_PROMPT_KEY = "silverspoon-office-import-prompted-v5";

type DemoState = {
  store: CompanyStore;
  estimates: EstimateRecord[];
  nextNumber: number;
  productRevisions: Record<string, ProductRevision[]>;
};

type BrowserImportSummary = {
  source: Record<string, number>;
  additions: Record<string, number>;
  identical: Record<string, number>;
  conflicts: Array<{ entity_type: string; entity_id: string; reason: string }>;
  conflict_count: number;
  can_safe_merge: boolean;
  requires_action: boolean;
  strategies: Array<"safe_merge" | "preserve_copy">;
};

type BrowserImportPreview = { job_id: string; summary: BrowserImportSummary };

const productHistoryKey = (companyId: string, productId: string) => `${companyId}:${productId}`;
const utcNow = () => new Date().toISOString();
const productId = () => `product-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function canonicalToProduct(product: CanonicalProduct): Product {
  return inferProductRules(product as unknown as Partial<Product> & Record<string, unknown>);
}

function productToCanonical(companyId: string, product: Product): CanonicalProduct {
  return {
    product_id: product.product_id,
    company_id: companyId,
    sku: product.sku,
    name: product.Description,
    customer_description: product.Notes,
    internal_notes: product.internal_notes,
    category_id: product.category_id,
    category: product.Category,
    price_cents: Math.round(product["Unit Price"] * 100),
    currency: product.currency,
    pricing_unit: product.pricing_unit,
    quantity_rule: product.quantity_rule,
    default_quantity: product.default_quantity,
    minimum_quantity: product.minimum_quantity,
    quantity_step: product.quantity_step,
    charge_group: product.charge_group,
    tax_class: product.tax_class,
    status: product.status,
    sort_order: product.sort_order,
    version: product.version,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

function revisionFor(companyId: string, product: Product, changeReason: string): ProductRevision {
  return {
    revision_id: `product-revision-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    product_id: product.product_id,
    company_id: companyId,
    version: product.version,
    change_reason: changeReason.trim() || "Product updated",
    changed_at: product.updated_at,
    snapshot: productToCanonical(companyId, product),
  };
}

function ensureProductHistories(
  store: CompanyStore,
  histories?: Record<string, ProductRevision[]>,
): Record<string, ProductRevision[]> {
  const normalized = clone(histories || {});
  store.companies.forEach((company) => company.products.forEach((product) => {
    const key = productHistoryKey(company.company_id, product.product_id);
    if (!normalized[key]?.length) normalized[key] = [revisionFor(company.company_id, product, "Imported product")];
  }));
  return normalized;
}

function normalizeDemoState(input: unknown): DemoState {
  const raw = (input || {}) as {
    store?: unknown;
    estimates?: unknown;
    nextNumber?: number;
    productRevisions?: Record<string, ProductRevision[]>;
  };
  const store = normalizeStore(raw.store || seedStore);
  return {
    store,
    estimates: normalizeEstimateRecords(raw.estimates || [], store),
    nextNumber: Number(raw.nextNumber || seedCounter.next_number),
    productRevisions: ensureProductHistories(store, raw.productRevisions),
  };
}

function seededDemo(): DemoState {
  const store = normalizeStore(seedStore);
  return {
    store,
    nextNumber: seedCounter.next_number,
    estimates: normalizeEstimateRecords([estimate1269, estimate1321, estimate1337, estimate1338], store),
    productRevisions: ensureProductHistories(store),
  };
}

const apiUrl = (path: string) => API_BASE === "__same_origin__" ? path : `${API_BASE}${path}`;
const requestIdentifier = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Request-ID", headers.get("X-Request-ID") || `web-${requestIdentifier()}`);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", `web-${requestIdentifier()}`);
  }
  const options = { ...init, headers };
  let response: Response;
  try {
    response = await fetch(apiUrl(path), options);
  } catch {
    response = await fetch(apiUrl(path), options);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function storedDemo(): DemoState | null {
  try {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage?.getItem(STORAGE_KEY)
      || LEGACY_STORAGE_KEYS.map((key) => window.localStorage?.getItem(key)).find(Boolean);
    return saved ? normalizeDemoState(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

async function loadDemo(): Promise<DemoState> {
  const existing = storedDemo();
  if (existing) {
    saveDemo(existing);
    return existing;
  }
  const state = seededDemo();
  saveDemo(state);
  return state;
}

function saveDemo(state: DemoState) {
  try {
    if (typeof window !== "undefined") window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the in-memory interaction usable when storage is unavailable.
  }
}

function companyDefaults(values: Partial<Company>): Company {
  return {
    company_id: values.company_id ?? `company-${Date.now()}`,
    business_name: values.business_name ?? "New catering company",
    business_email: values.business_email ?? "",
    business_phone: values.business_phone ?? "",
    business_address: values.business_address ?? "",
    default_service_charge_percent: values.default_service_charge_percent ?? 0,
    default_gratuity_percent: values.default_gratuity_percent ?? 0,
    payment_terms: values.payment_terms ?? "",
    estimate_notes: values.estimate_notes ?? "",
    products: values.products ?? [],
    customers: values.customers ?? [],
    events: values.events ?? [],
    archived: false,
    version: values.version ?? 1,
    created_at: values.created_at ?? utcNow(),
    updated_at: values.updated_at ?? utcNow(),
  };
}

function companyWriteValues(company: Partial<Company>) {
  return {
    business_name: company.business_name ?? "",
    business_email: company.business_email ?? "",
    business_phone: company.business_phone ?? "",
    business_address: company.business_address ?? "",
    default_service_charge_percent: company.default_service_charge_percent ?? 0,
    default_gratuity_percent: company.default_gratuity_percent ?? 0,
    payment_terms: company.payment_terms ?? "",
    estimate_notes: company.estimate_notes ?? "",
  };
}

function activeRevision(record: EstimateRecord): Estimate {
  return record.revisions.find((item) => item.revision_number === record.current_revision) || record.revisions.at(-1)!;
}

function demoCompany(state: DemoState, companyId: string): Company {
  const company = state.store.companies.find((item) => item.company_id === companyId && !item.archived);
  if (!company) throw new Error("Company not found");
  return company;
}

function assertAvailableSku(company: Company, sku: string, exceptProductId = "") {
  const normalized = sku.trim().toLowerCase();
  if (!normalized) return;
  if (company.products.some((item) => item.product_id !== exceptProductId && item.sku.trim().toLowerCase() === normalized)) {
    throw new Error(`SKU ${sku.trim()} is already used by another product`);
  }
}

function productFromFields(
  companyId: string,
  fields: ProductWriteFields,
  existing?: Product,
): Product {
  const now = utcNow();
  const category = fields.category.trim();
  return inferProductRules({
    product_id: existing?.product_id || productId(),
    Category: category,
    Description: fields.name.trim(),
    Notes: fields.customer_description.trim(),
    "Unit Price": fields.price_cents / 100,
    pricing_unit: fields.pricing_unit,
    quantity_rule: fields.quantity_rule,
    charge_group: fields.charge_group,
    tax_class: fields.tax_class,
    archived: existing?.archived || false,
    version: existing ? existing.version + 1 : 1,
    sku: fields.sku.trim(),
    internal_notes: fields.internal_notes.trim(),
    category_id: fields.category_id.trim() || category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorized",
    currency: fields.currency.toUpperCase(),
    default_quantity: fields.default_quantity,
    minimum_quantity: fields.minimum_quantity,
    quantity_step: fields.quantity_step,
    status: existing?.status || "active",
    sort_order: fields.sort_order,
    created_at: existing?.created_at || now,
    updated_at: now,
    company_id: companyId,
  } as unknown as Partial<Product> & Record<string, unknown>);
}

function recordDemoProductRevision(state: DemoState, companyId: string, product: Product, reason: string) {
  const key = productHistoryKey(companyId, product.product_id);
  state.productRevisions[key] = [...(state.productRevisions[key] || []), revisionFor(companyId, product, reason)];
}

function setDemoProductStatus(
  state: DemoState,
  companyId: string,
  targetProductId: string,
  expectedVersion: number,
  status: "active" | "archived",
  reason: string,
): Product {
  const company = demoCompany(state, companyId);
  const index = company.products.findIndex((item) => item.product_id === targetProductId);
  if (index < 0) throw new Error("Product not found");
  const current = company.products[index];
  if (current.version !== expectedVersion) {
    throw new Error(`Product changed since version ${expectedVersion}; current version is ${current.version}`);
  }
  if (current.status === status) return clone(current);
  const updated: Product = {
    ...current,
    archived: status === "archived",
    status,
    version: current.version + 1,
    updated_at: utcNow(),
  };
  company.products[index] = updated;
  company.product_catalog_version = (company.product_catalog_version || 0) + 1;
  recordDemoProductRevision(state, companyId, updated, reason);
  return clone(updated);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const officeApi = {
  initialBootstrap(): Bootstrap {
    if (API_BASE) {
      return {
        store: { schema_version: 5, selected_company: "", companies: [] },
        estimates: [],
        mode: "api",
      };
    }
    const state = seededDemo();
    return {
      store: clone(state.store),
      estimates: state.estimates.filter((record) => !record.archived).map(estimateSummary),
      mode: "demo",
    };
  },

  async bootstrap(): Promise<Bootstrap> {
    if (API_BASE) {
      const response = await request<Omit<Bootstrap, "mode">>("/api/bootstrap");
      return { store: normalizeStore(response.store), estimates: response.estimates, mode: "api" };
    }
    const state = await loadDemo();
    return {
      store: clone(state.store),
      estimates: state.estimates.filter((record) => !record.archived).map(estimateSummary),
      mode: "demo",
    };
  },

  async createCompany(values: Partial<Company>): Promise<Company> {
    if (API_BASE) return request("/api/companies", {
      method: "POST",
      body: JSON.stringify({ ...companyWriteValues(values), change_reason: "Created in Office" }),
    });
    const state = await loadDemo();
    const company = companyDefaults({ ...values, company_id: `company-${Date.now()}` });
    state.store.companies.push(company);
    state.store.selected_company = company.business_name;
    saveDemo(state);
    return clone(company);
  },

  async updateCompany(company: Company): Promise<Company> {
    const values = {
      ...companyWriteValues(company),
      expected_version: company.version,
      change_reason: "Updated business settings",
    };
    if (API_BASE) return request(`/api/companies/${company.company_id}`, { method: "PUT", body: JSON.stringify(values) });
    const state = await loadDemo();
    const index = state.store.companies.findIndex((item) => item.company_id === company.company_id);
    if (index < 0) throw new Error("Company not found");
    const current = state.store.companies[index];
    const updated = { ...current, ...companyWriteValues(company), company_id: current.company_id, version: current.version + 1, updated_at: utcNow() };
    state.store.companies[index] = clone(updated);
    state.store.selected_company = updated.business_name;
    saveDemo(state);
    return clone(updated);
  },

  async archiveCompany(companyId: string, expectedVersion: number): Promise<void> {
    if (API_BASE) return request(`/api/companies/${companyId}/archive`, {
      method: "POST",
      body: JSON.stringify({ expected_version: expectedVersion, change_reason: "Archived in Office" }),
    });
    const state = await loadDemo();
    const company = state.store.companies.find((item) => item.company_id === companyId);
    if (!company) throw new Error("Company not found");
    company.archived = true;
    state.store.selected_company = state.store.companies.find((item) => !item.archived)?.business_name ?? "";
    saveDemo(state);
  },

  async updateProducts(companyId: string, products: Product[]): Promise<Product[]> {
    if (API_BASE) {
      const response = await request<Array<Partial<Product> & Record<string, unknown>>>(`/api/companies/${companyId}/products`, {
        method: "PUT",
        body: JSON.stringify({ products }),
      });
      return response.map(inferProductRules);
    }
    const state = await loadDemo();
    const company = state.store.companies.find((item) => item.company_id === companyId);
    if (!company) throw new Error("Company not found");
    company.products = products
      .filter((item) => item.Description.trim())
      .map((item) => ({ ...item, product_id: item.product_id || `product-${Date.now()}-${Math.random().toString(16).slice(2)}` }));
    saveDemo(state);
    return clone(company.products);
  },

  async listProducts(companyId: string, includeArchived = true): Promise<{ catalog_version: number; products: Product[] }> {
    if (API_BASE) {
      const response = await request<{ catalog_version: number; products: CanonicalProduct[] }>(
        `/api/companies/${encodeURIComponent(companyId)}/products?include_archived=${includeArchived}`,
      );
      return { catalog_version: response.catalog_version, products: response.products.map(canonicalToProduct) };
    }
    const state = await loadDemo();
    const company = demoCompany(state, companyId);
    const products = company.products
      .filter((item) => includeArchived || item.status !== "archived")
      .sort((left, right) => left.sort_order - right.sort_order || left.Description.localeCompare(right.Description));
    return { catalog_version: company.product_catalog_version || 0, products: clone(products) };
  },

  async getProduct(companyId: string, targetProductId: string): Promise<Product> {
    if (API_BASE) {
      const response = await request<CanonicalProduct>(
        `/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}`,
      );
      return canonicalToProduct(response);
    }
    const state = await loadDemo();
    const product = demoCompany(state, companyId).products.find((item) => item.product_id === targetProductId);
    if (!product) throw new Error("Product not found");
    return clone(product);
  },

  async createProduct(
    companyId: string,
    values: ProductWriteFields & { change_reason: string },
  ): Promise<Product> {
    if (!values.name.trim()) throw new Error("Product name is required");
    if (API_BASE) {
      const response = await request<CanonicalProduct>(`/api/companies/${encodeURIComponent(companyId)}/products`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      return canonicalToProduct(response);
    }
    const state = await loadDemo();
    const company = demoCompany(state, companyId);
    assertAvailableSku(company, values.sku);
    const product = productFromFields(companyId, values);
    company.products.push(product);
    company.product_catalog_version = (company.product_catalog_version || 0) + 1;
    recordDemoProductRevision(state, companyId, product, values.change_reason || "Created product");
    saveDemo(state);
    return clone(product);
  },

  async updateProduct(
    companyId: string,
    targetProductId: string,
    values: ProductWriteFields & { expected_version: number; change_reason: string },
  ): Promise<Product> {
    if (!values.change_reason.trim()) throw new Error("Change reason is required");
    if (API_BASE) {
      const response = await request<CanonicalProduct>(
        `/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}`,
        { method: "PATCH", body: JSON.stringify(values) },
      );
      return canonicalToProduct(response);
    }
    const state = await loadDemo();
    const company = demoCompany(state, companyId);
    const index = company.products.findIndex((item) => item.product_id === targetProductId);
    if (index < 0) throw new Error("Product not found");
    const current = company.products[index];
    if (current.version !== values.expected_version) {
      throw new Error(`Product changed since version ${values.expected_version}; current version is ${current.version}`);
    }
    assertAvailableSku(company, values.sku, targetProductId);
    const updated = productFromFields(companyId, values, current);
    company.products[index] = updated;
    company.product_catalog_version = (company.product_catalog_version || 0) + 1;
    recordDemoProductRevision(state, companyId, updated, values.change_reason);
    saveDemo(state);
    return clone(updated);
  },

  async archiveProduct(
    companyId: string,
    targetProductId: string,
    expectedVersion: number,
    changeReason: string,
  ): Promise<Product> {
    if (API_BASE) {
      const response = await request<CanonicalProduct>(
        `/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}/archive`,
        { method: "POST", body: JSON.stringify({ expected_version: expectedVersion, change_reason: changeReason }) },
      );
      return canonicalToProduct(response);
    }
    const state = await loadDemo();
    const product = setDemoProductStatus(state, companyId, targetProductId, expectedVersion, "archived", changeReason);
    saveDemo(state);
    return product;
  },

  async restoreProduct(
    companyId: string,
    targetProductId: string,
    expectedVersion: number,
    changeReason: string,
  ): Promise<Product> {
    if (API_BASE) {
      const response = await request<CanonicalProduct>(
        `/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}/restore`,
        { method: "POST", body: JSON.stringify({ expected_version: expectedVersion, change_reason: changeReason }) },
      );
      return canonicalToProduct(response);
    }
    const state = await loadDemo();
    const product = setDemoProductStatus(state, companyId, targetProductId, expectedVersion, "active", changeReason);
    saveDemo(state);
    return product;
  },

  async getProductRevisions(companyId: string, targetProductId: string): Promise<ProductRevision[]> {
    if (API_BASE) {
      return request(
        `/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}/revisions`,
      );
    }
    const state = await loadDemo();
    const product = demoCompany(state, companyId).products.some((item) => item.product_id === targetProductId);
    if (!product) throw new Error("Product not found");
    return clone([...(state.productRevisions[productHistoryKey(companyId, targetProductId)] || [])].reverse());
  },

  async getProductUsage(companyId: string, targetProductId: string): Promise<ProductUsage> {
    if (API_BASE) {
      return request(
        `/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}/usage`,
      );
    }
    const state = await loadDemo();
    if (!demoCompany(state, companyId).products.some((item) => item.product_id === targetProductId)) {
      throw new Error("Product not found");
    }
    const estimateNumbers = new Set<string>();
    const references: ProductUsage["references"] = [];
    let lineCount = 0;
    state.estimates.forEach((record) => record.revisions.forEach((revision) => {
      if (revision.company_id !== companyId) return;
      const matchingLines = revision.line_items.filter((line) => line.source_product_id === targetProductId);
      if (!matchingLines.length) return;
      estimateNumbers.add(revision.estimate_number);
      lineCount += matchingLines.length;
      references.push({
        estimate_number: revision.estimate_number,
        revision_number: revision.revision_number,
        customer_name: revision.customer_name,
        event_name: revision.event_name,
        used_at: revision.updated_at || revision.created_at,
        line_count: matchingLines.length,
      });
    }));
    references.sort((left, right) => right.used_at.localeCompare(left.used_at));
    return {
      product_id: targetProductId,
      estimate_count: estimateNumbers.size,
      revision_count: references.length,
      line_count: lineCount,
      latest_used_at: references[0]?.used_at || null,
      references: references.slice(0, 25),
    };
  },

  async updateCustomers(companyId: string, customers: Customer[]): Promise<Customer[]> {
    if (API_BASE) return request(`/api/companies/${companyId}/customers`, { method: "PUT", body: JSON.stringify({ customers }) });
    const state = await loadDemo();
    const company = state.store.companies.find((item) => item.company_id === companyId);
    if (!company) throw new Error("Company not found");
    company.customers = customers
      .filter((item) => item.customer_name.trim())
      .map((item) => ({ ...item, customer_id: item.customer_id || `customer-${Date.now()}-${Math.random().toString(16).slice(2)}` }));
    saveDemo(state);
    return clone(company.customers);
  },

  async updateEvents(companyId: string, events: Event[]): Promise<Event[]> {
    if (API_BASE) return request(`/api/companies/${companyId}/events`, { method: "PUT", body: JSON.stringify({ events }) });
    const state = await loadDemo();
    const company = state.store.companies.find((item) => item.company_id === companyId);
    if (!company) throw new Error("Company not found");
    const customerIds = new Set(company.customers.map((item) => item.customer_id));
    company.events = events
      .filter((item) => customerIds.has(item.customer_id))
      .map((item) => ({ ...item, event_id: item.event_id || `event-${Date.now()}-${Math.random().toString(16).slice(2)}` }));
    saveDemo(state);
    return clone(company.events);
  },

  async getEstimate(number: string, revision?: number): Promise<Estimate> {
    if (API_BASE) return request(`/api/estimates/${encodeURIComponent(number)}${revision ? `?revision=${revision}` : ""}`);
    const state = await loadDemo();
    const record = state.estimates.find((item) => item.estimate_number === number);
    if (!record) throw new Error("Estimate not found");
    const estimate = revision
      ? record.revisions.find((item) => item.revision_number === revision)
      : activeRevision(record);
    if (!estimate) throw new Error("Estimate revision not found");
    return clone(estimate);
  },

  async getRevisions(number: string): Promise<EstimateRevisionSummary[]> {
    if (API_BASE) return request(`/api/estimates/${encodeURIComponent(number)}/revisions`);
    const state = await loadDemo();
    const record = state.estimates.find((item) => item.estimate_number === number);
    if (!record) throw new Error("Estimate not found");
    return [...record.revisions].reverse().map((item) => ({
      revision_number: item.revision_number,
      revision_id: item.revision_id,
      revision_reason: item.revision_reason,
      updated_at: item.updated_at,
      total: item.total,
    }));
  },

  async calculateEstimate(draft: EstimateDraft): Promise<Estimate> {
    if (API_BASE) return request("/api/estimates/calculate", { method: "POST", body: JSON.stringify(draft) });
    const state = await loadDemo();
    const previousRecord = draft.estimate_number
      ? state.estimates.find((item) => item.estimate_number === draft.estimate_number)
      : undefined;
    return calculateDraftSnapshot(
      state.store,
      draft,
      draft.estimate_number || "DRAFT",
      previousRecord ? previousRecord.current_revision + 1 : 0,
      previousRecord ? activeRevision(previousRecord) : undefined,
    );
  },

  async saveEstimate(draft: EstimateDraft): Promise<Estimate> {
    if (API_BASE) return request("/api/estimates", { method: "POST", body: JSON.stringify(draft) });
    const state = await loadDemo();
    let record = draft.estimate_number
      ? state.estimates.find((item) => item.estimate_number === draft.estimate_number)
      : undefined;
    if (record && draft.base_revision != null && draft.base_revision !== record.current_revision) {
      throw new Error(`Estimate changed since revision ${draft.base_revision}; reload before saving`);
    }
    const estimateNumber = record?.estimate_number || `EST-${state.nextNumber++}`;
    const revisionNumber = (record?.current_revision || 0) + 1;
    const estimate = calculateDraftSnapshot(
      state.store,
      draft,
      estimateNumber,
      revisionNumber,
      record ? activeRevision(record) : undefined,
    );
    if (!record) {
      record = { estimate_number: estimateNumber, archived: false, current_revision: 0, revisions: [] };
      state.estimates.unshift(record);
    }
    record.archived = false;
    record.current_revision = revisionNumber;
    record.revisions.push(estimate);
    saveDemo(state);
    return clone(estimate);
  },

  async archiveEstimate(number: string, baseRevision: number): Promise<void> {
    if (API_BASE) return request(`/api/estimates/${encodeURIComponent(number)}/archive`, {
      method: "POST",
      body: JSON.stringify({ base_revision: baseRevision, change_reason: "Archived in Office" }),
    });
    const state = await loadDemo();
    const record = state.estimates.find((item) => item.estimate_number === number);
    if (!record) throw new Error("Estimate not found");
    record.archived = true;
    saveDemo(state);
  },

  async downloadPdf(draft: EstimateDraft, preview: Estimate): Promise<void> {
    if (API_BASE) {
      const saved = Boolean(
        draft.estimate_number
        && draft.base_revision
        && preview.estimate_number !== "DRAFT"
        && preview.revision_number === draft.base_revision,
      );
      const path = saved
        ? `/api/estimates/${encodeURIComponent(preview.estimate_number)}/pdf?revision=${preview.revision_number}`
        : "/api/estimates/pdf";
      const response = await fetch(apiUrl(path), saved ? undefined : {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-ID": `web-${requestIdentifier()}` },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error("Could not create the PDF");
      downloadBlob(await response.blob(), `${preview.estimate_number}_r${preview.revision_number}_${preview.customer_name.replace(/\W+/g, "-")}.pdf`);
      return;
    }
    const previousTitle = document.title;
    document.title = `${preview.estimate_number} r${preview.revision_number} — ${preview.customer_name}`;
    document.body.dataset.printingEstimate = "true";
    window.print();
    delete document.body.dataset.printingEstimate;
    document.title = previousTitle;
  },

  pendingBrowserDemo(): DemoState | null {
    if (!API_BASE || typeof window === "undefined" || window.sessionStorage?.getItem(IMPORT_PROMPT_KEY)) return null;
    return storedDemo();
  },

  markBrowserImportPrompted(): void {
    try { window.sessionStorage?.setItem(IMPORT_PROMPT_KEY, "true"); } catch { /* no-op */ }
  },

  async previewBrowserDemo(state: DemoState): Promise<BrowserImportPreview> {
    if (!API_BASE) throw new Error("Browser import requires API mode");
    return request("/api/admin/imports/browser-demo/preview", {
      method: "POST",
      body: JSON.stringify({ state }),
    });
  },

  async commitBrowserDemo(
    jobId: string,
    strategy: "safe_merge" | "preserve_copy",
  ): Promise<{ inserted: Record<string, number> }> {
    if (!API_BASE) throw new Error("Browser import requires API mode");
    return request("/api/admin/imports/browser-demo/commit", {
      method: "POST",
      body: JSON.stringify({
        job_id: jobId,
        strategy,
        change_reason: "Recovered browser-local Office data",
      }),
    });
  },

  async resetDemo(): Promise<void> {
    try {
      if (typeof window !== "undefined") {
        window.localStorage?.removeItem(STORAGE_KEY);
        LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage?.removeItem(key));
      }
    } catch {
      // no-op
    }
  },
};

export { defaultProductQuantity };
