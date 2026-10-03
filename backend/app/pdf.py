from __future__ import annotations

from functools import partial
from io import BytesIO
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as canvas_module
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    Image,
    KeepTogether,
    LongTable,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from .pdf_theme import (
    BRAND_RED,
    BRAND_RED_DARK,
    BRAND_SOFT,
    FONT_BOLD,
    FONT_REGULAR,
    INK,
    MUTED,
    MUTED_LIGHT,
    RULE,
    WARM_PAPER,
    WARM_SAND,
    WHITE,
    build_styles,
)
from .pdf_view import estimate_document_view
from .services import money

PAGE_WIDTH, PAGE_HEIGHT = LETTER
LEFT_MARGIN = 0.55 * inch
RIGHT_MARGIN = 0.55 * inch
BOTTOM_MARGIN = 0.64 * inch
FIRST_TOP_MARGIN = 0.4 * inch
LATER_TOP_MARGIN = 0.82 * inch
CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN
LOGO = Path(__file__).parents[1] / "assets" / "logo_header.png"


def _display_money(value: Any) -> str:
    amount = float(value or 0)
    return f"-{money(abs(amount))}" if amount < 0 else money(amount)


def _fit_footer(canvas: canvas_module.Canvas, value: str, max_width: float) -> str:
    fitted = value
    while fitted and canvas.stringWidth(fitted, FONT_REGULAR, 6.4) > max_width:
        fitted = fitted[:-1]
    return f"{fitted.rstrip()}..." if fitted != value else fitted


def _draw_footer(canvas: canvas_module.Canvas, view: dict[str, Any]) -> None:
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.45)
    canvas.line(LEFT_MARGIN, 0.48 * inch, PAGE_WIDTH - RIGHT_MARGIN, 0.48 * inch)
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT_REGULAR, 6.4)
    contact = " | ".join(view["business"]["footer"]) or view["business"]["name"]
    canvas.drawString(LEFT_MARGIN, 0.27 * inch, _fit_footer(canvas, contact, 5.6 * inch))
    canvas.restoreState()


def _draw_later_header(canvas: canvas_module.Canvas, view: dict[str, Any]) -> None:
    canvas.saveState()
    if LOGO.exists():
        canvas.drawImage(
            str(LOGO),
            LEFT_MARGIN,
            PAGE_HEIGHT - 0.58 * inch,
            width=1.38 * inch,
            height=0.27 * inch,
            preserveAspectRatio=True,
            mask="auto",
        )
    canvas.setFont(FONT_BOLD, 7)
    canvas.setFillColor(INK)
    canvas.drawRightString(
        PAGE_WIDTH - RIGHT_MARGIN,
        PAGE_HEIGHT - 0.42 * inch,
        f"ESTIMATE {view['document']['number']} - CONTINUED",
    )
    canvas.setStrokeColor(BRAND_RED)
    canvas.setLineWidth(1)
    canvas.line(LEFT_MARGIN, PAGE_HEIGHT - 0.68 * inch, PAGE_WIDTH - RIGHT_MARGIN, PAGE_HEIGHT - 0.68 * inch)
    canvas.restoreState()


def _first_page(canvas: canvas_module.Canvas, doc: BaseDocTemplate, view: dict[str, Any]) -> None:
    del doc
    _draw_footer(canvas, view)


def _later_page(canvas: canvas_module.Canvas, doc: BaseDocTemplate, view: dict[str, Any]) -> None:
    del doc
    _draw_later_header(canvas, view)
    _draw_footer(canvas, view)


