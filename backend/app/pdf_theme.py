from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

INK = colors.HexColor("#252A25")
INK_SOFT = colors.HexColor("#454B45")
MUTED = colors.HexColor("#717770")
MUTED_LIGHT = colors.HexColor("#969C95")
BRAND_RED = colors.HexColor("#B63C40")
BRAND_RED_DARK = colors.HexColor("#922F33")
BRAND_SOFT = colors.HexColor("#FAECEB")
WARM_PAPER = colors.HexColor("#FBFAF7")
WARM_SAND = colors.HexColor("#F3EEE7")
RULE = colors.HexColor("#DED8D0")
WHITE = colors.white

FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


def build_styles() -> dict[str, ParagraphStyle]:
    sample = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "PdfBody",
            parent=sample["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=8.5,
            leading=11.5,
            textColor=INK,
            spaceAfter=0,
        ),
        "small": ParagraphStyle(
            "PdfSmall",
            parent=sample["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=7.5,
            leading=10,
            textColor=MUTED,
            spaceAfter=0,
        ),
        "micro": ParagraphStyle(
            "PdfMicro",
            parent=sample["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=6.5,
            leading=8.2,
            textColor=MUTED_LIGHT,
            spaceAfter=0,
        ),
        "label": ParagraphStyle(
            "PdfLabel",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=6.6,
            leading=8,
            textColor=BRAND_RED,
            spaceAfter=0,
        ),
        "card_title": ParagraphStyle(
            "PdfCardTitle",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=11,
            leading=13,
            textColor=INK,
            spaceAfter=0,
        ),
        "document_type": ParagraphStyle(
            "PdfDocumentType",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=8,
            leading=9,
            textColor=BRAND_RED,
            alignment=2,
            spaceAfter=0,
        ),
        "document_number": ParagraphStyle(
            "PdfDocumentNumber",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=19,
            leading=21,
            textColor=INK,
            alignment=2,
            spaceAfter=0,
        ),
        "document_meta": ParagraphStyle(
            "PdfDocumentMeta",
            parent=sample["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=7,
            leading=9,
            textColor=MUTED,
            alignment=2,
            spaceAfter=0,
        ),
        "section": ParagraphStyle(
            "PdfSection",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=8,
            leading=10,
            textColor=INK,
            spaceAfter=0,
        ),
        "table_header": ParagraphStyle(
            "PdfTableHeader",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=6.7,
            leading=8,
            textColor=WHITE,
            spaceAfter=0,
        ),
        "table_header_right": ParagraphStyle(
            "PdfTableHeaderRight",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=6.7,
            leading=8,
            textColor=WHITE,
            alignment=2,
            spaceAfter=0,
        ),
        "group": ParagraphStyle(
            "PdfGroup",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=6.8,
            leading=8,
            textColor=BRAND_RED_DARK,
            spaceAfter=0,
        ),
        "item": ParagraphStyle(
            "PdfItem",
            parent=sample["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=8,
            leading=10,
            textColor=INK,
            spaceAfter=0,
        ),
        "item_note": ParagraphStyle(
            "PdfItemNote",
            parent=sample["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=6.8,
            leading=8.4,
            textColor=MUTED,
            spaceAfter=0,
        ),
        "money": ParagraphStyle(
            "PdfMoney",
            parent=sample["BodyText"],
            fontName=FONT_REGULAR,
            fontSize=8,
            leading=10,
            textColor=INK,
            alignment=2,
            spaceAfter=0,
        ),
        "money_bold": ParagraphStyle(
            "PdfMoneyBold",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=9,
            leading=11,
            textColor=INK,
            alignment=2,
            spaceAfter=0,
        ),
        "balance_label": ParagraphStyle(
            "PdfBalanceLabel",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=8.5,
            leading=10,
            textColor=WHITE,
            spaceAfter=0,
        ),
        "balance_money": ParagraphStyle(
            "PdfBalanceMoney",
            parent=sample["BodyText"],
            fontName=FONT_BOLD,
            fontSize=11,
            leading=13,
            textColor=WHITE,
            alignment=2,
            spaceAfter=0,
        ),
    }
