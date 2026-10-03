"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { officeApi } from "@/lib/api";
import type {
  ChargeGroup,
  Company,
  PricingUnit,
  Product,
  ProductRevision,
  ProductUsage,
  ProductWriteFields,
  QuantityRule,
  TaxClass,
} from "@/lib/types";

type ProductForm = {
  sku: string;
  name: string;
  customer_description: string;
  internal_notes: string;
  category: string;
  unit_price: number;
  currency: string;
  pricing_unit: PricingUnit;
  quantity_rule: QuantityRule;
  default_quantity: number;
  minimum_quantity: number;
  quantity_step: number;
  charge_group: ChargeGroup;
  tax_class: TaxClass;
  sort_order: number;
};

type Template = {
  id: string;
  icon: string;
  label: string;
  detail: string;
  values: Partial<ProductForm>;
};

type Props = {
  company: Company;
  products: Product[];
  search: string;
  onSearchChange: (value: string) => void;
  onProductsChange: (products: Product[]) => void;
  notify: (message: string, tone?: "success" | "error") => void;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatMoney = (value: number) => currency.format(value || 0);

const pricingUnits: Array<{ value: PricingUnit; label: string }> = [
  { value: "each", label: "Each" },
  { value: "guest", label: "Per guest" },
  { value: "hour", label: "Per hour" },
  { value: "flat", label: "Flat fee" },
];

const quantityRules: Array<{ value: QuantityRule; label: string; detail: string }> = [
  { value: "manual", label: "Manual quantity", detail: "Starts at the default quantity" },
  { value: "guest_count", label: "Guest count", detail: "Uses the event guest count" },
  { value: "guest_plus_buffer", label: "Guests + buffer", detail: "Uses guests plus the utensil buffer" },
  { value: "server_hours", label: "Server hours", detail: "Servers × scheduled hours" },
  { value: "kitchen_staff_hours", label: "Kitchen staff hours", detail: "Kitchen staff × scheduled hours" },
];

const chargeGroups: Array<{ value: ChargeGroup; label: string }> = [
  { value: "item", label: "Food & items" },
  { value: "staff", label: "Staff" },
  { value: "service", label: "Service" },
  { value: "delivery", label: "Delivery" },
  { value: "gratuity", label: "Gratuity" },
];

const templates: Template[] = [
  {
    id: "menu",
    icon: "◇",
    label: "Menu item",
    detail: "Priced per serving or item",
    values: { category: "Menu", pricing_unit: "each", quantity_rule: "manual", charge_group: "item", tax_class: "taxable" },
  },
  {
    id: "guest",
    icon: "◎",
    label: "Per guest",
    detail: "Quantity follows guest count",
    values: { category: "Entrées", pricing_unit: "guest", quantity_rule: "guest_count", charge_group: "item", tax_class: "taxable" },
  },
  {
    id: "staff",
    icon: "◷",
    label: "Hourly staff",
    detail: "Hours calculated from the event",
    values: { category: "Staff", pricing_unit: "hour", quantity_rule: "server_hours", charge_group: "staff", tax_class: "taxable" },
  },
  {
    id: "fee",
    icon: "▱",
    label: "Flat fee",
    detail: "One fixed service charge",
    values: { category: "Service", pricing_unit: "flat", quantity_rule: "manual", charge_group: "service", tax_class: "non_taxable", default_quantity: 1 },
  },
  {
    id: "delivery",
    icon: "→",
    label: "Delivery",
    detail: "A reusable delivery charge",
    values: { category: "Delivery", pricing_unit: "flat", quantity_rule: "manual", charge_group: "delivery", tax_class: "taxable", default_quantity: 1 },
  },
];

function blankForm(sortOrder: number): ProductForm {
  return {
    sku: "",
    name: "",
    customer_description: "",
    internal_notes: "",
    category: "",
    unit_price: 0,
    currency: "USD",
    pricing_unit: "each",
    quantity_rule: "manual",
    default_quantity: 1,
    minimum_quantity: 0,
    quantity_step: 1,
    charge_group: "item",
    tax_class: "taxable",
    sort_order: sortOrder,
  };
}

function formFromProduct(product: Product): ProductForm {
  return {
    sku: product.sku,
    name: product.Description,
    customer_description: product.Notes,
    internal_notes: product.internal_notes,
    category: product.Category,
    unit_price: product["Unit Price"],
    currency: product.currency,
    pricing_unit: product.pricing_unit,
    quantity_rule: product.quantity_rule,
    default_quantity: product.default_quantity,
    minimum_quantity: product.minimum_quantity,
    quantity_step: product.quantity_step,
    charge_group: product.charge_group,
    tax_class: product.tax_class,
    sort_order: product.sort_order,
  };
}

function categoryId(category: string): string {
  return category.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorized";
}

function writeFields(form: ProductForm): ProductWriteFields {
  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    customer_description: form.customer_description.trim(),
    internal_notes: form.internal_notes.trim(),
    category_id: categoryId(form.category),
    category: form.category.trim(),
    price_cents: Math.round(Math.max(form.unit_price || 0, 0) * 100),
    currency: form.currency.trim().toUpperCase() || "USD",
    pricing_unit: form.pricing_unit,
    quantity_rule: form.quantity_rule,
    default_quantity: Math.max(form.default_quantity || 0, 0),
    minimum_quantity: Math.max(form.minimum_quantity || 0, 0),
    quantity_step: Math.max(form.quantity_step || 1, 0.01),
    charge_group: form.charge_group,
    tax_class: form.tax_class,
    sort_order: Math.max(Math.round(form.sort_order || 0), 0),
  };
}

