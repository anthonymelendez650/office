from __future__ import annotations

import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

APP_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = APP_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
ESTIMATES_DIR = DATA_DIR / "estimates"
SETTINGS_FILE = DATA_DIR / "settings.json"
COUNTER_FILE = DATA_DIR / "counter.json"
HEADER_LOGO_FILE = PROJECT_ROOT / "images" / "logo_header.png"

TWOPLACES = Decimal("0.01")

DEFAULT_SETTINGS = {
    "business_name": "Premium Dynasty Catering",
    "business_email": "office@premiumdynasty.com",
    "business_phone": "",
    "business_address": "",
    "default_tax_percent": 0.0,
    "default_service_charge_percent": 0.0,
    "default_gratuity_percent": 0.0,
    "payment_terms": "50% deposit due upon approval. Final balance due before the event.",
    "estimate_notes": "Thank you for the opportunity to cater your event.",
}

DEFAULT_LINE_ITEMS = [
    {"Description": "Catering package", "Qty": 1, "Unit Price": 0.00},
    {"Description": "Service staff", "Qty": 1, "Unit Price": 0.00},
]


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ESTIMATES_DIR.mkdir(parents=True, exist_ok=True)
    if not SETTINGS_FILE.exists():
        SETTINGS_FILE.write_text(json.dumps(DEFAULT_SETTINGS, indent=2), encoding="utf-8")
    if not COUNTER_FILE.exists():
        COUNTER_FILE.write_text(json.dumps({"next_number": 1001}, indent=2), encoding="utf-8")


ensure_storage()


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default



def save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")



def money(value: Decimal | float | int | str) -> str:
    amount = to_decimal(value)
    return f"${amount:,.2f}"



def to_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value).replace(",", "")).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, AttributeError):
        return Decimal("0.00")



def sanitize_filename(value: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_-]+", "-", value.strip())
    return clean.strip("-") or "estimate"



def next_estimate_number() -> str:
    counter = load_json(COUNTER_FILE, {"next_number": 1001})
    current = int(counter.get("next_number", 1001))
    counter["next_number"] = current + 1
    save_json(COUNTER_FILE, counter)
    return f"EST-{current}"



def list_saved_estimates() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(ESTIMATES_DIR.glob("*.json"), reverse=True):
        data = load_json(path, {})
        if not data:
            continue
        items.append(
            {
                "file": path.name,
                "estimate_number": data.get("estimate_number", path.stem),
                "client_name": data.get("client_name", ""),
                "event_date": data.get("event_date", ""),
                "total": data.get("total", 0),
                "updated_at": data.get("updated_at", ""),
            }
        )
    return items



def calculate_totals(line_items: list[dict[str, Any]], tax_pct: float, service_pct: float, gratuity_pct: float, deposit_amount: float) -> dict[str, Decimal]:
    subtotal = Decimal("0.00")
    for item in line_items:
        qty = to_decimal(item.get("Qty", 0))
        unit_price = to_decimal(item.get("Unit Price", 0))
        subtotal += (qty * unit_price).quantize(TWOPLACES, rounding=ROUND_HALF_UP)

    service_charge = (subtotal * to_decimal(service_pct) / Decimal("100")).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    gratuity = (subtotal * to_decimal(gratuity_pct) / Decimal("100")).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    taxable_base = subtotal + service_charge
    tax = (taxable_base * to_decimal(tax_pct) / Decimal("100")).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    total = subtotal + service_charge + gratuity + tax
    deposit = min(to_decimal(deposit_amount), total)
    balance_due = total - deposit

    return {
        "subtotal": subtotal,
        "service_charge": service_charge,
        "gratuity": gratuity,
        "tax": tax,
        "total": total,
        "deposit": deposit,
        "balance_due": balance_due,
    }



def build_estimate_payload(settings: dict[str, Any], form_data: dict[str, Any], line_items: list[dict[str, Any]], totals: dict[str, Decimal], existing_number: str | None = None) -> dict[str, Any]:
    estimate_number = existing_number or next_estimate_number()
    now = datetime.now().isoformat(timespec="seconds")
    payload = {
        "estimate_number": estimate_number,
        "created_at": now,
        "updated_at": now,
        "business": settings,
        **form_data,
        "line_items": line_items,
        **{k: float(v) for k, v in totals.items()},
    }
    return payload



def save_estimate(payload: dict[str, Any]) -> Path:
    client_slug = sanitize_filename(payload.get("client_name", "client"))
    path = ESTIMATES_DIR / f"{payload['estimate_number']}_{client_slug}.json"
    existing = load_json(path, {})
    if existing:
        payload["created_at"] = existing.get("created_at", payload["created_at"])
    payload["updated_at"] = datetime.now().isoformat(timespec="seconds")
    save_json(path, payload)
    return path



