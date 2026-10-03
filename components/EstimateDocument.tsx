"use client";

/* eslint-disable @next/next/no-img-element -- a plain image preserves predictable browser-print dimensions. */

import type { ChargeGroup, Estimate } from "@/lib/types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const quantity = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const groups: Array<{ key: ChargeGroup; label: string }> = [
  { key: "item", label: "Menu & Food" },
  { key: "staff", label: "Staffing" },
  { key: "service", label: "Service" },
  { key: "delivery", label: "Delivery" },
  { key: "gratuity", label: "Gratuity" },
];

function formatMoney(value: number): string {
  return value < 0 ? `−${currency.format(Math.abs(value))}` : currency.format(value || 0);
}

function formatDate(value: string): string {
  if (!value) return "Not set";
  const parts = value.trim().split(/[./-]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
  const [first, second, third] = parts;
  const date = first > 999 ? new Date(Date.UTC(first, second - 1, third)) : new Date(Date.UTC(third, first - 1, second));
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function summaryRows(estimate: Estimate) {
  const groupRows = [
    ["Food & items", estimate.items_subtotal],
    ["Staffing", estimate.staff_total],
    ["Service items", estimate.service_items_total],
    ["Delivery", estimate.delivery_charge],
    ["Gratuity items", estimate.gratuity_items_total],
  ].filter(([, value]) => Number(value) !== 0).map(([label, value]) => ({ label: String(label), value: Number(value), kind: "group" }));
  const adjustments = [
    { label: `Service charge (${quantity.format(estimate.service_charge_percent)}%)`, value: estimate.service_charge },
    { label: `Gratuity (${quantity.format(estimate.gratuity_percent)}%)`, value: estimate.gratuity },
    { label: `Tax (${quantity.format(estimate.tax_percent)}%)`, value: estimate.tax },
  ].filter((row) => Number(row.value) !== 0).map((row) => ({ ...row, kind: "adjustment" }));
  return [
    ...groupRows,
    ...(groupRows.length > 1 || adjustments.length ? [{ label: "Line subtotal", value: estimate.subtotal, kind: "subtotal" }] : []),
    ...adjustments,
    { label: "Total", value: estimate.total, kind: "total" },
    ...(estimate.deposit ? [{ label: "Deposit", value: -estimate.deposit, kind: "deposit" }] : []),
    { label: "Balance due", value: estimate.balance_due, kind: "balance" },
  ];
}

export default function EstimateDocument({ estimate }: { estimate: Estimate | null }) {
  if (!estimate) return null;
  const lineGroups = groups.map((group) => ({
    ...group,
    items: estimate.line_items.filter((item) => item.charge_group === group.key),
  })).filter((group) => group.items.length);
  const customerDetails = [
    estimate.customer?.organization,
    estimate.customer_email,
    estimate.customer_phone,
    estimate.billing_address,
  ].filter(Boolean);
  const eventDetails = [formatDate(estimate.event_date), estimate.venue, `${quantity.format(estimate.guest_count)} guests`].filter(Boolean);
  const businessContact = [
    estimate.business.business_phone,
    estimate.business.business_email,
    estimate.business.business_address,
  ].filter(Boolean).join(" | ");
  const defaultNote = estimate.business.estimate_notes?.trim();
  const estimateNote = estimate.notes?.trim();
  const paymentTerms = estimate.business.payment_terms?.trim();

  return <article className="print-estimate">
    <header className="print-doc-header">
      <img src="/logo_header.png" alt="Silverspoon Catering" width="1592" height="312" />
      <div><span>Estimate</span><h1>{estimate.estimate_number}</h1><p>{estimate.revision_number ? `Revision ${estimate.revision_number}` : "Draft"} | Issued {formatDate(estimate.issue_date)} | USD</p></div>
    </header>

    <section className="print-summary-grid">
      <div className="print-summary-card"><span>Prepared for</span><h2>{estimate.customer_name}</h2>{customerDetails.map((detail) => <p key={detail}>{detail}</p>)}</div>
      <div className="print-summary-card"><span>Event details</span><h2>{estimate.event_name || estimate.event_type}</h2>{eventDetails.map((detail) => <p key={detail}>{detail}</p>)}</div>
    </section>

    <section className="print-scope">
      <div className="print-section-heading"><h2>Scope &amp; pricing</h2><span>{estimate.line_items.length} line{estimate.line_items.length === 1 ? "" : "s"}</span></div>
      <table className="print-items"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>{lineGroups.map((group) => <tbody key={group.key}><tr className="print-group-row"><th colSpan={5}>{group.label}</th></tr>{group.items.map((item) => <tr key={item.line_id}><td><span>{item.Category || "Uncategorized"}</span><strong>{item.Description}</strong>{item.Notes && <small>{item.Notes}</small>}</td><td>{quantity.format(item.Qty)}</td><td>{item.pricing_unit === "flat" ? "flat" : item.pricing_unit}</td><td>{formatMoney(item["Unit Price"])}</td><td>{formatMoney(item["Line Total"])}</td></tr>)}</tbody>)}</table>
    </section>

    <section className="print-financial-summary">
      <div className="print-notes-card"><span>Notes &amp; terms</span>{defaultNote && <div><h3>About this estimate</h3><p>{defaultNote}</p></div>}{estimateNote && estimateNote !== defaultNote && <div><h3>Estimate notes</h3><p>{estimateNote}</p></div>}{paymentTerms && <div><h3>Payment terms</h3><p>{paymentTerms}</p></div>}{!defaultNote && !estimateNote && !paymentTerms && <p>No additional notes or payment terms.</p>}</div>
      <div className="print-totals-card">{summaryRows(estimate).map((row) => <div key={`${row.kind}-${row.label}`} className={`print-summary-row ${row.kind}`}><span>{row.label}</span><strong>{formatMoney(row.value)}</strong></div>)}</div>
    </section>

    <footer className="print-doc-footer"><span>{businessContact || estimate.company_name}</span><span>{estimate.estimate_number}</span></footer>
  </article>;
}