function displayTimestamp(value: string): string {
  if (!value) return "Imported";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function quantityLabel(rule: QuantityRule): string {
  return quantityRules.find((item) => item.value === rule)?.label || "Manual quantity";
}

function sampleQuantity(form: ProductForm): number {
  if (form.quantity_rule === "guest_count") return 100;
  if (form.quantity_rule === "guest_plus_buffer") return 110;
  if (form.quantity_rule === "server_hours") return 24;
  if (form.quantity_rule === "kitchen_staff_hours") return 18;
  return Math.max(form.default_quantity || 1, form.minimum_quantity || 0);
}

function TextInput({ label, value, onChange, placeholder, help, required }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  help?: string;
  required?: boolean;
}) {
  return <label className="field"><span>{label}{required && " *"}</span><input value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />{help && <small>{help}</small>}</label>;
}

function NumberInput({ label, value, onChange, min = 0, step = "any", prefix, help }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number | "any";
  prefix?: string;
  help?: string;
}) {
  return <label className="field"><span>{label}</span><span className={prefix ? "studio-number-input prefixed" : "studio-number-input"}>{prefix && <b>{prefix}</b>}<input type="number" value={value} min={min} step={step} onChange={(event) => onChange(Number(event.target.value))} /></span>{help && <small>{help}</small>}</label>;
}

function SelectInput({ label, value, onChange, options, help }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  help?: string;
}) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{help && <small>{help}</small>}</label>;
}