def load_estimate_file(filename: str) -> dict[str, Any]:
    return load_json(ESTIMATES_DIR / filename, {})



def line_items_to_rows(df: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        description = str(row.get("Description", "")).strip()
        qty = to_decimal(row.get("Qty", 0))
        unit_price = to_decimal(row.get("Unit Price", 0))
        if not description and qty == 0 and unit_price == 0:
            continue
        rows.append(
            {
                "Description": description,
                "Qty": float(qty),
                "Unit Price": float(unit_price),
                "Line Total": float((qty * unit_price).quantize(TWOPLACES, rounding=ROUND_HALF_UP)),
            }
        )
    return rows



def estimate_to_pdf_bytes(payload: dict[str, Any]) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = styles["Title"]
    title_style.fontName = "Helvetica-Bold"
    title_style.fontSize = 18
    normal = styles["BodyText"]
    normal.fontName = "Helvetica"
    normal.fontSize = 10
    small = ParagraphStyle("small", parent=normal, fontSize=9, leading=12)

    story = []
    if HEADER_LOGO_FILE.exists():
        story.append(Image(str(HEADER_LOGO_FILE), width=7.0 * inch, height=(7.0 * inch * 312) / 1592))
        story.append(Spacer(1, 0.15 * inch))
    business = payload.get("business", {})
    business_block = "<br/>".join(
        filter(
            None,
            [
                f"<b>{business.get('business_name', '')}</b>",
                business.get("business_address", ""),
                business.get("business_phone", ""),
                business.get("business_email", ""),
            ],
        )
    )
    story.append(Paragraph(business_block, normal))
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph(f"Estimate {payload.get('estimate_number', '')}", title_style))
    story.append(Spacer(1, 0.1 * inch))

    details_table = Table(
        [
            ["Client", payload.get("client_name", ""), "Event Date", payload.get("event_date", "")],
            ["Contact", payload.get("client_email", ""), "Venue", payload.get("venue", "")],
            ["Phone", payload.get("client_phone", ""), "Guests", str(payload.get("guest_count", ""))],
            ["Event Type", payload.get("event_type", ""), "Issue Date", payload.get("issue_date", "")],
        ],
        colWidths=[1.1 * inch, 2.2 * inch, 1.1 * inch, 2.4 * inch],
    )
    details_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(details_table)
    story.append(Spacer(1, 0.2 * inch))

    item_rows = [["Description", "Qty", "Unit Price", "Line Total"]]
    for item in payload.get("line_items", []):
        item_rows.append(
            [
                item.get("Description", ""),
                str(item.get("Qty", "")),
                money(item.get("Unit Price", 0)),
                money(item.get("Line Total", 0)),
            ]
        )

    items_table = Table(item_rows, colWidths=[3.4 * inch, 0.8 * inch, 1.3 * inch, 1.3 * inch])
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(items_table)
    story.append(Spacer(1, 0.2 * inch))

    totals_rows = [
        ["Subtotal", money(payload.get("subtotal", 0))],
        ["Service Charge", money(payload.get("service_charge", 0))],
        ["Gratuity", money(payload.get("gratuity", 0))],
        ["Tax", money(payload.get("tax", 0))],
        ["Total", money(payload.get("total", 0))],
        ["Deposit", money(payload.get("deposit", 0))],
        ["Balance Due", money(payload.get("balance_due", 0))],
    ]
    totals_table = Table(totals_rows, colWidths=[1.8 * inch, 1.4 * inch], hAlign="RIGHT")
    totals_table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME", (0, 4), (-1, 4), "Helvetica-Bold"),
                ("FONTNAME", (0, 6), (-1, 6), "Helvetica-Bold"),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("PADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(totals_table)
    story.append(Spacer(1, 0.2 * inch))

    notes = payload.get("notes", "")
    payment_terms = business.get("payment_terms", "")
    if notes:
        story.append(Paragraph("<b>Notes</b>", normal))
        story.append(Paragraph(notes.replace("\n", "<br/>"), small))
        story.append(Spacer(1, 0.1 * inch))
    if payment_terms:
        story.append(Paragraph("<b>Payment Terms</b>", normal))
        story.append(Paragraph(payment_terms.replace("\n", "<br/>"), small))

    doc.build(story)
    return buffer.getvalue()



def render_saved_estimates() -> None:
    st.subheader("Saved estimates")
    records = list_saved_estimates()
    if not records:
        st.info("No estimates saved yet.")
        return

    saved_df = pd.DataFrame(records)
    st.dataframe(
        saved_df[["estimate_number", "client_name", "event_date", "total", "updated_at"]],
        use_container_width=True,
        hide_index=True,
        column_config={
            "estimate_number": "Estimate #",
            "client_name": "Client",
            "event_date": "Event date",
            "total": st.column_config.NumberColumn("Total", format="$%.2f"),
            "updated_at": "Last updated",
        },
    )

    selected = st.selectbox(
        "Load a saved estimate",
        options=[""] + [record["file"] for record in records],
        format_func=lambda x: "Select an estimate..." if x == "" else x,
    )
    if selected and st.button("Load selected estimate"):
        loaded = load_estimate_file(selected)
        if loaded:
            st.session_state["loaded_estimate"] = loaded
            st.success(f"Loaded {loaded.get('estimate_number', selected)}. The page will refresh with its values.")
            st.rerun()



def apply_loaded_defaults() -> dict[str, Any]:
    loaded = st.session_state.get("loaded_estimate", {})
    settings = load_json(SETTINGS_FILE, DEFAULT_SETTINGS)
    defaults = {
        "settings": settings,
        "form": {
            "estimate_number": loaded.get("estimate_number", ""),
            "issue_date": loaded.get("issue_date", date.today().isoformat()),
            "client_name": loaded.get("client_name", ""),
            "client_email": loaded.get("client_email", ""),
            "client_phone": loaded.get("client_phone", ""),
            "event_date": loaded.get("event_date", date.today().isoformat()),
            "event_type": loaded.get("event_type", "Private Event"),
            "venue": loaded.get("venue", ""),
            "guest_count": int(loaded.get("guest_count", 50) or 50),
            "tax_percent": float(loaded.get("tax_percent", settings.get("default_tax_percent", 0.0))),
            "service_charge_percent": float(loaded.get("service_charge_percent", settings.get("default_service_charge_percent", 0.0))),
            "gratuity_percent": float(loaded.get("gratuity_percent", settings.get("default_gratuity_percent", 0.0))),
            "deposit_amount": float(loaded.get("deposit", 0.0)),
            "notes": loaded.get("notes", settings.get("estimate_notes", "")),
        },
        "line_items": loaded.get("line_items", DEFAULT_LINE_ITEMS),
    }
    return defaults


st.set_page_config(page_title="Catering Estimate Maker", page_icon="🧾", layout="wide")
st.title("🧾 Catering Estimate Maker")
st.caption("Internal estimate builder with JSON persistence and same-page PDF download.")

defaults = apply_loaded_defaults()
settings = defaults["settings"]
loaded_number = defaults["form"]["estimate_number"]

with st.sidebar:
    st.header("Business settings")
    business_name = st.text_input("Business name", value=settings.get("business_name", ""))
    business_email = st.text_input("Business email", value=settings.get("business_email", ""))
    business_phone = st.text_input("Business phone", value=settings.get("business_phone", ""))
    business_address = st.text_area("Business address", value=settings.get("business_address", ""), height=90)
    default_tax = st.number_input("Default tax %", min_value=0.0, step=0.25, value=float(settings.get("default_tax_percent", 0.0)))
    default_service = st.number_input("Default service charge %", min_value=0.0, step=0.25, value=float(settings.get("default_service_charge_percent", 0.0)))
    default_gratuity = st.number_input("Default gratuity %", min_value=0.0, step=0.25, value=float(settings.get("default_gratuity_percent", 0.0)))
    payment_terms = st.text_area("Default payment terms", value=settings.get("payment_terms", ""), height=100)
    estimate_notes = st.text_area("Default note", value=settings.get("estimate_notes", ""), height=100)

    if st.button("Save business settings"):
        new_settings = {
            "business_name": business_name,
            "business_email": business_email,
            "business_phone": business_phone,
            "business_address": business_address,
            "default_tax_percent": default_tax,
            "default_service_charge_percent": default_service,
            "default_gratuity_percent": default_gratuity,
            "payment_terms": payment_terms,
            "estimate_notes": estimate_notes,
        }
        save_json(SETTINGS_FILE, new_settings)
        st.success("Settings saved.")

left, right = st.columns([1.3, 1])

with left:
    st.subheader("Estimate details")
    c1, c2 = st.columns(2)
    with c1:
        issue_date = st.date_input("Issue date", value=date.fromisoformat(defaults["form"]["issue_date"]))
        client_name = st.text_input("Client name", value=defaults["form"]["client_name"])
        client_email = st.text_input("Client email", value=defaults["form"]["client_email"])
        client_phone = st.text_input("Client phone", value=defaults["form"]["client_phone"])
    with c2:
        event_date = st.date_input("Event date", value=date.fromisoformat(defaults["form"]["event_date"]))
        event_type = st.text_input("Event type", value=defaults["form"]["event_type"])
        venue = st.text_input("Venue", value=defaults["form"]["venue"])
        guest_count = st.number_input("Guest count", min_value=1, step=1, value=defaults["form"]["guest_count"])

    st.markdown("#### Line items")
    items_df = pd.DataFrame(defaults["line_items"])
    if "Line Total" in items_df.columns:
        items_df = items_df.drop(columns=["Line Total"])
    edited_df = st.data_editor(
        items_df,
        num_rows="dynamic",
        use_container_width=True,
        hide_index=True,
        column_config={
            "Description": st.column_config.TextColumn("Description", required=True),
            "Qty": st.column_config.NumberColumn("Qty", min_value=0.0, step=1.0, format="%.2f"),
            "Unit Price": st.column_config.NumberColumn("Unit Price", min_value=0.0, step=1.0, format="$%.2f"),
        },
    )

    st.markdown("#### Fees and notes")
    f1, f2, f3 = st.columns(3)
    with f1:
        tax_percent = st.number_input("Tax %", min_value=0.0, step=0.25, value=defaults["form"]["tax_percent"])
    with f2:
        service_charge_percent = st.number_input("Service charge %", min_value=0.0, step=0.25, value=defaults["form"]["service_charge_percent"])
    with f3:
        gratuity_percent = st.number_input("Gratuity %", min_value=0.0, step=0.25, value=defaults["form"]["gratuity_percent"])

    deposit_amount = st.number_input("Deposit amount", min_value=0.0, step=25.0, value=defaults["form"]["deposit_amount"])
    notes = st.text_area("Estimate notes", value=defaults["form"]["notes"], height=120)

with right:
    st.subheader("Preview and totals")
    line_items = line_items_to_rows(edited_df)
    totals = calculate_totals(line_items, tax_percent, service_charge_percent, gratuity_percent, deposit_amount)

    preview_df = pd.DataFrame(line_items) if line_items else pd.DataFrame(columns=["Description", "Qty", "Unit Price", "Line Total"])
    st.dataframe(
        preview_df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "Unit Price": st.column_config.NumberColumn("Unit Price", format="$%.2f"),
            "Line Total": st.column_config.NumberColumn("Line Total", format="$%.2f"),
        },
    )

    st.metric("Subtotal", money(totals["subtotal"]))
    m1, m2 = st.columns(2)
    m1.metric("Service charge", money(totals["service_charge"]))
    m2.metric("Gratuity", money(totals["gratuity"]))
    m3, m4 = st.columns(2)
    m3.metric("Tax", money(totals["tax"]))
    m4.metric("Deposit", money(totals["deposit"]))
    st.metric("Total", money(totals["total"]))
    st.metric("Balance due", money(totals["balance_due"]))

