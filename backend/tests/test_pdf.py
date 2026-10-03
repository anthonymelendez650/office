from __future__ import annotations

import re
import unittest
from io import BytesIO

from pypdf import PdfReader

from backend.app.pdf import build_pdf
from backend.app.pdf_view import estimate_document_view
from backend.app.services import calculate_totals


def sample_payload(line_count: int = 8) -> dict[str, object]:
    group_cycle = ("item", "item", "item", "staff", "service", "delivery", "gratuity")
    units = {"item": "guest", "staff": "hour", "service": "flat", "delivery": "flat", "gratuity": "flat"}
    prices = {"item": 12.5, "staff": 32, "service": 145, "delivery": 85, "gratuity": 60}
    items: list[dict[str, object]] = []
    for index in range(line_count):
        charge_group = group_cycle[index % len(group_cycle)]
        quantity = 75 if charge_group == "item" else 2 if charge_group == "staff" else 1
        price = prices[charge_group]
        items.append(
            {
                "line_id": f"line-{index + 1}",
                "Category": "Seasonal menu" if charge_group == "item" else charge_group.title(),
                "Description": f"Customer-facing line {index + 1}",
                "Notes": "Prepared and presented on site" if index % 3 == 0 else "",
                "internal_notes": "INTERNAL-SUPPLIER-COST-DO-NOT-PRINT",
                "Qty": quantity,
                "Unit Price": price,
                "Line Total": quantity * price,
                "pricing_unit": units[charge_group],
                "charge_group": charge_group,
                "tax_class": "taxable" if charge_group in {"item", "service", "delivery"} else "non_taxable",
            }
        )

    totals = calculate_totals(
        items,
        tax_percent=8.25,
        service_percent=12,
        gratuity_percent=18,
        deposit_amount=500,
        gratuity_taxable=False,
    )
    return {
        "estimate_number": "EST-2026-0042",
        "revision_number": 3,
        "issue_date": "2026-07-16",
        "company_name": "Silverspoon Catering",
        "customer_name": "Jordan Rivera",
        "customer_email": "jordan@example.com",
        "customer_phone": "(555) 867-5309",
        "billing_address": "1200 Market Street, Los Angeles, CA",
        "event_name": "Rivera Summer Celebration",
        "event_type": "Private Event",
        "event_date": "2026-09-12",
        "venue": "The Garden Room",
        "guest_count": 75,
        "service_charge_percent": 12,
        "gratuity_percent": 18,
        "tax_percent": 8.25,
        "notes": "Final guest count is due seven days before the event.",
        "business": {
            "business_name": "Silverspoon Catering",
            "business_phone": "(555) 555-0199",
            "business_email": "hello@silverspooncatering.com",
            "business_address": "Los Angeles, California",
            "estimate_notes": "Thank you for considering Silverspoon Catering for your celebration.",
            "payment_terms": "A signed agreement and deposit reserve the event date.",
        },
        "customer": {
            "customer_name": "Jordan Rivera",
            "organization": "Rivera & Co.",
            "internal_notes": "INTERNAL-CUSTOMER-NOTE-DO-NOT-PRINT",
        },
        "line_items": items,
        **totals,
    }


class EstimateDocumentViewTests(unittest.TestCase):
    def test_groups_lines_and_omits_zero_or_internal_details(self) -> None:
        payload = sample_payload()
        payload["tax"] = 0
        view = estimate_document_view(payload)

        self.assertEqual(
            [group["label"] for group in view["line_groups"]],
            ["Menu & Food", "Staffing", "Service", "Delivery", "Gratuity"],
        )
        service_group = next(group for group in view["line_groups"] if group["key"] == "service")
        self.assertEqual(service_group["items"][0]["unit"], "flat")
        summary_labels = [row["label"] for row in view["summary_rows"]]
        self.assertNotIn("Tax (8.25%)", summary_labels)
        self.assertEqual(summary_labels[-1], "Balance due")
        self.assertNotIn("INTERNAL", str(view))


class PdfRenderTests(unittest.TestCase):
    def test_multi_page_pdf_has_metadata_identity_and_intact_summary(self) -> None:
        pdf = build_pdf(sample_payload(line_count=35))
        reader = PdfReader(BytesIO(pdf))
        self.assertGreaterEqual(len(reader.pages), 2)
        self.assertEqual(reader.metadata.title, "Estimate EST-2026-0042 - Jordan Rivera")
        self.assertEqual(reader.metadata.author, "Silverspoon Catering")

        page_texts = [page.extract_text() or "" for page in reader.pages]
        page_count = len(page_texts)
        for page_number, text in enumerate(page_texts, start=1):
            self.assertIn("hello@silverspooncatering.com", text)
            self.assertRegex(text, rf"EST-2026-0042\s*\|\s*Page {page_number} of {page_count}")

        document_text = "\n".join(page_texts)
        self.assertNotIn("INTERNAL-SUPPLIER-COST", document_text)
        self.assertNotIn("INTERNAL-CUSTOMER-NOTE", document_text)
        self.assertIn("ESTIMATE EST-2026-0042 - CONTINUED", document_text)

        balance_pages = [text for text in page_texts if re.search(r"Balance\s+due", text, re.IGNORECASE)]
        self.assertEqual(len(balance_pages), 1)
        self.assertRegex(balance_pages[0], r"\bTotal\b")
        self.assertRegex(balance_pages[0], r"(?i)Notes\s*&\s*terms")


if __name__ == "__main__":
    unittest.main()