class NumberedCanvas(canvas_module.Canvas):
    def __init__(self, *args: Any, view: dict[str, Any], **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict[str, Any]] = []
        self._view = view
        self.setTitle(view["metadata"]["title"])
        self.setAuthor(view["metadata"]["author"])
        self.setSubject(view["metadata"]["subject"])
        self.setKeywords("catering, estimate, event, pricing")

    def showPage(self) -> None:  # noqa: N802 - ReportLab API name.
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_page_number(page_count)
            canvas_module.Canvas.showPage(self)
        canvas_module.Canvas.save(self)

    def _draw_page_number(self, page_count: int) -> None:
        self.saveState()
        self.setFillColor(MUTED)
        self.setFont(FONT_REGULAR, 6.4)
        self.drawRightString(
            PAGE_WIDTH - RIGHT_MARGIN,
            0.27 * inch,
            f"{self._view['document']['number']} | Page {self._pageNumber} of {page_count}",
        )
        self.restoreState()


def _document_header(view: dict[str, Any], styles: dict[str, Any]) -> Table:
    logo: Any = ""
    if LOGO.exists():
        logo = Image(str(LOGO), width=2.28 * inch, height=0.447 * inch)
    meta_parts = [view["document"]["revision_label"], f"Issued {view['document']['issue_date']}"]
    if view["document"]["valid_until"]:
        meta_parts.append(f"Valid until {view['document']['valid_until']}")
    meta_parts.append(view["document"]["currency"])
    right = [
        Paragraph("ESTIMATE", styles["document_type"]),
        Paragraph(escape(view["document"]["number"]), styles["document_number"]),
        Paragraph(" | ".join(escape(part) for part in meta_parts), styles["document_meta"]),
    ]
    header = Table([[logo, right]], colWidths=[3.35 * inch, CONTENT_WIDTH - 3.35 * inch])
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
                ("LINEBELOW", (0, 0), (-1, -1), 1.4, BRAND_RED),
            ]
        )
    )
    return header


def _detail_card_content(title: str, name: str, details: list[str], styles: dict[str, Any]) -> list[Any]:
    detail_markup = "<br/>".join(escape(value) for value in details)
    contents: list[Any] = [
        Paragraph(escape(title.upper()), styles["label"]),
        Spacer(1, 3),
        Paragraph(escape(name), styles["card_title"]),
    ]
    if detail_markup:
        contents.extend([Spacer(1, 5), Paragraph(detail_markup, styles["small"])])
    return contents


def _summary_cards(view: dict[str, Any], styles: dict[str, Any]) -> Table:
    card_width = (CONTENT_WIDTH - 0.16 * inch) / 2
    prepared = _detail_card_content(
        "Prepared for",
        view["prepared_for"]["name"],
        view["prepared_for"]["details"],
        styles,
    )
    event = _detail_card_content(
        "Event details",
        view["event"]["name"],
        view["event"]["details"],
        styles,
    )
    cards = Table([[prepared, "", event]], colWidths=[card_width, 0.16 * inch, card_width])
    cards.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("BACKGROUND", (0, 0), (0, 0), WARM_PAPER),
                ("BACKGROUND", (2, 0), (2, 0), WARM_PAPER),
                ("BOX", (0, 0), (0, 0), 0.5, RULE),
                ("BOX", (2, 0), (2, 0), 0.5, RULE),
                ("LEFTPADDING", (0, 0), (0, 0), 12),
                ("RIGHTPADDING", (0, 0), (0, 0), 12),
                ("TOPPADDING", (0, 0), (0, 0), 10),
                ("BOTTOMPADDING", (0, 0), (0, 0), 10),
                ("LEFTPADDING", (2, 0), (2, 0), 12),
                ("RIGHTPADDING", (2, 0), (2, 0), 12),
                ("TOPPADDING", (2, 0), (2, 0), 10),
                ("BOTTOMPADDING", (2, 0), (2, 0), 10),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return cards


def _section_heading(title: str, detail: str, styles: dict[str, Any]) -> Table:
    heading = Table(
        [[Paragraph(escape(title), styles["section"]), Paragraph(escape(detail), styles["micro"])]],
        colWidths=[CONTENT_WIDTH * 0.6, CONTENT_WIDTH * 0.4],
    )
    heading.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -1), 0.55, RULE),
            ]
        )
    )
    return heading