export default function ProductStudio({ company, products, search, onSearchChange, onProductsChange, notify }: Props) {
  const [scope, setScope] = useState<"active" | "archived">("active");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<"order" | "name" | "updated">("order");
  const [loading, setLoading] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [editorStage, setEditorStage] = useState<"template" | "form">("template");
  const [editorTab, setEditorTab] = useState<"details" | "history">("details");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(() => blankForm(0));
  const [baseline, setBaseline] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [revisions, setRevisions] = useState<ProductRevision[]>([]);
  const [usage, setUsage] = useState<ProductUsage | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setEditorMode(null);
    setCategory("All");
    officeApi.listProducts(company.company_id, true)
      .then((result) => { if (active) onProductsChange(result.products); })
      .catch((error: Error) => { if (active) notify(error.message, "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // The company id is the only input that should refresh the catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.company_id]);

  const activeCount = products.filter((item) => item.status === "active").length;
  const archivedCount = products.length - activeCount;
  const scopedProducts = products.filter((item) => item.status === scope);
  const categories = useMemo(() => [
    "All",
    ...Array.from(new Set(scopedProducts.map((item) => item.Category).filter(Boolean))).sort(),
  ], [scopedProducts]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = scopedProducts.filter((product) => (
      (category === "All" || product.Category === category)
      && `${product.Description} ${product.Category} ${product.Notes} ${product.sku} ${product.internal_notes}`.toLowerCase().includes(query)
    ));
    return [...result].sort((left, right) => {
      if (sort === "name") return left.Description.localeCompare(right.Description);
      if (sort === "updated") return right.updated_at.localeCompare(left.updated_at);
      return left.sort_order - right.sort_order || left.Description.localeCompare(right.Description);
    });
  }, [category, scopedProducts, search, sort]);

  const dirty = editorStage === "form" && JSON.stringify(form) !== baseline;
  const suggestedQuantity = sampleQuantity(form);
  const mergeProduct = (nextProduct: Product) => {
    const next = [...products.filter((item) => item.product_id !== nextProduct.product_id), nextProduct]
      .sort((left, right) => left.sort_order - right.sort_order || left.Description.localeCompare(right.Description));
    onProductsChange(next);
  };

  const loadInsights = async (product: Product) => {
    setInsightsLoading(true);
    try {
      const [nextRevisions, nextUsage] = await Promise.all([
        officeApi.getProductRevisions(company.company_id, product.product_id),
        officeApi.getProductUsage(company.company_id, product.product_id),
      ]);
      setRevisions(nextRevisions);
      setUsage(nextUsage);
    } catch (error) {
      setEditorError((error as Error).message);
    } finally {
      setInsightsLoading(false);
    }
  };

  const openCreate = () => {
    const next = blankForm(Math.max(-1, ...products.map((item) => item.sort_order)) + 1);
    setEditorMode("create");
    setEditorStage("template");
    setEditorTab("details");
    setEditingProduct(null);
    setForm(next);
    setBaseline(JSON.stringify(next));
    setChangeReason("");
    setEditorError("");
    setConflict(false);
  };

  const chooseTemplate = (template?: Template) => {
    const next = { ...blankForm(Math.max(-1, ...products.map((item) => item.sort_order)) + 1), ...(template?.values || {}) };
    setForm(next);
    setBaseline(JSON.stringify(next));
    setEditorStage("form");
    setTimeout(() => document.getElementById("studio-product-name")?.focus(), 0);
  };

  const openEdit = (product: Product) => {
    const next = formFromProduct(product);
    setEditorMode("edit");
    setEditorStage("form");
    setEditorTab("details");
    setEditingProduct(product);
    setForm(next);
    setBaseline(JSON.stringify(next));
    setChangeReason("");
    setEditorError("");
    setConflict(false);
    setRevisions([]);
    setUsage(null);
    void loadInsights(product);
  };

  const closeEditor = () => {
    if (dirty && !window.confirm("Discard your unsaved product changes?")) return;
    setEditorMode(null);
  };

  const updateForm = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setEditorError("");
    setConflict(false);
  };

  const submit = async (addAnother = false) => {
    if (!form.name.trim()) return setEditorError("Add a customer-facing product name.");
    if (form.quantity_step <= 0) return setEditorError("Quantity step must be greater than zero.");
    if (editorMode === "edit" && !changeReason.trim()) return setEditorError("Add a short change reason for the version history.");
    setSaving(true);
    setEditorError("");
    setConflict(false);
    try {
      if (editorMode === "edit" && editingProduct) {
        const updated = await officeApi.updateProduct(company.company_id, editingProduct.product_id, {
          ...writeFields(form),
          expected_version: editingProduct.version,
          change_reason: changeReason.trim(),
        });
        mergeProduct(updated);
        setEditingProduct(updated);
        const next = formFromProduct(updated);
        setForm(next);
        setBaseline(JSON.stringify(next));
        setChangeReason("");
        notify(`${updated.Description} saved as version ${updated.version}`);
        void loadInsights(updated);
      } else {
        const created = await officeApi.createProduct(company.company_id, {
          ...writeFields(form),
          change_reason: changeReason.trim() || "Created in Product Studio",
        });
        mergeProduct(created);
        notify(`${created.Description} added to the catalog`);
        if (addAnother) {
          const next = blankForm(Math.max(created.sort_order, ...products.map((item) => item.sort_order)) + 1);
          setForm(next);
          setBaseline(JSON.stringify(next));
          setEditorStage("template");
          setChangeReason("");
        } else {
          setEditorMode(null);
        }
      }
    } catch (error) {
      const message = (error as Error).message;
      setEditorError(message);
      setConflict(/current version|changed since version/i.test(message));
    } finally {
      setSaving(false);
    }
  };

  const reloadLatest = async () => {
    if (!editingProduct) return;
    setSaving(true);
    try {
      const latest = await officeApi.getProduct(company.company_id, editingProduct.product_id);
      mergeProduct(latest);
      openEdit(latest);
      notify("Latest product version loaded");
    } catch (error) {
      setEditorError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const duplicateProduct = (product: Product) => {
    const next = { ...formFromProduct(product), name: `${product.Description} copy`, sku: "", sort_order: Math.max(-1, ...products.map((item) => item.sort_order)) + 1 };
    setEditorMode("create");
    setEditorStage("form");
    setEditorTab("details");
    setEditingProduct(null);
    setForm(next);
    setBaseline(JSON.stringify(next));
    setChangeReason("");
    setEditorError("");
    setConflict(false);
  };

  const changeStatus = async (product: Product, status: "active" | "archived") => {
    if (status === "archived" && !window.confirm(`Archive ${product.Description}? Saved estimates will keep their original snapshots.`)) return;
    try {
      const reason = status === "archived" ? "Archived from Product Studio" : "Restored from Product Studio";
      const updated = status === "archived"
        ? await officeApi.archiveProduct(company.company_id, product.product_id, product.version, reason)
        : await officeApi.restoreProduct(company.company_id, product.product_id, product.version, reason);
      mergeProduct(updated);
      if (editingProduct?.product_id === product.product_id) setEditorMode(null);
      notify(`${updated.Description} ${status === "archived" ? "archived" : "restored"}`);
    } catch (error) {
      notify((error as Error).message, "error");
    }
  };

  return <section className="product-studio section-stack">
    <div className="product-studio-hero">
      <div>
        <p className="eyebrow">Reusable catalog · version controlled</p>
        <h2>Product Studio</h2>
        <p>Create menu items, staffing, and fees once. Every saved change becomes a new version; existing estimates stay untouched.</p>
      </div>
      <button className="button primary large" onClick={openCreate}>＋ New product</button>
    </div>

    <div className="panel studio-toolbar">
      <label className="inline-search studio-search"><span>⌕</span><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search name, SKU, category, or note" /></label>
      <div className="studio-scope" aria-label="Product status">
        <button className={scope === "active" ? "active" : ""} onClick={() => { setScope("active"); setCategory("All"); }}>Active <b>{activeCount}</b></button>
        <button className={scope === "archived" ? "active" : ""} onClick={() => { setScope("archived"); setCategory("All"); }}>Archived <b>{archivedCount}</b></button>
      </div>
      <label className="studio-sort"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="order">Catalog order</option><option value="name">Name</option><option value="updated">Recently updated</option></select></label>
      <div className="category-chips studio-categories">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <span className="studio-result-count">{loading ? "Refreshing…" : `${filteredProducts.length} ${scope} product${filteredProducts.length === 1 ? "" : "s"}`}</span>
    </div>

    {filteredProducts.length ? <div className="studio-product-list">{filteredProducts.map((product) => <article key={product.product_id} className={product.status === "archived" ? "studio-product-card archived" : "studio-product-card"}>
      <div className="studio-product-mark"><span>{product.Category.slice(0, 1).toUpperCase() || "P"}</span></div>
      <div className="studio-product-main">
        <div className="studio-product-title"><span className="category-pill">{product.Category || "Uncategorized"}</span><span className={product.status === "archived" ? "studio-status archived" : "studio-status"}>{product.status}</span></div>
        <h3>{product.Description}</h3>
        <p>{product.Notes || "No customer description yet."}</p>
        <div className="studio-product-meta">{product.sku && <span>SKU {product.sku}</span>}<span>{quantityLabel(product.quantity_rule)}</span><span>{chargeGroups.find((item) => item.value === product.charge_group)?.label}</span><span>v{product.version}</span></div>
      </div>
      <div className="studio-product-price"><strong>{formatMoney(product["Unit Price"])}</strong><span>/ {pricingUnits.find((item) => item.value === product.pricing_unit)?.label.toLowerCase()}</span></div>
      <div className="studio-card-actions"><button className="button secondary" onClick={() => openEdit(product)}>Edit</button><button className="studio-more-button" aria-label={`Duplicate ${product.Description}`} title="Duplicate" onClick={() => duplicateProduct(product)}>⧉</button>{product.status === "active" ? <button className="studio-more-button danger" aria-label={`Archive ${product.Description}`} title="Archive" onClick={() => void changeStatus(product, "archived")}>⌁</button> : <button className="button secondary" onClick={() => void changeStatus(product, "active")}>Restore</button>}</div>
    </article>)}</div> : <div className="panel studio-empty"><span>{scope === "active" ? "◇" : "↶"}</span><h3>{search || category !== "All" ? "No products match these filters" : `No ${scope} products`}</h3><p>{scope === "active" ? "Create a product or broaden your filters." : "Archived products will appear here and can be restored at any time."}</p>{scope === "active" && !search && category === "All" && <button className="button primary" onClick={openCreate}>Create your first product</button>}</div>}

    {editorMode && <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
      <aside className="studio-drawer" role="dialog" aria-modal="true" aria-labelledby="studio-drawer-title">
        <div className="drawer-head studio-drawer-head"><div><p className="eyebrow">{editorMode === "create" ? "Add to catalog" : `${editingProduct?.sku ? `SKU ${editingProduct.sku} · ` : ""}Version ${editingProduct?.version}`}</p><h2 id="studio-drawer-title">{editorMode === "create" ? "New product" : `Edit ${editingProduct?.Description}`}</h2><p>{editorMode === "create" ? "Start with a familiar product type, then tune the pricing behavior." : "Changes apply to future selections only. Saved estimates keep their original product snapshot."}</p></div><button className="drawer-close" aria-label="Close product editor" onClick={closeEditor}>×</button></div>

        {editorStage === "template" ? <div className="studio-template-stage"><div><h3>What are you adding?</h3><p>A template sets sensible pricing and quantity defaults. You can change every field next.</p></div><div className="studio-template-grid">{templates.map((template) => <button key={template.id} onClick={() => chooseTemplate(template)}><span>{template.icon}</span><strong>{template.label}</strong><small>{template.detail}</small><b>›</b></button>)}<button onClick={() => chooseTemplate()}><span>＋</span><strong>Start blank</strong><small>Configure every rule yourself</small><b>›</b></button></div><div className="studio-template-footer"><button className="button ghost" onClick={closeEditor}>Cancel</button></div></div> : <form className="studio-editor-form" onSubmit={(event) => { event.preventDefault(); void submit(false); }}>
          {editorMode === "edit" && <div className="studio-editor-tabs"><button type="button" className={editorTab === "details" ? "active" : ""} onClick={() => setEditorTab("details")}>Product details</button><button type="button" className={editorTab === "history" ? "active" : ""} onClick={() => setEditorTab("history")}>History & usage <span>{revisions.length || ""}</span></button></div>}

          <div className="studio-drawer-body">{editorTab === "details" ? <div className="studio-form-layout"><div className="studio-form-stack">
            {editorError && <div className={conflict ? "studio-alert conflict" : "studio-alert"}><span>!</span><div><strong>{conflict ? "This product changed elsewhere" : "Couldn’t save this product"}</strong><p>{editorError}</p>{conflict && <button type="button" onClick={() => void reloadLatest()}>Reload latest version</button>}</div></div>}
            <section className="studio-form-section"><div className="studio-form-heading"><span>01</span><div><h3>Customer-facing details</h3><p>This is what appears in the picker and on estimates.</p></div></div><div className="studio-form-grid two"><label className="field"><span>Product name *</span><input id="studio-product-name" required value={form.name} placeholder="Herb-roasted chicken" onChange={(event) => updateForm("name", event.target.value)} /></label><TextInput label="Category" value={form.category} placeholder="Entrées" onChange={(value) => updateForm("category", value)} /><TextInput label="SKU" value={form.sku} placeholder="ENT-CHICKEN" help="Optional, but unique within this business." onChange={(value) => updateForm("sku", value)} /><label className="field studio-field-wide"><span>Customer description</span><textarea value={form.customer_description} placeholder="Served with seasonal vegetables and pan jus." onChange={(event) => updateForm("customer_description", event.target.value)} /><small>Visible on the estimate. Keep this polished and concise.</small></label></div></section>
            <section className="studio-form-section"><div className="studio-form-heading"><span>02</span><div><h3>Price & quantity</h3><p>Control both the rate and the quantity suggested from an event.</p></div></div><div className="studio-form-grid three"><NumberInput label="Unit price" value={form.unit_price} min={0} step={0.01} prefix="$" onChange={(value) => updateForm("unit_price", value)} /><SelectInput label="Pricing unit" value={form.pricing_unit} options={pricingUnits} onChange={(value) => updateForm("pricing_unit", value as PricingUnit)} /><SelectInput label="Suggested quantity" value={form.quantity_rule} options={quantityRules} help={quantityRules.find((item) => item.value === form.quantity_rule)?.detail} onChange={(value) => updateForm("quantity_rule", value as QuantityRule)} /><NumberInput label="Default quantity" value={form.default_quantity} min={0} onChange={(value) => updateForm("default_quantity", value)} /><NumberInput label="Minimum quantity" value={form.minimum_quantity} min={0} onChange={(value) => updateForm("minimum_quantity", value)} /><NumberInput label="Quantity step" value={form.quantity_step} min={0.01} onChange={(value) => updateForm("quantity_step", value)} /></div></section>
            <section className="studio-form-section"><div className="studio-form-heading"><span>03</span><div><h3>Billing behavior</h3><p>Choose where the line is totaled and how it is taxed.</p></div></div><div className="studio-form-grid three"><SelectInput label="Charge group" value={form.charge_group} options={chargeGroups} onChange={(value) => updateForm("charge_group", value as ChargeGroup)} /><SelectInput label="Tax class" value={form.tax_class} options={[{ value: "taxable", label: "Taxable" }, { value: "non_taxable", label: "Non-taxable" }]} onChange={(value) => updateForm("tax_class", value as TaxClass)} /><NumberInput label="Catalog order" value={form.sort_order} min={0} step={1} help="Lower numbers appear first." onChange={(value) => updateForm("sort_order", value)} /></div></section>
            <section className="studio-form-section internal"><div className="studio-form-heading"><span>04</span><div><h3>Internal notes</h3><p>Only your team sees this. It is never placed on customer estimates.</p></div></div><label className="field"><span>Private preparation or costing notes</span><textarea value={form.internal_notes} placeholder="Vendor pack size, margin target, prep constraints…" onChange={(event) => updateForm("internal_notes", event.target.value)} /></label></section>
            {editorMode === "edit" && <section className="studio-change-reason"><TextInput label="Change reason *" value={changeReason} placeholder="Updated price for summer menu" help="Required. This note is stored with the new immutable version." required onChange={setChangeReason} /></section>}
          </div><aside className="studio-live-preview"><div className="studio-preview-label"><span>Live estimate preview</span><b>Customer-visible</b></div><div className="studio-preview-paper"><div><span>{form.category || "Category"}</span><strong>{form.name || "Product name"}</strong><p>{form.customer_description || "Your customer-facing description will appear here."}</p></div><div className="studio-preview-line"><span><b>{suggestedQuantity}</b><small>{quantityLabel(form.quantity_rule)}</small></span><span><b>{formatMoney(form.unit_price)}</b><small>per {form.pricing_unit}</small></span><strong>{formatMoney(suggestedQuantity * form.unit_price)}</strong></div></div><div className="studio-preview-context"><strong>Sample event</strong><p>100 guests · 10 utensil buffer · 3 servers × 8 hours · 3 kitchen staff × 6 hours</p></div><div className="studio-future-note"><span>↗</span><p><strong>Safe catalog changes</strong>New versions affect future selections. Existing estimate revisions remain historically accurate.</p></div></aside></div> : <div className="studio-insights">
            {insightsLoading ? <div className="studio-insights-loading">Loading product history…</div> : <><div className="studio-usage-summary"><div><strong>{usage?.estimate_count || 0}</strong><span>Estimates</span></div><div><strong>{usage?.revision_count || 0}</strong><span>Estimate revisions</span></div><div><strong>{usage?.line_count || 0}</strong><span>Line uses</span></div></div><div className="studio-insight-grid"><section><div className="studio-insight-heading"><h3>Version history</h3><p>Every saved product snapshot</p></div><div className="studio-revision-list">{revisions.map((revision) => <article key={revision.revision_id}><span>v{revision.version}</span><div><strong>{revision.change_reason}</strong><p>{revision.snapshot.name} · {formatMoney(revision.snapshot.price_cents / 100)} / {revision.snapshot.pricing_unit}</p><small>{displayTimestamp(revision.changed_at)}</small></div></article>)}</div></section><section><div className="studio-insight-heading"><h3>Estimate usage</h3><p>{usage?.latest_used_at ? `Last used ${displayTimestamp(usage.latest_used_at)}` : "Not used on a saved estimate yet"}</p></div>{usage?.references.length ? <div className="studio-usage-list">{usage.references.map((reference) => <article key={`${reference.estimate_number}-${reference.revision_number}`}><span>▤</span><div><strong>{reference.estimate_number} · r{reference.revision_number}</strong><p>{reference.customer_name} · {reference.event_name}</p><small>{displayTimestamp(reference.used_at)} · {reference.line_count} line{reference.line_count === 1 ? "" : "s"}</small></div></article>)}</div> : <div className="studio-unused"><span>◇</span><strong>Ready for its first estimate</strong><p>Usage will appear after this product is included in a saved estimate.</p></div>}</section></div></>}
          </div>}</div>

          <footer className="studio-drawer-footer"><div>{editorMode === "edit" && editingProduct && (editingProduct.status === "active" ? <button type="button" className="text-danger" onClick={() => void changeStatus(editingProduct, "archived")}>Archive product</button> : <button type="button" className="text-button" onClick={() => void changeStatus(editingProduct, "active")}>Restore product</button>)}</div><div><button type="button" className="button ghost" onClick={closeEditor}>Cancel</button>{editorMode === "create" && <button type="button" className="button secondary" disabled={saving} onClick={() => void submit(true)}>Save & add another</button>}<button type="submit" className="button primary" disabled={saving || (editorMode === "edit" && (!dirty || !changeReason.trim()))}>{saving ? "Saving…" : editorMode === "edit" ? "Save new version" : "Add product"}</button></div></footer>
        </form>}
      </aside>
    </div>}
  </section>;
}