current_settings = {
    "business_name": business_name,
    "business_email": business_email,
    "business_phone": business_phone,
    "business_address": business_address,
    "default_tax_percent": default_tax,
    "default_service_charge_percent": default_service,
    "default_gratuity_percent": default_gratuity,
    "payment_terms": payment_terms,
    "estimate_notes": estimate_notes,
}

form_data = {
    "issue_date": issue_date.isoformat(),
    "client_name": client_name,
    "client_email": client_email,
    "client_phone": client_phone,
    "event_date": event_date.isoformat(),
    "event_type": event_type,
    "venue": venue,
    "guest_count": int(guest_count),
    "tax_percent": tax_percent,
    "service_charge_percent": service_charge_percent,
    "gratuity_percent": gratuity_percent,
    "notes": notes,
}

payload_for_pdf = build_estimate_payload(current_settings, form_data, line_items, totals, existing_number=loaded_number or None)
pdf_bytes = estimate_to_pdf_bytes(payload_for_pdf)

b1, b2, b3 = st.columns([1, 1, 1.4])
with b1:
    if st.button("Save estimate", use_container_width=True):
        saved_path = save_estimate(payload_for_pdf)
        st.session_state["loaded_estimate"] = load_json(saved_path, {})
        st.success(f"Saved to {saved_path.name}")
with b2:
    if st.button("Start new estimate", use_container_width=True):
        st.session_state.pop("loaded_estimate", None)
        st.rerun()
with b3:
    st.download_button(
        "Download estimate PDF",
        data=pdf_bytes,
        file_name=f"{payload_for_pdf['estimate_number']}_{sanitize_filename(client_name or 'client')}.pdf",
        mime="application/pdf",
        use_container_width=True,
    )

st.divider()
render_saved_estimates()
