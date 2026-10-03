"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultProductQuantity, officeApi } from "@/lib/api";
import EstimateDocument from "@/components/EstimateDocument";
import ProductStudio from "@/components/ProductStudio";
import type {
  ChargeGroup,
  Company,
  Customer,
  DraftLineItem,
  Estimate,
  EstimateDraft,
  EstimateRevisionSummary,
  EstimateSummary,
  Event,
  Product,
  QuantityRule,
  TaxClass,
} from "@/lib/types";

type Tab = "overview" | "estimates" | "clients" | "catalog" | "settings";
type EstimateStep = 1 | 2 | 3;
type SaveState = "saved" | "dirty" | "saving" | "error";
type Toast = { message: string; tone: "success" | "error" } | null;

const tabs: { id: Tab; label: string; description: string; glyph: string }[] = [
  { id: "overview", label: "Overview", description: "Your catering office", glyph: "⌂" },
  { id: "estimates", label: "Estimates", description: "Quotes & revisions", glyph: "▤" },
  { id: "clients", label: "Customers & Events", description: "Contacts & occasions", glyph: "◎" },
  { id: "catalog", label: "Catalog", description: "Menu & pricing rules", glyph: "▦" },
  { id: "settings", label: "Business Settings", description: "Branding & defaults", glyph: "⚙" },
];

const quantityRules: { value: QuantityRule; label: string }[] = [
  { value: "manual", label: "Manual" }, { value: "guest_count", label: "Guest count" },
  { value: "guest_plus_buffer", label: "Guests + buffer" }, { value: "server_hours", label: "Server hours" },
  { value: "kitchen_staff_hours", label: "Kitchen hours" },
];
const chargeGroups: { value: ChargeGroup; label: string }[] = [
  { value: "item", label: "Food & items" }, { value: "staff", label: "Staff" },
  { value: "service", label: "Service item" }, { value: "delivery", label: "Delivery" },
  { value: "gratuity", label: "Gratuity item" },
];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatMoney = (value: number | undefined) => currency.format(value ?? 0);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const blankCompany = (): Company => ({
  company_id: "", business_name: "", business_email: "", business_phone: "", business_address: "",
  default_service_charge_percent: 0, default_gratuity_percent: 0, payment_terms: "", estimate_notes: "",
  products: [], customers: [], events: [], archived: false, version: 1, created_at: "", updated_at: "",
});
const blankCustomer = (): Customer => ({
  customer_id: makeId("customer"), customer_name: "", organization: "", customer_email: "", customer_phone: "",
  billing_address: "", internal_notes: "", archived: false, version: 1, created_at: "", updated_at: "",
});
const blankEvent = (customerId: string): Event => ({
  event_id: makeId("event"), customer_id: customerId, event_name: "", event_type: "Private Event", event_date: "",
  venue: "", guest_count: 50, servers_count: 0, servers_hours: 0, kitchen_staff_count: 0,
  kitchen_staff_hours: 0, utensils_buffer: 0, charge_tax: false, tax_percent: 0,
  default_deposit_amount: 0, archived: false, version: 1, created_at: "", updated_at: "",
});
function parseEventDate(value: string): Date | null {
  if (!value) return null;
  const parts = value.trim().split(/[./-]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [first, second, third] = parts;
  const date = first > 999 ? new Date(Date.UTC(first, second - 1, third)) : new Date(Date.UTC(third, first - 1, second));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function displayDate(value: string): string {
  const date = parseEventDate(value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date) : value || "Not set";
}

function displayTimestamp(value: string): string {
  const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
  }).format(date);
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "NC";
}

function Field({ label, value, onChange, type = "text", placeholder, min, help }: {
  label: string; value: string | number; onChange: (value: string) => void;
  type?: "text" | "email" | "tel" | "number"; placeholder?: string; min?: number; help?: string;
}) {
  return <label className="field"><span>{label}</span><input type={type} value={value} min={min} step={type === "number" ? "any" : undefined} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />{help && <small>{help}</small>}</label>;
}

function TextField({ label, value, onChange, placeholder, help }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; help?: string }) {
  return <label className="field"><span>{label}</span><textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />{help && <small>{help}</small>}</label>;
}

function Select({ label, value, onChange, children, disabled }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; disabled?: boolean }) {
  return <label className="field select-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>{children}</select></label>;
}

function Toggle({ checked, onChange, label, detail }: { checked: boolean; onChange: (checked: boolean) => void; label: string; detail: string }) {
  return <label className="toggle-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className="toggle" /><span><strong>{label}</strong><small>{detail}</small></span></label>;
}

function SaveIndicator({ state }: { state: SaveState }) {
  const labels: Record<SaveState, string> = { saved: "All changes saved", dirty: "Unsaved changes", saving: "Saving changes…", error: "Could not save" };
  return <span className={`save-indicator ${state}`}><i />{labels[state]}</span>;
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-mark">S</div><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

function SectionHeader({ eyebrow, title, detail, actions }: { eyebrow: string; title: string; detail: string; actions?: React.ReactNode }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{detail}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

function EstimateTotals({ estimate }: { estimate: Estimate | null }) {
  const rows = [
    ["Food & items", estimate?.items_subtotal], ["Staff", estimate?.staff_total],
    ["Service items", estimate?.service_items_total], ["Delivery", estimate?.delivery_charge],
    ["Gratuity items", estimate?.gratuity_items_total],
    [`Service charge${estimate?.service_charge_percent ? ` (${estimate.service_charge_percent}%)` : ""}`, estimate?.service_charge],
    [`Gratuity${estimate?.gratuity_percent ? ` (${estimate.gratuity_percent}%)` : ""}`, estimate?.gratuity],
    [`Tax${estimate?.tax_percent ? ` (${estimate.tax_percent}%)` : ""}`, estimate?.tax],
  ] as const;
  return <div className="totals-card"><div className="totals-card-head"><div><span>Estimate total</span><strong>{formatMoney(estimate?.total)}</strong></div><span className="status-badge neutral">{estimate && estimate.estimate_number !== "DRAFT" ? `r${estimate.revision_number || 1}` : "Draft"}</span></div><div className="totals-breakdown">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatMoney(value)}</strong></div>)}</div><div className="deposit-line"><span>Deposit</span><strong>− {formatMoney(estimate?.deposit)}</strong></div><div className="balance-total"><span>Balance due</span><strong>{formatMoney(estimate?.balance_due)}</strong></div></div>;
}

function toDraftLine(item: Estimate["line_items"][number]): DraftLineItem {
  return {
    line_id: item.line_id, source_product_id: item.source_product_id, Category: item.Category,
    Description: item.Description, Notes: item.Notes, Qty: item.Qty, "Unit Price": item["Unit Price"],
    pricing_unit: item.pricing_unit, charge_group: item.charge_group, tax_class: item.tax_class,
    source_product_version: item.source_product_version, catalog_price_cents_at_selection: item.catalog_price_cents_at_selection,
    quantity_rule: item.quantity_rule, suggested_quantity: item.suggested_quantity, selected_at: item.selected_at,
    is_custom: item.is_custom, override_reason: item.override_reason,
  };
}

function estimateToSummary(estimate: Estimate): EstimateSummary {
  return {
    file: `${estimate.estimate_number}.json`, estimate_number: estimate.estimate_number,
    revision_number: estimate.revision_number, company_id: estimate.company_id, customer_id: estimate.customer_id,
    customer_name: estimate.customer_name, event_id: estimate.event_id, event_name: estimate.event_name,
    event_date: estimate.event_date, total: estimate.total, updated_at: estimate.updated_at, archived: false,
  };
}

