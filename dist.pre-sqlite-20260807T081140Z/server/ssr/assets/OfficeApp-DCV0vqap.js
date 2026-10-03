import { a as require_react, o as __toESM, t as require_jsx_runtime } from "../index.js";
//#region lib/domain.ts
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var guestCategories = [
	"hot entree",
	"cold entree",
	"sides",
	"salads",
	"appetizers",
	"desserts",
	"fruits"
];
var moneyValue = (value) => Math.round((Number(value) || 0) * 100) / 100;
var clone$1 = (value) => JSON.parse(JSON.stringify(value));
function validProductId(value) {
	const productId = String(value ?? "").trim();
	return [
		"",
		"none",
		"null",
		"undefined"
	].includes(productId.toLowerCase()) ? "" : productId;
}
function inferProductRules(raw) {
	const category = String(raw.Category ?? raw.category ?? "").trim();
	const description = String(raw.Description ?? raw.name ?? "").trim();
	const notes = String(raw.Notes ?? raw.customer_description ?? "").trim();
	const normalizedCategory = category.toLowerCase();
	const normalizedDescription = description.toLowerCase();
	let chargeGroup = "item";
	if (normalizedCategory === "staff") chargeGroup = "staff";
	if (normalizedCategory === "service") chargeGroup = "service";
	if (normalizedCategory === "delivery") chargeGroup = "delivery";
	if (normalizedCategory === "gratuity") chargeGroup = "gratuity";
	let quantityRule = "manual";
	let pricingUnit = "each";
	if (normalizedDescription === "servers") [quantityRule, pricingUnit] = ["server_hours", "hour"];
	else if (normalizedDescription === "kitchen staff") [quantityRule, pricingUnit] = ["kitchen_staff_hours", "hour"];
	else if (normalizedCategory === "utensils") [quantityRule, pricingUnit] = ["guest_plus_buffer", "each"];
	else if (guestCategories.includes(normalizedCategory)) [quantityRule, pricingUnit] = ["guest_count", "guest"];
	else if ([
		"service",
		"delivery",
		"gratuity"
	].includes(chargeGroup)) pricingUnit = "flat";
	const canonicalPrice = raw.price_cents == null ? void 0 : Number(raw.price_cents) / 100;
	const archived = raw.status === "archived" || Boolean(raw.archived);
	return {
		product_id: validProductId(raw.product_id),
		Category: category,
		Description: description,
		Notes: notes,
		"Unit Price": Math.max(moneyValue(canonicalPrice ?? raw["Unit Price"]), 0),
		pricing_unit: raw.pricing_unit || pricingUnit,
		quantity_rule: raw.quantity_rule || quantityRule,
		charge_group: raw.charge_group || chargeGroup,
		tax_class: raw.tax_class || "taxable",
		archived,
		version: Math.max(Number(raw.version || 1), 1),
		sku: String(raw.sku || "").trim(),
		internal_notes: String(raw.internal_notes || "").trim(),
		category_id: String(raw.category_id || (category ? category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "uncategorized")),
		currency: String(raw.currency || "USD").toUpperCase(),
		default_quantity: Math.max(Number(raw.default_quantity ?? 1), 0),
		minimum_quantity: Math.max(Number(raw.minimum_quantity ?? 0), 0),
		quantity_step: Math.max(Number(raw.quantity_step ?? 1), .01),
		status: archived ? "archived" : "active",
		sort_order: Math.max(Number(raw.sort_order ?? 0), 0),
		created_at: String(raw.created_at || ""),
		updated_at: String(raw.updated_at || "")
	};
}
function legacyCustomer(client, index) {
	return {
		customer_id: String(client.client_id || `customer-legacy-${index + 1}`),
		customer_name: String(client.client_name || "Unnamed customer"),
		organization: "",
		customer_email: String(client.client_email || ""),
		customer_phone: String(client.client_phone || ""),
		billing_address: "",
		internal_notes: "",
		archived: false
	};
}
function legacyEvent(client, index) {
	const customerId = String(client.client_id || `customer-legacy-${index + 1}`);
	const eventType = String(client.event_type || "Private Event");
	return {
		event_id: `event-${customerId.replace(/^client-|^customer-/, "")}`,
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
		archived: false
	};
}
function normalizeCustomer(raw, index) {
	return {
		customer_id: String(raw.customer_id || `customer-${index + 1}`),
		customer_name: String(raw.customer_name || "Unnamed customer"),
		organization: String(raw.organization || ""),
		customer_email: String(raw.customer_email || ""),
		customer_phone: String(raw.customer_phone || ""),
		billing_address: String(raw.billing_address || ""),
		internal_notes: String(raw.internal_notes || ""),
		archived: Boolean(raw.archived)
	};
}
function normalizeEvent(raw, index) {
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
		archived: Boolean(raw.archived)
	};
}
function normalizeStore(input) {
	const raw = clone$1(input || {});
	const companies = (raw.companies || []).map((rawCompany) => {
		const legacyClients = rawCompany.clients || [];
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
			products: (rawCompany.products || []).map((rawProduct, index) => {
				const product = inferProductRules(rawProduct);
				return {
					...product,
					product_id: product.product_id || `product-legacy-${index + 1}`,
					sort_order: rawProduct.sort_order == null ? index : product.sort_order
				};
			}),
			customers: hasNormalizedRecords ? (rawCompany.customers || []).map(normalizeCustomer) : legacyClients.map(legacyCustomer),
			events: hasNormalizedRecords ? (rawCompany.events || []).map(normalizeEvent) : legacyClients.map(legacyEvent),
			product_catalog_version: Math.max(Number(rawCompany.product_catalog_version || 0), 0),
			archived: Boolean(rawCompany.archived)
		};
	});
	return {
		schema_version: 4,
		selected_company: String(raw.selected_company || companies[0]?.business_name || ""),
		companies
	};
}
function defaultProductQuantity(product, event) {
	if (product.quantity_rule === "guest_count") return event.guest_count;
	if (product.quantity_rule === "guest_plus_buffer") return event.guest_count + event.utensils_buffer;
	if (product.quantity_rule === "server_hours") return event.servers_count * event.servers_hours;
	if (product.quantity_rule === "kitchen_staff_hours") return event.kitchen_staff_count * event.kitchen_staff_hours;
	return Math.max(product.default_quantity || 1, product.minimum_quantity || 0);
}
function totals(lineItems, draft, event) {
	const groups = {
		item: 0,
		staff: 0,
		service: 0,
		delivery: 0,
		gratuity: 0
	};
	let taxableLines = 0;
	lineItems.forEach((item) => {
		groups[item.charge_group] += item["Line Total"];
		if (item.tax_class === "taxable") taxableLines += item["Line Total"];
	});
	const serviceCharge = moneyValue(groups.item * draft.service_charge_percent / 100);
	const gratuity = moneyValue(groups.item * draft.gratuity_percent / 100);
	const taxableSubtotal = moneyValue(taxableLines + (draft.service_charge_taxable ? serviceCharge : 0) + (draft.gratuity_taxable ? gratuity : 0));
	const tax = moneyValue(taxableSubtotal * (event.charge_tax ? event.tax_percent : 0) / 100);
	const subtotal = moneyValue(Object.values(groups).reduce((sum, value) => sum + value, 0));
	const total = moneyValue(subtotal + serviceCharge + gratuity + tax);
	const deposit = Math.min(Math.max(moneyValue(draft.deposit_amount), 0), total);
	return {
		items_subtotal: moneyValue(groups.item),
		staff_total: moneyValue(groups.staff),
		service_items_total: moneyValue(groups.service),
		delivery_charge: moneyValue(groups.delivery),
		gratuity_items_total: moneyValue(groups.gratuity),
		subtotal,
		service_charge: serviceCharge,
		gratuity,
		taxable_subtotal: taxableSubtotal,
		tax,
		total,
		deposit,
		balance_due: moneyValue(total - deposit)
	};
}
function calculateDraftSnapshot(store, draft, estimateNumber = "DRAFT", revisionNumber = 0, previous) {
	const company = store.companies.find((item) => item.company_id === draft.company_id);
	const customer = company.customers.find((item) => item.customer_id === draft.customer_id);
	const event = company.events.find((item) => item.event_id === draft.event_id && item.customer_id === draft.customer_id);
	const products = new Map(company.products.map((item) => [item.product_id, item]));
	const lineItems = draft.line_items.filter((item) => item.Description.trim()).map((item) => {
		const product = item.source_product_id ? products.get(item.source_product_id) : void 0;
		const unitPrice = moneyValue(item["Unit Price"]);
		const baselinePrice = item.catalog_price_cents_at_selection == null ? product?.["Unit Price"] : item.catalog_price_cents_at_selection / 100;
		return {
			...clone$1(item),
			"Unit Price": unitPrice,
			"Line Total": moneyValue(item.Qty * unitPrice),
			price_overridden: Boolean(product && moneyValue(baselinePrice) !== unitPrice)
		};
	});
	const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19);
	return {
		estimate_number: estimateNumber,
		revision_id: `revision-${estimateNumber}-${revisionNumber || "preview"}`,
		revision_number: revisionNumber,
		revision_reason: draft.revision_reason || (revisionNumber <= 1 ? "Initial estimate" : "Updated estimate"),
		created_at: previous?.created_at || now,
		updated_at: now,
		issue_date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
		company_id: company.company_id,
		company_name: company.business_name,
		business: {
			company_id: company.company_id,
			business_name: company.business_name,
			business_email: company.business_email,
			business_phone: company.business_phone,
			business_address: company.business_address,
			payment_terms: company.payment_terms,
			estimate_notes: company.estimate_notes
		},
		customer_id: customer.customer_id,
		customer_name: customer.customer_name,
		customer_email: customer.customer_email,
		customer_phone: customer.customer_phone,
		billing_address: customer.billing_address,
		customer: clone$1(customer),
		event_id: event.event_id,
		event_name: event.event_name,
		event_date: event.event_date,
		event_type: event.event_type,
		venue: event.venue,
		guest_count: event.guest_count,
		event: clone$1(event),
		tax_percent: event.charge_tax ? event.tax_percent : 0,
		service_charge_percent: draft.service_charge_percent,
		service_charge_taxable: draft.service_charge_taxable,
		gratuity_percent: draft.gratuity_percent,
		gratuity_taxable: draft.gratuity_taxable,
		deposit: 0,
		notes: draft.notes,
		line_items: lineItems,
		...totals(lineItems, draft, event)
	};
}
function legacyEstimateRecord(raw, store) {
	const company = store.companies.find((item) => item.company_id === raw.company_id) || store.companies[0];
	const legacyCustomerId = String(raw.customer_id || raw.client_id || company.customers[0]?.customer_id || "");
	const customer = company.customers.find((item) => item.customer_id === legacyCustomerId) || company.customers[0];
	const event = company.events.find((item) => item.customer_id === customer.customer_id) || company.events[0];
	const lines = (raw.line_items || []).map((rawLine, index) => {
		const inferred = inferProductRules(rawLine);
		const sourceId = validProductId(rawLine.product_id || rawLine.source_product_id);
		const catalogProduct = company.products.find((item) => item.product_id === sourceId) || company.products.find((item) => item.Description.trim().toLowerCase() === inferred.Description.trim().toLowerCase() && item.Category.trim().toLowerCase() === inferred.Category.trim().toLowerCase());
		const product = catalogProduct || inferred;
		return {
			line_id: `legacy-${String(raw.estimate_number)}-${index + 1}`,
			source_product_id: catalogProduct?.product_id || null,
			source_product_version: catalogProduct?.version ?? null,
			catalog_price_cents_at_selection: catalogProduct ? Math.round(product["Unit Price"] * 100) : null,
			selected_at: String(raw.updated_at || raw.created_at || (/* @__PURE__ */ new Date()).toISOString()),
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
			override_reason: ""
		};
	});
	const hasServiceItem = lines.some((item) => item.charge_group === "service");
	const hasStaffItem = lines.some((item) => item.charge_group === "staff");
	const estimate = calculateDraftSnapshot(store, {
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
		revision_reason: "Imported legacy estimate"
	}, String(raw.estimate_number), 1);
	estimate.revision_id = `revision-${estimate.estimate_number}-1`;
	estimate.created_at = String(raw.created_at || estimate.created_at);
	estimate.updated_at = String(raw.updated_at || estimate.updated_at);
	estimate.issue_date = String(raw.issue_date || estimate.issue_date);
	return {
		estimate_number: estimate.estimate_number,
		archived: false,
		current_revision: 1,
		revisions: [estimate]
	};
}
function normalizeEstimateRecords(input, store) {
	return clone$1(input || []).map((raw) => {
		if (Array.isArray(raw.revisions)) return raw;
		return legacyEstimateRecord(raw, store);
	});
}
function estimateSummary(record) {
	const estimate = record.revisions.find((item) => item.revision_number === record.current_revision) || record.revisions.at(-1);
	return {
		file: `${estimate.estimate_number}.json`,
		estimate_number: estimate.estimate_number,
		revision_number: estimate.revision_number,
		company_id: estimate.company_id,
		customer_id: estimate.customer_id,
		customer_name: estimate.customer_name,
		event_id: estimate.event_id,
		event_name: estimate.event_name,
		event_date: estimate.event_date,
		total: estimate.total,
		updated_at: estimate.updated_at,
		archived: record.archived
	};
}
var companies_default = {
	selected_company: "Silverspoon Catering",
	companies: [{
		"business_name": "Silverspoon Catering",
		"business_email": "silverspoonpe@gmail.com",
		"business_phone": "(650) 863-7435",
		"business_address": "1664 Maywood Ave, Manteca CA 95336",
		"default_tax_percent": 9,
		"default_service_charge_percent": 0,
		"default_gratuity_percent": 0,
		"payment_terms": "",
		"estimate_notes": "Thanks for choosing us! Silverspoon Catering will provide all items for the buffet including chafers, linens, utensils, trinkets, and decorations!",
		"company_id": "company-1",
		"products": [
			{
				"product_id": "None",
				"Category": "Hot Entree",
				"Description": "Stir-Fry Peruvian Lomo Saltado",
				"Notes": "Per Guest",
				"Unit Price": 18
			},
			{
				"product_id": "product-1",
				"Category": "Sides",
				"Description": "Papa A La Huancaina",
				"Notes": "Per Guest",
				"Unit Price": 6
			},
			{
				"product_id": "product-2",
				"Category": "Fruits",
				"Description": "Papaya, Mango",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-3",
				"Category": "Appetizers",
				"Description": "Beef Empanadas w/ Chimichurri",
				"Notes": "Per Guest",
				"Unit Price": 5
			},
			{
				"product_id": "product-4",
				"Category": "Salads",
				"Description": "Asian Fusion Salad Mixed Greens",
				"Notes": "Per Guest",
				"Unit Price": 4
			},
			{
				"product_id": "product-5",
				"Category": "Sides",
				"Description": "French Fries",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-6",
				"Category": "Sides",
				"Description": "Steamed Rice",
				"Notes": "Per Guest",
				"Unit Price": 2
			},
			{
				"product_id": "product-7",
				"Category": "Service",
				"Description": "Service Fee",
				"Notes": "Flat Fee",
				"Unit Price": 200
			},
			{
				"product_id": "product-8",
				"Category": "Staff",
				"Description": "Kitchen Staff",
				"Notes": "Hours",
				"Unit Price": 25
			},
			{
				"product_id": "product-9",
				"Category": "Staff",
				"Description": "Servers",
				"Notes": "Hours",
				"Unit Price": 30
			},
			{
				"product_id": "product-10",
				"Category": "Staff",
				"Description": "Head Chef",
				"Notes": "Flat Fee",
				"Unit Price": 360
			},
			{
				"product_id": "product-11",
				"Category": "Delivery",
				"Description": "Delivery Fee",
				"Notes": "Flat Fee",
				"Unit Price": 150
			},
			{
				"product_id": "product-12",
				"Category": "Utensils",
				"Description": "Napkins",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-13",
				"Category": "Utensils",
				"Description": "Dinner Plates",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-14",
				"Category": "Utensils",
				"Description": "Knifes",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-15",
				"Category": "Utensils",
				"Description": "Forks",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-16",
				"Category": "Utensils",
				"Description": "Wine Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-17",
				"Category": "Utensils",
				"Description": "Water Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-18",
				"Category": "Hot Entree",
				"Description": "Pan Seared Atlantic Salmon w/ Meyer Lemon Beurre Blanc Sauce",
				"Notes": "Per Guest",
				"Unit Price": 27
			},
			{
				"product_id": "product-19",
				"Category": "Hot Entree",
				"Description": "Baked Honey Mustard Chicken Breast",
				"Notes": "Per Guest",
				"Unit Price": 25
			},
			{
				"product_id": "product-20",
				"Category": "Service",
				"Description": "Service Fee (High Guest Count)",
				"Notes": "Flat Fee",
				"Unit Price": 150
			},
			{
				"product_id": "product-21",
				"Category": "Sides",
				"Description": "Crispy Oven Roasted Garlic Potatoes",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-22",
				"Category": "Sides",
				"Description": "Garlic Potato Wedges",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-23",
				"Category": "Sides",
				"Description": "Roasted Fresh Glazed Summer Vegetables",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-24",
				"Category": "Salads",
				"Description": "Fresh Salad/Spring Mix Cranberries, Pecans, Gorgonzola Cheese with Italian Dressing",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-25",
				"Category": "Sides",
				"Description": "Dinner Rolls",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-26",
				"Category": "Hot Entree",
				"Description": "Creamy Garlic Spinach Chicken Breast",
				"Notes": "Per Guest",
				"Unit Price": 25
			}
		],
		"clients": [{
			"client_id": "None",
			"client_name": "Perla Aramburu",
			"client_email": "",
			"client_phone": "(650) 544-5934",
			"event_type": "Wedding",
			"event_date": "11-22-2026",
			"venue": "Fremont, CA",
			"guest_count": 120,
			"servers_count": 5,
			"servers_hours": 6,
			"kitchen_staff_count": 3,
			"kitchen_staff_hours": 8,
			"deposit_amount": 0,
			"utensils_buffer": 20,
			"charge_tax": false,
			"tax_percent": 0
		}, {
			"client_id": "client-bfe31d1f30",
			"client_name": "Nancy Young",
			"client_email": "",
			"client_phone": "",
			"event_type": "Garden Brunch",
			"event_date": "05-02-2026",
			"venue": "",
			"guest_count": 150,
			"servers_count": 0,
			"servers_hours": 0,
			"kitchen_staff_count": 3,
			"kitchen_staff_hours": 8,
			"deposit_amount": 0,
			"utensils_buffer": 0,
			"charge_tax": true,
			"tax_percent": 9
		}]
	}]
};
var counter_default = { next_number: 1348 };
var EST_1269_default = {
	estimate_number: "EST-1269",
	created_at: "2026-04-04T19:09:30",
	updated_at: "2026-04-04T21:17:35",
	company_id: "company-1",
	company_name: "Silverspoon Catering",
	business: {
		"business_name": "Silverspoon Catering",
		"business_email": "silverspoonpe@gmail.com",
		"business_phone": "(650) 863-7435",
		"business_address": "1664 Maywood Ave, Manteca CA 95336",
		"default_tax_percent": 0,
		"default_service_charge_percent": 0,
		"default_gratuity_percent": 0,
		"payment_terms": "",
		"estimate_notes": "Thanks for choosing us! Silverspoon Catering will provide all items for the buffet including chafers, linens, utensils, trinkets, and decorations!",
		"company_id": "company-1",
		"products": [
			{
				"product_id": "None",
				"Category": "Hot Entree",
				"Description": "Stir-Fry Peruvian Lomo Saltado",
				"Notes": "Per Guest",
				"Unit Price": 18
			},
			{
				"product_id": "product-1",
				"Category": "Sides",
				"Description": "Papa A La Huancaina",
				"Notes": "Per Guest",
				"Unit Price": 6
			},
			{
				"product_id": "product-2",
				"Category": "Fruits",
				"Description": "Papaya, Mango",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-3",
				"Category": "Appetizers",
				"Description": "Beef Empanadas w/ Chimichurri",
				"Notes": "Per Guest",
				"Unit Price": 5
			},
			{
				"product_id": "product-4",
				"Category": "Salads",
				"Description": "Asian Fusion Salad Mixed Greens",
				"Notes": "Per Guest",
				"Unit Price": 4
			},
			{
				"product_id": "product-5",
				"Category": "Sides",
				"Description": "French Fries",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-6",
				"Category": "Sides",
				"Description": "Steamed Rice",
				"Notes": "Per Guest",
				"Unit Price": 2
			},
			{
				"product_id": "product-7",
				"Category": "Service",
				"Description": "Service Fee",
				"Notes": "Flat Fee",
				"Unit Price": 200
			},
			{
				"product_id": "product-8",
				"Category": "Staff",
				"Description": "Kitchen Staff",
				"Notes": "Hours",
				"Unit Price": 25
			},
			{
				"product_id": "product-9",
				"Category": "Staff",
				"Description": "Servers",
				"Notes": "Hours",
				"Unit Price": 30
			},
			{
				"product_id": "product-10",
				"Category": "Staff",
				"Description": "Head Chef",
				"Notes": "Hours",
				"Unit Price": 45
			},
			{
				"product_id": "product-11",
				"Category": "Delivery",
				"Description": "Delivery Fee",
				"Notes": "Flat Fee",
				"Unit Price": 150
			},
			{
				"product_id": "product-12",
				"Category": "Utensils",
				"Description": "Napkins",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-13",
				"Category": "Utensils",
				"Description": "Dinner Plates",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-14",
				"Category": "Utensils",
				"Description": "Knifes",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-15",
				"Category": "Utensils",
				"Description": "Forks",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-16",
				"Category": "Utensils",
				"Description": "Wine Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-17",
				"Category": "Utensils",
				"Description": "Water Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			}
		],
		"clients": [{
			"client_id": "None",
			"client_name": "Perla Aramburu",
			"client_email": "",
			"client_phone": "(650) 544-5934",
			"event_type": "Wedding",
			"event_date": "11-22-2026",
			"venue": "Fremont, CA",
			"guest_count": 120,
			"servers_count": 5,
			"servers_hours": 6,
			"kitchen_staff_count": 3,
			"kitchen_staff_hours": 8,
			"deposit_amount": 0,
			"utensils_buffer": 20
		}]
	},
	client_id: "None",
	issue_date: "2026-04-04",
	client_name: "Perla Aramburu",
	client_email: "",
	client_phone: "(650) 544-5934",
	event_date: "11-22-2026",
	event_type: "Wedding",
	venue: "Fremont, CA",
	guest_count: 120,
	tax_percent: 0,
	service_charge_percent: 0,
	gratuity_percent: 0,
	notes: "",
	line_items: [
		{
			"product_id": "None",
			"Category": "Hot Entree",
			"Description": "Stir-Fry Peruvian Lomo Saltado",
			"Notes": "Per Guest",
			"Qty": 120,
			"Unit Price": 18,
			"Line Total": 2160
		},
		{
			"product_id": "product-5",
			"Category": "Sides",
			"Description": "French Fries",
			"Notes": "Per Guest",
			"Qty": 120,
			"Unit Price": 3,
			"Line Total": 360
		},
		{
			"product_id": "product-6",
			"Category": "Sides",
			"Description": "Steamed Rice",
			"Notes": "Per Guest",
			"Qty": 120,
			"Unit Price": 2,
			"Line Total": 240
		},
		{
			"product_id": "product-1",
			"Category": "Sides",
			"Description": "Papa A La Huancaina",
			"Notes": "Per Guest",
			"Qty": 120,
			"Unit Price": 6,
			"Line Total": 720
		},
		{
			"product_id": "product-4",
			"Category": "Salads",
			"Description": "Asian Fusion Salad Mixed Greens",
			"Notes": "Per Guest",
			"Qty": 120,
			"Unit Price": 4,
			"Line Total": 480
		},
		{
			"product_id": "product-2",
			"Category": "Fruits",
			"Description": "Papaya, Mango",
			"Notes": "Per Guest",
			"Qty": 120,
			"Unit Price": 3,
			"Line Total": 360
		},
		{
			"product_id": "product-3",
			"Category": "Appetizers",
			"Description": "Beef Empanadas w/ Chimichurri",
			"Notes": "Per Guest",
			"Qty": 120,
			"Unit Price": 5,
			"Line Total": 600
		},
		{
			"product_id": "product-12",
			"Category": "Utensils",
			"Description": "Napkins",
			"Notes": "Per Guest",
			"Qty": 140,
			"Unit Price": 1,
			"Line Total": 140
		},
		{
			"product_id": "product-13",
			"Category": "Utensils",
			"Description": "Dinner Plates",
			"Notes": "Per Guest",
			"Qty": 140,
			"Unit Price": 1,
			"Line Total": 140
		},
		{
			"product_id": "product-14",
			"Category": "Utensils",
			"Description": "Knifes",
			"Notes": "Per Guest",
			"Qty": 140,
			"Unit Price": 1,
			"Line Total": 140
		},
		{
			"product_id": "product-15",
			"Category": "Utensils",
			"Description": "Forks",
			"Notes": "Per Guest",
			"Qty": 140,
			"Unit Price": 1,
			"Line Total": 140
		},
		{
			"product_id": "product-16",
			"Category": "Utensils",
			"Description": "Wine Glasses",
			"Notes": "Per Guest",
			"Qty": 140,
			"Unit Price": 1,
			"Line Total": 140
		},
		{
			"product_id": "product-17",
			"Category": "Utensils",
			"Description": "Water Glasses",
			"Notes": "Per Guest",
			"Qty": 140,
			"Unit Price": 1,
			"Line Total": 140
		},
		{
			"product_id": "product-8",
			"Category": "Staff",
			"Description": "Kitchen Staff",
			"Notes": "Hours",
			"Qty": 24,
			"Unit Price": 25,
			"Line Total": 600
		},
		{
			"product_id": "product-9",
			"Category": "Staff",
			"Description": "Servers",
			"Notes": "Hours",
			"Qty": 30,
			"Unit Price": 30,
			"Line Total": 900
		},
		{
			"product_id": "product-10",
			"Category": "Staff",
			"Description": "Head Chef",
			"Notes": "WAIVED",
			"Qty": 0,
			"Unit Price": 45,
			"Line Total": 0
		},
		{
			"product_id": "product-7",
			"Category": "Service",
			"Description": "Service Fee",
			"Notes": "Flat Fee",
			"Qty": 1,
			"Unit Price": 200,
			"Line Total": 200
		},
		{
			"product_id": "product-11",
			"Category": "Delivery",
			"Description": "Delivery Fee",
			"Notes": "Flat Fee",
			"Qty": 1,
			"Unit Price": 150,
			"Line Total": 150
		}
	],
	subtotal: 5760,
	service_charge: 200,
	gratuity: 1500,
	delivery_charge: 150,
	tax: 0,
	total: 7610,
	deposit: 0,
	balance_due: 7610,
	selected_product_ids: [
		"None",
		"product-5",
		"product-6",
		"product-1",
		"product-4",
		"product-2",
		"product-3",
		"product-12",
		"product-13",
		"product-14",
		"product-15",
		"product-16",
		"product-17",
		"product-8",
		"product-9",
		"product-10",
		"product-7",
		"product-11"
	]
};
var EST_1321_default = {
	estimate_number: "EST-1321",
	created_at: "2026-04-22T04:47:07",
	updated_at: "2026-04-22T05:28:06",
	company_id: "company-1",
	company_name: "Silverspoon Catering",
	business: {
		"business_name": "Silverspoon Catering",
		"business_email": "silverspoonpe@gmail.com",
		"business_phone": "(650) 863-7435",
		"business_address": "1664 Maywood Ave, Manteca CA 95336",
		"default_tax_percent": 0,
		"default_service_charge_percent": 0,
		"default_gratuity_percent": 0,
		"payment_terms": "",
		"estimate_notes": "Thanks for choosing us! Silverspoon Catering will provide all items for the buffet including chafers, linens, utensils, trinkets, and decorations!",
		"company_id": "company-1",
		"products": [
			{
				"product_id": "None",
				"Category": "Hot Entree",
				"Description": "Stir-Fry Peruvian Lomo Saltado",
				"Notes": "Per Guest",
				"Unit Price": 18
			},
			{
				"product_id": "product-1",
				"Category": "Sides",
				"Description": "Papa A La Huancaina",
				"Notes": "Per Guest",
				"Unit Price": 6
			},
			{
				"product_id": "product-2",
				"Category": "Fruits",
				"Description": "Papaya, Mango",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-3",
				"Category": "Appetizers",
				"Description": "Beef Empanadas w/ Chimichurri",
				"Notes": "Per Guest",
				"Unit Price": 5
			},
			{
				"product_id": "product-4",
				"Category": "Salads",
				"Description": "Asian Fusion Salad Mixed Greens",
				"Notes": "Per Guest",
				"Unit Price": 4
			},
			{
				"product_id": "product-5",
				"Category": "Sides",
				"Description": "French Fries",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-6",
				"Category": "Sides",
				"Description": "Steamed Rice",
				"Notes": "Per Guest",
				"Unit Price": 2
			},
			{
				"product_id": "product-7",
				"Category": "Service",
				"Description": "Service Fee",
				"Notes": "Flat Fee",
				"Unit Price": 200
			},
			{
				"product_id": "product-8",
				"Category": "Staff",
				"Description": "Kitchen Staff",
				"Notes": "Hours",
				"Unit Price": 25
			},
			{
				"product_id": "product-9",
				"Category": "Staff",
				"Description": "Servers",
				"Notes": "Hours",
				"Unit Price": 30
			},
			{
				"product_id": "product-10",
				"Category": "Staff",
				"Description": "Head Chef",
				"Notes": "Flat Fee",
				"Unit Price": 360
			},
			{
				"product_id": "product-11",
				"Category": "Delivery",
				"Description": "Delivery Fee",
				"Notes": "Flat Fee",
				"Unit Price": 150
			},
			{
				"product_id": "product-12",
				"Category": "Utensils",
				"Description": "Napkins",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-13",
				"Category": "Utensils",
				"Description": "Dinner Plates",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-14",
				"Category": "Utensils",
				"Description": "Knifes",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-15",
				"Category": "Utensils",
				"Description": "Forks",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-16",
				"Category": "Utensils",
				"Description": "Wine Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-17",
				"Category": "Utensils",
				"Description": "Water Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-18",
				"Category": "Hot Entree",
				"Description": "Pan Seared Atlantic Salmon w/ Meyer Lemon Beurre Blanc Sauce",
				"Notes": "Per Guest",
				"Unit Price": 27
			},
			{
				"product_id": "product-19",
				"Category": "Hot Entree",
				"Description": "Baked Honey Mustard Chicken Breast",
				"Notes": "Per Guest",
				"Unit Price": 25
			},
			{
				"product_id": "product-20",
				"Category": "Service",
				"Description": "Service Fee (High Guest Count)",
				"Notes": "Flat Fee",
				"Unit Price": 150
			},
			{
				"product_id": "product-21",
				"Category": "Sides",
				"Description": "Crispy Oven Roasted Garlic Potatoes",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-22",
				"Category": "Sides",
				"Description": "Garlic Potato Wedges",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-23",
				"Category": "Sides",
				"Description": "Roasted Fresh Glazed Summer Vegetables",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-24",
				"Category": "Salads",
				"Description": "Fresh Salad/Spring Mix Cranberries, Pecans, Gorgonzola Cheese with Italian Dressing",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-25",
				"Category": "Sides",
				"Description": "Dinner Rolls",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-26",
				"Category": "Hot Entree",
				"Description": "Creamy Garlic Spinach Chicken Breast",
				"Notes": "Per Guest",
				"Unit Price": 25
			}
		],
		"clients": [{
			"client_id": "None",
			"client_name": "Perla Aramburu",
			"client_email": "",
			"client_phone": "(650) 544-5934",
			"event_type": "Wedding",
			"event_date": "11-22-2026",
			"venue": "Fremont, CA",
			"guest_count": 120,
			"servers_count": 5,
			"servers_hours": 6,
			"kitchen_staff_count": 3,
			"kitchen_staff_hours": 8,
			"deposit_amount": 0,
			"utensils_buffer": 20
		}, {
			"client_id": "client-bfe31d1f30",
			"client_name": "Nancy Young",
			"client_email": "",
			"client_phone": "",
			"event_type": "Garden Brunch",
			"event_date": "05-02-2026",
			"venue": "",
			"guest_count": 150,
			"servers_count": 0,
			"servers_hours": 0,
			"kitchen_staff_count": 3,
			"kitchen_staff_hours": 8,
			"deposit_amount": 0,
			"utensils_buffer": 0
		}]
	},
	client_id: "client-bfe31d1f30",
	issue_date: "2026-04-22",
	client_name: "Nancy Young",
	client_email: "",
	client_phone: "",
	event_date: "05-02-2026",
	event_type: "Garden Brunch",
	venue: "",
	guest_count: 150,
	tax_percent: 0,
	service_charge_percent: 0,
	gratuity_percent: 0,
	notes: "",
	line_items: [
		{
			"product_id": "product-18",
			"Category": "Hot Entree",
			"Description": "Pan Seared Atlantic Salmon w/ Meyer Lemon Beurre Blanc Sauce",
			"Notes": "Per Guest",
			"Qty": 150,
			"Unit Price": 27,
			"Line Total": 4050
		},
		{
			"product_id": "product-22",
			"Category": "Sides",
			"Description": "Garlic Potato Wedges",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-23",
			"Category": "Sides",
			"Description": "Roasted Fresh Glazed Summer Vegetables",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-24",
			"Category": "Salads",
			"Description": "Fresh Salad/Spring Mix Cranberries, Pecans, Gorgonzola Cheese with Italian Dressing",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-25",
			"Category": "Sides",
			"Description": "Dinner Rolls",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-8",
			"Category": "Staff",
			"Description": "Kitchen Staff",
			"Notes": "Hours",
			"Qty": 24,
			"Unit Price": 25,
			"Line Total": 600
		},
		{
			"product_id": "product-10",
			"Category": "Staff",
			"Description": "Head Chef",
			"Notes": "Flat Fee",
			"Qty": 1,
			"Unit Price": 360,
			"Line Total": 360
		},
		{
			"product_id": "product-20",
			"Category": "Service",
			"Description": "Service Fee (High Guest Count)",
			"Notes": "Flat Fee",
			"Qty": 1,
			"Unit Price": 150,
			"Line Total": 150
		},
		{
			"product_id": "product-11",
			"Category": "Delivery",
			"Description": "Delivery Fee",
			"Notes": "Flat Fee",
			"Qty": 1,
			"Unit Price": 150,
			"Line Total": 150
		}
	],
	subtotal: 4050,
	service_charge: 150,
	gratuity: 960,
	delivery_charge: 150,
	tax: 0,
	total: 5310,
	deposit: 0,
	balance_due: 5310,
	selected_product_ids: [
		"product-18",
		"product-22",
		"product-23",
		"product-24",
		"product-25",
		"product-8",
		"product-10",
		"product-20",
		"product-11"
	]
};
var EST_1337_default = {
	estimate_number: "EST-1337",
	created_at: "2026-04-22T05:22:15",
	updated_at: "2026-04-22T05:22:16",
	company_id: "company-1",
	company_name: "Silverspoon Catering",
	business: {
		"business_name": "Silverspoon Catering",
		"business_email": "silverspoonpe@gmail.com",
		"business_phone": "(650) 863-7435",
		"business_address": "1664 Maywood Ave, Manteca CA 95336",
		"default_tax_percent": 0,
		"default_service_charge_percent": 0,
		"default_gratuity_percent": 0,
		"payment_terms": "",
		"estimate_notes": "Thanks for choosing us! Silverspoon Catering will provide all items for the buffet including chafers, linens, utensils, trinkets, and decorations!",
		"company_id": "company-1",
		"products": [
			{
				"product_id": "None",
				"Category": "Hot Entree",
				"Description": "Stir-Fry Peruvian Lomo Saltado",
				"Notes": "Per Guest",
				"Unit Price": 18
			},
			{
				"product_id": "product-1",
				"Category": "Sides",
				"Description": "Papa A La Huancaina",
				"Notes": "Per Guest",
				"Unit Price": 6
			},
			{
				"product_id": "product-2",
				"Category": "Fruits",
				"Description": "Papaya, Mango",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-3",
				"Category": "Appetizers",
				"Description": "Beef Empanadas w/ Chimichurri",
				"Notes": "Per Guest",
				"Unit Price": 5
			},
			{
				"product_id": "product-4",
				"Category": "Salads",
				"Description": "Asian Fusion Salad Mixed Greens",
				"Notes": "Per Guest",
				"Unit Price": 4
			},
			{
				"product_id": "product-5",
				"Category": "Sides",
				"Description": "French Fries",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-6",
				"Category": "Sides",
				"Description": "Steamed Rice",
				"Notes": "Per Guest",
				"Unit Price": 2
			},
			{
				"product_id": "product-7",
				"Category": "Service",
				"Description": "Service Fee",
				"Notes": "Flat Fee",
				"Unit Price": 200
			},
			{
				"product_id": "product-8",
				"Category": "Staff",
				"Description": "Kitchen Staff",
				"Notes": "Hours",
				"Unit Price": 25
			},
			{
				"product_id": "product-9",
				"Category": "Staff",
				"Description": "Servers",
				"Notes": "Hours",
				"Unit Price": 30
			},
			{
				"product_id": "product-10",
				"Category": "Staff",
				"Description": "Head Chef",
				"Notes": "Hours",
				"Unit Price": 45
			},
			{
				"product_id": "product-11",
				"Category": "Delivery",
				"Description": "Delivery Fee",
				"Notes": "Flat Fee",
				"Unit Price": 150
			},
			{
				"product_id": "product-12",
				"Category": "Utensils",
				"Description": "Napkins",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-13",
				"Category": "Utensils",
				"Description": "Dinner Plates",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-14",
				"Category": "Utensils",
				"Description": "Knifes",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-15",
				"Category": "Utensils",
				"Description": "Forks",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-16",
				"Category": "Utensils",
				"Description": "Wine Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-17",
				"Category": "Utensils",
				"Description": "Water Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-18",
				"Category": "Hot Entree",
				"Description": "Pan Seared Atlantic Salmon w/ Meyer Lemon Beurre Blanc Sauce",
				"Notes": "Per Guest",
				"Unit Price": 27
			},
			{
				"product_id": "product-19",
				"Category": "Hot Entree",
				"Description": "Baked Honey Mustard Chicken Breast",
				"Notes": "Per Guest",
				"Unit Price": 25
			},
			{
				"product_id": "product-20",
				"Category": "Service",
				"Description": "Service Fee (High Guest Count)",
				"Notes": "Flat Fee",
				"Unit Price": 150
			},
			{
				"product_id": "product-21",
				"Category": "Sides",
				"Description": "Crispy Oven Roasted Garlic Potatoes",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-22",
				"Category": "Sides",
				"Description": "Garlic Potato Wedges",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-23",
				"Category": "Sides",
				"Description": "Roasted Fresh Glazed Summer Vegetables",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-24",
				"Category": "Salads",
				"Description": "Fresh Salad/Spring Mix Cranberries, Pecans, Gorgonzola Cheese with Italian Dressing",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-25",
				"Category": "Sides",
				"Description": "Dinner Rolls",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-26",
				"Category": "Hot Entree",
				"Description": "Creamy Garlic Spinach Chicken Breast",
				"Notes": "Per Guest",
				"Unit Price": 25
			}
		],
		"clients": [{
			"client_id": "None",
			"client_name": "Perla Aramburu",
			"client_email": "",
			"client_phone": "(650) 544-5934",
			"event_type": "Wedding",
			"event_date": "11-22-2026",
			"venue": "Fremont, CA",
			"guest_count": 120,
			"servers_count": 5,
			"servers_hours": 6,
			"kitchen_staff_count": 3,
			"kitchen_staff_hours": 8,
			"deposit_amount": 0,
			"utensils_buffer": 20
		}, {
			"client_id": "client-bfe31d1f30",
			"client_name": "Nancy Young",
			"client_email": "",
			"client_phone": "",
			"event_type": "Garden Brunch",
			"event_date": "05-02-2026",
			"venue": "",
			"guest_count": 150,
			"servers_count": 0,
			"servers_hours": 0,
			"kitchen_staff_count": 3,
			"kitchen_staff_hours": 8,
			"deposit_amount": 0,
			"utensils_buffer": 0
		}]
	},
	client_id: "client-bfe31d1f30",
	issue_date: "2026-04-22",
	client_name: "Nancy Young",
	client_email: "",
	client_phone: "",
	event_date: "05-02-2026",
	event_type: "Garden Brunch",
	venue: "",
	guest_count: 150,
	tax_percent: 0,
	service_charge_percent: 0,
	gratuity_percent: 0,
	notes: "",
	line_items: [
		{
			"product_id": "product-19",
			"Category": "Hot Entree",
			"Description": "Baked Honey Mustard Chicken Breast",
			"Notes": "Per Guest",
			"Qty": 150,
			"Unit Price": 25,
			"Line Total": 3750
		},
		{
			"product_id": "product-22",
			"Category": "Sides",
			"Description": "Garlic Potato Wedges",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-23",
			"Category": "Sides",
			"Description": "Roasted Fresh Glazed Summer Vegetables",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-24",
			"Category": "Salads",
			"Description": "Fresh Salad/Spring Mix Cranberries, Pecans, Gorgonzola Cheese with Italian Dressing",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-25",
			"Category": "Sides",
			"Description": "Dinner Rolls",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-8",
			"Category": "Staff",
			"Description": "Kitchen Staff",
			"Notes": "Hours",
			"Qty": 24,
			"Unit Price": 25,
			"Line Total": 600
		},
		{
			"product_id": "product-10",
			"Category": "Staff",
			"Description": "Head Chef",
			"Notes": "Hours",
			"Qty": 1,
			"Unit Price": 45,
			"Line Total": 45
		},
		{
			"product_id": "product-20",
			"Category": "Service",
			"Description": "Service Fee (High Guest Count)",
			"Notes": "Flat Fee",
			"Qty": 1,
			"Unit Price": 150,
			"Line Total": 150
		},
		{
			"product_id": "product-11",
			"Category": "Delivery",
			"Description": "Delivery Fee",
			"Notes": "Flat Fee",
			"Qty": 1,
			"Unit Price": 150,
			"Line Total": 150
		}
	],
	subtotal: 3750,
	service_charge: 150,
	gratuity: 645,
	delivery_charge: 150,
	tax: 0,
	total: 4695,
	deposit: 0,
	balance_due: 4695,
	selected_product_ids: [
		"product-19",
		"product-22",
		"product-23",
		"product-24",
		"product-25",
		"product-8",
		"product-10",
		"product-20",
		"product-11"
	]
};
var EST_1338_default = {
	estimate_number: "EST-1338",
	created_at: "2026-04-22T05:23:29",
	updated_at: "2026-04-22T05:23:29",
	company_id: "company-1",
	company_name: "Silverspoon Catering",
	business: {
		"business_name": "Silverspoon Catering",
		"business_email": "silverspoonpe@gmail.com",
		"business_phone": "(650) 863-7435",
		"business_address": "1664 Maywood Ave, Manteca CA 95336",
		"default_tax_percent": 0,
		"default_service_charge_percent": 0,
		"default_gratuity_percent": 0,
		"payment_terms": "",
		"estimate_notes": "Thanks for choosing us! Silverspoon Catering will provide all items for the buffet including chafers, linens, utensils, trinkets, and decorations!",
		"company_id": "company-1",
		"products": [
			{
				"product_id": "None",
				"Category": "Hot Entree",
				"Description": "Stir-Fry Peruvian Lomo Saltado",
				"Notes": "Per Guest",
				"Unit Price": 18
			},
			{
				"product_id": "product-1",
				"Category": "Sides",
				"Description": "Papa A La Huancaina",
				"Notes": "Per Guest",
				"Unit Price": 6
			},
			{
				"product_id": "product-2",
				"Category": "Fruits",
				"Description": "Papaya, Mango",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-3",
				"Category": "Appetizers",
				"Description": "Beef Empanadas w/ Chimichurri",
				"Notes": "Per Guest",
				"Unit Price": 5
			},
			{
				"product_id": "product-4",
				"Category": "Salads",
				"Description": "Asian Fusion Salad Mixed Greens",
				"Notes": "Per Guest",
				"Unit Price": 4
			},
			{
				"product_id": "product-5",
				"Category": "Sides",
				"Description": "French Fries",
				"Notes": "Per Guest",
				"Unit Price": 3
			},
			{
				"product_id": "product-6",
				"Category": "Sides",
				"Description": "Steamed Rice",
				"Notes": "Per Guest",
				"Unit Price": 2
			},
			{
				"product_id": "product-7",
				"Category": "Service",
				"Description": "Service Fee",
				"Notes": "Flat Fee",
				"Unit Price": 200
			},
			{
				"product_id": "product-8",
				"Category": "Staff",
				"Description": "Kitchen Staff",
				"Notes": "Hours",
				"Unit Price": 25
			},
			{
				"product_id": "product-9",
				"Category": "Staff",
				"Description": "Servers",
				"Notes": "Hours",
				"Unit Price": 30
			},
			{
				"product_id": "product-10",
				"Category": "Staff",
				"Description": "Head Chef",
				"Notes": "Hours",
				"Unit Price": 45
			},
			{
				"product_id": "product-11",
				"Category": "Delivery",
				"Description": "Delivery Fee",
				"Notes": "Flat Fee",
				"Unit Price": 150
			},
			{
				"product_id": "product-12",
				"Category": "Utensils",
				"Description": "Napkins",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-13",
				"Category": "Utensils",
				"Description": "Dinner Plates",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-14",
				"Category": "Utensils",
				"Description": "Knifes",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-15",
				"Category": "Utensils",
				"Description": "Forks",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-16",
				"Category": "Utensils",
				"Description": "Wine Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-17",
				"Category": "Utensils",
				"Description": "Water Glasses",
				"Notes": "Per Guest",
				"Unit Price": 1
			},
			{
				"product_id": "product-18",
				"Category": "Hot Entree",
				"Description": "Pan Seared Atlantic Salmon w/ Meyer Lemon Beurre Blanc Sauce",
				"Notes": "Per Guest",
				"Unit Price": 27
			},
			{
				"product_id": "product-19",
				"Category": "Hot Entree",
				"Description": "Baked Honey Mustard Chicken Breast",
				"Notes": "Per Guest",
				"Unit Price": 25
			},
			{
				"product_id": "product-20",
				"Category": "Service",
				"Description": "Service Fee (High Guest Count)",
				"Notes": "Flat Fee",
				"Unit Price": 150
			},
			{
				"product_id": "product-21",
				"Category": "Sides",
				"Description": "Crispy Oven Roasted Garlic Potatoes",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-22",
				"Category": "Sides",
				"Description": "Garlic Potato Wedges",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-23",
				"Category": "Sides",
				"Description": "Roasted Fresh Glazed Summer Vegetables",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-24",
				"Category": "Salads",
				"Description": "Fresh Salad/Spring Mix Cranberries, Pecans, Gorgonzola Cheese with Italian Dressing",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-25",
				"Category": "Sides",
				"Description": "Dinner Rolls",
				"Notes": "None",
				"Unit Price": 0
			},
			{
				"product_id": "product-26",
				"Category": "Hot Entree",
				"Description": "Creamy Garlic Spinach Chicken Breast",
				"Notes": "Per Guest",
				"Unit Price": 25
			}
		],
		"clients": [{
			"client_id": "None",
			"client_name": "Perla Aramburu",
			"client_email": "",
			"client_phone": "(650) 544-5934",
			"event_type": "Wedding",
			"event_date": "11-22-2026",
			"venue": "Fremont, CA",
			"guest_count": 120,
			"servers_count": 5,
			"servers_hours": 6,
			"kitchen_staff_count": 3,
			"kitchen_staff_hours": 8,
			"deposit_amount": 0,
			"utensils_buffer": 20
		}, {
			"client_id": "client-bfe31d1f30",
			"client_name": "Nancy Young",
			"client_email": "",
			"client_phone": "",
			"event_type": "Garden Brunch",
			"event_date": "05-02-2026",
			"venue": "",
			"guest_count": 150,
			"servers_count": 0,
			"servers_hours": 0,
			"kitchen_staff_count": 3,
			"kitchen_staff_hours": 8,
			"deposit_amount": 0,
			"utensils_buffer": 0
		}]
	},
	client_id: "client-bfe31d1f30",
	issue_date: "2026-04-22",
	client_name: "Nancy Young",
	client_email: "",
	client_phone: "",
	event_date: "05-02-2026",
	event_type: "Garden Brunch",
	venue: "",
	guest_count: 150,
	tax_percent: 0,
	service_charge_percent: 0,
	gratuity_percent: 0,
	notes: "",
	line_items: [
		{
			"product_id": "product-26",
			"Category": "Hot Entree",
			"Description": "Creamy Garlic Spinach Chicken Breast",
			"Notes": "Per Guest",
			"Qty": 150,
			"Unit Price": 25,
			"Line Total": 3750
		},
		{
			"product_id": "product-21",
			"Category": "Sides",
			"Description": "Crispy Oven Roasted Garlic Potatoes",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-23",
			"Category": "Sides",
			"Description": "Roasted Fresh Glazed Summer Vegetables",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-24",
			"Category": "Salads",
			"Description": "Fresh Salad/Spring Mix Cranberries, Pecans, Gorgonzola Cheese with Italian Dressing",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-25",
			"Category": "Sides",
			"Description": "Dinner Rolls",
			"Notes": "None",
			"Qty": 150,
			"Unit Price": 0,
			"Line Total": 0
		},
		{
			"product_id": "product-8",
			"Category": "Staff",
			"Description": "Kitchen Staff",
			"Notes": "Hours",
			"Qty": 24,
			"Unit Price": 25,
			"Line Total": 600
		},
		{
			"product_id": "product-10",
			"Category": "Staff",
			"Description": "Head Chef",
			"Notes": "Hours",
			"Qty": 1,
			"Unit Price": 45,
			"Line Total": 45
		},
		{
			"product_id": "product-20",
			"Category": "Service",
			"Description": "Service Fee (High Guest Count)",
			"Notes": "Flat Fee",
			"Qty": 1,
			"Unit Price": 150,
			"Line Total": 150
		},
		{
			"product_id": "product-11",
			"Category": "Delivery",
			"Description": "Delivery Fee",
			"Notes": "Flat Fee",
			"Qty": 1,
			"Unit Price": 150,
			"Line Total": 150
		}
	],
	subtotal: 3750,
	service_charge: 150,
	gratuity: 645,
	delivery_charge: 150,
	tax: 0,
	total: 4695,
	deposit: 0,
	balance_due: 4695,
	selected_product_ids: [
		"product-26",
		"product-21",
		"product-23",
		"product-24",
		"product-25",
		"product-8",
		"product-10",
		"product-20",
		"product-11"
	]
};
//#endregion
//#region lib/api.ts
var API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
var STORAGE_KEY = "silverspoon-office-demo-v4";
var LEGACY_STORAGE_KEYS = ["silverspoon-office-demo-v3", "silverspoon-office-demo-v2"];
var productHistoryKey = (companyId, productId) => `${companyId}:${productId}`;
var utcNow = () => (/* @__PURE__ */ new Date()).toISOString();
var productId = () => `product-${Date.now()}-${Math.random().toString(16).slice(2)}`;
function canonicalToProduct(product) {
	return inferProductRules(product);
}
function productToCanonical(companyId, product) {
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
		updated_at: product.updated_at
	};
}
function revisionFor(companyId, product, changeReason) {
	return {
		revision_id: `product-revision-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		product_id: product.product_id,
		company_id: companyId,
		version: product.version,
		change_reason: changeReason.trim() || "Product updated",
		changed_at: product.updated_at,
		snapshot: productToCanonical(companyId, product)
	};
}
function ensureProductHistories(store, histories) {
	const normalized = clone$1(histories || {});
	store.companies.forEach((company) => company.products.forEach((product) => {
		const key = productHistoryKey(company.company_id, product.product_id);
		if (!normalized[key]?.length) normalized[key] = [revisionFor(company.company_id, product, "Imported product")];
	}));
	return normalized;
}
function normalizeDemoState(input) {
	const raw = input || {};
	const store = normalizeStore(raw.store || companies_default);
	return {
		store,
		estimates: normalizeEstimateRecords(raw.estimates || [], store),
		nextNumber: Number(raw.nextNumber || counter_default.next_number),
		productRevisions: ensureProductHistories(store, raw.productRevisions)
	};
}
function seededDemo() {
	const store = normalizeStore(companies_default);
	return {
		store,
		nextNumber: counter_default.next_number,
		estimates: normalizeEstimateRecords([
			EST_1269_default,
			EST_1321_default,
			EST_1337_default,
			EST_1338_default
		], store),
		productRevisions: ensureProductHistories(store)
	};
}
async function request(path, init) {
	const response = await fetch(`${API_BASE}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...init?.headers ?? {}
		}
	});
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.detail ?? `Request failed (${response.status})`);
	}
	if (response.status === 204) return void 0;
	return response.json();
}
async function loadDemo() {
	try {
		if (typeof window !== "undefined") {
			const saved = window.localStorage?.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((key) => window.localStorage?.getItem(key)).find(Boolean);
			if (saved) {
				const migrated = normalizeDemoState(JSON.parse(saved));
				saveDemo(migrated);
				return migrated;
			}
		}
	} catch {}
	const state = seededDemo();
	saveDemo(state);
	return state;
}
function saveDemo(state) {
	try {
		if (typeof window !== "undefined") window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {}
}
function companyDefaults(values) {
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
		archived: false
	};
}
function activeRevision(record) {
	return record.revisions.find((item) => item.revision_number === record.current_revision) || record.revisions.at(-1);
}
function demoCompany(state, companyId) {
	const company = state.store.companies.find((item) => item.company_id === companyId && !item.archived);
	if (!company) throw new Error("Company not found");
	return company;
}
function assertAvailableSku(company, sku, exceptProductId = "") {
	const normalized = sku.trim().toLowerCase();
	if (!normalized) return;
	if (company.products.some((item) => item.product_id !== exceptProductId && item.sku.trim().toLowerCase() === normalized)) throw new Error(`SKU ${sku.trim()} is already used by another product`);
}
function productFromFields(companyId, fields, existing) {
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
		company_id: companyId
	});
}
function recordDemoProductRevision(state, companyId, product, reason) {
	const key = productHistoryKey(companyId, product.product_id);
	state.productRevisions[key] = [...state.productRevisions[key] || [], revisionFor(companyId, product, reason)];
}
function setDemoProductStatus(state, companyId, targetProductId, expectedVersion, status, reason) {
	const company = demoCompany(state, companyId);
	const index = company.products.findIndex((item) => item.product_id === targetProductId);
	if (index < 0) throw new Error("Product not found");
	const current = company.products[index];
	if (current.version !== expectedVersion) throw new Error(`Product changed since version ${expectedVersion}; current version is ${current.version}`);
	if (current.status === status) return clone$1(current);
	const updated = {
		...current,
		archived: status === "archived",
		status,
		version: current.version + 1,
		updated_at: utcNow()
	};
	company.products[index] = updated;
	company.product_catalog_version = (company.product_catalog_version || 0) + 1;
	recordDemoProductRevision(state, companyId, updated, reason);
	return clone$1(updated);
}
function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
var officeApi = {
	initialBootstrap() {
		const state = seededDemo();
		return {
			store: clone$1(state.store),
			estimates: state.estimates.filter((record) => !record.archived).map(estimateSummary),
			mode: "demo"
		};
	},
	async bootstrap() {
		if (API_BASE) {
			const response = await request("/api/bootstrap");
			return {
				store: normalizeStore(response.store),
				estimates: response.estimates,
				mode: "api"
			};
		}
		const state = await loadDemo();
		return {
			store: clone$1(state.store),
			estimates: state.estimates.filter((record) => !record.archived).map(estimateSummary),
			mode: "demo"
		};
	},
	async createCompany(values) {
		if (API_BASE) return request("/api/companies", {
			method: "POST",
			body: JSON.stringify(values)
		});
		const state = await loadDemo();
		const company = companyDefaults({
			...values,
			company_id: `company-${Date.now()}`
		});
		state.store.companies.push(company);
		state.store.selected_company = company.business_name;
		saveDemo(state);
		return clone$1(company);
	},
	async updateCompany(company) {
		const values = { ...company };
		delete values.products;
		delete values.customers;
		delete values.events;
		delete values.company_id;
		delete values.archived;
		if (API_BASE) return request(`/api/companies/${company.company_id}`, {
			method: "PUT",
			body: JSON.stringify(values)
		});
		const state = await loadDemo();
		const index = state.store.companies.findIndex((item) => item.company_id === company.company_id);
		if (index < 0) throw new Error("Company not found");
		const current = state.store.companies[index];
		const updated = {
			...current,
			...values,
			company_id: current.company_id
		};
		state.store.companies[index] = clone$1(updated);
		state.store.selected_company = updated.business_name;
		saveDemo(state);
		return clone$1(updated);
	},
	async archiveCompany(companyId) {
		if (API_BASE) return request(`/api/companies/${companyId}`, { method: "DELETE" });
		const state = await loadDemo();
		const company = state.store.companies.find((item) => item.company_id === companyId);
		if (!company) throw new Error("Company not found");
		company.archived = true;
		state.store.selected_company = state.store.companies.find((item) => !item.archived)?.business_name ?? "";
		saveDemo(state);
	},
	async updateProducts(companyId, products) {
		if (API_BASE) return (await request(`/api/companies/${companyId}/products`, {
			method: "PUT",
			body: JSON.stringify({ products })
		})).map(inferProductRules);
		const state = await loadDemo();
		const company = state.store.companies.find((item) => item.company_id === companyId);
		if (!company) throw new Error("Company not found");
		company.products = products.filter((item) => item.Description.trim()).map((item) => ({
			...item,
			product_id: item.product_id || `product-${Date.now()}-${Math.random().toString(16).slice(2)}`
		}));
		saveDemo(state);
		return clone$1(company.products);
	},
	async listProducts(companyId, includeArchived = true) {
		if (API_BASE) {
			const response = await request(`/api/companies/${encodeURIComponent(companyId)}/products?include_archived=${includeArchived}`);
			return {
				catalog_version: response.catalog_version,
				products: response.products.map(canonicalToProduct)
			};
		}
		const company = demoCompany(await loadDemo(), companyId);
		const products = company.products.filter((item) => includeArchived || item.status !== "archived").sort((left, right) => left.sort_order - right.sort_order || left.Description.localeCompare(right.Description));
		return {
			catalog_version: company.product_catalog_version || 0,
			products: clone$1(products)
		};
	},
	async getProduct(companyId, targetProductId) {
		if (API_BASE) return canonicalToProduct(await request(`/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}`));
		const product = demoCompany(await loadDemo(), companyId).products.find((item) => item.product_id === targetProductId);
		if (!product) throw new Error("Product not found");
		return clone$1(product);
	},
	async createProduct(companyId, values) {
		if (!values.name.trim()) throw new Error("Product name is required");
		if (API_BASE) return canonicalToProduct(await request(`/api/companies/${encodeURIComponent(companyId)}/products`, {
			method: "POST",
			body: JSON.stringify(values)
		}));
		const state = await loadDemo();
		const company = demoCompany(state, companyId);
		assertAvailableSku(company, values.sku);
		const product = productFromFields(companyId, values);
		company.products.push(product);
		company.product_catalog_version = (company.product_catalog_version || 0) + 1;
		recordDemoProductRevision(state, companyId, product, values.change_reason || "Created product");
		saveDemo(state);
		return clone$1(product);
	},
	async updateProduct(companyId, targetProductId, values) {
		if (!values.change_reason.trim()) throw new Error("Change reason is required");
		if (API_BASE) return canonicalToProduct(await request(`/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}`, {
			method: "PATCH",
			body: JSON.stringify(values)
		}));
		const state = await loadDemo();
		const company = demoCompany(state, companyId);
		const index = company.products.findIndex((item) => item.product_id === targetProductId);
		if (index < 0) throw new Error("Product not found");
		const current = company.products[index];
		if (current.version !== values.expected_version) throw new Error(`Product changed since version ${values.expected_version}; current version is ${current.version}`);
		assertAvailableSku(company, values.sku, targetProductId);
		const updated = productFromFields(companyId, values, current);
		company.products[index] = updated;
		company.product_catalog_version = (company.product_catalog_version || 0) + 1;
		recordDemoProductRevision(state, companyId, updated, values.change_reason);
		saveDemo(state);
		return clone$1(updated);
	},
	async archiveProduct(companyId, targetProductId, expectedVersion, changeReason) {
		if (API_BASE) return canonicalToProduct(await request(`/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}/archive`, {
			method: "POST",
			body: JSON.stringify({
				expected_version: expectedVersion,
				change_reason: changeReason
			})
		}));
		const state = await loadDemo();
		const product = setDemoProductStatus(state, companyId, targetProductId, expectedVersion, "archived", changeReason);
		saveDemo(state);
		return product;
	},
	async restoreProduct(companyId, targetProductId, expectedVersion, changeReason) {
		if (API_BASE) return canonicalToProduct(await request(`/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}/restore`, {
			method: "POST",
			body: JSON.stringify({
				expected_version: expectedVersion,
				change_reason: changeReason
			})
		}));
		const state = await loadDemo();
		const product = setDemoProductStatus(state, companyId, targetProductId, expectedVersion, "active", changeReason);
		saveDemo(state);
		return product;
	},
	async getProductRevisions(companyId, targetProductId) {
		if (API_BASE) return request(`/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}/revisions`);
		const state = await loadDemo();
		if (!demoCompany(state, companyId).products.some((item) => item.product_id === targetProductId)) throw new Error("Product not found");
		return clone$1([...state.productRevisions[productHistoryKey(companyId, targetProductId)] || []].reverse());
	},
	async getProductUsage(companyId, targetProductId) {
		if (API_BASE) return request(`/api/companies/${encodeURIComponent(companyId)}/products/${encodeURIComponent(targetProductId)}/usage`);
		const state = await loadDemo();
		if (!demoCompany(state, companyId).products.some((item) => item.product_id === targetProductId)) throw new Error("Product not found");
		const estimateNumbers = /* @__PURE__ */ new Set();
		const references = [];
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
				line_count: matchingLines.length
			});
		}));
		references.sort((left, right) => right.used_at.localeCompare(left.used_at));
		return {
			product_id: targetProductId,
			estimate_count: estimateNumbers.size,
			revision_count: references.length,
			line_count: lineCount,
			latest_used_at: references[0]?.used_at || null,
			references: references.slice(0, 25)
		};
	},
	async updateCustomers(companyId, customers) {
		if (API_BASE) return request(`/api/companies/${companyId}/customers`, {
			method: "PUT",
			body: JSON.stringify({ customers })
		});
		const state = await loadDemo();
		const company = state.store.companies.find((item) => item.company_id === companyId);
		if (!company) throw new Error("Company not found");
		company.customers = customers.filter((item) => item.customer_name.trim()).map((item) => ({
			...item,
			customer_id: item.customer_id || `customer-${Date.now()}-${Math.random().toString(16).slice(2)}`
		}));
		saveDemo(state);
		return clone$1(company.customers);
	},
	async updateEvents(companyId, events) {
		if (API_BASE) return request(`/api/companies/${companyId}/events`, {
			method: "PUT",
			body: JSON.stringify({ events })
		});
		const state = await loadDemo();
		const company = state.store.companies.find((item) => item.company_id === companyId);
		if (!company) throw new Error("Company not found");
		const customerIds = new Set(company.customers.map((item) => item.customer_id));
		company.events = events.filter((item) => customerIds.has(item.customer_id)).map((item) => ({
			...item,
			event_id: item.event_id || `event-${Date.now()}-${Math.random().toString(16).slice(2)}`
		}));
		saveDemo(state);
		return clone$1(company.events);
	},
	async getEstimate(number, revision) {
		if (API_BASE) return request(`/api/estimates/${encodeURIComponent(number)}${revision ? `?revision=${revision}` : ""}`);
		const record = (await loadDemo()).estimates.find((item) => item.estimate_number === number);
		if (!record) throw new Error("Estimate not found");
		const estimate = revision ? record.revisions.find((item) => item.revision_number === revision) : activeRevision(record);
		if (!estimate) throw new Error("Estimate revision not found");
		return clone$1(estimate);
	},
	async getRevisions(number) {
		if (API_BASE) return request(`/api/estimates/${encodeURIComponent(number)}/revisions`);
		const record = (await loadDemo()).estimates.find((item) => item.estimate_number === number);
		if (!record) throw new Error("Estimate not found");
		return [...record.revisions].reverse().map((item) => ({
			revision_number: item.revision_number,
			revision_id: item.revision_id,
			revision_reason: item.revision_reason,
			updated_at: item.updated_at,
			total: item.total
		}));
	},
	async calculateEstimate(draft) {
		if (API_BASE) return request("/api/estimates/calculate", {
			method: "POST",
			body: JSON.stringify(draft)
		});
		const state = await loadDemo();
		const previousRecord = draft.estimate_number ? state.estimates.find((item) => item.estimate_number === draft.estimate_number) : void 0;
		return calculateDraftSnapshot(state.store, draft, draft.estimate_number || "DRAFT", previousRecord ? previousRecord.current_revision + 1 : 0, previousRecord ? activeRevision(previousRecord) : void 0);
	},
	async saveEstimate(draft) {
		if (API_BASE) return request("/api/estimates", {
			method: "POST",
			body: JSON.stringify(draft)
		});
		const state = await loadDemo();
		let record = draft.estimate_number ? state.estimates.find((item) => item.estimate_number === draft.estimate_number) : void 0;
		if (record && draft.base_revision != null && draft.base_revision !== record.current_revision) throw new Error(`Estimate changed since revision ${draft.base_revision}; reload before saving`);
		const estimateNumber = record?.estimate_number || `EST-${state.nextNumber++}`;
		const revisionNumber = (record?.current_revision || 0) + 1;
		const estimate = calculateDraftSnapshot(state.store, draft, estimateNumber, revisionNumber, record ? activeRevision(record) : void 0);
		if (!record) {
			record = {
				estimate_number: estimateNumber,
				archived: false,
				current_revision: 0,
				revisions: []
			};
			state.estimates.unshift(record);
		}
		record.archived = false;
		record.current_revision = revisionNumber;
		record.revisions.push(estimate);
		saveDemo(state);
		return clone$1(estimate);
	},
	async archiveEstimate(number) {
		if (API_BASE) return request(`/api/estimates/${encodeURIComponent(number)}`, { method: "DELETE" });
		const state = await loadDemo();
		const record = state.estimates.find((item) => item.estimate_number === number);
		if (!record) throw new Error("Estimate not found");
		record.archived = true;
		saveDemo(state);
	},
	async downloadPdf(draft, preview) {
		if (API_BASE) {
			const saved = Boolean(draft.estimate_number && draft.base_revision && preview.estimate_number !== "DRAFT" && preview.revision_number === draft.base_revision);
			const path = saved ? `/api/estimates/${encodeURIComponent(preview.estimate_number)}/pdf?revision=${preview.revision_number}` : "/api/estimates/pdf";
			const response = await fetch(`${API_BASE}${path}`, saved ? void 0 : {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(draft)
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
	async resetDemo() {
		try {
			if (typeof window !== "undefined") {
				window.localStorage?.removeItem(STORAGE_KEY);
				LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage?.removeItem(key));
			}
		} catch {}
	}
};
//#endregion
//#region components/EstimateDocument.tsx
var import_jsx_runtime = require_jsx_runtime();
var currency$2 = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD"
});
var quantity = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
var groups = [
	{
		key: "item",
		label: "Menu & Food"
	},
	{
		key: "staff",
		label: "Staffing"
	},
	{
		key: "service",
		label: "Service"
	},
	{
		key: "delivery",
		label: "Delivery"
	},
	{
		key: "gratuity",
		label: "Gratuity"
	}
];
function formatMoney$2(value) {
	return value < 0 ? `−${currency$2.format(Math.abs(value))}` : currency$2.format(value || 0);
}
function formatDate(value) {
	if (!value) return "Not set";
	const parts = value.trim().split(/[./-]/).map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
	const [first, second, third] = parts;
	const date = first > 999 ? new Date(Date.UTC(first, second - 1, third)) : new Date(Date.UTC(third, first - 1, second));
	return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC"
	}).format(date);
}
function summaryRows(estimate) {
	const groupRows = [
		["Food & items", estimate.items_subtotal],
		["Staffing", estimate.staff_total],
		["Service items", estimate.service_items_total],
		["Delivery", estimate.delivery_charge],
		["Gratuity items", estimate.gratuity_items_total]
	].filter(([, value]) => Number(value) !== 0).map(([label, value]) => ({
		label: String(label),
		value: Number(value),
		kind: "group"
	}));
	const adjustments = [
		{
			label: `Service charge (${quantity.format(estimate.service_charge_percent)}%)`,
			value: estimate.service_charge
		},
		{
			label: `Gratuity (${quantity.format(estimate.gratuity_percent)}%)`,
			value: estimate.gratuity
		},
		{
			label: `Tax (${quantity.format(estimate.tax_percent)}%)`,
			value: estimate.tax
		}
	].filter((row) => Number(row.value) !== 0).map((row) => ({
		...row,
		kind: "adjustment"
	}));
	return [
		...groupRows,
		...groupRows.length > 1 || adjustments.length ? [{
			label: "Line subtotal",
			value: estimate.subtotal,
			kind: "subtotal"
		}] : [],
		...adjustments,
		{
			label: "Total",
			value: estimate.total,
			kind: "total"
		},
		...estimate.deposit ? [{
			label: "Deposit",
			value: -estimate.deposit,
			kind: "deposit"
		}] : [],
		{
			label: "Balance due",
			value: estimate.balance_due,
			kind: "balance"
		}
	];
}
function EstimateDocument({ estimate }) {
	if (!estimate) return null;
	const lineGroups = groups.map((group) => ({
		...group,
		items: estimate.line_items.filter((item) => item.charge_group === group.key)
	})).filter((group) => group.items.length);
	const customerDetails = [
		estimate.customer?.organization,
		estimate.customer_email,
		estimate.customer_phone,
		estimate.billing_address
	].filter(Boolean);
	const eventDetails = [
		formatDate(estimate.event_date),
		estimate.venue,
		`${quantity.format(estimate.guest_count)} guests`
	].filter(Boolean);
	const businessContact = [
		estimate.business.business_phone,
		estimate.business.business_email,
		estimate.business.business_address
	].filter(Boolean).join(" | ");
	const defaultNote = estimate.business.estimate_notes?.trim();
	const estimateNote = estimate.notes?.trim();
	const paymentTerms = estimate.business.payment_terms?.trim();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "print-estimate",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "print-doc-header",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: "/logo_header.png",
					alt: "Silverspoon Catering",
					width: "1592",
					height: "312"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Estimate" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: estimate.estimate_number }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
						estimate.revision_number ? `Revision ${estimate.revision_number}` : "Draft",
						" | Issued ",
						formatDate(estimate.issue_date),
						" | USD"
					] })
				] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "print-summary-grid",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "print-summary-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Prepared for" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: estimate.customer_name }),
						customerDetails.map((detail) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: detail }, detail))
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "print-summary-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Event details" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: estimate.event_name || estimate.event_type }),
						eventDetails.map((detail) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: detail }, detail))
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "print-scope",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "print-section-heading",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Scope & pricing" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
						estimate.line_items.length,
						" line",
						estimate.line_items.length === 1 ? "" : "s"
					] })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
					className: "print-items",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Item" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Qty" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Unit" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Rate" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Amount" })
					] }) }), lineGroups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", {
						className: "print-group-row",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
							colSpan: 5,
							children: group.label
						})
					}), group.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.Category || "Uncategorized" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: item.Description }),
							item.Notes && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: item.Notes })
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: quantity.format(item.Qty) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: item.pricing_unit === "flat" ? "flat" : item.pricing_unit }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: formatMoney$2(item["Unit Price"]) }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: formatMoney$2(item["Line Total"]) })
					] }, item.line_id))] }, group.key))]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "print-financial-summary",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "print-notes-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Notes & terms" }),
						defaultNote && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "About this estimate" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: defaultNote })] }),
						estimateNote && estimateNote !== defaultNote && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Estimate notes" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: estimateNote })] }),
						paymentTerms && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Payment terms" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: paymentTerms })] }),
						!defaultNote && !estimateNote && !paymentTerms && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "No additional notes or payment terms." })
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "print-totals-card",
					children: summaryRows(estimate).map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: `print-summary-row ${row.kind}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: row.label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatMoney$2(row.value) })]
					}, `${row.kind}-${row.label}`))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
				className: "print-doc-footer",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: businessContact || estimate.company_name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: estimate.estimate_number })]
			})
		]
	});
}
//#endregion
//#region components/ProductStudio.tsx
var currency$1 = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD"
});
var formatMoney$1 = (value) => currency$1.format(value || 0);
var pricingUnits = [
	{
		value: "each",
		label: "Each"
	},
	{
		value: "guest",
		label: "Per guest"
	},
	{
		value: "hour",
		label: "Per hour"
	},
	{
		value: "flat",
		label: "Flat fee"
	}
];
var quantityRules$1 = [
	{
		value: "manual",
		label: "Manual quantity",
		detail: "Starts at the default quantity"
	},
	{
		value: "guest_count",
		label: "Guest count",
		detail: "Uses the event guest count"
	},
	{
		value: "guest_plus_buffer",
		label: "Guests + buffer",
		detail: "Uses guests plus the utensil buffer"
	},
	{
		value: "server_hours",
		label: "Server hours",
		detail: "Servers × scheduled hours"
	},
	{
		value: "kitchen_staff_hours",
		label: "Kitchen staff hours",
		detail: "Kitchen staff × scheduled hours"
	}
];
var chargeGroups$1 = [
	{
		value: "item",
		label: "Food & items"
	},
	{
		value: "staff",
		label: "Staff"
	},
	{
		value: "service",
		label: "Service"
	},
	{
		value: "delivery",
		label: "Delivery"
	},
	{
		value: "gratuity",
		label: "Gratuity"
	}
];
var templates = [
	{
		id: "menu",
		icon: "◇",
		label: "Menu item",
		detail: "Priced per serving or item",
		values: {
			category: "Menu",
			pricing_unit: "each",
			quantity_rule: "manual",
			charge_group: "item",
			tax_class: "taxable"
		}
	},
	{
		id: "guest",
		icon: "◎",
		label: "Per guest",
		detail: "Quantity follows guest count",
		values: {
			category: "Entrées",
			pricing_unit: "guest",
			quantity_rule: "guest_count",
			charge_group: "item",
			tax_class: "taxable"
		}
	},
	{
		id: "staff",
		icon: "◷",
		label: "Hourly staff",
		detail: "Hours calculated from the event",
		values: {
			category: "Staff",
			pricing_unit: "hour",
			quantity_rule: "server_hours",
			charge_group: "staff",
			tax_class: "taxable"
		}
	},
	{
		id: "fee",
		icon: "▱",
		label: "Flat fee",
		detail: "One fixed service charge",
		values: {
			category: "Service",
			pricing_unit: "flat",
			quantity_rule: "manual",
			charge_group: "service",
			tax_class: "non_taxable",
			default_quantity: 1
		}
	},
	{
		id: "delivery",
		icon: "→",
		label: "Delivery",
		detail: "A reusable delivery charge",
		values: {
			category: "Delivery",
			pricing_unit: "flat",
			quantity_rule: "manual",
			charge_group: "delivery",
			tax_class: "taxable",
			default_quantity: 1
		}
	}
];
function blankForm(sortOrder) {
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
		sort_order: sortOrder
	};
}
function formFromProduct(product) {
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
		sort_order: product.sort_order
	};
}
function categoryId(category) {
	return category.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uncategorized";
}
function writeFields(form) {
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
		quantity_step: Math.max(form.quantity_step || 1, .01),
		charge_group: form.charge_group,
		tax_class: form.tax_class,
		sort_order: Math.max(Math.round(form.sort_order || 0), 0)
	};
}
function displayTimestamp$1(value) {
	if (!value) return "Imported";
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit"
	}).format(date);
}
function quantityLabel(rule) {
	return quantityRules$1.find((item) => item.value === rule)?.label || "Manual quantity";
}
function sampleQuantity(form) {
	if (form.quantity_rule === "guest_count") return 100;
	if (form.quantity_rule === "guest_plus_buffer") return 110;
	if (form.quantity_rule === "server_hours") return 24;
	if (form.quantity_rule === "kitchen_staff_hours") return 18;
	return Math.max(form.default_quantity || 1, form.minimum_quantity || 0);
}
function TextInput({ label, value, onChange, placeholder, help, required }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "field",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [label, required && " *"] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				value,
				required,
				placeholder,
				onChange: (event) => onChange(event.target.value)
			}),
			help && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: help })
		]
	});
}
function NumberInput({ label, value, onChange, min = 0, step = "any", prefix, help }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "field",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: prefix ? "studio-number-input prefixed" : "studio-number-input",
				children: [prefix && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: prefix }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "number",
					value,
					min,
					step,
					onChange: (event) => onChange(Number(event.target.value))
				})]
			}),
			help && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: help })
		]
	});
}
function SelectInput({ label, value, onChange, options, help }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "field",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
				value,
				onChange: (event) => onChange(event.target.value),
				children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
					value: option.value,
					children: option.label
				}, option.value))
			}),
			help && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: help })
		]
	});
}
function ProductStudio({ company, products, search, onSearchChange, onProductsChange, notify }) {
	const [scope, setScope] = (0, import_react.useState)("active");
	const [category, setCategory] = (0, import_react.useState)("All");
	const [sort, setSort] = (0, import_react.useState)("order");
	const [loading, setLoading] = (0, import_react.useState)(false);
	const [editorMode, setEditorMode] = (0, import_react.useState)(null);
	const [editorStage, setEditorStage] = (0, import_react.useState)("template");
	const [editorTab, setEditorTab] = (0, import_react.useState)("details");
	const [editingProduct, setEditingProduct] = (0, import_react.useState)(null);
	const [form, setForm] = (0, import_react.useState)(() => blankForm(0));
	const [baseline, setBaseline] = (0, import_react.useState)("");
	const [changeReason, setChangeReason] = (0, import_react.useState)("");
	const [saving, setSaving] = (0, import_react.useState)(false);
	const [editorError, setEditorError] = (0, import_react.useState)("");
	const [conflict, setConflict] = (0, import_react.useState)(false);
	const [revisions, setRevisions] = (0, import_react.useState)([]);
	const [usage, setUsage] = (0, import_react.useState)(null);
	const [insightsLoading, setInsightsLoading] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		let active = true;
		setLoading(true);
		setEditorMode(null);
		setCategory("All");
		officeApi.listProducts(company.company_id, true).then((result) => {
			if (active) onProductsChange(result.products);
		}).catch((error) => {
			if (active) notify(error.message, "error");
		}).finally(() => {
			if (active) setLoading(false);
		});
		return () => {
			active = false;
		};
	}, [company.company_id]);
	const activeCount = products.filter((item) => item.status === "active").length;
	const archivedCount = products.length - activeCount;
	const scopedProducts = products.filter((item) => item.status === scope);
	const categories = (0, import_react.useMemo)(() => ["All", ...Array.from(new Set(scopedProducts.map((item) => item.Category).filter(Boolean))).sort()], [scopedProducts]);
	const filteredProducts = (0, import_react.useMemo)(() => {
		const query = search.trim().toLowerCase();
		return [...scopedProducts.filter((product) => (category === "All" || product.Category === category) && `${product.Description} ${product.Category} ${product.Notes} ${product.sku} ${product.internal_notes}`.toLowerCase().includes(query))].sort((left, right) => {
			if (sort === "name") return left.Description.localeCompare(right.Description);
			if (sort === "updated") return right.updated_at.localeCompare(left.updated_at);
			return left.sort_order - right.sort_order || left.Description.localeCompare(right.Description);
		});
	}, [
		category,
		scopedProducts,
		search,
		sort
	]);
	const dirty = editorStage === "form" && JSON.stringify(form) !== baseline;
	const suggestedQuantity = sampleQuantity(form);
	const mergeProduct = (nextProduct) => {
		onProductsChange([...products.filter((item) => item.product_id !== nextProduct.product_id), nextProduct].sort((left, right) => left.sort_order - right.sort_order || left.Description.localeCompare(right.Description)));
	};
	const loadInsights = async (product) => {
		setInsightsLoading(true);
		try {
			const [nextRevisions, nextUsage] = await Promise.all([officeApi.getProductRevisions(company.company_id, product.product_id), officeApi.getProductUsage(company.company_id, product.product_id)]);
			setRevisions(nextRevisions);
			setUsage(nextUsage);
		} catch (error) {
			setEditorError(error.message);
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
	const chooseTemplate = (template) => {
		const next = {
			...blankForm(Math.max(-1, ...products.map((item) => item.sort_order)) + 1),
			...template?.values || {}
		};
		setForm(next);
		setBaseline(JSON.stringify(next));
		setEditorStage("form");
		setTimeout(() => document.getElementById("studio-product-name")?.focus(), 0);
	};
	const openEdit = (product) => {
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
		loadInsights(product);
	};
	const closeEditor = () => {
		if (dirty && !window.confirm("Discard your unsaved product changes?")) return;
		setEditorMode(null);
	};
	const updateForm = (key, value) => {
		setForm((current) => ({
			...current,
			[key]: value
		}));
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
					change_reason: changeReason.trim()
				});
				mergeProduct(updated);
				setEditingProduct(updated);
				const next = formFromProduct(updated);
				setForm(next);
				setBaseline(JSON.stringify(next));
				setChangeReason("");
				notify(`${updated.Description} saved as version ${updated.version}`);
				loadInsights(updated);
			} else {
				const created = await officeApi.createProduct(company.company_id, {
					...writeFields(form),
					change_reason: changeReason.trim() || "Created in Product Studio"
				});
				mergeProduct(created);
				notify(`${created.Description} added to the catalog`);
				if (addAnother) {
					const next = blankForm(Math.max(created.sort_order, ...products.map((item) => item.sort_order)) + 1);
					setForm(next);
					setBaseline(JSON.stringify(next));
					setEditorStage("template");
					setChangeReason("");
				} else setEditorMode(null);
			}
		} catch (error) {
			const message = error.message;
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
			setEditorError(error.message);
		} finally {
			setSaving(false);
		}
	};
	const duplicateProduct = (product) => {
		const next = {
			...formFromProduct(product),
			name: `${product.Description} copy`,
			sku: "",
			sort_order: Math.max(-1, ...products.map((item) => item.sort_order)) + 1
		};
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
	const changeStatus = async (product, status) => {
		if (status === "archived" && !window.confirm(`Archive ${product.Description}? Saved estimates will keep their original snapshots.`)) return;
		try {
			const reason = status === "archived" ? "Archived from Product Studio" : "Restored from Product Studio";
			const updated = status === "archived" ? await officeApi.archiveProduct(company.company_id, product.product_id, product.version, reason) : await officeApi.restoreProduct(company.company_id, product.product_id, product.version, reason);
			mergeProduct(updated);
			if (editingProduct?.product_id === product.product_id) setEditorMode(null);
			notify(`${updated.Description} ${status === "archived" ? "archived" : "restored"}`);
		} catch (error) {
			notify(error.message, "error");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "product-studio section-stack",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "product-studio-hero",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "eyebrow",
						children: "Reusable catalog · version controlled"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Product Studio" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Create menu items, staffing, and fees once. Every saved change becomes a new version; existing estimates stay untouched." })
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "button primary large",
					onClick: openCreate,
					children: "＋ New product"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "panel studio-toolbar",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "inline-search studio-search",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "⌕" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: search,
							onChange: (event) => onSearchChange(event.target.value),
							placeholder: "Search name, SKU, category, or note"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "studio-scope",
						"aria-label": "Product status",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							className: scope === "active" ? "active" : "",
							onClick: () => {
								setScope("active");
								setCategory("All");
							},
							children: ["Active ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: activeCount })]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							className: scope === "archived" ? "active" : "",
							onClick: () => {
								setScope("archived");
								setCategory("All");
							},
							children: ["Archived ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: archivedCount })]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "studio-sort",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Sort" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							value: sort,
							onChange: (event) => setSort(event.target.value),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "order",
									children: "Catalog order"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "name",
									children: "Name"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "updated",
									children: "Recently updated"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "category-chips studio-categories",
						children: categories.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							className: category === item ? "active" : "",
							onClick: () => setCategory(item),
							children: item
						}, item))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "studio-result-count",
						children: loading ? "Refreshing…" : `${filteredProducts.length} ${scope} product${filteredProducts.length === 1 ? "" : "s"}`
					})
				]
			}),
			filteredProducts.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "studio-product-list",
				children: filteredProducts.map((product) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
					className: product.status === "archived" ? "studio-product-card archived" : "studio-product-card",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "studio-product-mark",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: product.Category.slice(0, 1).toUpperCase() || "P" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "studio-product-main",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "studio-product-title",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "category-pill",
										children: product.Category || "Uncategorized"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: product.status === "archived" ? "studio-status archived" : "studio-status",
										children: product.status
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: product.Description }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: product.Notes || "No customer description yet." }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "studio-product-meta",
									children: [
										product.sku && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["SKU ", product.sku] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: quantityLabel(product.quantity_rule) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: chargeGroups$1.find((item) => item.value === product.charge_group)?.label }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["v", product.version] })
									]
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "studio-product-price",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatMoney$1(product["Unit Price"]) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["/ ", pricingUnits.find((item) => item.value === product.pricing_unit)?.label.toLowerCase()] })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "studio-card-actions",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: "button secondary",
									onClick: () => openEdit(product),
									children: "Edit"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: "studio-more-button",
									"aria-label": `Duplicate ${product.Description}`,
									title: "Duplicate",
									onClick: () => duplicateProduct(product),
									children: "⧉"
								}),
								product.status === "active" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: "studio-more-button danger",
									"aria-label": `Archive ${product.Description}`,
									title: "Archive",
									onClick: () => void changeStatus(product, "archived"),
									children: "⌁"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: "button secondary",
									onClick: () => void changeStatus(product, "active"),
									children: "Restore"
								})
							]
						})
					]
				}, product.product_id))
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "panel studio-empty",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: scope === "active" ? "◇" : "↶" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: search || category !== "All" ? "No products match these filters" : `No ${scope} products` }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: scope === "active" ? "Create a product or broaden your filters." : "Archived products will appear here and can be restored at any time." }),
					scope === "active" && !search && category === "All" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: "button primary",
						onClick: openCreate,
						children: "Create your first product"
					})
				]
			}),
			editorMode && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "drawer-backdrop",
				role: "presentation",
				onMouseDown: (event) => {
					if (event.target === event.currentTarget) closeEditor();
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
					className: "studio-drawer",
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "studio-drawer-title",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "drawer-head studio-drawer-head",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "eyebrow",
								children: editorMode === "create" ? "Add to catalog" : `${editingProduct?.sku ? `SKU ${editingProduct.sku} · ` : ""}Version ${editingProduct?.version}`
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								id: "studio-drawer-title",
								children: editorMode === "create" ? "New product" : `Edit ${editingProduct?.Description}`
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: editorMode === "create" ? "Start with a familiar product type, then tune the pricing behavior." : "Changes apply to future selections only. Saved estimates keep their original product snapshot." })
						] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							className: "drawer-close",
							"aria-label": "Close product editor",
							onClick: closeEditor,
							children: "×"
						})]
					}), editorStage === "template" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "studio-template-stage",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "What are you adding?" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "A template sets sensible pricing and quantity defaults. You can change every field next." })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "studio-template-grid",
								children: [templates.map((template) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: () => chooseTemplate(template),
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: template.icon }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: template.label }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: template.detail }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "›" })
									]
								}, template.id)), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									onClick: () => chooseTemplate(),
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "＋" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Start blank" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Configure every rule yourself" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "›" })
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "studio-template-footer",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: "button ghost",
									onClick: closeEditor,
									children: "Cancel"
								})
							})
						]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
						className: "studio-editor-form",
						onSubmit: (event) => {
							event.preventDefault();
							submit(false);
						},
						children: [
							editorMode === "edit" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "studio-editor-tabs",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: editorTab === "details" ? "active" : "",
									onClick: () => setEditorTab("details"),
									children: "Product details"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: editorTab === "history" ? "active" : "",
									onClick: () => setEditorTab("history"),
									children: ["History & usage ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: revisions.length || "" })]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "studio-drawer-body",
								children: editorTab === "details" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "studio-form-layout",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "studio-form-stack",
										children: [
											editorError && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: conflict ? "studio-alert conflict" : "studio-alert",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "!" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: conflict ? "This product changed elsewhere" : "Couldn’t save this product" }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: editorError }),
													conflict && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														type: "button",
														onClick: () => void reloadLatest(),
														children: "Reload latest version"
													})
												] })]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
												className: "studio-form-section",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "studio-form-heading",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "01" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Customer-facing details" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "This is what appears in the picker and on estimates." })] })]
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "studio-form-grid two",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
															className: "field",
															children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Product name *" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
																id: "studio-product-name",
																required: true,
																value: form.name,
																placeholder: "Herb-roasted chicken",
																onChange: (event) => updateForm("name", event.target.value)
															})]
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, {
															label: "Category",
															value: form.category,
															placeholder: "Entrées",
															onChange: (value) => updateForm("category", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, {
															label: "SKU",
															value: form.sku,
															placeholder: "ENT-CHICKEN",
															help: "Optional, but unique within this business.",
															onChange: (value) => updateForm("sku", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
															className: "field studio-field-wide",
															children: [
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Customer description" }),
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
																	value: form.customer_description,
																	placeholder: "Served with seasonal vegetables and pan jus.",
																	onChange: (event) => updateForm("customer_description", event.target.value)
																}),
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Visible on the estimate. Keep this polished and concise." })
															]
														})
													]
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
												className: "studio-form-section",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "studio-form-heading",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "02" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Price & quantity" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Control both the rate and the quantity suggested from an event." })] })]
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "studio-form-grid three",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberInput, {
															label: "Unit price",
															value: form.unit_price,
															min: 0,
															step: .01,
															prefix: "$",
															onChange: (value) => updateForm("unit_price", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectInput, {
															label: "Pricing unit",
															value: form.pricing_unit,
															options: pricingUnits,
															onChange: (value) => updateForm("pricing_unit", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectInput, {
															label: "Suggested quantity",
															value: form.quantity_rule,
															options: quantityRules$1,
															help: quantityRules$1.find((item) => item.value === form.quantity_rule)?.detail,
															onChange: (value) => updateForm("quantity_rule", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberInput, {
															label: "Default quantity",
															value: form.default_quantity,
															min: 0,
															onChange: (value) => updateForm("default_quantity", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberInput, {
															label: "Minimum quantity",
															value: form.minimum_quantity,
															min: 0,
															onChange: (value) => updateForm("minimum_quantity", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberInput, {
															label: "Quantity step",
															value: form.quantity_step,
															min: .01,
															onChange: (value) => updateForm("quantity_step", value)
														})
													]
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
												className: "studio-form-section",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "studio-form-heading",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "03" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Billing behavior" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Choose where the line is totaled and how it is taxed." })] })]
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "studio-form-grid three",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectInput, {
															label: "Charge group",
															value: form.charge_group,
															options: chargeGroups$1,
															onChange: (value) => updateForm("charge_group", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectInput, {
															label: "Tax class",
															value: form.tax_class,
															options: [{
																value: "taxable",
																label: "Taxable"
															}, {
																value: "non_taxable",
																label: "Non-taxable"
															}],
															onChange: (value) => updateForm("tax_class", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberInput, {
															label: "Catalog order",
															value: form.sort_order,
															min: 0,
															step: 1,
															help: "Lower numbers appear first.",
															onChange: (value) => updateForm("sort_order", value)
														})
													]
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
												className: "studio-form-section internal",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "studio-form-heading",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "04" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Internal notes" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Only your team sees this. It is never placed on customer estimates." })] })]
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
													className: "field",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Private preparation or costing notes" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
														value: form.internal_notes,
														placeholder: "Vendor pack size, margin target, prep constraints…",
														onChange: (event) => updateForm("internal_notes", event.target.value)
													})]
												})]
											}),
											editorMode === "edit" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
												className: "studio-change-reason",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, {
													label: "Change reason *",
													value: changeReason,
													placeholder: "Updated price for summer menu",
													help: "Required. This note is stored with the new immutable version.",
													required: true,
													onChange: setChangeReason
												})
											})
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
										className: "studio-live-preview",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "studio-preview-label",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Live estimate preview" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Customer-visible" })]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "studio-preview-paper",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: form.category || "Category" }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: form.name || "Product name" }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: form.customer_description || "Your customer-facing description will appear here." })
												] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "studio-preview-line",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: suggestedQuantity }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: quantityLabel(form.quantity_rule) })] }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: formatMoney$1(form.unit_price) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: ["per ", form.pricing_unit] })] }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatMoney$1(suggestedQuantity * form.unit_price) })
													]
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "studio-preview-context",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Sample event" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "100 guests · 10 utensil buffer · 3 servers × 8 hours · 3 kitchen staff × 6 hours" })]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "studio-future-note",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "↗" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Safe catalog changes" }), "New versions affect future selections. Existing estimate revisions remain historically accurate."] })]
											})
										]
									})]
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "studio-insights",
									children: insightsLoading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "studio-insights-loading",
										children: "Loading product history…"
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "studio-usage-summary",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: usage?.estimate_count || 0 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Estimates" })] }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: usage?.revision_count || 0 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Estimate revisions" })] }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: usage?.line_count || 0 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Line uses" })] })
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "studio-insight-grid",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "studio-insight-heading",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Version history" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Every saved product snapshot" })]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "studio-revision-list",
											children: revisions.map((revision) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["v", revision.version] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: revision.change_reason }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
													revision.snapshot.name,
													" · ",
													formatMoney$1(revision.snapshot.price_cents / 100),
													" / ",
													revision.snapshot.pricing_unit
												] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: displayTimestamp$1(revision.changed_at) })
											] })] }, revision.revision_id))
										})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "studio-insight-heading",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Estimate usage" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: usage?.latest_used_at ? `Last used ${displayTimestamp$1(usage.latest_used_at)}` : "Not used on a saved estimate yet" })]
										}), usage?.references.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "studio-usage-list",
											children: usage.references.map((reference) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "▤" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
													reference.estimate_number,
													" · r",
													reference.revision_number
												] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
													reference.customer_name,
													" · ",
													reference.event_name
												] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
													displayTimestamp$1(reference.used_at),
													" · ",
													reference.line_count,
													" line",
													reference.line_count === 1 ? "" : "s"
												] })
											] })] }, `${reference.estimate_number}-${reference.revision_number}`))
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "studio-unused",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "◇" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Ready for its first estimate" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Usage will appear after this product is included in a saved estimate." })
											]
										})] })]
									})] })
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
								className: "studio-drawer-footer",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: editorMode === "edit" && editingProduct && (editingProduct.status === "active" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "text-danger",
									onClick: () => void changeStatus(editingProduct, "archived"),
									children: "Archive product"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "text-button",
									onClick: () => void changeStatus(editingProduct, "active"),
									children: "Restore product"
								})) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "button ghost",
										onClick: closeEditor,
										children: "Cancel"
									}),
									editorMode === "create" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "button secondary",
										disabled: saving,
										onClick: () => void submit(true),
										children: "Save & add another"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "submit",
										className: "button primary",
										disabled: saving || editorMode === "edit" && (!dirty || !changeReason.trim()),
										children: saving ? "Saving…" : editorMode === "edit" ? "Save new version" : "Add product"
									})
								] })]
							})
						]
					})]
				})
			})
		]
	});
}
//#endregion
//#region components/OfficeApp.tsx
var tabs = [
	{
		id: "overview",
		label: "Overview",
		description: "Your catering office",
		glyph: "⌂"
	},
	{
		id: "estimates",
		label: "Estimates",
		description: "Quotes & revisions",
		glyph: "▤"
	},
	{
		id: "clients",
		label: "Customers & Events",
		description: "Contacts & occasions",
		glyph: "◎"
	},
	{
		id: "catalog",
		label: "Catalog",
		description: "Menu & pricing rules",
		glyph: "▦"
	},
	{
		id: "settings",
		label: "Business Settings",
		description: "Branding & defaults",
		glyph: "⚙"
	}
];
var quantityRules = [
	{
		value: "manual",
		label: "Manual"
	},
	{
		value: "guest_count",
		label: "Guest count"
	},
	{
		value: "guest_plus_buffer",
		label: "Guests + buffer"
	},
	{
		value: "server_hours",
		label: "Server hours"
	},
	{
		value: "kitchen_staff_hours",
		label: "Kitchen hours"
	}
];
var chargeGroups = [
	{
		value: "item",
		label: "Food & items"
	},
	{
		value: "staff",
		label: "Staff"
	},
	{
		value: "service",
		label: "Service item"
	},
	{
		value: "delivery",
		label: "Delivery"
	},
	{
		value: "gratuity",
		label: "Gratuity item"
	}
];
var currency = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD"
});
var formatMoney = (value) => currency.format(value ?? 0);
var clone = (value) => JSON.parse(JSON.stringify(value));
var makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
var blankCompany = () => ({
	company_id: "",
	business_name: "",
	business_email: "",
	business_phone: "",
	business_address: "",
	default_service_charge_percent: 0,
	default_gratuity_percent: 0,
	payment_terms: "",
	estimate_notes: "",
	products: [],
	customers: [],
	events: [],
	archived: false
});
var blankCustomer = () => ({
	customer_id: makeId("customer"),
	customer_name: "",
	organization: "",
	customer_email: "",
	customer_phone: "",
	billing_address: "",
	internal_notes: "",
	archived: false
});
var blankEvent = (customerId) => ({
	event_id: makeId("event"),
	customer_id: customerId,
	event_name: "",
	event_type: "Private Event",
	event_date: "",
	venue: "",
	guest_count: 50,
	servers_count: 0,
	servers_hours: 0,
	kitchen_staff_count: 0,
	kitchen_staff_hours: 0,
	utensils_buffer: 0,
	charge_tax: false,
	tax_percent: 0,
	default_deposit_amount: 0,
	archived: false
});
function parseEventDate(value) {
	if (!value) return null;
	const parts = value.trim().split(/[./-]/).map(Number);
	if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
	const [first, second, third] = parts;
	const date = first > 999 ? new Date(Date.UTC(first, second - 1, third)) : new Date(Date.UTC(third, first - 1, second));
	return Number.isNaN(date.valueOf()) ? null : date;
}
function displayDate(value) {
	const date = parseEventDate(value);
	return date ? new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC"
	}).format(date) : value || "Not set";
}
function displayTimestamp(value) {
	const date = new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
	return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone: "UTC"
	}).format(date);
}
function initials(value) {
	return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "NC";
}
function Field({ label, value, onChange, type = "text", placeholder, min, help }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "field",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				type,
				value,
				min,
				step: type === "number" ? "any" : void 0,
				placeholder,
				onChange: (event) => onChange(event.target.value)
			}),
			help && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: help })
		]
	});
}
function TextField({ label, value, onChange, placeholder, help }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "field",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				value,
				placeholder,
				onChange: (event) => onChange(event.target.value)
			}),
			help && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: help })
		]
	});
}
function Select({ label, value, onChange, children, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "field select-field",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
			value,
			onChange: (event) => onChange(event.target.value),
			disabled,
			children
		})]
	});
}
function Toggle({ checked, onChange, label, detail }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "toggle-row",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				type: "checkbox",
				checked,
				onChange: (event) => onChange(event.target.checked)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "toggle" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: detail })] })
		]
	});
}
function SaveIndicator({ state }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: `save-indicator ${state}`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}), {
			saved: "All changes saved",
			dirty: "Unsaved changes",
			saving: "Saving changes…",
			error: "Could not save"
		}[state]]
	});
}
function EmptyState({ title, detail, action }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "empty-state",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "empty-mark",
				children: "S"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: title }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: detail }),
			action
		]
	});
}
function SectionHeader({ eyebrow, title, detail, actions }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "section-heading",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "eyebrow",
				children: eyebrow
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: title }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: detail })
		] }), actions && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "heading-actions",
			children: actions
		})]
	});
}
function EstimateTotals({ estimate }) {
	const rows = [
		["Food & items", estimate?.items_subtotal],
		["Staff", estimate?.staff_total],
		["Service items", estimate?.service_items_total],
		["Delivery", estimate?.delivery_charge],
		["Gratuity items", estimate?.gratuity_items_total],
		[`Service charge${estimate?.service_charge_percent ? ` (${estimate.service_charge_percent}%)` : ""}`, estimate?.service_charge],
		[`Gratuity${estimate?.gratuity_percent ? ` (${estimate.gratuity_percent}%)` : ""}`, estimate?.gratuity],
		[`Tax${estimate?.tax_percent ? ` (${estimate.tax_percent}%)` : ""}`, estimate?.tax]
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "totals-card",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "totals-card-head",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Estimate total" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatMoney(estimate?.total) })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "status-badge neutral",
					children: estimate && estimate.estimate_number !== "DRAFT" ? `r${estimate.revision_number || 1}` : "Draft"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "totals-breakdown",
				children: rows.map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatMoney(value) })] }, label))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "deposit-line",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Deposit" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: ["− ", formatMoney(estimate?.deposit)] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "balance-total",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Balance due" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatMoney(estimate?.balance_due) })]
			})
		]
	});
}
function toDraftLine(item) {
	return {
		line_id: item.line_id,
		source_product_id: item.source_product_id,
		Category: item.Category,
		Description: item.Description,
		Notes: item.Notes,
		Qty: item.Qty,
		"Unit Price": item["Unit Price"],
		pricing_unit: item.pricing_unit,
		charge_group: item.charge_group,
		tax_class: item.tax_class,
		source_product_version: item.source_product_version,
		catalog_price_cents_at_selection: item.catalog_price_cents_at_selection,
		quantity_rule: item.quantity_rule,
		suggested_quantity: item.suggested_quantity,
		selected_at: item.selected_at,
		is_custom: item.is_custom,
		override_reason: item.override_reason
	};
}
function estimateToSummary(estimate) {
	return {
		file: `${estimate.estimate_number}.json`,
		estimate_number: estimate.estimate_number,
		revision_number: estimate.revision_number,
		company_id: estimate.company_id,
		customer_id: estimate.customer_id,
		customer_name: estimate.customer_name,
		event_id: estimate.event_id,
		event_name: estimate.event_name,
		event_date: estimate.event_date,
		total: estimate.total,
		updated_at: estimate.updated_at,
		archived: false
	};
}
function OfficeApp() {
	const initial = (0, import_react.useMemo)(() => officeApi.initialBootstrap(), []);
	const firstCompany = initial.store.companies.find((item) => !item.archived && item.business_name === initial.store.selected_company) || initial.store.companies.find((item) => !item.archived);
	const [activeTab, setActiveTab] = (0, import_react.useState)("overview");
	const [companies, setCompanies] = (0, import_react.useState)(initial.store.companies);
	const [estimates, setEstimates] = (0, import_react.useState)(initial.estimates);
	const [selectedCompanyId, setSelectedCompanyId] = (0, import_react.useState)(firstCompany?.company_id || "");
	const [mode, setMode] = (0, import_react.useState)("demo");
	const [toast, setToast] = (0, import_react.useState)(null);
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [companyDraft, setCompanyDraft] = (0, import_react.useState)(firstCompany || blankCompany());
	const [creatingCompany, setCreatingCompany] = (0, import_react.useState)(false);
	const [settingsState, setSettingsState] = (0, import_react.useState)("saved");
	const [productRows, setProductRows] = (0, import_react.useState)(firstCompany?.products || []);
	const [productSearch, setProductSearch] = (0, import_react.useState)("");
	const [customerRows, setCustomerRows] = (0, import_react.useState)(firstCompany?.customers || []);
	const [eventRows, setEventRows] = (0, import_react.useState)(firstCompany?.events || []);
	const [selectedCustomerId, setSelectedCustomerId] = (0, import_react.useState)(firstCompany?.customers.find((item) => !item.archived)?.customer_id || "");
	const [selectedEventId, setSelectedEventId] = (0, import_react.useState)("");
	const [recordState, setRecordState] = (0, import_react.useState)("saved");
	const [customerSearch, setCustomerSearch] = (0, import_react.useState)("");
	const [estimateMode, setEstimateMode] = (0, import_react.useState)("list");
	const [estimateStep, setEstimateStep] = (0, import_react.useState)(1);
	const [estimateSearch, setEstimateSearch] = (0, import_react.useState)("");
	const [estimateCustomerFilter, setEstimateCustomerFilter] = (0, import_react.useState)("all");
	const [estimateEventId, setEstimateEventId] = (0, import_react.useState)("");
	const [loadedEstimateNumber, setLoadedEstimateNumber] = (0, import_react.useState)(null);
	const [baseRevision, setBaseRevision] = (0, import_react.useState)(null);
	const [draftItems, setDraftItems] = (0, import_react.useState)([]);
	const [servicePercent, setServicePercent] = (0, import_react.useState)(0);
	const [serviceTaxable, setServiceTaxable] = (0, import_react.useState)(true);
	const [gratuityPercent, setGratuityPercent] = (0, import_react.useState)(0);
	const [gratuityTaxable, setGratuityTaxable] = (0, import_react.useState)(true);
	const [depositAmount, setDepositAmount] = (0, import_react.useState)(0);
	const [estimateNotes, setEstimateNotes] = (0, import_react.useState)("");
	const [revisionReason, setRevisionReason] = (0, import_react.useState)("");
	const [revisionHistory, setRevisionHistory] = (0, import_react.useState)([]);
	const [preview, setPreview] = (0, import_react.useState)(null);
	const [draftDirty, setDraftDirty] = (0, import_react.useState)(false);
	const [drawerOpen, setDrawerOpen] = (0, import_react.useState)(false);
	const [drawerSearch, setDrawerSearch] = (0, import_react.useState)("");
	const [drawerCategory, setDrawerCategory] = (0, import_react.useState)("All");
	const selectedCompany = (0, import_react.useMemo)(() => companies.find((item) => item.company_id === selectedCompanyId) || null, [companies, selectedCompanyId]);
	const activeCustomer = customerRows.find((item) => item.customer_id === selectedCustomerId) || null;
	const customerEvents = eventRows.filter((item) => item.customer_id === selectedCustomerId && !item.archived);
	const activeEvent = eventRows.find((item) => item.event_id === selectedEventId) || customerEvents[0] || null;
	const estimateEvent = selectedCompany?.events.find((item) => item.event_id === estimateEventId && !item.archived) || null;
	const estimateCustomer = estimateEvent ? selectedCompany?.customers.find((item) => item.customer_id === estimateEvent.customer_id) || null : null;
	const notify = (0, import_react.useCallback)((message, tone = "success") => {
		setToast({
			message,
			tone
		});
		window.setTimeout(() => setToast(null), 3300);
	}, []);
	const syncEditors = (company) => {
		setCompanyDraft(clone(company));
		setProductRows(clone(company.products));
		setCustomerRows(clone(company.customers));
		setEventRows(clone(company.events));
		const customerId = company.customers.find((item) => !item.archived)?.customer_id || "";
		setSelectedCustomerId(customerId);
		setSelectedEventId(company.events.find((item) => item.customer_id === customerId && !item.archived)?.event_id || "");
		setSettingsState("saved");
		setRecordState("saved");
	};
	const resetBuilder = () => {
		setEstimateMode("list");
		setEstimateStep(1);
		setLoadedEstimateNumber(null);
		setBaseRevision(null);
		setDraftItems([]);
		setEstimateEventId("");
		setPreview(null);
		setRevisionHistory([]);
		setRevisionReason("");
		setDraftDirty(false);
		setDrawerOpen(false);
	};
	const load = (0, import_react.useCallback)(async () => {
		try {
			const result = await officeApi.bootstrap();
			setCompanies(result.store.companies);
			setEstimates(result.estimates);
			setMode(result.mode);
			const company = result.store.companies.find((item) => !item.archived && item.business_name === result.store.selected_company) || result.store.companies.find((item) => !item.archived);
			if (company) {
				setSelectedCompanyId(company.company_id);
				syncEditors(company);
			}
		} catch (error) {
			notify(error instanceof Error ? error.message : "Could not open the office", "error");
		}
	}, [notify]);
	(0, import_react.useEffect)(() => {
		load();
	}, [load]);
	const selectCompany = (companyId) => {
		const company = companies.find((item) => item.company_id === companyId);
		if (!company) return;
		setCreatingCompany(false);
		setSelectedCompanyId(companyId);
		syncEditors(company);
		resetBuilder();
	};
	const updateCompanyDraft = (key, value) => {
		setCompanyDraft((current) => ({
			...current,
			[key]: value
		}));
		setSettingsState("dirty");
	};
	const persistCompany = async () => {
		if (!companyDraft.business_name.trim() || settingsState === "saving") return notify("Business name is required", "error");
		setSettingsState("saving");
		try {
			const saved = await officeApi.updateCompany(companyDraft);
			const merged = {
				...companyDraft,
				...saved,
				products: productRows,
				customers: customerRows,
				events: eventRows
			};
			setCompanies((current) => current.map((item) => item.company_id === merged.company_id ? merged : item));
			setCompanyDraft(clone(merged));
			setSettingsState("saved");
			notify("Business settings saved");
		} catch (error) {
			setSettingsState("error");
			notify(error instanceof Error ? error.message : "Could not save business settings", "error");
		}
	};
	const createCompany = async () => {
		if (!companyDraft.business_name.trim()) return notify("Business name is required", "error");
		setBusy(true);
		try {
			const company = await officeApi.createCompany(companyDraft);
			setCompanies((current) => [...current, company]);
			setCreatingCompany(false);
			setSelectedCompanyId(company.company_id);
			syncEditors(company);
			notify("Business created");
		} catch (error) {
			notify(error instanceof Error ? error.message : "Could not create business", "error");
		} finally {
			setBusy(false);
		}
	};
	const archiveCompany = async () => {
		if (!selectedCompany || !window.confirm(`Archive ${selectedCompany.business_name}? Its estimates and history will remain intact.`)) return;
		setBusy(true);
		try {
			await officeApi.archiveCompany(selectedCompany.company_id);
			const next = companies.map((item) => item.company_id === selectedCompany.company_id ? {
				...item,
				archived: true
			} : item);
			setCompanies(next);
			const replacement = next.find((item) => !item.archived);
			if (replacement) selectCompany(replacement.company_id);
			notify("Business archived — estimate history preserved");
		} catch (error) {
			notify(error instanceof Error ? error.message : "Could not archive business", "error");
		} finally {
			setBusy(false);
		}
	};
	const syncProducts = (0, import_react.useCallback)((products) => {
		setProductRows(clone(products));
		setCompanies((current) => current.map((item) => item.company_id === selectedCompanyId ? {
			...item,
			products: clone(products)
		} : item));
		setCompanyDraft((current) => current.company_id === selectedCompanyId ? {
			...current,
			products: clone(products)
		} : current);
	}, [selectedCompanyId]);
	const updateCustomer = (key, value) => {
		setCustomerRows((current) => current.map((item) => item.customer_id === selectedCustomerId ? {
			...item,
			[key]: value
		} : item));
		setRecordState("dirty");
	};
	const updateEvent = (key, value) => {
		if (!activeEvent) return;
		setEventRows((current) => current.map((item) => item.event_id === activeEvent.event_id ? {
			...item,
			[key]: value
		} : item));
		setRecordState("dirty");
	};
	const selectCustomer = (customerId) => {
		setSelectedCustomerId(customerId);
		setSelectedEventId(eventRows.find((item) => item.customer_id === customerId && !item.archived)?.event_id || "");
	};
	const persistRecords = async (customers = customerRows, events = eventRows) => {
		if (!selectedCompany || customers.some((item) => !item.archived && !item.customer_name.trim())) return notify("Every active customer needs a name", "error");
		setRecordState("saving");
		try {
			const savedCustomers = await officeApi.updateCustomers(selectedCompany.company_id, customers);
			const savedEvents = await officeApi.updateEvents(selectedCompany.company_id, events);
			setCustomerRows(savedCustomers);
			setEventRows(savedEvents);
			setCompanies((current) => current.map((item) => item.company_id === selectedCompany.company_id ? {
				...item,
				customers: savedCustomers,
				events: savedEvents
			} : item));
			setRecordState("saved");
			notify("Customer and event records saved");
		} catch (error) {
			setRecordState("error");
			notify(error instanceof Error ? error.message : "Could not save records", "error");
		}
	};
	const addCustomer = () => {
		const customer = blankCustomer();
		setCustomerRows((current) => [...current, customer]);
		setSelectedCustomerId(customer.customer_id);
		setSelectedEventId("");
		setRecordState("dirty");
	};
	const addEvent = () => {
		if (!activeCustomer) return;
		const event = blankEvent(activeCustomer.customer_id);
		setEventRows((current) => [...current, event]);
		setSelectedEventId(event.event_id);
		setRecordState("dirty");
	};
	const archiveCustomer = async () => {
		if (!activeCustomer || !window.confirm(`Archive ${activeCustomer.customer_name || "this customer"}? Saved estimates will remain available.`)) return;
		const customers = customerRows.map((item) => item.customer_id === activeCustomer.customer_id ? {
			...item,
			archived: true
		} : item);
		const events = eventRows.map((item) => item.customer_id === activeCustomer.customer_id ? {
			...item,
			archived: true
		} : item);
		setCustomerRows(customers);
		setEventRows(events);
		setSelectedCustomerId(customers.find((item) => !item.archived)?.customer_id || "");
		setSelectedEventId("");
		await persistRecords(customers, events);
	};
	const archiveEvent = async () => {
		if (!activeEvent || !window.confirm(`Archive ${activeEvent.event_name || "this event"}? Its estimate history will remain intact.`)) return;
		const events = eventRows.map((item) => item.event_id === activeEvent.event_id ? {
			...item,
			archived: true
		} : item);
		setEventRows(events);
		setSelectedEventId(events.find((item) => item.customer_id === selectedCustomerId && !item.archived)?.event_id || "");
		await persistRecords(customerRows, events);
	};
	const draft = (0, import_react.useMemo)(() => ({
		company_id: selectedCompanyId,
		customer_id: estimateCustomer?.customer_id || "",
		event_id: estimateEventId,
		estimate_number: loadedEstimateNumber,
		base_revision: baseRevision,
		line_items: draftItems,
		service_charge_percent: servicePercent,
		service_charge_taxable: serviceTaxable,
		gratuity_percent: gratuityPercent,
		gratuity_taxable: gratuityTaxable,
		deposit_amount: depositAmount,
		notes: estimateNotes,
		revision_reason: revisionReason || (loadedEstimateNumber ? "Updated estimate" : "Initial estimate")
	}), [
		selectedCompanyId,
		estimateCustomer?.customer_id,
		estimateEventId,
		loadedEstimateNumber,
		baseRevision,
		draftItems,
		servicePercent,
		serviceTaxable,
		gratuityPercent,
		gratuityTaxable,
		depositAmount,
		estimateNotes,
		revisionReason
	]);
	(0, import_react.useEffect)(() => {
		if (!draftDirty || !estimateEvent || !estimateCustomer || !draftItems.length) {
			if (!draftItems.length && draftDirty) setPreview(null);
			return;
		}
		const timer = window.setTimeout(async () => {
			try {
				setPreview(await officeApi.calculateEstimate(draft));
			} catch {
				setPreview(null);
			}
		}, 120);
		return () => window.clearTimeout(timer);
	}, [draft, draftDirty]);
	const chooseEstimateEvent = (eventId, resetDefaults = true) => {
		const event = selectedCompany?.events.find((item) => item.event_id === eventId);
		setEstimateEventId(eventId);
		if (resetDefaults && event) {
			setServicePercent(selectedCompany?.default_service_charge_percent || 0);
			setGratuityPercent(selectedCompany?.default_gratuity_percent || 0);
			setDepositAmount(event.default_deposit_amount);
			setDraftDirty(true);
		}
	};
	const startEstimate = (eventId) => {
		const fallback = eventId || selectedCompany?.events.find((item) => !item.archived)?.event_id || "";
		setActiveTab("estimates");
		setEstimateMode("builder");
		setEstimateStep(1);
		setLoadedEstimateNumber(null);
		setBaseRevision(null);
		setDraftItems([]);
		setPreview(null);
		setRevisionHistory([]);
		setRevisionReason("");
		setEstimateNotes("");
		setServiceTaxable(true);
		setGratuityTaxable(true);
		chooseEstimateEvent(fallback);
		setDrawerOpen(false);
	};
	const markDraft = () => setDraftDirty(true);
	const addDraftProduct = (product) => {
		if (!estimateEvent || draftItems.some((item) => item.source_product_id === product.product_id)) return;
		const quantity = defaultProductQuantity(product, estimateEvent);
		setDraftItems((current) => [...current, {
			line_id: makeId("line"),
			source_product_id: product.product_id,
			Category: product.Category,
			source_product_version: product.version,
			catalog_price_cents_at_selection: Math.round(product["Unit Price"] * 100),
			quantity_rule: product.quantity_rule,
			suggested_quantity: quantity,
			selected_at: (/* @__PURE__ */ new Date()).toISOString(),
			Description: product.Description,
			Notes: product.Notes,
			Qty: quantity,
			"Unit Price": product["Unit Price"],
			pricing_unit: product.pricing_unit,
			charge_group: product.charge_group,
			tax_class: product.tax_class,
			is_custom: false,
			override_reason: ""
		}]);
		markDraft();
	};
	const addCustomItem = () => {
		setDraftItems((current) => [...current, {
			line_id: makeId("line"),
			source_product_id: null,
			Category: "Custom",
			Description: "Custom line item",
			Notes: "",
			Qty: 1,
			"Unit Price": 0,
			pricing_unit: "each",
			charge_group: "item",
			tax_class: "taxable",
			is_custom: true,
			override_reason: ""
		}]);
		markDraft();
	};
	const updateDraftItem = (lineId, values) => {
		setDraftItems((current) => current.map((item) => item.line_id === lineId ? {
			...item,
			...values
		} : item));
		markDraft();
	};
	const hydrateEstimate = (estimate, dirty = false) => {
		const company = companies.find((item) => item.company_id === estimate.company_id);
		if (company && company.company_id !== selectedCompanyId) {
			setSelectedCompanyId(company.company_id);
			syncEditors(company);
		}
		setEstimateEventId(estimate.event_id);
		setLoadedEstimateNumber(estimate.estimate_number);
		setBaseRevision(estimate.revision_number);
		setDraftItems(estimate.line_items.map(toDraftLine));
		setServicePercent(estimate.service_charge_percent);
		setServiceTaxable(estimate.service_charge_taxable);
		setGratuityPercent(estimate.gratuity_percent);
		setGratuityTaxable(estimate.gratuity_taxable);
		setDepositAmount(estimate.deposit);
		setEstimateNotes(estimate.notes);
		setRevisionReason("");
		setPreview(estimate);
		setDraftDirty(dirty);
	};
	const openEstimate = async (number, step = 3) => {
		setBusy(true);
		try {
			const estimate = await officeApi.getEstimate(number);
			hydrateEstimate(estimate);
			setRevisionHistory(await officeApi.getRevisions(number));
			setEstimateMode("builder");
			setEstimateStep(step);
			setActiveTab("estimates");
			notify(`${number} revision ${estimate.revision_number} opened`);
		} catch (error) {
			notify(error instanceof Error ? error.message : "Could not open estimate", "error");
		} finally {
			setBusy(false);
		}
	};
	const loadRevisionAsDraft = async (revision) => {
		if (!loadedEstimateNumber) return;
		setBusy(true);
		try {
			const currentRevision = revisionHistory[0]?.revision_number || baseRevision || revision;
			hydrateEstimate(await officeApi.getEstimate(loadedEstimateNumber, revision), true);
			setBaseRevision(currentRevision);
			setRevisionReason(`Revised from revision ${revision}`);
			setEstimateStep(2);
			notify(`Revision ${revision} loaded as a new draft`);
		} catch (error) {
			notify(error instanceof Error ? error.message : "Could not load revision", "error");
		} finally {
			setBusy(false);
		}
	};
	const duplicateEstimate = async (number) => {
		setBusy(true);
		try {
			hydrateEstimate(await officeApi.getEstimate(number), true);
			setLoadedEstimateNumber(null);
			setBaseRevision(null);
			setRevisionHistory([]);
			setRevisionReason("Initial estimate");
			setEstimateMode("builder");
			setEstimateStep(2);
			setActiveTab("estimates");
			notify(`Copy of ${number} is ready`);
		} catch (error) {
			notify(error instanceof Error ? error.message : "Could not duplicate estimate", "error");
		} finally {
			setBusy(false);
		}
	};
	const hasMissingOverrideReason = draftItems.some((item) => {
		if (!item.source_product_id) return false;
		const product = selectedCompany?.products.find((candidate) => candidate.product_id === item.source_product_id);
		const selectedPrice = item.catalog_price_cents_at_selection == null ? product?.["Unit Price"] : item.catalog_price_cents_at_selection / 100;
		return product && Number(selectedPrice) !== Number(item["Unit Price"]) && !item.override_reason.trim();
	});
	const saveEstimate = async () => {
		if (!draftItems.length) return notify("Add at least one line item before saving", "error");
		if (draftItems.some((item) => !item.Description.trim())) return notify("Every line item needs a description", "error");
		if (hasMissingOverrideReason) return notify("Add a reason for every catalog price override", "error");
		if (loadedEstimateNumber && !revisionReason.trim()) return notify("Describe what changed in this revision", "error");
		setBusy(true);
		try {
			const saved = await officeApi.saveEstimate(draft);
			hydrateEstimate(saved);
			setBaseRevision(saved.revision_number);
			setRevisionReason("");
			setEstimates((current) => [estimateToSummary(saved), ...current.filter((item) => item.estimate_number !== saved.estimate_number)]);
			setRevisionHistory(await officeApi.getRevisions(saved.estimate_number));
			setEstimateStep(3);
			notify(`${saved.estimate_number} revision ${saved.revision_number} saved`);
		} catch (error) {
			notify(error instanceof Error ? error.message : "Could not save estimate", "error");
		} finally {
			setBusy(false);
		}
	};
	const archiveEstimate = async (number) => {
		if (!window.confirm(`Archive ${number}? All revisions will be preserved.`)) return;
		setBusy(true);
		try {
			await officeApi.archiveEstimate(number);
			setEstimates((current) => current.filter((item) => item.estimate_number !== number));
			if (loadedEstimateNumber === number) resetBuilder();
			notify(`${number} archived — revision history preserved`);
		} catch (error) {
			notify(error instanceof Error ? error.message : "Could not archive estimate", "error");
		} finally {
			setBusy(false);
		}
	};
	(0, import_react.useEffect)(() => {
		const onKeyDown = (event) => {
			const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
			if (event.key === "Escape" && drawerOpen) setDrawerOpen(false);
			if (!editing && event.key.toLowerCase() === "n") startEstimate();
			if (!editing && event.key === "/") {
				event.preventDefault();
				document.querySelector("[data-global-search]")?.focus();
			}
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && activeTab === "estimates" && estimateMode === "builder") {
				event.preventDefault();
				saveEstimate();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		drawerOpen,
		activeTab,
		estimateMode,
		draft,
		revisionReason
	]);
	const activeCompanies = companies.filter((item) => !item.archived);
	const currentEstimates = estimates.filter((item) => item.company_id === selectedCompanyId && !item.archived);
	const totalQuoted = currentEstimates.reduce((sum, item) => sum + Number(item.total || 0), 0);
	const recentEstimates = [...currentEstimates].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
	const upcomingEvents = [...selectedCompany?.events || []].filter((item) => !item.archived && parseEventDate(item.event_date)).sort((a, b) => (parseEventDate(a.event_date)?.valueOf() || 0) - (parseEventDate(b.event_date)?.valueOf() || 0)).slice(0, 5);
	const filteredCustomers = customerRows.filter((item) => !item.archived).filter((item) => `${item.customer_name} ${item.organization} ${item.customer_email}`.toLowerCase().includes(customerSearch.toLowerCase()));
	const currentCustomerEstimates = currentEstimates.filter((item) => item.customer_id === selectedCustomerId);
	const visibleEstimates = currentEstimates.filter((item) => estimateCustomerFilter === "all" || item.customer_id === estimateCustomerFilter).filter((item) => `${item.estimate_number} ${item.customer_name} ${item.event_name} ${item.event_date}`.toLowerCase().includes(estimateSearch.toLowerCase())).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	const drawerCategories = ["All", ...Array.from(new Set((selectedCompany?.products || []).filter((item) => !item.archived).map((item) => item.Category).filter(Boolean))).sort()];
	const drawerProducts = (selectedCompany?.products || []).filter((item) => !item.archived && (drawerCategory === "All" || item.Category === drawerCategory)).filter((item) => `${item.Category} ${item.Description} ${item.Notes}`.toLowerCase().includes(drawerSearch.toLowerCase()));
	const activeTabMeta = tabs.find((item) => item.id === activeTab);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "app-shell",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "sidebar",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "brand-lockup",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "brand-image",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: "/logo_header.png",
								alt: "Silverspoon Catering",
								width: "1592",
								height: "312"
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Office workspace" })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						className: "sidebar-create",
						onClick: () => startEstimate(),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "＋" }),
							"New estimate ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", { children: "N" })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
						"aria-label": "Office sections",
						children: tabs.map((tab) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							className: activeTab === tab.id ? "nav-item active" : "nav-item",
							onClick: () => setActiveTab(tab.id),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "nav-glyph",
								"aria-hidden": "true",
								children: tab.glyph
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: tab.label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: tab.description })] })]
						}, tab.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "sidebar-foot",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `status-dot ${mode}` }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: mode === "api" ? "FastAPI connected" : "Demo workspace" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: mode === "api" ? "Immutable JSON revisions" : "Changes stay in this browser" })] })]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "workspace",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "topbar",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "topbar-path",
						children: [
							"Silverspoon ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "/" }),
							" ",
							activeTabMeta.label
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: activeTabMeta.label })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "topbar-actions",
						children: [
							[
								"estimates",
								"catalog",
								"clients"
							].includes(activeTab) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "top-search",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "⌕" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										"data-global-search": true,
										value: activeTab === "estimates" ? estimateSearch : activeTab === "catalog" ? productSearch : customerSearch,
										onChange: (event) => activeTab === "estimates" ? setEstimateSearch(event.target.value) : activeTab === "catalog" ? setProductSearch(event.target.value) : setCustomerSearch(event.target.value),
										placeholder: `Search ${activeTab === "clients" ? "customers" : activeTab}`
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", { children: "/" })
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "company-switcher",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Workspace" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									value: selectedCompanyId,
									onChange: (event) => selectCompany(event.target.value),
									children: activeCompanies.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: item.company_id,
										children: item.business_name
									}, item.company_id))
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "avatar",
								children: initials(selectedCompany?.business_name || "S")
							})
						]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "content",
					children: [
						activeTab === "overview" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							className: "section-stack",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "welcome-banner",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "eyebrow",
											children: "Good to see you"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Keep every event moving." }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Customers, upcoming events, pricing rules, and every estimate revision—together in one reliable workspace." })
									] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										className: "button primary large",
										onClick: () => startEstimate(),
										children: "＋ Create estimate"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "metric-grid",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "metric-card",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "metric-icon red",
												children: "▤"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Active estimates" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: currentEstimates.length }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Current revision of each estimate" })
											] })]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "metric-card",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "metric-icon amber",
												children: "$"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Total quoted" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatMoney(totalQuoted) }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Across active estimates" })
											] })]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "metric-card",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "metric-icon green",
												children: "◎"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Customers" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: selectedCompany?.customers.filter((item) => !item.archived).length || 0 }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Separate from their events" })
											] })]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "metric-card",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "metric-icon blue",
												children: "◇"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Upcoming events" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: upcomingEvents.length }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Ready for an estimate" })
											] })]
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "overview-grid",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "panel overview-panel",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "card-heading",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Recent estimates" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Open the latest immutable revision" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												className: "text-button",
												onClick: () => setActiveTab("estimates"),
												children: "View all"
											})]
										}), recentEstimates.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "activity-list",
											children: recentEstimates.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												className: "activity-row",
												onClick: () => void openEstimate(item.estimate_number),
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "document-icon",
														children: "▤"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
														className: "activity-main",
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
															item.estimate_number,
															" · r",
															item.revision_number
														] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
															item.customer_name,
															" · ",
															item.event_name
														] })]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "status-badge",
														children: "Saved"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
														className: "activity-total",
														children: formatMoney(item.total)
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "row-arrow",
														children: "›"
													})
												]
											}, item.estimate_number))
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
											title: "No estimates yet",
											detail: "Create the first estimate for this company.",
											action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												className: "button primary",
												onClick: () => startEstimate(),
												children: "Create estimate"
											})
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "panel overview-panel",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "card-heading",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Upcoming events" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Event details are reusable across revisions" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												className: "text-button",
												onClick: () => setActiveTab("clients"),
												children: "Manage"
											})]
										}), upcomingEvents.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "event-list",
											children: upcomingEvents.map((item) => {
												const customer = selectedCompany?.customers.find((candidate) => candidate.customer_id === item.customer_id);
												const date = parseEventDate(item.event_date);
												return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
													className: "event-row",
													onClick: () => startEstimate(item.event_id),
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
															className: "date-tile",
															children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: date?.getUTCDate() || "—" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: date ? new Intl.DateTimeFormat("en-US", {
																month: "short",
																timeZone: "UTC"
															}).format(date) : "TBD" })]
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: item.event_name || item.event_type }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
															customer?.customer_name,
															" · ",
															item.venue || "Venue not set",
															" · ",
															item.guest_count,
															" guests"
														] })] }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "row-arrow",
															children: "›"
														})
													]
												}, item.event_id);
											})
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
											title: "No upcoming events",
											detail: "Add an event to a customer record to start planning."
										})]
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "quick-actions",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											onClick: () => startEstimate(),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "＋" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "New estimate" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Start from an event" })] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "›" })
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											onClick: () => {
												setActiveTab("clients");
												addCustomer();
											},
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "◎" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Add customer" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Create a reusable contact" })] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "›" })
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											onClick: () => setActiveTab("catalog"),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "▦" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Pricing rules" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Review catalog behavior" })] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "›" })
											]
										})
									]
								})
							]
						}),
						activeTab === "estimates" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
							className: "section-stack",
							children: estimateMode === "list" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionHeader, {
									eyebrow: "Proposals & history",
									title: "Estimates",
									detail: "Every save creates an immutable revision. Archived records remain available to the backend.",
									actions: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										className: "button primary",
										onClick: () => startEstimate(),
										children: "＋ Create estimate"
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "filter-bar panel",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
											className: "inline-search",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "⌕" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												value: estimateSearch,
												onChange: (event) => setEstimateSearch(event.target.value),
												placeholder: "Number, customer, or event"
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											value: estimateCustomerFilter,
											onChange: (event) => setEstimateCustomerFilter(event.target.value),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "all",
												children: "All customers"
											}), selectedCompany?.customers.filter((item) => !item.archived).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: item.customer_id,
												children: item.customer_name
											}, item.customer_id))]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "result-count",
											children: [visibleEstimates.length, " estimates"]
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "panel table-panel",
									children: visibleEstimates.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "data-table-wrap",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
											className: "data-table",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Estimate" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Customer" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Event" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Date" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Revision" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
													className: "number-cell",
													children: "Total"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {})
											] }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: visibleEstimates.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "estimate-link",
													onClick: () => void openEstimate(item.estimate_number),
													children: item.estimate_number
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: displayTimestamp(item.updated_at) })] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: item.customer_name }) }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: item.event_name }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: displayDate(item.event_date) }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
													className: "revision-badge",
													children: ["r", item.revision_number]
												}) }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
													className: "number-cell",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatMoney(item.total) })
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "row-actions",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
															onClick: () => void openEstimate(item.estimate_number),
															children: "Open"
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
															onClick: () => void duplicateEstimate(item.estimate_number),
															children: "Duplicate"
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
															className: "danger-action",
															onClick: () => void archiveEstimate(item.estimate_number),
															children: "Archive"
														})
													]
												}) })
											] }, item.estimate_number)) })]
										})
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
										title: "No matching estimates",
										detail: "Try another search or create a new estimate.",
										action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											className: "button primary",
											onClick: () => startEstimate(),
											children: "Create estimate"
										})
									})
								})
							] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "builder-heading",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											className: "back-link",
											onClick: resetBuilder,
											children: "← All estimates"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "eyebrow",
											children: loadedEstimateNumber ? `${loadedEstimateNumber} · base revision ${baseRevision}` : "New estimate"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: estimateStep === 1 ? "Choose an event" : estimateStep === 2 ? "Build the estimate" : "Review & save" })] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: `save-indicator ${draftDirty ? "dirty" : "saved"}`,
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}), draftDirty ? "Draft has changes" : loadedEstimateNumber ? "Saved revision" : "New draft"]
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "stepper panel",
									children: [
										1,
										2,
										3
									].map((step) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										className: estimateStep === step ? "active" : estimateStep > step ? "complete" : "",
										onClick: () => step === 1 || estimateEventId ? setEstimateStep(step) : void 0,
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: estimateStep > step ? "✓" : step }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: step === 1 ? "Event" : step === 2 ? "Scope & pricing" : "Review" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: step === 1 ? "Customer context" : step === 2 ? "Lines and charges" : "Revision & PDF" })] }),
											step < 3 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {})
										]
									}, step))
								}),
								estimateStep === 1 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "builder-stage client-stage",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "panel stage-card",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "stage-heading",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "01" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Select the event to estimate" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "The customer, tax profile, staffing plan, and headcount come from the event record." })] })]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
												label: "Customer · event",
												value: estimateEventId,
												onChange: (value) => chooseEstimateEvent(value),
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "",
													children: "Choose an event"
												}), selectedCompany?.customers.filter((item) => !item.archived).map((customer) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("optgroup", {
													label: customer.customer_name,
													children: selectedCompany.events.filter((item) => item.customer_id === customer.customer_id && !item.archived).map((event) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
														value: event.event_id,
														children: [
															event.event_name || event.event_type,
															" · ",
															displayDate(event.event_date)
														]
													}, event.event_id))
												}, customer.customer_id))]
											}),
											estimateEvent && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "event-preview-grid",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Customer" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateCustomer?.customer_name })] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Event" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateEvent.event_name || estimateEvent.event_type })] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Date" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: displayDate(estimateEvent.event_date) })] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Venue" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateEvent.venue || "Not set" })] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Guests" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateEvent.guest_count })] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Tax" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateEvent.charge_tax ? `${estimateEvent.tax_percent}%` : "Not charged" })] })
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "stage-actions",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "button ghost",
													onClick: () => {
														setActiveTab("clients");
														if (estimateEvent) {
															selectCustomer(estimateEvent.customer_id);
															setSelectedEventId(estimateEvent.event_id);
														}
													},
													children: "Edit event details"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "button primary",
													disabled: !estimateEventId,
													onClick: () => setEstimateStep(2),
													children: "Continue to scope →"
												})]
											})
										]
									})
								}),
								estimateStep === 2 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "builder-stage items-stage",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "panel items-workspace",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "items-toolbar",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Line items" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Catalog rules suggest quantities; every value remains editable." })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "toolbar-actions",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														className: "button ghost",
														onClick: addCustomItem,
														children: "＋ Custom item"
													}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														className: "button secondary",
														onClick: () => setDrawerOpen(true),
														children: "＋ From catalog"
													})]
												})]
											}),
											draftItems.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "builder-table-wrap",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
													className: "builder-table phase-one-table",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Item" }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Group / tax" }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Qty" }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Unit price" }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: "Amount" }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {})
													] }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: draftItems.map((item) => {
														const source = item.source_product_id ? selectedCompany?.products.find((product) => product.product_id === item.source_product_id) : null;
														const selectedPrice = item.catalog_price_cents_at_selection == null ? source?.["Unit Price"] : item.catalog_price_cents_at_selection / 100;
														const overridden = Boolean(source && Number(selectedPrice) !== Number(item["Unit Price"]));
														return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
																	className: "category-pill",
																	children: item.is_custom ? "Custom" : item.Category || "Uncategorized"
																}),
																item.is_custom ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
																	className: "line-title-input",
																	value: item.Description,
																	onChange: (event) => updateDraftItem(item.line_id, { Description: event.target.value })
																}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
																	value: item.Category,
																	placeholder: "Category",
																	onChange: (event) => updateDraftItem(item.line_id, { Category: event.target.value })
																})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: item.Description }),
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
																	value: item.Notes,
																	placeholder: "Line note",
																	onChange: (event) => updateDraftItem(item.line_id, { Notes: event.target.value })
																}),
																overridden && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
																	className: item.override_reason.trim() ? "override-reason" : "override-reason missing",
																	value: item.override_reason,
																	placeholder: "Required: reason for price override",
																	onChange: (event) => updateDraftItem(item.line_id, { override_reason: event.target.value })
																})
															] }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
																value: item.charge_group,
																onChange: (event) => updateDraftItem(item.line_id, { charge_group: event.target.value }),
																children: chargeGroups.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
																	value: option.value,
																	children: option.label
																}, option.value))
															}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
																value: item.tax_class,
																onChange: (event) => updateDraftItem(item.line_id, { tax_class: event.target.value }),
																children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
																	value: "taxable",
																	children: "Taxable"
																}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
																	value: "non_taxable",
																	children: "Non-taxable"
																})]
															})] }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
																className: "quantity-input",
																type: "number",
																min: "0",
																step: "any",
																value: item.Qty,
																onChange: (event) => updateDraftItem(item.line_id, { Qty: Number(event.target.value) })
															}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: item.pricing_unit })] }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
																className: overridden ? "money-input overridden" : "money-input",
																children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "$" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
																	type: "number",
																	min: "0",
																	step: "0.01",
																	value: item["Unit Price"],
																	onChange: (event) => updateDraftItem(item.line_id, {
																		"Unit Price": Number(event.target.value),
																		override_reason: Number(event.target.value) === Number(selectedPrice) ? "" : item.override_reason
																	})
																})]
															}), overridden && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: ["Selected price: ", formatMoney(selectedPrice)] })] }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
																className: "number-cell",
																children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatMoney(item.Qty * item["Unit Price"]) })
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
																className: "remove-line",
																"aria-label": `Remove ${item.Description}`,
																onClick: () => {
																	setDraftItems((current) => current.filter((line) => line.line_id !== item.line_id));
																	markDraft();
																},
																children: "×"
															}) })
														] }, item.line_id);
													}) })]
												})
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
												title: "Build the scope",
												detail: "Add reusable catalog products or a one-off custom line item.",
												action: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "empty-actions",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														className: "button secondary",
														onClick: () => setDrawerOpen(true),
														children: "Browse catalog"
													}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														className: "button ghost",
														onClick: addCustomItem,
														children: "Add custom item"
													})]
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "stage-actions items-actions",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "button ghost",
													onClick: () => setEstimateStep(1),
													children: "← Event"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "button secondary",
													onClick: () => setDrawerOpen(true),
													children: "＋ Add items"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "button primary",
													disabled: !draftItems.length || hasMissingOverrideReason,
													onClick: () => setEstimateStep(3),
													children: "Review estimate →"
												})] })]
											})
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
										className: "builder-summary",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "summary-client-card",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Prepared for" }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateCustomer?.customer_name }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
														estimateEvent?.event_name,
														" · ",
														displayDate(estimateEvent?.event_date || "")
													] })
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "panel commercial-card",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "card-heading",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Commercial terms" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Separate charges with explicit tax treatment" })] })
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "commercial-grid",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
															label: "Service charge %",
															type: "number",
															min: 0,
															value: servicePercent,
															onChange: (value) => {
																setServicePercent(Number(value));
																markDraft();
															}
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
															checked: serviceTaxable,
															onChange: (value) => {
																setServiceTaxable(value);
																markDraft();
															},
															label: "Tax service charge",
															detail: "Include in taxable subtotal"
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
															label: "Gratuity %",
															type: "number",
															min: 0,
															value: gratuityPercent,
															onChange: (value) => {
																setGratuityPercent(Number(value));
																markDraft();
															}
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
															checked: gratuityTaxable,
															onChange: (value) => {
																setGratuityTaxable(value);
																markDraft();
															},
															label: "Tax gratuity",
															detail: "Include in taxable subtotal"
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
															label: "Deposit",
															type: "number",
															min: 0,
															value: depositAmount,
															onChange: (value) => {
																setDepositAmount(Number(value));
																markDraft();
															}
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextField, {
															label: "Estimate notes",
															value: estimateNotes,
															placeholder: "Scope assumptions or terms",
															onChange: (value) => {
																setEstimateNotes(value);
																markDraft();
															}
														})
													]
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EstimateTotals, { estimate: preview })
										]
									})]
								}),
								estimateStep === 3 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "builder-stage review-stage",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "panel review-document",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "review-document-head",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
													src: "/logo_header.png",
													alt: "Silverspoon Catering",
													width: "1592",
													height: "312"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: loadedEstimateNumber ? `${loadedEstimateNumber} · revision ${preview?.revision_number || baseRevision || 1}` : "Estimate preview" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateCustomer?.customer_name })] })]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "snapshot-callout",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "◇" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Snapshot-safe document" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Saving captures the customer, event, business, line prices, rules, and totals exactly as shown. Future catalog edits will not change this revision." })] })]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "review-event",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Event" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateEvent?.event_name })] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Date" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: displayDate(estimateEvent?.event_date || "") })] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Venue" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateEvent?.venue || "Not set" })] }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Guests" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: estimateEvent?.guest_count })] })
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "review-lines",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "review-line header",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Description" }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Qty" }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Amount" })
													]
												}), draftItems.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "review-line",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: item.Description }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
															chargeGroups.find((group) => group.value === item.charge_group)?.label,
															" · ",
															item.tax_class === "taxable" ? "Taxable" : "Non-taxable",
															item.override_reason ? ` · Override: ${item.override_reason}` : ""
														] })] }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: item.Qty }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: formatMoney(item.Qty * item["Unit Price"]) })
													]
												}, item.line_id))]
											}),
											estimateNotes && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "review-note",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Estimate notes" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: estimateNotes })]
											})
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
										className: "review-sidebar",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EstimateTotals, { estimate: preview }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "panel review-actions",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
														label: loadedEstimateNumber ? "Revision note (required)" : "Revision note",
														value: revisionReason,
														placeholder: loadedEstimateNumber ? "What changed?" : "Initial estimate",
														onChange: (value) => {
															setRevisionReason(value);
															markDraft();
														}
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														className: "button primary wide",
														disabled: busy || !draftItems.length || hasMissingOverrideReason,
														onClick: () => void saveEstimate(),
														children: busy ? "Saving…" : loadedEstimateNumber ? "Save new revision" : "Save estimate"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
														className: "button secondary wide",
														disabled: !preview,
														onClick: () => preview && officeApi.downloadPdf(draft, preview).catch((error) => notify(error.message, "error")),
														children: ["⇩ ", mode === "api" ? "Download PDF" : "Print / save PDF"]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														className: "button ghost wide",
														onClick: () => setEstimateStep(2),
														children: "← Edit scope"
													}),
													loadedEstimateNumber && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
														className: "text-danger centered",
														onClick: () => void archiveEstimate(loadedEstimateNumber),
														children: ["Archive ", loadedEstimateNumber]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", {
														className: "shortcut-note",
														children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", { children: "⌘" }),
															" + ",
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", { children: "S" }),
															" to save"
														]
													})
												]
											}),
											loadedEstimateNumber && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "panel revision-card",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "card-heading",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Revision history" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Immutable saved snapshots" })] })
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "revision-list",
													children: revisionHistory.map((revision) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
														className: revision.revision_number === baseRevision && !draftDirty ? "revision-row current" : "revision-row",
														children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
																className: "revision-number",
																children: ["r", revision.revision_number]
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: revision.revision_reason }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
																displayTimestamp(revision.updated_at),
																" · ",
																formatMoney(revision.total)
															] })] }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
																onClick: () => void loadRevisionAsDraft(revision.revision_number),
																children: "Use as draft"
															})
														]
													}, revision.revision_id))
												})]
											})
										]
									})]
								})
							] })
						}),
						activeTab === "clients" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							className: "section-stack",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionHeader, {
								eyebrow: "Reusable customer records",
								title: "Customers & Events",
								detail: "A customer can have many events. Archiving either record never removes saved estimates.",
								actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SaveIndicator, { state: recordState }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										className: "button secondary",
										onClick: addCustomer,
										children: "＋ Add customer"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										className: "button primary",
										disabled: recordState === "saved" || recordState === "saving",
										onClick: () => void persistRecords(),
										children: "Save records"
									})
								] })
							}), !selectedCompany ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
								title: "Create a business first",
								detail: "Customer records belong to a business workspace."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "client-layout",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
									className: "panel client-list-panel",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
											className: "inline-search client-search",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "⌕" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												value: customerSearch,
												onChange: (event) => setCustomerSearch(event.target.value),
												placeholder: "Search customers"
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "list-title",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [filteredCustomers.length, " customers"] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Select a customer to see their events" })]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "client-list",
											children: filteredCustomers.map((customer) => {
												const events = eventRows.filter((item) => item.customer_id === customer.customer_id && !item.archived);
												const nextEvent = events[0];
												return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
													className: selectedCustomerId === customer.customer_id ? "client-card active" : "client-card",
													onClick: () => selectCustomer(customer.customer_id),
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "client-avatar",
															children: initials(customer.customer_name)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: customer.customer_name || "New customer" }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: customer.organization || `${events.length} event${events.length === 1 ? "" : "s"}` }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: nextEvent ? `${nextEvent.event_name || nextEvent.event_type} · ${displayDate(nextEvent.event_date)}` : "No active events" })
														] }),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "›" })
													]
												}, customer.customer_id);
											})
										}),
										!filteredCustomers.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mini-empty",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "No customers match your search." })
										})
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "client-detail-stack",
									children: !activeCustomer ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "panel",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
											title: "Select a customer",
											detail: "Choose a customer on the left or add a new one."
										})
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "panel client-hero",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
													className: "client-hero-avatar",
													children: initials(activeCustomer.customer_name)
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
														className: "eyebrow",
														children: "Customer profile"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: activeCustomer.customer_name || "New customer" }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
														activeCustomer.organization || "Individual customer",
														" · ",
														customerEvents.length,
														" active event",
														customerEvents.length === 1 ? "" : "s"
													] })
												] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "client-hero-actions",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														className: "button secondary",
														onClick: addEvent,
														children: "＋ Add event"
													}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
														className: "text-danger",
														onClick: () => void archiveCustomer(),
														children: "Archive customer"
													})]
												})
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "panel form-panel customer-form",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "form-section",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "form-section-heading",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "01" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Customer details" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Reusable contact and billing information, independent of any event." })] })]
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "form-grid three",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
															label: "Customer name",
															value: activeCustomer.customer_name,
															onChange: (value) => updateCustomer("customer_name", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
															label: "Organization",
															value: activeCustomer.organization,
															onChange: (value) => updateCustomer("organization", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
															label: "Email",
															type: "email",
															value: activeCustomer.customer_email,
															onChange: (value) => updateCustomer("customer_email", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
															label: "Phone",
															type: "tel",
															value: activeCustomer.customer_phone,
															onChange: (value) => updateCustomer("customer_phone", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextField, {
															label: "Billing address",
															value: activeCustomer.billing_address,
															onChange: (value) => updateCustomer("billing_address", value)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextField, {
															label: "Internal notes",
															value: activeCustomer.internal_notes,
															onChange: (value) => updateCustomer("internal_notes", value)
														})
													]
												})]
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "panel event-workspace",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "card-heading",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Events" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Choose an event to manage planning and billing defaults." })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "text-button",
													onClick: addEvent,
													children: "＋ Add event"
												})]
											}), customerEvents.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "event-tabs",
												children: customerEvents.map((event) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
													className: activeEvent?.event_id === event.event_id ? "active" : "",
													onClick: () => setSelectedEventId(event.event_id),
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: event.event_name || "New event" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
														displayDate(event.event_date),
														" · ",
														event.guest_count,
														" guests"
													] })]
												}, event.event_id))
											}), activeEvent && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "event-editor",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
														className: "event-editor-head",
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "category-pill",
															children: "Event record"
														}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: activeEvent.event_name || "New event" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
															className: "button secondary",
															onClick: () => startEstimate(activeEvent.event_id),
															children: "Create estimate"
														}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
															className: "text-danger",
															onClick: () => void archiveEvent(),
															children: "Archive event"
														})] })]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
														className: "form-grid three",
														children: [
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																label: "Event name",
																value: activeEvent.event_name,
																placeholder: "Jordan & Alex wedding",
																onChange: (value) => updateEvent("event_name", value)
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																label: "Event type",
																value: activeEvent.event_type,
																onChange: (value) => updateEvent("event_type", value)
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																label: "Event date",
																value: activeEvent.event_date,
																placeholder: "YYYY-MM-DD",
																onChange: (value) => updateEvent("event_date", value)
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																label: "Venue",
																value: activeEvent.venue,
																onChange: (value) => updateEvent("venue", value)
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																label: "Guest count",
																type: "number",
																min: 1,
																value: activeEvent.guest_count,
																onChange: (value) => updateEvent("guest_count", Number(value))
															}),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																label: "Utensil buffer",
																type: "number",
																min: 0,
																value: activeEvent.utensils_buffer,
																onChange: (value) => updateEvent("utensils_buffer", Number(value))
															})
														]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
														className: "event-subsection",
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { children: "Staffing plan" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
															className: "form-grid four",
															children: [
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																	label: "Servers",
																	type: "number",
																	min: 0,
																	value: activeEvent.servers_count,
																	onChange: (value) => updateEvent("servers_count", Number(value))
																}),
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																	label: "Server hours",
																	type: "number",
																	min: 0,
																	value: activeEvent.servers_hours,
																	onChange: (value) => updateEvent("servers_hours", Number(value))
																}),
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																	label: "Kitchen staff",
																	type: "number",
																	min: 0,
																	value: activeEvent.kitchen_staff_count,
																	onChange: (value) => updateEvent("kitchen_staff_count", Number(value))
																}),
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																	label: "Kitchen hours",
																	type: "number",
																	min: 0,
																	value: activeEvent.kitchen_staff_hours,
																	onChange: (value) => updateEvent("kitchen_staff_hours", Number(value))
																})
															]
														})]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
														className: "event-subsection",
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", { children: "Billing defaults" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
															className: "form-grid three align-end",
															children: [
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																	label: "Default deposit",
																	type: "number",
																	min: 0,
																	value: activeEvent.default_deposit_amount,
																	onChange: (value) => updateEvent("default_deposit_amount", Number(value))
																}),
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
																	checked: activeEvent.charge_tax,
																	onChange: (value) => updateEvent("charge_tax", value),
																	label: "Charge tax",
																	detail: "Apply the event tax rate"
																}),
																activeEvent.charge_tax && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
																	label: "Tax percentage",
																	type: "number",
																	min: 0,
																	value: activeEvent.tax_percent,
																	onChange: (value) => updateEvent("tax_percent", Number(value))
																})
															]
														})]
													})
												]
											})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
												title: "No events yet",
												detail: "Add an event before creating an estimate for this customer.",
												action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													className: "button secondary",
													onClick: addEvent,
													children: "Add event"
												})
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "panel client-estimates",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "card-heading",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Customer estimates" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: ["Current revisions for ", activeCustomer.customer_name || "this customer"] })] })
											}), currentCustomerEstimates.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "activity-list compact-list",
												children: currentCustomerEstimates.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
													className: "activity-row",
													onClick: () => void openEstimate(item.estimate_number),
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "document-icon",
															children: "▤"
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
															className: "activity-main",
															children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
																item.estimate_number,
																" · r",
																item.revision_number
															] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
																item.event_name,
																" · ",
																displayDate(item.event_date)
															] })]
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "status-badge",
															children: "Saved"
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
															className: "activity-total",
															children: formatMoney(item.total)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
															className: "row-arrow",
															children: "›"
														})
													]
												}, item.estimate_number))
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
												className: "no-records",
												children: "No estimates saved for this customer yet."
											})]
										})
									] })
								})]
							})]
						}),
						activeTab === "catalog" && (selectedCompany ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductStudio, {
							company: selectedCompany,
							products: productRows,
							search: productSearch,
							onSearchChange: setProductSearch,
							onProductsChange: syncProducts,
							notify
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							className: "section-stack",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionHeader, {
								eyebrow: "Reusable product catalog",
								title: "Product Studio",
								detail: "Create a business workspace before adding products."
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
								title: "Create a business first",
								detail: "Products and pricing rules belong to a business workspace."
							})]
						})),
						activeTab === "settings" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
							className: "section-stack",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionHeader, {
								eyebrow: "Branding & defaults",
								title: creatingCompany ? "Create a business" : "Business Settings",
								detail: "Reusable business details and percentage defaults for new estimates.",
								actions: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [!creatingCompany && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SaveIndicator, { state: settingsState }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									className: "button secondary",
									onClick: () => {
										setCreatingCompany(true);
										setCompanyDraft(blankCompany());
										setSettingsState("dirty");
									},
									children: "＋ New business"
								})] })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "settings-layout",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "settings-stack",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "panel settings-card",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "form-section-heading",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "01" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Business profile" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Contact information captured in every saved revision." })] })]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "form-grid two",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
														label: "Business name",
														value: companyDraft.business_name,
														onChange: (value) => updateCompanyDraft("business_name", value)
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
														label: "Business email",
														type: "email",
														value: companyDraft.business_email,
														onChange: (value) => updateCompanyDraft("business_email", value)
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
														label: "Business phone",
														type: "tel",
														value: companyDraft.business_phone,
														onChange: (value) => updateCompanyDraft("business_phone", value)
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextField, {
														label: "Business address",
														value: companyDraft.business_address,
														onChange: (value) => updateCompanyDraft("business_address", value)
													})
												]
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "panel settings-card",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "form-section-heading",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "02" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "New-estimate defaults" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Service charge and gratuity remain separate, editable commercial terms." })] })]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "form-grid two",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
													label: "Default service charge %",
													type: "number",
													min: 0,
													value: companyDraft.default_service_charge_percent,
													onChange: (value) => updateCompanyDraft("default_service_charge_percent", Number(value))
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
													label: "Default gratuity %",
													type: "number",
													min: 0,
													value: companyDraft.default_gratuity_percent,
													onChange: (value) => updateCompanyDraft("default_gratuity_percent", Number(value))
												})]
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "panel settings-card",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "form-section-heading",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "03" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Estimate document" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Reusable language snapshotted with the saved estimate." })] })]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextField, {
													label: "Payment terms",
													value: companyDraft.payment_terms,
													onChange: (value) => updateCompanyDraft("payment_terms", value)
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextField, {
													label: "Default estimate note",
													value: companyDraft.estimate_notes,
													onChange: (value) => updateCompanyDraft("estimate_notes", value)
												})
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "settings-actions",
											children: creatingCompany ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												className: "button primary",
												disabled: busy,
												onClick: () => void createCompany(),
												children: busy ? "Creating…" : "Create business"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												className: "button ghost",
												onClick: () => {
													setCreatingCompany(false);
													if (selectedCompany) setCompanyDraft(clone(selectedCompany));
													setSettingsState("saved");
												},
												children: "Cancel"
											})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												className: "button primary",
												disabled: settingsState === "saved" || settingsState === "saving",
												onClick: () => void persistCompany(),
												children: "Save settings"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												className: "text-danger",
												onClick: () => void archiveCompany(),
												children: "Archive this business"
											})] })
										})
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
									className: "panel document-preview-card",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "preview-browser-bar",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Revision snapshot" })
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "preview-paper",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
												src: "/logo_header.png",
												alt: "Company logo",
												width: "1592",
												height: "312"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "preview-meta",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Customer: Sample Customer" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Estimate EST-0000 · r1" })]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "preview-rule" }),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "preview-faux-table",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "preview-message",
												children: companyDraft.estimate_notes || "Your estimate note will appear here."
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "preview-total",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Total" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "$0.00" })]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "preview-contact",
												children: [
													companyDraft.business_phone,
													companyDraft.business_email,
													companyDraft.business_address
												].filter(Boolean).join(" · ") || "Your business contact information"
											})
										]
									})]
								})]
							})]
						})
					]
				})]
			})]
		}),
		drawerOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "drawer-backdrop",
			role: "presentation",
			onMouseDown: (event) => {
				if (event.target === event.currentTarget) setDrawerOpen(false);
			},
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "item-drawer",
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": "catalog-drawer-title",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "drawer-head",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "eyebrow",
								children: "Estimate catalog"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								id: "catalog-drawer-title",
								children: "Add items"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
								"Explicit quantity rules use ",
								estimateEvent?.event_name || "the selected event",
								"'s planning details."
							] })
						] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							className: "drawer-close",
							"aria-label": "Close item catalog",
							onClick: () => setDrawerOpen(false),
							children: "×"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "inline-search drawer-search",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "⌕" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							autoFocus: true,
							value: drawerSearch,
							onChange: (event) => setDrawerSearch(event.target.value),
							placeholder: "Search menu, staff, or services"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "category-chips drawer-chips",
						children: drawerCategories.map((category) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							className: drawerCategory === category ? "active" : "",
							onClick: () => setDrawerCategory(category),
							children: category
						}, category))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "drawer-list",
						children: drawerProducts.map((product) => {
							const added = draftItems.some((item) => item.source_product_id === product.product_id);
							const quantity = estimateEvent ? defaultProductQuantity(product, estimateEvent) : 1;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
								className: added ? "drawer-product added" : "drawer-product",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "category-pill",
										children: product.Category || "Uncategorized"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: product.Description }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
										product.Notes || chargeGroups.find((item) => item.value === product.charge_group)?.label,
										" · ",
										formatMoney(product["Unit Price"]),
										" / ",
										product.pricing_unit
									] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
										quantityRules.find((item) => item.value === product.quantity_rule)?.label,
										": suggested qty ",
										quantity
									] })
								] }), added ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => {
										setDraftItems((current) => current.filter((item) => item.source_product_id !== product.product_id));
										markDraft();
									},
									children: "✓ Added"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									onClick: () => addDraftProduct(product),
									children: "＋ Add"
								})]
							}, product.product_id);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "drawer-footer",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: draftItems.length }), " lines in estimate"] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							className: "button ghost",
							onClick: addCustomItem,
							children: "＋ Custom"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							className: "button primary",
							onClick: () => setDrawerOpen(false),
							children: "Done"
						})] })]
					})
				]
			})
		}),
		toast && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: `toast ${toast.tone}`,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: toast.tone === "success" ? "✓" : "!" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: toast.message })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EstimateDocument, { estimate: preview })
	] });
}
//#endregion
export { OfficeApp as default };