def _items_table(view: dict[str, Any], styles: dict[str, Any]) -> LongTable:
    rows: list[list[Any]] = [[
        Paragraph("ITEM", styles["table_header"]),
        Paragraph("QTY", styles["table_header_right"]),
        Paragraph("UNIT", styles["table_header_right"]),
        Paragraph("RATE", styles["table_header_right"]),
        Paragraph("AMOUNT", styles["table_header_right"]),
    ]]
    group_rows: list[int] = []
    item_rows: list[int] = []
    for group in view["line_groups"]:
        group_rows.append(len(rows))
        rows.append([Paragraph(escape(group["label"].upper()), styles["group"]), "", "", "", ""])
        for item in group["items"]:
            note = f"<br/><font color='#717770' size='6.8'>{escape(item['description'])}</font>" if item["description"] else ""
            item_markup = (
                f"<font color='#B63C40' size='6.2'><b>{escape(item['category'].upper())}</b></font>"
                f"<br/><b>{escape(item['name'])}</b>{note}"
            )
            item_rows.append(len(rows))
            rows.append(
                [
                    Paragraph(item_markup, styles["item"]),
                    Paragraph(escape(item["quantity_label"]), styles["money"]),
                    Paragraph(escape(item["unit"]), styles["money"]),
                    Paragraph(_display_money(item["unit_price"]), styles["money"]),
                    Paragraph(_display_money(item["line_total"]), styles["money"]),
                ]
            )

    table = LongTable(
        rows,
        colWidths=[3.75 * inch, 0.62 * inch, 0.72 * inch, 1.02 * inch, 1.29 * inch],
        repeatRows=1,
        splitByRow=1,
        hAlign="LEFT",
    )
    commands: list[tuple[Any, ...]] = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, 0), 7),
        ("RIGHTPADDING", (0, 0), (-1, 0), 7),
        ("TOPPADDING", (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
    ]
    for row in group_rows:
        commands.extend(
            [
                ("SPAN", (0, row), (-1, row)),
                ("BACKGROUND", (0, row), (-1, row), WARM_SAND),
                ("LEFTPADDING", (0, row), (-1, row), 8),
                ("RIGHTPADDING", (0, row), (-1, row), 8),
                ("TOPPADDING", (0, row), (-1, row), 5),
                ("BOTTOMPADDING", (0, row), (-1, row), 5),
                ("NOSPLIT", (0, row), (-1, min(row + 1, len(rows) - 1))),
            ]
        )
    for row in item_rows:
        commands.extend(
            [
                ("LINEBELOW", (0, row), (-1, row), 0.35, RULE),
                ("LEFTPADDING", (0, row), (-1, row), 7),
                ("RIGHTPADDING", (0, row), (-1, row), 7),
                ("TOPPADDING", (0, row), (-1, row), 6),
                ("BOTTOMPADDING", (0, row), (-1, row), 6),
            ]
        )
    table.setStyle(TableStyle(commands))
    return table


def _notes_card(view: dict[str, Any], width: float, styles: dict[str, Any]) -> Table:
    contents: list[Any] = [Paragraph("NOTES & TERMS", styles["label"])]
    for index, note in enumerate(view["notes"]):
        contents.extend(
            [
                Spacer(1, 7 if index == 0 else 9),
                Paragraph(escape(note["label"]), styles["section"]),
                Spacer(1, 2),
                Paragraph(escape(note["text"]), styles["small"]),
            ]
        )
    if view["payment_terms"]:
        contents.extend(
            [
                Spacer(1, 9),
                Paragraph("Payment terms", styles["section"]),
                Spacer(1, 2),
                Paragraph(escape(view["payment_terms"]), styles["small"]),
            ]
        )
    if not view["notes"] and not view["payment_terms"]:
        contents.extend([Spacer(1, 7), Paragraph("No additional notes or payment terms.", styles["small"])])
    card = Table([[contents]], colWidths=[width])
    card.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), WARM_PAPER),
                ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 11),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return card