export default function OfficeApp() {
  const initial = useMemo(() => officeApi.initialBootstrap(), []);
  const firstCompany = initial.store.companies.find((item) => !item.archived && item.business_name === initial.store.selected_company) || initial.store.companies.find((item) => !item.archived);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [companies, setCompanies] = useState(initial.store.companies);
  const [estimates, setEstimates] = useState(initial.estimates);
  const [selectedCompanyId, setSelectedCompanyId] = useState(firstCompany?.company_id || "");
  const [mode, setMode] = useState<"api" | "demo">("demo");
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);

  const [companyDraft, setCompanyDraft] = useState<Company>(firstCompany || blankCompany());
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [settingsState, setSettingsState] = useState<SaveState>("saved");
  const [productRows, setProductRows] = useState<Product[]>(firstCompany?.products || []);
  const [productSearch, setProductSearch] = useState("");

  const [customerRows, setCustomerRows] = useState<Customer[]>(firstCompany?.customers || []);
  const [eventRows, setEventRows] = useState<Event[]>(firstCompany?.events || []);
  const [selectedCustomerId, setSelectedCustomerId] = useState(firstCompany?.customers.find((item) => !item.archived)?.customer_id || "");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [recordState, setRecordState] = useState<SaveState>("saved");
  const [customerSearch, setCustomerSearch] = useState("");

  const [estimateMode, setEstimateMode] = useState<"list" | "builder">("list");
  const [estimateStep, setEstimateStep] = useState<EstimateStep>(1);
  const [estimateSearch, setEstimateSearch] = useState("");
  const [estimateCustomerFilter, setEstimateCustomerFilter] = useState("all");
  const [estimateEventId, setEstimateEventId] = useState("");
  const [loadedEstimateNumber, setLoadedEstimateNumber] = useState<string | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [draftItems, setDraftItems] = useState<DraftLineItem[]>([]);
  const [servicePercent, setServicePercent] = useState(0);
  const [serviceTaxable, setServiceTaxable] = useState(true);
  const [gratuityPercent, setGratuityPercent] = useState(0);
  const [gratuityTaxable, setGratuityTaxable] = useState(true);
  const [depositAmount, setDepositAmount] = useState(0);
  const [estimateNotes, setEstimateNotes] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionHistory, setRevisionHistory] = useState<EstimateRevisionSummary[]>([]);
  const [preview, setPreview] = useState<Estimate | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState("");
  const [drawerCategory, setDrawerCategory] = useState("All");

  const selectedCompany = useMemo(() => companies.find((item) => item.company_id === selectedCompanyId) || null, [companies, selectedCompanyId]);
  const activeCustomer = customerRows.find((item) => item.customer_id === selectedCustomerId) || null;
  const customerEvents = eventRows.filter((item) => item.customer_id === selectedCustomerId && !item.archived);
  const activeEvent = eventRows.find((item) => item.event_id === selectedEventId) || customerEvents[0] || null;
  const estimateEvent = selectedCompany?.events.find((item) => item.event_id === estimateEventId && !item.archived) || null;
  const estimateCustomer = estimateEvent ? selectedCompany?.customers.find((item) => item.customer_id === estimateEvent.customer_id) || null : null;

  const notify = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3300);
  }, []);

  const syncEditors = (company: Company) => {
    setCompanyDraft(clone(company)); setProductRows(clone(company.products)); setCustomerRows(clone(company.customers)); setEventRows(clone(company.events));
    const customerId = company.customers.find((item) => !item.archived)?.customer_id || "";
    setSelectedCustomerId(customerId);
    setSelectedEventId(company.events.find((item) => item.customer_id === customerId && !item.archived)?.event_id || "");
    setSettingsState("saved"); setRecordState("saved");
  };

  const resetBuilder = () => {
    setEstimateMode("list"); setEstimateStep(1); setLoadedEstimateNumber(null); setBaseRevision(null); setDraftItems([]);
    setEstimateEventId(""); setPreview(null); setRevisionHistory([]); setRevisionReason(""); setDraftDirty(false); setDrawerOpen(false);
  };

  const load = useCallback(async () => {
    try {
      let result = await officeApi.bootstrap();
      const browserDemo = officeApi.pendingBrowserDemo();
      if (browserDemo) {
        officeApi.markBrowserImportPrompted();
        try {
          const previewResult = await officeApi.previewBrowserDemo(browserDemo);
          const { summary } = previewResult;
          if (!summary.requires_action) {
            await officeApi.resetDemo();
          } else {
            const additions = Object.values(summary.additions).reduce((total, value) => total + value, 0);
            const strategy = summary.can_safe_merge ? "safe_merge" : "preserve_copy";
            const choice = window.confirm(
              `Browser-local Office data was found (${additions} new records, ${summary.conflict_count} conflicts). Import it now? ${summary.conflict_count ? "Conflicts will be preserved in a separate recovered workspace." : "Only new records will be added."}`,
            );
            if (choice) {
              await officeApi.commitBrowserDemo(previewResult.job_id, strategy);
              await officeApi.resetDemo();
              result = await officeApi.bootstrap();
              notify(summary.conflict_count ? "Browser data preserved in a recovered workspace" : "Browser data imported");
            } else {
              notify("Browser-local data was left unchanged");
            }
          }
        } catch (error) {
          notify(error instanceof Error ? error.message : "Could not reconcile browser-local data", "error");
        }
      }
      setCompanies(result.store.companies); setEstimates(result.estimates); setMode(result.mode);
      const company = result.store.companies.find((item) => !item.archived && item.business_name === result.store.selected_company) || result.store.companies.find((item) => !item.archived);
      if (company) { setSelectedCompanyId(company.company_id); syncEditors(company); }
    } catch (error) { notify(error instanceof Error ? error.message : "Could not open the office", "error"); }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  const selectCompany = (companyId: string) => {
    const company = companies.find((item) => item.company_id === companyId);
    if (!company) return;
    setCreatingCompany(false); setSelectedCompanyId(companyId); syncEditors(company); resetBuilder();
  };

  const updateCompanyDraft = <K extends keyof Company>(key: K, value: Company[K]) => { setCompanyDraft((current) => ({ ...current, [key]: value })); setSettingsState("dirty"); };
  const persistCompany = async () => {
    if (!companyDraft.business_name.trim() || settingsState === "saving") return notify("Business name is required", "error");
    setSettingsState("saving");
    try {
      const saved = await officeApi.updateCompany(companyDraft);
      const merged = { ...companyDraft, ...saved, products: productRows, customers: customerRows, events: eventRows };
      setCompanies((current) => current.map((item) => item.company_id === merged.company_id ? merged : item)); setCompanyDraft(clone(merged)); setSettingsState("saved"); notify("Business settings saved");
    } catch (error) { setSettingsState("error"); notify(error instanceof Error ? error.message : "Could not save business settings", "error"); }
  };

  const createCompany = async () => {
    if (!companyDraft.business_name.trim()) return notify("Business name is required", "error");
    setBusy(true);
    try { const company = await officeApi.createCompany(companyDraft); setCompanies((current) => [...current, company]); setCreatingCompany(false); setSelectedCompanyId(company.company_id); syncEditors(company); notify("Business created"); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not create business", "error"); }
    finally { setBusy(false); }
  };

  const archiveCompany = async () => {
    if (!selectedCompany || !window.confirm(`Archive ${selectedCompany.business_name}? Its estimates and history will remain intact.`)) return;
    setBusy(true);
    try {
      await officeApi.archiveCompany(selectedCompany.company_id, selectedCompany.version);
      const next = companies.map((item) => item.company_id === selectedCompany.company_id ? { ...item, archived: true } : item);
      setCompanies(next); const replacement = next.find((item) => !item.archived); if (replacement) selectCompany(replacement.company_id); notify("Business archived — estimate history preserved");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not archive business", "error"); }
    finally { setBusy(false); }
  };

  const syncProducts = useCallback((products: Product[]) => {
    setProductRows(clone(products));
    setCompanies((current) => current.map((item) => item.company_id === selectedCompanyId ? { ...item, products: clone(products) } : item));
    setCompanyDraft((current) => current.company_id === selectedCompanyId ? { ...current, products: clone(products) } : current);
  }, [selectedCompanyId]);

  const updateCustomer = (key: keyof Customer, value: string | boolean) => { setCustomerRows((current) => current.map((item) => item.customer_id === selectedCustomerId ? { ...item, [key]: value } : item)); setRecordState("dirty"); };
  const updateEvent = (key: keyof Event, value: string | number | boolean) => { if (!activeEvent) return; setEventRows((current) => current.map((item) => item.event_id === activeEvent.event_id ? { ...item, [key]: value } : item)); setRecordState("dirty"); };
  const selectCustomer = (customerId: string) => { setSelectedCustomerId(customerId); setSelectedEventId(eventRows.find((item) => item.customer_id === customerId && !item.archived)?.event_id || ""); };

  const persistRecords = async (customers = customerRows, events = eventRows) => {
    if (!selectedCompany || customers.some((item) => !item.archived && !item.customer_name.trim())) return notify("Every active customer needs a name", "error");
    setRecordState("saving");
    try {
      const savedCustomers = await officeApi.updateCustomers(selectedCompany.company_id, customers);
      const savedEvents = await officeApi.updateEvents(selectedCompany.company_id, events);
      setCustomerRows(savedCustomers); setEventRows(savedEvents);
      setCompanies((current) => current.map((item) => item.company_id === selectedCompany.company_id ? { ...item, customers: savedCustomers, events: savedEvents } : item));
      setRecordState("saved"); notify("Customer and event records saved");
    } catch (error) { setRecordState("error"); notify(error instanceof Error ? error.message : "Could not save records", "error"); }
  };

  const addCustomer = () => { const customer = blankCustomer(); setCustomerRows((current) => [...current, customer]); setSelectedCustomerId(customer.customer_id); setSelectedEventId(""); setRecordState("dirty"); };
  const addEvent = () => { if (!activeCustomer) return; const event = blankEvent(activeCustomer.customer_id); setEventRows((current) => [...current, event]); setSelectedEventId(event.event_id); setRecordState("dirty"); };
  const archiveCustomer = async () => {
    if (!activeCustomer || !window.confirm(`Archive ${activeCustomer.customer_name || "this customer"}? Saved estimates will remain available.`)) return;
    const customers = customerRows.map((item) => item.customer_id === activeCustomer.customer_id ? { ...item, archived: true } : item);
    const events = eventRows.map((item) => item.customer_id === activeCustomer.customer_id ? { ...item, archived: true } : item);
    setCustomerRows(customers); setEventRows(events); const next = customers.find((item) => !item.archived); setSelectedCustomerId(next?.customer_id || ""); setSelectedEventId(""); await persistRecords(customers, events);
  };
  const archiveEvent = async () => {
    if (!activeEvent || !window.confirm(`Archive ${activeEvent.event_name || "this event"}? Its estimate history will remain intact.`)) return;
    const events = eventRows.map((item) => item.event_id === activeEvent.event_id ? { ...item, archived: true } : item);
    setEventRows(events); setSelectedEventId(events.find((item) => item.customer_id === selectedCustomerId && !item.archived)?.event_id || ""); await persistRecords(customerRows, events);
  };

  const draft: EstimateDraft = useMemo(() => ({
    company_id: selectedCompanyId, customer_id: estimateCustomer?.customer_id || "", event_id: estimateEventId,
    estimate_number: loadedEstimateNumber, base_revision: baseRevision, line_items: draftItems,
    service_charge_percent: servicePercent, service_charge_taxable: serviceTaxable,
    gratuity_percent: gratuityPercent, gratuity_taxable: gratuityTaxable, deposit_amount: depositAmount,
    notes: estimateNotes, revision_reason: revisionReason || (loadedEstimateNumber ? "Updated estimate" : "Initial estimate"),
  }), [selectedCompanyId, estimateCustomer?.customer_id, estimateEventId, loadedEstimateNumber, baseRevision, draftItems, servicePercent, serviceTaxable, gratuityPercent, gratuityTaxable, depositAmount, estimateNotes, revisionReason]);

  useEffect(() => {
    if (!draftDirty || !estimateEvent || !estimateCustomer || !draftItems.length) { if (!draftItems.length && draftDirty) setPreview(null); return; }
    const timer = window.setTimeout(async () => { try { setPreview(await officeApi.calculateEstimate(draft)); } catch { setPreview(null); } }, 120);
    return () => window.clearTimeout(timer);
  }, [draft, draftDirty]);

  const chooseEstimateEvent = (eventId: string, resetDefaults = true) => {
    const event = selectedCompany?.events.find((item) => item.event_id === eventId);
    setEstimateEventId(eventId);
    if (resetDefaults && event) { setServicePercent(selectedCompany?.default_service_charge_percent || 0); setGratuityPercent(selectedCompany?.default_gratuity_percent || 0); setDepositAmount(event.default_deposit_amount); setDraftDirty(true); }
  };

  const startEstimate = (eventId?: string) => {
    const fallback = eventId || selectedCompany?.events.find((item) => !item.archived)?.event_id || "";
    setActiveTab("estimates"); setEstimateMode("builder"); setEstimateStep(1); setLoadedEstimateNumber(null); setBaseRevision(null); setDraftItems([]); setPreview(null); setRevisionHistory([]); setRevisionReason(""); setEstimateNotes(""); setServiceTaxable(true); setGratuityTaxable(true); chooseEstimateEvent(fallback); setDrawerOpen(false);
  };

  const markDraft = () => setDraftDirty(true);
  const addDraftProduct = (product: Product) => {
    if (!estimateEvent || draftItems.some((item) => item.source_product_id === product.product_id)) return;
    const quantity = defaultProductQuantity(product, estimateEvent);
    setDraftItems((current) => [...current, {
      line_id: makeId("line"), source_product_id: product.product_id, Category: product.Category,
      source_product_version: product.version, catalog_price_cents_at_selection: Math.round(product["Unit Price"] * 100),
      quantity_rule: product.quantity_rule, suggested_quantity: quantity, selected_at: new Date().toISOString(),
      Description: product.Description, Notes: product.Notes, Qty: quantity,
      "Unit Price": product["Unit Price"], pricing_unit: product.pricing_unit, charge_group: product.charge_group,
      tax_class: product.tax_class, is_custom: false, override_reason: "",
    }]); markDraft();
  };
  const addCustomItem = () => {
    setDraftItems((current) => [...current, { line_id: makeId("line"), source_product_id: null, Category: "Custom", Description: "Custom line item", Notes: "", Qty: 1, "Unit Price": 0, pricing_unit: "each", charge_group: "item", tax_class: "taxable", is_custom: true, override_reason: "" }]); markDraft();
  };
  const updateDraftItem = (lineId: string, values: Partial<DraftLineItem>) => { setDraftItems((current) => current.map((item) => item.line_id === lineId ? { ...item, ...values } : item)); markDraft(); };

  const hydrateEstimate = (estimate: Estimate, dirty = false) => {
    const company = companies.find((item) => item.company_id === estimate.company_id);
    if (company && company.company_id !== selectedCompanyId) { setSelectedCompanyId(company.company_id); syncEditors(company); }
    setEstimateEventId(estimate.event_id); setLoadedEstimateNumber(estimate.estimate_number); setBaseRevision(estimate.revision_number);
    setDraftItems(estimate.line_items.map(toDraftLine)); setServicePercent(estimate.service_charge_percent); setServiceTaxable(estimate.service_charge_taxable);
    setGratuityPercent(estimate.gratuity_percent); setGratuityTaxable(estimate.gratuity_taxable); setDepositAmount(estimate.deposit);
    setEstimateNotes(estimate.notes); setRevisionReason(""); setPreview(estimate); setDraftDirty(dirty);
  };

  const openEstimate = async (number: string, step: EstimateStep = 3) => {
    setBusy(true);
    try { const estimate = await officeApi.getEstimate(number); hydrateEstimate(estimate); setRevisionHistory(await officeApi.getRevisions(number)); setEstimateMode("builder"); setEstimateStep(step); setActiveTab("estimates"); notify(`${number} revision ${estimate.revision_number} opened`); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not open estimate", "error"); }
    finally { setBusy(false); }
  };

  const loadRevisionAsDraft = async (revision: number) => {
    if (!loadedEstimateNumber) return;
    setBusy(true);
    try {
      const currentRevision = revisionHistory[0]?.revision_number || baseRevision || revision;
      const estimate = await officeApi.getEstimate(loadedEstimateNumber, revision);
      hydrateEstimate(estimate, true); setBaseRevision(currentRevision); setRevisionReason(`Revised from revision ${revision}`); setEstimateStep(2); notify(`Revision ${revision} loaded as a new draft`);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not load revision", "error"); }
    finally { setBusy(false); }
  };

  const duplicateEstimate = async (number: string) => {
    setBusy(true);
    try { const estimate = await officeApi.getEstimate(number); hydrateEstimate(estimate, true); setLoadedEstimateNumber(null); setBaseRevision(null); setRevisionHistory([]); setRevisionReason("Initial estimate"); setEstimateMode("builder"); setEstimateStep(2); setActiveTab("estimates"); notify(`Copy of ${number} is ready`); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not duplicate estimate", "error"); }
    finally { setBusy(false); }
  };

  const hasMissingOverrideReason = draftItems.some((item) => {
    if (!item.source_product_id) return false;
    const product = selectedCompany?.products.find((candidate) => candidate.product_id === item.source_product_id);
    const selectedPrice = item.catalog_price_cents_at_selection == null
      ? product?.["Unit Price"]
      : item.catalog_price_cents_at_selection / 100;
    return product && Number(selectedPrice) !== Number(item["Unit Price"]) && !item.override_reason.trim();
  });

  const saveEstimate = async () => {
    if (!draftItems.length) return notify("Add at least one line item before saving", "error");
    if (draftItems.some((item) => !item.Description.trim())) return notify("Every line item needs a description", "error");
    if (hasMissingOverrideReason) return notify("Add a reason for every catalog price override", "error");
    if (loadedEstimateNumber && !revisionReason.trim()) return notify("Describe what changed in this revision", "error");
    setBusy(true);
    try {
      const saved = await officeApi.saveEstimate(draft); hydrateEstimate(saved); setBaseRevision(saved.revision_number); setRevisionReason("");
      setEstimates((current) => [estimateToSummary(saved), ...current.filter((item) => item.estimate_number !== saved.estimate_number)]);
      setRevisionHistory(await officeApi.getRevisions(saved.estimate_number)); setEstimateStep(3); notify(`${saved.estimate_number} revision ${saved.revision_number} saved`);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save estimate", "error"); }
    finally { setBusy(false); }
  };

  const archiveEstimate = async (number: string) => {
    if (!window.confirm(`Archive ${number}? All revisions will be preserved.`)) return;
    setBusy(true);
    try {
      const revision = estimates.find((item) => item.estimate_number === number)?.revision_number
        || (loadedEstimateNumber === number ? baseRevision : null);
      if (!revision) throw new Error("Could not determine the current estimate revision");
      await officeApi.archiveEstimate(number, revision);
      setEstimates((current) => current.filter((item) => item.estimate_number !== number));
      if (loadedEstimateNumber === number) resetBuilder();
      notify(`${number} archived — revision history preserved`);
    }
    catch (error) { notify(error instanceof Error ? error.message : "Could not archive estimate", "error"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if (event.key === "Escape" && drawerOpen) setDrawerOpen(false);
      if (!editing && event.key.toLowerCase() === "n") startEstimate();
      if (!editing && event.key === "/") { event.preventDefault(); (document.querySelector("[data-global-search]") as HTMLInputElement | null)?.focus(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && activeTab === "estimates" && estimateMode === "builder") { event.preventDefault(); void saveEstimate(); }
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, activeTab, estimateMode, draft, revisionReason]);

  const activeCompanies = companies.filter((item) => !item.archived);
  const currentEstimates = estimates.filter((item) => item.company_id === selectedCompanyId && !item.archived);
  const totalQuoted = currentEstimates.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const recentEstimates = [...currentEstimates].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
  const upcomingEvents = [...(selectedCompany?.events || [])].filter((item) => !item.archived && parseEventDate(item.event_date)).sort((a, b) => (parseEventDate(a.event_date)?.valueOf() || 0) - (parseEventDate(b.event_date)?.valueOf() || 0)).slice(0, 5);
  const activeCustomers = customerRows.filter((item) => !item.archived);
  const filteredCustomers = activeCustomers.filter((item) => `${item.customer_name} ${item.organization} ${item.customer_email}`.toLowerCase().includes(customerSearch.toLowerCase()));
  const currentCustomerEstimates = currentEstimates.filter((item) => item.customer_id === selectedCustomerId);
  const visibleEstimates = currentEstimates.filter((item) => estimateCustomerFilter === "all" || item.customer_id === estimateCustomerFilter).filter((item) => `${item.estimate_number} ${item.customer_name} ${item.event_name} ${item.event_date}`.toLowerCase().includes(estimateSearch.toLowerCase())).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const drawerCategories = ["All", ...Array.from(new Set((selectedCompany?.products || []).filter((item) => !item.archived).map((item) => item.Category).filter(Boolean))).sort()];
  const drawerProducts = (selectedCompany?.products || []).filter((item) => !item.archived && (drawerCategory === "All" || item.Category === drawerCategory)).filter((item) => `${item.Category} ${item.Description} ${item.Notes}`.toLowerCase().includes(drawerSearch.toLowerCase()));
  const activeTabMeta = tabs.find((item) => item.id === activeTab)!;

  return <>
    <div className="app-shell"><aside className="sidebar"><div className="brand-lockup"><div className="brand-image"><img src="/logo_header.png" alt="Silverspoon Catering" width="1592" height="312" /></div><p>Office workspace</p></div><button className="sidebar-create" onClick={() => startEstimate()}><span>＋</span>New estimate <kbd>N</kbd></button><nav aria-label="Office sections">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "nav-item active" : "nav-item"} onClick={() => setActiveTab(tab.id)}><span className="nav-glyph" aria-hidden="true">{tab.glyph}</span><span><strong>{tab.label}</strong><small>{tab.description}</small></span></button>)}</nav><div className="sidebar-foot"><span className={`status-dot ${mode}`} /><div><strong>{mode === "api" ? "FastAPI connected" : "Demo workspace"}</strong><small>{mode === "api" ? "Immutable JSON revisions" : "Changes stay in this browser"}</small></div></div></aside>
      <main className="workspace"><header className="topbar"><div><p className="topbar-path">Silverspoon <span>/</span> {activeTabMeta.label}</p><h1>{activeTabMeta.label}</h1></div><div className="topbar-actions">{(["estimates", "catalog", "clients"] as Tab[]).includes(activeTab) && <label className="top-search"><span>⌕</span><input data-global-search value={activeTab === "estimates" ? estimateSearch : activeTab === "catalog" ? productSearch : customerSearch} onChange={(event) => activeTab === "estimates" ? setEstimateSearch(event.target.value) : activeTab === "catalog" ? setProductSearch(event.target.value) : setCustomerSearch(event.target.value)} placeholder={`Search ${activeTab === "clients" ? "customers" : activeTab}`} /><kbd>/</kbd></label>}<label className="company-switcher"><span>Workspace</span><select value={selectedCompanyId} onChange={(event) => selectCompany(event.target.value)}>{activeCompanies.map((item) => <option key={item.company_id} value={item.company_id}>{item.business_name}</option>)}</select></label><span className="avatar">{initials(selectedCompany?.business_name || "S")}</span></div></header>
        <div className="content">
          {activeTab === "overview" && <section className="section-stack"><div className="welcome-banner"><div><p className="eyebrow">Good to see you</p><h2>Keep every event moving.</h2><p>Customers, upcoming events, pricing rules, and every estimate revision—together in one reliable workspace.</p></div><button className="button primary large" onClick={() => startEstimate()}>＋ Create estimate</button></div><div className="metric-grid"><div className="metric-card"><span className="metric-icon red">▤</span><div><small>Active estimates</small><strong>{currentEstimates.length}</strong><p>Current revision of each estimate</p></div></div><div className="metric-card"><span className="metric-icon amber">$</span><div><small>Total quoted</small><strong>{formatMoney(totalQuoted)}</strong><p>Across active estimates</p></div></div><div className="metric-card"><span className="metric-icon green">◎</span><div><small>Customers</small><strong>{selectedCompany?.customers.filter((item) => !item.archived).length || 0}</strong><p>Separate from their events</p></div></div><div className="metric-card"><span className="metric-icon blue">◇</span><div><small>Upcoming events</small><strong>{upcomingEvents.length}</strong><p>Ready for an estimate</p></div></div></div><div className="overview-grid"><div className="panel overview-panel"><div className="card-heading"><div><h3>Recent estimates</h3><p>Open the latest immutable revision</p></div><button className="text-button" onClick={() => setActiveTab("estimates")}>View all</button></div>{recentEstimates.length ? <div className="activity-list">{recentEstimates.map((item) => <button key={item.estimate_number} className="activity-row" onClick={() => void openEstimate(item.estimate_number)}><span className="document-icon">▤</span><span className="activity-main"><strong>{item.estimate_number} · r{item.revision_number}</strong><small>{item.customer_name} · {item.event_name}</small></span><span className="status-badge">Saved</span><strong className="activity-total">{formatMoney(item.total)}</strong><span className="row-arrow">›</span></button>)}</div> : <EmptyState title="No estimates yet" detail="Create the first estimate for this company." action={<button className="button primary" onClick={() => startEstimate()}>Create estimate</button>} />}</div><div className="panel overview-panel"><div className="card-heading"><div><h3>Upcoming events</h3><p>Event details are reusable across revisions</p></div><button className="text-button" onClick={() => setActiveTab("clients")}>Manage</button></div>{upcomingEvents.length ? <div className="event-list">{upcomingEvents.map((item) => { const customer = selectedCompany?.customers.find((candidate) => candidate.customer_id === item.customer_id); const date = parseEventDate(item.event_date); return <button key={item.event_id} className="event-row" onClick={() => startEstimate(item.event_id)}><span className="date-tile"><strong>{date?.getUTCDate() || "—"}</strong><small>{date ? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date) : "TBD"}</small></span><span><strong>{item.event_name || item.event_type}</strong><small>{customer?.customer_name} · {item.venue || "Venue not set"} · {item.guest_count} guests</small></span><span className="row-arrow">›</span></button>; })}</div> : <EmptyState title="No upcoming events" detail="Add an event to a customer record to start planning." />}</div></div><div className="quick-actions"><button onClick={() => startEstimate()}><span>＋</span><div><strong>New estimate</strong><small>Start from an event</small></div><b>›</b></button><button onClick={() => { setActiveTab("clients"); addCustomer(); }}><span>◎</span><div><strong>Add customer</strong><small>Create a reusable contact</small></div><b>›</b></button><button onClick={() => setActiveTab("catalog")}><span>▦</span><div><strong>Pricing rules</strong><small>Review catalog behavior</small></div><b>›</b></button></div></section>}

          {activeTab === "estimates" && <section className="section-stack">{estimateMode === "list" ? <><SectionHeader eyebrow="Proposals & history" title="Estimates" detail="Every save creates an immutable revision. Archived records remain available to the backend." actions={<button className="button primary" onClick={() => startEstimate()}>＋ Create estimate</button>} /><div className="filter-bar panel"><label className="inline-search"><span>⌕</span><input value={estimateSearch} onChange={(event) => setEstimateSearch(event.target.value)} placeholder="Number, customer, or event" /></label><select value={estimateCustomerFilter} onChange={(event) => setEstimateCustomerFilter(event.target.value)}><option value="all">All customers</option>{selectedCompany?.customers.filter((item) => !item.archived).map((item) => <option key={item.customer_id} value={item.customer_id}>{item.customer_name}</option>)}</select><span className="result-count">{visibleEstimates.length} estimates</span></div><div className="panel table-panel">{visibleEstimates.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Estimate</th><th>Customer</th><th>Event</th><th>Date</th><th>Revision</th><th className="number-cell">Total</th><th /></tr></thead><tbody>{visibleEstimates.map((item) => <tr key={item.estimate_number}><td><button className="estimate-link" onClick={() => void openEstimate(item.estimate_number)}>{item.estimate_number}</button><small>{displayTimestamp(item.updated_at)}</small></td><td><strong>{item.customer_name}</strong></td><td>{item.event_name}</td><td>{displayDate(item.event_date)}</td><td><span className="revision-badge">r{item.revision_number}</span></td><td className="number-cell"><strong>{formatMoney(item.total)}</strong></td><td><div className="row-actions"><button onClick={() => void openEstimate(item.estimate_number)}>Open</button><button onClick={() => void duplicateEstimate(item.estimate_number)}>Duplicate</button><button className="danger-action" onClick={() => void archiveEstimate(item.estimate_number)}>Archive</button></div></td></tr>)}</tbody></table></div> : <EmptyState title="No matching estimates" detail="Try another search or create a new estimate." action={<button className="button primary" onClick={() => startEstimate()}>Create estimate</button>} />}</div></> : <><div className="builder-heading"><button className="back-link" onClick={resetBuilder}>← All estimates</button><div><p className="eyebrow">{loadedEstimateNumber ? `${loadedEstimateNumber} · base revision ${baseRevision}` : "New estimate"}</p><h2>{estimateStep === 1 ? "Choose an event" : estimateStep === 2 ? "Build the estimate" : "Review & save"}</h2></div><span className={`save-indicator ${draftDirty ? "dirty" : "saved"}`}><i />{draftDirty ? "Draft has changes" : loadedEstimateNumber ? "Saved revision" : "New draft"}</span></div><div className="stepper panel">{([1, 2, 3] as EstimateStep[]).map((step) => <button key={step} className={estimateStep === step ? "active" : estimateStep > step ? "complete" : ""} onClick={() => step === 1 || estimateEventId ? setEstimateStep(step) : undefined}><span>{estimateStep > step ? "✓" : step}</span><div><strong>{step === 1 ? "Event" : step === 2 ? "Scope & pricing" : "Review"}</strong><small>{step === 1 ? "Customer context" : step === 2 ? "Lines and charges" : "Revision & PDF"}</small></div>{step < 3 && <i />}</button>)}</div>
            {estimateStep === 1 && <div className="builder-stage client-stage"><div className="panel stage-card"><div className="stage-heading"><span>01</span><div><h3>Select the event to estimate</h3><p>The customer, tax profile, staffing plan, and headcount come from the event record.</p></div></div><Select label="Customer · event" value={estimateEventId} onChange={(value) => chooseEstimateEvent(value)}><option value="">Choose an event</option>{selectedCompany?.customers.filter((item) => !item.archived).map((customer) => <optgroup key={customer.customer_id} label={customer.customer_name}>{selectedCompany.events.filter((item) => item.customer_id === customer.customer_id && !item.archived).map((event) => <option key={event.event_id} value={event.event_id}>{event.event_name || event.event_type} · {displayDate(event.event_date)}</option>)}</optgroup>)}</Select>{estimateEvent && <div className="event-preview-grid"><div><span>Customer</span><strong>{estimateCustomer?.customer_name}</strong></div><div><span>Event</span><strong>{estimateEvent.event_name || estimateEvent.event_type}</strong></div><div><span>Date</span><strong>{displayDate(estimateEvent.event_date)}</strong></div><div><span>Venue</span><strong>{estimateEvent.venue || "Not set"}</strong></div><div><span>Guests</span><strong>{estimateEvent.guest_count}</strong></div><div><span>Tax</span><strong>{estimateEvent.charge_tax ? `${estimateEvent.tax_percent}%` : "Not charged"}</strong></div></div>}<div className="stage-actions"><button className="button ghost" onClick={() => { setActiveTab("clients"); if (estimateEvent) { selectCustomer(estimateEvent.customer_id); setSelectedEventId(estimateEvent.event_id); } }}>Edit event details</button><button className="button primary" disabled={!estimateEventId} onClick={() => setEstimateStep(2)}>Continue to scope →</button></div></div></div>}
            {estimateStep === 2 && <div className="builder-stage items-stage"><div className="panel items-workspace"><div className="items-toolbar"><div><h3>Line items</h3><p>Catalog rules suggest quantities; every value remains editable.</p></div><div className="toolbar-actions"><button className="button ghost" onClick={addCustomItem}>＋ Custom item</button><button className="button secondary" onClick={() => setDrawerOpen(true)}>＋ From catalog</button></div></div>{draftItems.length ? <div className="builder-table-wrap"><table className="builder-table phase-one-table"><thead><tr><th>Item</th><th>Group / tax</th><th>Qty</th><th>Unit price</th><th>Amount</th><th /></tr></thead><tbody>{draftItems.map((item) => { const source = item.source_product_id ? selectedCompany?.products.find((product) => product.product_id === item.source_product_id) : null; const selectedPrice = item.catalog_price_cents_at_selection == null ? source?.["Unit Price"] : item.catalog_price_cents_at_selection / 100; const overridden = Boolean(source && Number(selectedPrice) !== Number(item["Unit Price"])); return <tr key={item.line_id}><td><span className="category-pill">{item.is_custom ? "Custom" : item.Category || "Uncategorized"}</span>{item.is_custom ? <><input className="line-title-input" value={item.Description} onChange={(event) => updateDraftItem(item.line_id, { Description: event.target.value })} /><input value={item.Category} placeholder="Category" onChange={(event) => updateDraftItem(item.line_id, { Category: event.target.value })} /></> : <strong>{item.Description}</strong>}<input value={item.Notes} placeholder="Line note" onChange={(event) => updateDraftItem(item.line_id, { Notes: event.target.value })} />{overridden && <input className={item.override_reason.trim() ? "override-reason" : "override-reason missing"} value={item.override_reason} placeholder="Required: reason for price override" onChange={(event) => updateDraftItem(item.line_id, { override_reason: event.target.value })} />}</td><td><select value={item.charge_group} onChange={(event) => updateDraftItem(item.line_id, { charge_group: event.target.value as ChargeGroup })}>{chargeGroups.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select value={item.tax_class} onChange={(event) => updateDraftItem(item.line_id, { tax_class: event.target.value as TaxClass })}><option value="taxable">Taxable</option><option value="non_taxable">Non-taxable</option></select></td><td><input className="quantity-input" type="number" min="0" step="any" value={item.Qty} onChange={(event) => updateDraftItem(item.line_id, { Qty: Number(event.target.value) })} /><small>{item.pricing_unit}</small></td><td><div className={overridden ? "money-input overridden" : "money-input"}><span>$</span><input type="number" min="0" step="0.01" value={item["Unit Price"]} onChange={(event) => updateDraftItem(item.line_id, { "Unit Price": Number(event.target.value), override_reason: Number(event.target.value) === Number(selectedPrice) ? "" : item.override_reason })} /></div>{overridden && <small>Selected price: {formatMoney(selectedPrice)}</small>}</td><td className="number-cell"><strong>{formatMoney(item.Qty * item["Unit Price"])}</strong></td><td><button className="remove-line" aria-label={`Remove ${item.Description}`} onClick={() => { setDraftItems((current) => current.filter((line) => line.line_id !== item.line_id)); markDraft(); }}>×</button></td></tr>; })}</tbody></table></div> : <EmptyState title="Build the scope" detail="Add reusable catalog products or a one-off custom line item." action={<div className="empty-actions"><button className="button secondary" onClick={() => setDrawerOpen(true)}>Browse catalog</button><button className="button ghost" onClick={addCustomItem}>Add custom item</button></div>} />}<div className="stage-actions items-actions"><button className="button ghost" onClick={() => setEstimateStep(1)}>← Event</button><div><button className="button secondary" onClick={() => setDrawerOpen(true)}>＋ Add items</button><button className="button primary" disabled={!draftItems.length || hasMissingOverrideReason} onClick={() => setEstimateStep(3)}>Review estimate →</button></div></div></div><aside className="builder-summary"><div className="summary-client-card"><span>Prepared for</span><strong>{estimateCustomer?.customer_name}</strong><small>{estimateEvent?.event_name} · {displayDate(estimateEvent?.event_date || "")}</small></div><div className="panel commercial-card"><div className="card-heading"><div><h3>Commercial terms</h3><p>Separate charges with explicit tax treatment</p></div></div><div className="commercial-grid"><Field label="Service charge %" type="number" min={0} value={servicePercent} onChange={(value) => { setServicePercent(Number(value)); markDraft(); }} /><Toggle checked={serviceTaxable} onChange={(value) => { setServiceTaxable(value); markDraft(); }} label="Tax service charge" detail="Include in taxable subtotal" /><Field label="Gratuity %" type="number" min={0} value={gratuityPercent} onChange={(value) => { setGratuityPercent(Number(value)); markDraft(); }} /><Toggle checked={gratuityTaxable} onChange={(value) => { setGratuityTaxable(value); markDraft(); }} label="Tax gratuity" detail="Include in taxable subtotal" /><Field label="Deposit" type="number" min={0} value={depositAmount} onChange={(value) => { setDepositAmount(Number(value)); markDraft(); }} /><TextField label="Estimate notes" value={estimateNotes} placeholder="Scope assumptions or terms" onChange={(value) => { setEstimateNotes(value); markDraft(); }} /></div></div><EstimateTotals estimate={preview} /></aside></div>}
            {estimateStep === 3 && <div className="builder-stage review-stage"><div className="panel review-document"><div className="review-document-head"><img src="/logo_header.png" alt="Silverspoon Catering" width="1592" height="312" /><div><span>{loadedEstimateNumber ? `${loadedEstimateNumber} · revision ${preview?.revision_number || baseRevision || 1}` : "Estimate preview"}</span><strong>{estimateCustomer?.customer_name}</strong></div></div><div className="snapshot-callout"><span>◇</span><div><strong>Snapshot-safe document</strong><p>Saving captures the customer, event, business, line prices, rules, and totals exactly as shown. Future catalog edits will not change this revision.</p></div></div><div className="review-event"><div><span>Event</span><strong>{estimateEvent?.event_name}</strong></div><div><span>Date</span><strong>{displayDate(estimateEvent?.event_date || "")}</strong></div><div><span>Venue</span><strong>{estimateEvent?.venue || "Not set"}</strong></div><div><span>Guests</span><strong>{estimateEvent?.guest_count}</strong></div></div><div className="review-lines"><div className="review-line header"><span>Description</span><span>Qty</span><span>Amount</span></div>{draftItems.map((item) => <div className="review-line" key={item.line_id}><span><strong>{item.Description}</strong><small>{chargeGroups.find((group) => group.value === item.charge_group)?.label} · {item.tax_class === "taxable" ? "Taxable" : "Non-taxable"}{item.override_reason ? ` · Override: ${item.override_reason}` : ""}</small></span><span>{item.Qty}</span><span>{formatMoney(item.Qty * item["Unit Price"])}</span></div>)}</div>{estimateNotes && <div className="review-note"><strong>Estimate notes</strong><p>{estimateNotes}</p></div>}</div><aside className="review-sidebar"><EstimateTotals estimate={preview} /><div className="panel review-actions"><Field label={loadedEstimateNumber ? "Revision note (required)" : "Revision note"} value={revisionReason} placeholder={loadedEstimateNumber ? "What changed?" : "Initial estimate"} onChange={(value) => { setRevisionReason(value); markDraft(); }} /><button className="button primary wide" disabled={busy || !draftItems.length || hasMissingOverrideReason} onClick={() => void saveEstimate()}>{busy ? "Saving…" : loadedEstimateNumber ? "Save new revision" : "Save estimate"}</button><button className="button secondary wide" disabled={!preview} onClick={() => preview && officeApi.downloadPdf(draft, preview).catch((error) => notify(error.message, "error"))}>⇩ {mode === "api" ? "Download PDF" : "Print / save PDF"}</button><button className="button ghost wide" onClick={() => setEstimateStep(2)}>← Edit scope</button>{loadedEstimateNumber && <button className="text-danger centered" onClick={() => void archiveEstimate(loadedEstimateNumber)}>Archive {loadedEstimateNumber}</button>}<small className="shortcut-note"><kbd>⌘</kbd> + <kbd>S</kbd> to save</small></div>{loadedEstimateNumber && <div className="panel revision-card"><div className="card-heading"><div><h3>Revision history</h3><p>Immutable saved snapshots</p></div></div><div className="revision-list">{revisionHistory.map((revision) => <div key={revision.revision_id} className={revision.revision_number === baseRevision && !draftDirty ? "revision-row current" : "revision-row"}><span className="revision-number">r{revision.revision_number}</span><span><strong>{revision.revision_reason}</strong><small>{displayTimestamp(revision.updated_at)} · {formatMoney(revision.total)}</small></span><button onClick={() => void loadRevisionAsDraft(revision.revision_number)}>Use as draft</button></div>)}</div></div>}</aside></div>}
          </>}</section>}

          {activeTab === "clients" && <section className="section-stack"><SectionHeader eyebrow="Reusable customer records" title="Customers & Events" detail="A customer can have many events. Archiving either record never removes saved estimates." actions={<><SaveIndicator state={recordState} /><button className="button secondary" onClick={addCustomer}>＋ Add customer</button><button className="button primary" disabled={recordState === "saved" || recordState === "saving"} onClick={() => void persistRecords()}>Save records</button></>} />{!selectedCompany ? <EmptyState title="Create a business first" detail="Customer records belong to a business workspace." /> : <div className="client-layout"><aside className="panel client-list-panel"><label className="inline-search client-search"><span>⌕</span><input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search customers" /></label><div className="list-title"><strong>{filteredCustomers.length} customers</strong><small>Select a customer to see their events</small></div><div className="client-list">{filteredCustomers.map((customer) => { const events = eventRows.filter((item) => item.customer_id === customer.customer_id && !item.archived); const nextEvent = events[0]; return <button key={customer.customer_id} className={selectedCustomerId === customer.customer_id ? "client-card active" : "client-card"} onClick={() => selectCustomer(customer.customer_id)}><span className="client-avatar">{initials(customer.customer_name)}</span><span><strong>{customer.customer_name || "New customer"}</strong><small>{customer.organization || `${events.length} event${events.length === 1 ? "" : "s"}`}</small><em>{nextEvent ? `${nextEvent.event_name || nextEvent.event_type} · ${displayDate(nextEvent.event_date)}` : "No active events"}</em></span><b>›</b></button>; })}</div>{!filteredCustomers.length && <div className="mini-empty"><p>No customers match your search.</p></div>}</aside><div className="client-detail-stack">{!activeCustomer ? <div className="panel"><EmptyState title="Select a customer" detail="Choose a customer on the left or add a new one." /></div> : <><div className="panel client-hero"><div className="client-hero-avatar">{initials(activeCustomer.customer_name)}</div><div><p className="eyebrow">Customer profile</p><h2>{activeCustomer.customer_name || "New customer"}</h2><p>{activeCustomer.organization || "Individual customer"} · {customerEvents.length} active event{customerEvents.length === 1 ? "" : "s"}</p></div><div className="client-hero-actions"><button className="button secondary" onClick={addEvent}>＋ Add event</button><button className="text-danger" onClick={() => void archiveCustomer()}>Archive customer</button></div></div><div className="panel form-panel customer-form"><div className="form-section"><div className="form-section-heading"><span>01</span><div><h3>Customer details</h3><p>Reusable contact and billing information, independent of any event.</p></div></div><div className="form-grid three"><Field label="Customer name" value={activeCustomer.customer_name} onChange={(value) => updateCustomer("customer_name", value)} /><Field label="Organization" value={activeCustomer.organization} onChange={(value) => updateCustomer("organization", value)} /><Field label="Email" type="email" value={activeCustomer.customer_email} onChange={(value) => updateCustomer("customer_email", value)} /><Field label="Phone" type="tel" value={activeCustomer.customer_phone} onChange={(value) => updateCustomer("customer_phone", value)} /><TextField label="Billing address" value={activeCustomer.billing_address} onChange={(value) => updateCustomer("billing_address", value)} /><TextField label="Internal notes" value={activeCustomer.internal_notes} onChange={(value) => updateCustomer("internal_notes", value)} /></div></div></div><div className="panel event-workspace"><div className="card-heading"><div><h3>Events</h3><p>Choose an event to manage planning and billing defaults.</p></div><button className="text-button" onClick={addEvent}>＋ Add event</button></div>{customerEvents.length ? <><div className="event-tabs">{customerEvents.map((event) => <button key={event.event_id} className={activeEvent?.event_id === event.event_id ? "active" : ""} onClick={() => setSelectedEventId(event.event_id)}><strong>{event.event_name || "New event"}</strong><small>{displayDate(event.event_date)} · {event.guest_count} guests</small></button>)}</div>{activeEvent && <div className="event-editor"><div className="event-editor-head"><div><span className="category-pill">Event record</span><h3>{activeEvent.event_name || "New event"}</h3></div><div><button className="button secondary" onClick={() => startEstimate(activeEvent.event_id)}>Create estimate</button><button className="text-danger" onClick={() => void archiveEvent()}>Archive event</button></div></div><div className="form-grid three"><Field label="Event name" value={activeEvent.event_name} placeholder="Jordan & Alex wedding" onChange={(value) => updateEvent("event_name", value)} /><Field label="Event type" value={activeEvent.event_type} onChange={(value) => updateEvent("event_type", value)} /><Field label="Event date" value={activeEvent.event_date} placeholder="YYYY-MM-DD" onChange={(value) => updateEvent("event_date", value)} /><Field label="Venue" value={activeEvent.venue} onChange={(value) => updateEvent("venue", value)} /><Field label="Guest count" type="number" min={1} value={activeEvent.guest_count} onChange={(value) => updateEvent("guest_count", Number(value))} /><Field label="Utensil buffer" type="number" min={0} value={activeEvent.utensils_buffer} onChange={(value) => updateEvent("utensils_buffer", Number(value))} /></div><div className="event-subsection"><h4>Staffing plan</h4><div className="form-grid four"><Field label="Servers" type="number" min={0} value={activeEvent.servers_count} onChange={(value) => updateEvent("servers_count", Number(value))} /><Field label="Server hours" type="number" min={0} value={activeEvent.servers_hours} onChange={(value) => updateEvent("servers_hours", Number(value))} /><Field label="Kitchen staff" type="number" min={0} value={activeEvent.kitchen_staff_count} onChange={(value) => updateEvent("kitchen_staff_count", Number(value))} /><Field label="Kitchen hours" type="number" min={0} value={activeEvent.kitchen_staff_hours} onChange={(value) => updateEvent("kitchen_staff_hours", Number(value))} /></div></div><div className="event-subsection"><h4>Billing defaults</h4><div className="form-grid three align-end"><Field label="Default deposit" type="number" min={0} value={activeEvent.default_deposit_amount} onChange={(value) => updateEvent("default_deposit_amount", Number(value))} /><Toggle checked={activeEvent.charge_tax} onChange={(value) => updateEvent("charge_tax", value)} label="Charge tax" detail="Apply the event tax rate" />{activeEvent.charge_tax && <Field label="Tax percentage" type="number" min={0} value={activeEvent.tax_percent} onChange={(value) => updateEvent("tax_percent", Number(value))} />}</div></div></div>}</> : <EmptyState title="No events yet" detail="Add an event before creating an estimate for this customer." action={<button className="button secondary" onClick={addEvent}>Add event</button>} />}</div><div className="panel client-estimates"><div className="card-heading"><div><h3>Customer estimates</h3><p>Current revisions for {activeCustomer.customer_name || "this customer"}</p></div></div>{currentCustomerEstimates.length ? <div className="activity-list compact-list">{currentCustomerEstimates.map((item) => <button key={item.estimate_number} className="activity-row" onClick={() => void openEstimate(item.estimate_number)}><span className="document-icon">▤</span><span className="activity-main"><strong>{item.estimate_number} · r{item.revision_number}</strong><small>{item.event_name} · {displayDate(item.event_date)}</small></span><span className="status-badge">Saved</span><strong className="activity-total">{formatMoney(item.total)}</strong><span className="row-arrow">›</span></button>)}</div> : <p className="no-records">No estimates saved for this customer yet.</p>}</div></>}</div></div>}</section>}

          {activeTab === "catalog" && (selectedCompany ? <ProductStudio company={selectedCompany} products={productRows} search={productSearch} onSearchChange={setProductSearch} onProductsChange={syncProducts} notify={notify} /> : <section className="section-stack"><SectionHeader eyebrow="Reusable product catalog" title="Product Studio" detail="Create a business workspace before adding products." /><EmptyState title="Create a business first" detail="Products and pricing rules belong to a business workspace." /></section>)}

          {activeTab === "settings" && <section className="section-stack"><SectionHeader eyebrow="Branding & defaults" title={creatingCompany ? "Create a business" : "Business Settings"} detail="Reusable business details and percentage defaults for new estimates." actions={<>{!creatingCompany && <SaveIndicator state={settingsState} />}<button className="button secondary" onClick={() => { setCreatingCompany(true); setCompanyDraft(blankCompany()); setSettingsState("dirty"); }}>＋ New business</button></>} /><div className="settings-layout"><div className="settings-stack"><div className="panel settings-card"><div className="form-section-heading"><span>01</span><div><h3>Business profile</h3><p>Contact information captured in every saved revision.</p></div></div><div className="form-grid two"><Field label="Business name" value={companyDraft.business_name} onChange={(value) => updateCompanyDraft("business_name", value)} /><Field label="Business email" type="email" value={companyDraft.business_email} onChange={(value) => updateCompanyDraft("business_email", value)} /><Field label="Business phone" type="tel" value={companyDraft.business_phone} onChange={(value) => updateCompanyDraft("business_phone", value)} /><TextField label="Business address" value={companyDraft.business_address} onChange={(value) => updateCompanyDraft("business_address", value)} /></div></div><div className="panel settings-card"><div className="form-section-heading"><span>02</span><div><h3>New-estimate defaults</h3><p>Service charge and gratuity remain separate, editable commercial terms.</p></div></div><div className="form-grid two"><Field label="Default service charge %" type="number" min={0} value={companyDraft.default_service_charge_percent} onChange={(value) => updateCompanyDraft("default_service_charge_percent", Number(value))} /><Field label="Default gratuity %" type="number" min={0} value={companyDraft.default_gratuity_percent} onChange={(value) => updateCompanyDraft("default_gratuity_percent", Number(value))} /></div></div><div className="panel settings-card"><div className="form-section-heading"><span>03</span><div><h3>Estimate document</h3><p>Reusable language snapshotted with the saved estimate.</p></div></div><TextField label="Payment terms" value={companyDraft.payment_terms} onChange={(value) => updateCompanyDraft("payment_terms", value)} /><TextField label="Default estimate note" value={companyDraft.estimate_notes} onChange={(value) => updateCompanyDraft("estimate_notes", value)} /></div><div className="settings-actions">{creatingCompany ? <><button className="button primary" disabled={busy} onClick={() => void createCompany()}>{busy ? "Creating…" : "Create business"}</button><button className="button ghost" onClick={() => { setCreatingCompany(false); if (selectedCompany) setCompanyDraft(clone(selectedCompany)); setSettingsState("saved"); }}>Cancel</button></> : <><button className="button primary" disabled={settingsState === "saved" || settingsState === "saving"} onClick={() => void persistCompany()}>Save settings</button><button className="text-danger" onClick={() => void archiveCompany()}>Archive this business</button></>}</div></div><aside className="panel document-preview-card"><div className="preview-browser-bar"><i /><i /><i /><span>Revision snapshot</span></div><div className="preview-paper"><img src="/logo_header.png" alt="Company logo" width="1592" height="312" /><div className="preview-meta"><span>Customer: Sample Customer</span><span>Estimate EST-0000 · r1</span></div><div className="preview-rule" /><div className="preview-faux-table"><span /><span /><span /><span /><span /><span /></div><div className="preview-message">{companyDraft.estimate_notes || "Your estimate note will appear here."}</div><div className="preview-total"><span>Total</span><strong>$0.00</strong></div><div className="preview-contact">{[companyDraft.business_phone, companyDraft.business_email, companyDraft.business_address].filter(Boolean).join(" · ") || "Your business contact information"}</div></div></aside></div></section>}
        </div></main></div>

    {drawerOpen && <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}><aside className="item-drawer" role="dialog" aria-modal="true" aria-labelledby="catalog-drawer-title"><div className="drawer-head"><div><p className="eyebrow">Estimate catalog</p><h2 id="catalog-drawer-title">Add items</h2><p>Explicit quantity rules use {estimateEvent?.event_name || "the selected event"}&apos;s planning details.</p></div><button className="drawer-close" aria-label="Close item catalog" onClick={() => setDrawerOpen(false)}>×</button></div><label className="inline-search drawer-search"><span>⌕</span><input autoFocus value={drawerSearch} onChange={(event) => setDrawerSearch(event.target.value)} placeholder="Search menu, staff, or services" /></label><div className="category-chips drawer-chips">{drawerCategories.map((category) => <button key={category} className={drawerCategory === category ? "active" : ""} onClick={() => setDrawerCategory(category)}>{category}</button>)}</div><div className="drawer-list">{drawerProducts.map((product) => { const added = draftItems.some((item) => item.source_product_id === product.product_id); const quantity = estimateEvent ? defaultProductQuantity(product, estimateEvent) : 1; return <article key={product.product_id} className={added ? "drawer-product added" : "drawer-product"}><div><span className="category-pill">{product.Category || "Uncategorized"}</span><h3>{product.Description}</h3><p>{product.Notes || chargeGroups.find((item) => item.value === product.charge_group)?.label} · {formatMoney(product["Unit Price"])} / {product.pricing_unit}</p><small>{quantityRules.find((item) => item.value === product.quantity_rule)?.label}: suggested qty {quantity}</small></div>{added ? <button onClick={() => { setDraftItems((current) => current.filter((item) => item.source_product_id !== product.product_id)); markDraft(); }}>✓ Added</button> : <button onClick={() => addDraftProduct(product)}>＋ Add</button>}</article>; })}</div><div className="drawer-footer"><span><strong>{draftItems.length}</strong> lines in estimate</span><div><button className="button ghost" onClick={addCustomItem}>＋ Custom</button><button className="button primary" onClick={() => setDrawerOpen(false)}>Done</button></div></div></aside></div>}
    {toast && <div className={`toast ${toast.tone}`}><span>{toast.tone === "success" ? "✓" : "!"}</span><strong>{toast.message}</strong></div>}
    <EstimateDocument estimate={preview} />
  </>;
}