def _totals_card(view: dict[str, Any], width: float, styles: dict[str, Any]) -> Table:
    rows: list[list[Any]] = []
    commands: list[tuple[Any, ...]] = []
    for index, row in enumerate(view["summary_rows"]):
        kind = row["kind"]
        label_style = styles["section"] if kind in {"total", "subtotal"} else styles["small"]
        amount_style = styles["money_bold"] if kind == "total" else styles["money"]
        if kind == "balance":
            label_style = styles["balance_label"]
            amount_style = styles["balance_money"]
        rows.append(
            [
                Paragraph(escape(row["label"]), label_style),
                Paragraph(_display_money(row["amount"]), amount_style),
            ]
        )
        if kind == "subtotal":
            commands.append(("LINEABOVE", (0, index), (-1, index), 0.55, RULE))
        if kind == "total":
            commands.extend(
                [
                    ("LINEABOVE", (0, index), (-1, index), 1, INK),
                    ("TOPPADDING", (0, index), (-1, index), 8),
                ]
            )
        if kind == "balance":
            commands.extend(
                [
                    ("BACKGROUND", (0, index), (-1, index), INK),
                    ("TOPPADDING", (0, index), (-1, index), 9),
                    ("BOTTOMPADDING", (0, index), (-1, index), 9),
                ]
            )

    table = Table(rows, colWidths=[width * 0.58, width * 0.42])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("BOX", (0, 0), (-1, -1), 0.5, RULE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 5.2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5.2),
                *commands,
            ]
        )
    )
    return table


def _financial_summary(view: dict[str, Any], styles: dict[str, Any]) -> KeepTogether:
    gap = 0.18 * inch
    notes_width = 4.48 * inch
    totals_width = CONTENT_WIDTH - notes_width - gap
    notes = _notes_card(view, notes_width, styles)
    totals = _totals_card(view, totals_width, styles)
    layout = Table([[notes, "", totals]], colWidths=[notes_width, gap, totals_width])
    layout.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return KeepTogether([layout])


def build_pdf(payload: dict[str, Any]) -> bytes:
    view = estimate_document_view(payload)
    styles = build_styles()
    buffer = BytesIO()
    doc = BaseDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=FIRST_TOP_MARGIN,
        bottomMargin=BOTTOM_MARGIN,
        title=view["metadata"]["title"],
        author=view["metadata"]["author"],
        subject=view["metadata"]["subject"],
    )
    first_frame = Frame(
        LEFT_MARGIN,
        BOTTOM_MARGIN,
        CONTENT_WIDTH,
        PAGE_HEIGHT - BOTTOM_MARGIN - FIRST_TOP_MARGIN,
        id="first-frame",
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    later_frame = Frame(
        LEFT_MARGIN,
        BOTTOM_MARGIN,
        CONTENT_WIDTH,
        PAGE_HEIGHT - BOTTOM_MARGIN - LATER_TOP_MARGIN,
        id="later-frame",
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    doc.addPageTemplates(
        [
            PageTemplate(
                id="first",
                frames=[first_frame],
                onPage=partial(_first_page, view=view),
                autoNextPageTemplate="later",
            ),
            PageTemplate(id="later", frames=[later_frame], onPage=partial(_later_page, view=view)),
        ]
    )

    line_count = sum(len(group["items"]) for group in view["line_groups"])
    story: list[Any] = [
        _document_header(view, styles),
        Spacer(1, 0.18 * inch),
        _summary_cards(view, styles),
        Spacer(1, 0.22 * inch),
        _section_heading("Scope & pricing", f"{line_count} line{'s' if line_count != 1 else ''}", styles),
        Spacer(1, 0.08 * inch),
        _items_table(view, styles),
        Spacer(1, 0.18 * inch),
        CondPageBreak(2.15 * inch),
        _financial_summary(view, styles),
    ]
    doc.build(story, canvasmaker=partial(NumberedCanvas, view=view))
    return buffer.getvalue()
