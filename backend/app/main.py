from __future__ import annotations

import os
from copy import deepcopy
from io import BytesIO
from threading import RLock
from typing import Any, Callable
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .auth import AuthContext, AuthManager
from .browser_import import BrowserDataImporter
from .catalog import money_to_cents, utc_now
from .models import (
    BrowserDemoCommit,
    BrowserDemoImport,
    CompanyCreate,
    CompanyPatch,
    CompanyStateChange,
    CompanyUpdate,
    CustomerCreate,
    CustomerPatch,
    CustomerStateChange,
    CustomersUpdate,
    EstimateDraft,
    EstimateStateChange,
    EventCreate,
    EventPatch,
    EventStateChange,
    EventsUpdate,
    ProductCreate,
    ProductPatch,
    ProductResolveRequest,
    ProductStateChange,
    ProductsUpdate,
)
from .pdf import build_pdf
from .services import build_estimate, clean_filename, resolve_product_selection
from .storage import ALL_SCOPES, SCHEMA_VERSION, SqliteRepository

PII_FIELDS = {"customer_email", "customer_phone", "billing_address"}
INTERNAL_FIELDS = {"internal_notes"}


def create_app(repository: SqliteRepository | None = None) -> FastAPI:
    repo = repository or SqliteRepository()
    auth = AuthManager(repo)
    importer = BrowserDataImporter(repo)
    mutation_lock = RLock()
    application = FastAPI(title="Silverspoon Office API", version="5.0.0")
    origins = [
        item.strip()
        for item in os.getenv(
            "OFFICE_CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
        ).split(",")
        if item.strip()
    ]
    application.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
    )

    @application.middleware("http")
    async def request_controls(request: Request, call_next: Callable[..., Any]) -> Response:
        request_id = request.headers.get("x-request-id", "").strip() or f"request-{uuid4().hex[:16]}"
        request.state.request_id = request_id
        maximum = max(int(os.getenv("OFFICE_MAX_REQUEST_BYTES", "16777216") or 16777216), 1024)
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > maximum:
                    return JSONResponse(413, {"detail": "Request body is too large"}, headers={"X-Request-ID": request_id})
            except ValueError:
                return JSONResponse(400, {"detail": "Invalid Content-Length header"}, headers={"X-Request-ID": request_id})
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    read_access = auth.require("office.read")
    catalog_write = auth.require("office.catalog.write")
    crm_write = auth.require("office.crm.write")
    estimate_write = auth.require("office.estimates.write")
    archive_write = auth.require("office.archive")
    mcp_connect = auth.require("office.mcp.connect")
    pii_read = auth.require("office.read", "office.pii.read")
    admin_access = auth.require("office.admin")

    def redact(payload: Any, context: AuthContext) -> Any:
        allow_pii = context.can("office.pii.read")
        allow_internal = context.can("office.internal.read")

        def visit(value: Any) -> Any:
            if isinstance(value, list):
                return [visit(item) for item in value]
            if not isinstance(value, dict):
                return value
            result: dict[str, Any] = {}
            for key, item in value.items():
                if key in INTERNAL_FIELDS and not allow_internal:
                    result[key] = ""
                elif key in PII_FIELDS and not allow_pii:
                    result[key] = ""
                else:
                    result[key] = visit(item)
            return result

        return visit(deepcopy(payload))

    def page_headers(response: Response, limit: int, offset: int, returned: int) -> None:
        response.headers["X-Pagination-Limit"] = str(limit)
        response.headers["X-Pagination-Offset"] = str(offset)
        response.headers["X-Pagination-Returned"] = str(returned)

    def mutate(
        context: AuthContext,
        operation: str,
        payload: Any,
        callback: Callable[[], Any],
        not_found: str = "Resource not found",
    ) -> Any:
        if not context.idempotency_key:
            raise HTTPException(400, "Idempotency-Key header is required for mutations")
        request_hash = repo.request_hash(operation, payload)
        with mutation_lock:
            try:
                cached = repo.idempotency_lookup(
                    context.actor, context.idempotency_key, operation, request_hash
                )
                if cached is not None:
                    return cached
                result = callback()
                repo.idempotency_store(
                    context.actor,
                    context.idempotency_key,
                    operation,
                    request_hash,
                    result,
                )
                return result
            except KeyError as error:
                raise HTTPException(404, not_found) from error
            except ValueError as error:
                raise HTTPException(409, str(error)) from error

    def require_company(company_id: str, include_archived: bool = False) -> dict[str, Any]:
        company = repo.company(company_id)
        if not company or (company.get("archived") and not include_archived):
            raise HTTPException(404, "Company not found")
        return company

    def require_customer(company_id: str, customer_id: str) -> dict[str, Any]:
        customer = repo.customer(company_id, customer_id)
        if not customer or customer.get("archived"):
            raise HTTPException(404, "Customer not found")
        return customer

    def require_event(company_id: str, event_id: str, customer_id: str = "") -> dict[str, Any]:
        event = repo.event(company_id, event_id)
        if (
            not event
            or event.get("archived")
            or (customer_id and str(event.get("customer_id")) != customer_id)
        ):
            raise HTTPException(404, "Event not found")
        return event

    def resolve_customer_event(company_id: str, draft: EstimateDraft) -> tuple[dict[str, Any], dict[str, Any]]:
        customer_id = draft.customer_id or draft.client_id
        customer = require_customer(company_id, customer_id)
        event_id = draft.event_id
        if not event_id:
            events = repo.list_events(company_id, customer_id=customer_id, limit=1)
            event_id = str(events[0]["event_id"]) if events else ""
        return customer, require_event(company_id, event_id, customer_id)

    def materialize_draft(draft: EstimateDraft, reserve_number: bool = False) -> dict[str, Any]:
        company = require_company(draft.company_id)
        customer, event = resolve_customer_event(draft.company_id, draft)
        existing = repo.estimate(draft.estimate_number) if draft.estimate_number else None
        number = draft.estimate_number or (repo.next_estimate_number() if reserve_number else "DRAFT")
        next_revision = (int(existing.get("revision_number", 0)) + 1) if existing else (1 if reserve_number else 0)
        items = [item.model_dump(by_alias=True) for item in draft.line_items]
        return build_estimate(
            company=company,
            customer=customer,
            event=event,
            draft_items=items,
            estimate_number=number,
            revision_number=next_revision,
            previous=existing,
            notes=draft.notes,
            revision_reason=draft.revision_reason,
            service_charge_percent=draft.service_charge_percent,
            service_charge_taxable=draft.service_charge_taxable,
            gratuity_percent=draft.gratuity_percent,
            gratuity_taxable=draft.gratuity_taxable,
            deposit_amount=draft.deposit_amount,
        )

    def validate_price_overrides(draft: EstimateDraft) -> None:
        products = {
            str(item.get("product_id")): item
            for item in repo.list_products(draft.company_id, include_archived=True, limit=500)
        }
        for item in draft.line_items:
            source_id = item.source_product_id or item.product_id
            product = products.get(str(source_id or ""))
            if source_id and not product:
                raise HTTPException(422, f"Catalog product not found: {source_id}")
            if not product:
                continue
            has_version = item.source_product_version is not None
            has_selection_price = item.catalog_price_cents_at_selection is not None
            if has_version != has_selection_price:
                raise HTTPException(422, "Product selection metadata must include both version and catalog price")
            if has_version:
                revisions = repo.product_revisions(draft.company_id, str(source_id))
                selected_revision = next(
                    (
                        entry
                        for entry in revisions
                        if int(entry.get("version", 0)) == item.source_product_version
                    ),
                    None,
                )
                if not selected_revision:
                    raise HTTPException(422, f"Product version {item.source_product_version} was not found")
                baseline_cents = int(selected_revision.get("snapshot", {}).get("price_cents", 0) or 0)
                if item.catalog_price_cents_at_selection != baseline_cents:
                    raise HTTPException(422, "Catalog price does not match the selected product version")
            else:
                baseline_cents = int(product.get("price_cents", 0) or 0)
            if item.unit_price is not None and money_to_cents(item.unit_price) != baseline_cents:
                if not item.override_reason.strip():
                    name = item.description or product.get("name", "line item")
                    raise HTTPException(422, f"Price override reason required for {name}")

    @application.get("/api/health")
    def health() -> dict[str, Any]:
        status = repo.database_health()
        if status["status"] != "ok":
            raise HTTPException(503, "Database integrity check failed")
        return {"status": "ok", "database": "sqlite", "schema_version": status["schema_version"]}

    @application.get("/api/ready")
    def ready() -> dict[str, Any]:
        status = repo.database_health()
        if status["status"] != "ok" or status["schema_version"] != SCHEMA_VERSION:
            raise HTTPException(503, "Database is not ready")
        return status

    @application.post("/api/auth/login")
    def login(payload: dict[str, Any], response: Response) -> dict[str, Any]:
        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", ""))
        if not auth._verify_password(username, password):
            raise HTTPException(401, "Invalid username or password",
                                 headers={"WWW-Authenticate": "Bearer"})
        response.set_cookie(
            key="office_session",
            value=auth._issue_session(username),
            max_age=86400,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
        return {"user": username, "scopes": sorted(ALL_SCOPES)}

    @application.post("/api/auth/logout")
    def logout(response: Response) -> dict[str, Any]:
        response.delete_cookie("office_session", path="/")
        return {"ok": True}

    @application.get("/api/auth/session")
    def session(request: Request) -> dict[str, Any]:
        raw = request.cookies.get("office_session", "")
        user = auth._session_user(raw) if raw else ""
        if user:
            return {"user": user, "scopes": sorted(ALL_SCOPES)}
        raise HTTPException(401, "Not signed in")

    @application.get("/api/auth/mcp", status_code=204)
    def authorize_mcp(_context: AuthContext = Depends(mcp_connect)) -> Response:
        return Response(status_code=204)

    @application.get("/api/capabilities")
    def capabilities(context: AuthContext = Depends(read_access)) -> dict[str, Any]:
        return {
            "api_version": "5.0.0",
            "database": "sqlite",
            "schema_version": SCHEMA_VERSION,
            "actor": context.actor,
            "scopes": sorted(context.scopes),
            "available_scopes": sorted(ALL_SCOPES),
            "idempotency_required": True,
        }

    @application.get("/api/bootstrap")
    def bootstrap(context: AuthContext = Depends(read_access)) -> dict[str, Any]:
        store = repo.bootstrap_store(
            include_internal=context.can("office.internal.read"),
            include_pii=context.can("office.pii.read"),
        )
        return {"store": store, "estimates": repo.list_estimates(limit=500)}

    @application.get("/api/companies")
    def list_companies(
        response: Response,
        include_archived: bool = Query(default=False),
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
        context: AuthContext = Depends(read_access),
    ) -> list[dict[str, Any]]:
        rows = redact(repo.list_companies(include_archived, limit, offset), context)
        page_headers(response, limit, offset, len(rows))
        return rows

    @application.get("/api/companies/{company_id}")
    def get_company(
        company_id: str,
        include_archived: bool = Query(default=False),
        context: AuthContext = Depends(read_access),
    ) -> dict[str, Any]:
        return redact(require_company(company_id, include_archived), context)

    @application.post("/api/companies", status_code=201)
    def create_company(
        payload: CompanyCreate,
        context: AuthContext = Depends(crm_write),
    ) -> dict[str, Any]:
        values = payload.model_dump(exclude={"change_reason"})

        def execute() -> dict[str, Any]:
            created = repo.create_company(values, payload.change_reason, context.mutation())
            return redact(repo.company(created["company_id"]), context)

        return mutate(context, "company.create", payload.model_dump(mode="json"), execute)

    @application.put("/api/companies/{company_id}")
    def update_company(
        company_id: str,
        payload: CompanyUpdate,
        context: AuthContext = Depends(crm_write),
    ) -> dict[str, Any]:
        values = payload.model_dump(exclude={"expected_version", "change_reason"})

        def execute() -> dict[str, Any]:
            repo.update_company(
                company_id,
                values,
                payload.expected_version,
                payload.change_reason,
                context.mutation(),
            )
            return redact(repo.company(company_id), context)

        return mutate(
            context,
            f"company.update:{company_id}",
            payload.model_dump(mode="json"),
            execute,
            "Company not found",
        )

    @application.patch("/api/companies/{company_id}")
    def patch_company(
        company_id: str,
        payload: CompanyPatch,
        context: AuthContext = Depends(crm_write),
    ) -> dict[str, Any]:
        values = payload.model_dump(exclude_unset=True, exclude={"expected_version", "change_reason"})

        def execute() -> dict[str, Any]:
            repo.update_company(
                company_id,
                values,
                payload.expected_version,
                payload.change_reason,
                context.mutation(),
            )
            return redact(repo.company(company_id), context)

        return mutate(
            context,
            f"company.update:{company_id}",
            payload.model_dump(mode="json", exclude_unset=True),
            execute,
            "Company not found",
        )

    @application.post("/api/companies/{company_id}/archive")
    def archive_company(
        company_id: str,
        payload: CompanyStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return mutate(
            context,
            f"company.archive:{company_id}",
            payload.model_dump(mode="json"),
            lambda: repo.set_company_status(
                company_id, True, payload.expected_version, payload.change_reason, context.mutation()
            ),
            "Company not found",
        )

    @application.post("/api/companies/{company_id}/restore")
    def restore_company(
        company_id: str,
        payload: CompanyStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return mutate(
            context,
            f"company.restore:{company_id}",
            payload.model_dump(mode="json"),
            lambda: repo.set_company_status(
                company_id, False, payload.expected_version, payload.change_reason, context.mutation()
            ),
            "Company not found",
        )

    @application.delete("/api/companies/{company_id}", deprecated=True)
    def archive_company_compatibility(
        company_id: str,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        company = require_company(company_id, include_archived=True)
        payload = {"expected_version": company["version"], "change_reason": "Archived through compatibility endpoint"}
        return mutate(
            context,
            f"company.archive:{company_id}",
            payload,
            lambda: repo.set_company_status(
                company_id, True, company["version"], payload["change_reason"], context.mutation()
            ),
            "Company not found",
        )

    @application.get("/api/companies/{company_id}/revisions")
    def company_revisions(
        company_id: str,
        context: AuthContext = Depends(read_access),
    ) -> list[dict[str, Any]]:
        try:
            return redact(repo.company_revisions(company_id), context)
        except KeyError as error:
            raise HTTPException(404, "Company not found") from error

    @application.get("/api/companies/{company_id}/products")
    def list_products(
        company_id: str,
        response: Response,
        include_archived: bool = Query(default=False),
        query: str = Query(default="", max_length=200),
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
        context: AuthContext = Depends(read_access),
    ) -> dict[str, Any]:
        company = require_company(company_id, include_archived=True)
        try:
            products = redact(repo.list_products(company_id, include_archived, query, limit, offset), context)
        except KeyError as error:
            raise HTTPException(404, "Company not found") from error
        page_headers(response, limit, offset, len(products))
        return {"catalog_version": int(company.get("product_catalog_version", 0)), "products": products}

    @application.put("/api/companies/{company_id}/products")
    def update_products(
        company_id: str,
        payload: ProductsUpdate,
        context: AuthContext = Depends(catalog_write),
    ) -> list[dict[str, Any]]:
        body = payload.model_dump(mode="json", by_alias=True)
        return mutate(
            context,
            f"products.sync:{company_id}",
            body,
            lambda: redact(
                repo.replace_products(
                    company_id,
                    [item.model_dump(by_alias=True, exclude_unset=True) for item in payload.products],
                    payload.expected_catalog_version,
                    context.mutation(),
                ),
                context,
            ),
            "Company not found",
        )

    @application.post("/api/companies/{company_id}/products", status_code=201)
    def create_product(
        company_id: str,
        payload: ProductCreate,
        context: AuthContext = Depends(catalog_write),
    ) -> dict[str, Any]:
        require_company(company_id)
        values = payload.model_dump(exclude={"change_reason"})
        return mutate(
            context,
            f"product.create:{company_id}",
            payload.model_dump(mode="json"),
            lambda: redact(
                repo.create_product(company_id, values, payload.change_reason, context.mutation()),
                context,
            ),
        )

    @application.post("/api/companies/{company_id}/products/resolve")
    def resolve_products(
        company_id: str,
        payload: ProductResolveRequest,
        context: AuthContext = Depends(read_access),
    ) -> dict[str, Any]:
        require_company(company_id)
        event = require_event(company_id, payload.event_id)
        products = {
            item["product_id"]: item
            for item in repo.list_products(company_id, include_archived=True, limit=500)
        }
        selected_at = utc_now()
        resolved: list[dict[str, Any]] = []
        for product_id in payload.product_ids:
            product = products.get(product_id)
            if not product or product.get("status") == "archived":
                raise HTTPException(404, f"Active product not found: {product_id}")
            resolved.append(resolve_product_selection(product, event, selected_at))
        return redact({"event_id": payload.event_id, "selected_at": selected_at, "line_items": resolved}, context)

    @application.get("/api/companies/{company_id}/products/{product_id}")
    def get_product(
        company_id: str,
        product_id: str,
        context: AuthContext = Depends(read_access),
    ) -> dict[str, Any]:
        require_company(company_id, include_archived=True)
        product = repo.product(company_id, product_id)
        if not product:
            raise HTTPException(404, "Product not found")
        return redact(product, context)

    @application.patch("/api/companies/{company_id}/products/{product_id}")
    def patch_product(
        company_id: str,
        product_id: str,
        payload: ProductPatch,
        context: AuthContext = Depends(catalog_write),
    ) -> dict[str, Any]:
        require_company(company_id)
        values = payload.model_dump(exclude_unset=True, exclude={"expected_version", "change_reason"})
        return mutate(
            context,
            f"product.update:{company_id}:{product_id}",
            payload.model_dump(mode="json", exclude_unset=True),
            lambda: redact(
                repo.update_product(
                    company_id,
                    product_id,
                    values,
                    payload.expected_version,
                    payload.change_reason,
                    context.mutation(),
                ),
                context,
            ),
            "Product not found",
        )

    def change_product_status(
        company_id: str,
        product_id: str,
        payload: ProductStateChange,
        context: AuthContext,
        status: str,
    ) -> dict[str, Any]:
        return mutate(
            context,
            f"product.{status}:{company_id}:{product_id}",
            payload.model_dump(mode="json"),
            lambda: redact(
                repo.set_product_status(
                    company_id,
                    product_id,
                    status,
                    payload.expected_version,
                    payload.change_reason,
                    context.mutation(),
                ),
                context,
            ),
            "Product not found",
        )

    @application.post("/api/companies/{company_id}/products/{product_id}/archive")
    def archive_product(
        company_id: str,
        product_id: str,
        payload: ProductStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return change_product_status(company_id, product_id, payload, context, "archived")

    @application.post("/api/companies/{company_id}/products/{product_id}/restore")
    def restore_product(
        company_id: str,
        product_id: str,
        payload: ProductStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return change_product_status(company_id, product_id, payload, context, "active")

    @application.get("/api/companies/{company_id}/products/{product_id}/revisions")
    def product_revisions(
        company_id: str,
        product_id: str,
        context: AuthContext = Depends(read_access),
    ) -> list[dict[str, Any]]:
        try:
            return redact(repo.product_revisions(company_id, product_id), context)
        except KeyError as error:
            raise HTTPException(404, "Product not found") from error

    @application.get("/api/companies/{company_id}/products/{product_id}/usage")
    def product_usage(
        company_id: str,
        product_id: str,
        context: AuthContext = Depends(read_access),
    ) -> dict[str, Any]:
        try:
            return redact(repo.product_usage(company_id, product_id), context)
        except KeyError as error:
            raise HTTPException(404, "Product not found") from error

    @application.get("/api/companies/{company_id}/customers")
    def list_customers(
        company_id: str,
        response: Response,
        include_archived: bool = Query(default=False),
        query: str = Query(default="", max_length=200),
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
        context: AuthContext = Depends(read_access),
    ) -> list[dict[str, Any]]:
        try:
            rows = redact(repo.list_customers(company_id, include_archived, query, limit, offset), context)
        except KeyError as error:
            raise HTTPException(404, "Company not found") from error
        page_headers(response, limit, offset, len(rows))
        return rows

    @application.put("/api/companies/{company_id}/customers")
    def update_customers(
        company_id: str,
        payload: CustomersUpdate,
        context: AuthContext = Depends(crm_write),
    ) -> list[dict[str, Any]]:
        return mutate(
            context,
            f"customers.sync:{company_id}",
            payload.model_dump(mode="json"),
            lambda: redact(
                [
                    {key: value for key, value in item.items() if key != "company_id"}
                    for item in repo.replace_customers(
                        company_id,
                        [item.model_dump() for item in payload.customers],
                        context.mutation(),
                    )
                ],
                context,
            ),
            "Company not found",
        )

    @application.post("/api/companies/{company_id}/customers", status_code=201)
    def create_customer(
        company_id: str,
        payload: CustomerCreate,
        context: AuthContext = Depends(crm_write),
    ) -> dict[str, Any]:
        require_company(company_id)
        values = payload.model_dump(exclude={"change_reason"})

        def execute() -> dict[str, Any]:
            created = repo.create_customer(company_id, values, payload.change_reason, context.mutation())
            return redact(repo.customer(company_id, created["customer_id"]), context)

        return mutate(context, f"customer.create:{company_id}", payload.model_dump(mode="json"), execute)

    @application.get("/api/companies/{company_id}/customers/{customer_id}")
    def get_customer(
        company_id: str,
        customer_id: str,
        context: AuthContext = Depends(read_access),
    ) -> dict[str, Any]:
        customer = repo.customer(company_id, customer_id)
        if not customer:
            raise HTTPException(404, "Customer not found")
        return redact(customer, context)

    @application.patch("/api/companies/{company_id}/customers/{customer_id}")
    def patch_customer(
        company_id: str,
        customer_id: str,
        payload: CustomerPatch,
        context: AuthContext = Depends(crm_write),
    ) -> dict[str, Any]:
        values = payload.model_dump(exclude_unset=True, exclude={"expected_version", "change_reason"})
        return mutate(
            context,
            f"customer.update:{company_id}:{customer_id}",
            payload.model_dump(mode="json", exclude_unset=True),
            lambda: redact(
                repo.update_customer(
                    company_id,
                    customer_id,
                    values,
                    payload.expected_version,
                    payload.change_reason,
                    context.mutation(),
                ),
                context,
            ),
            "Customer not found",
        )

    def change_customer_status(
        company_id: str,
        customer_id: str,
        payload: CustomerStateChange,
        context: AuthContext,
        archived: bool,
    ) -> dict[str, Any]:
        action = "archive" if archived else "restore"
        return mutate(
            context,
            f"customer.{action}:{company_id}:{customer_id}",
            payload.model_dump(mode="json"),
            lambda: redact(
                repo.set_customer_status(
                    company_id,
                    customer_id,
                    archived,
                    payload.expected_version,
                    payload.change_reason,
                    context.mutation(),
                ),
                context,
            ),
            "Customer not found",
        )

    @application.post("/api/companies/{company_id}/customers/{customer_id}/archive")
    def archive_customer(
        company_id: str,
        customer_id: str,
        payload: CustomerStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return change_customer_status(company_id, customer_id, payload, context, True)

    @application.post("/api/companies/{company_id}/customers/{customer_id}/restore")
    def restore_customer(
        company_id: str,
        customer_id: str,
        payload: CustomerStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return change_customer_status(company_id, customer_id, payload, context, False)

    @application.get("/api/companies/{company_id}/customers/{customer_id}/revisions")
    def customer_revisions(
        company_id: str,
        customer_id: str,
        context: AuthContext = Depends(read_access),
    ) -> list[dict[str, Any]]:
        try:
            return redact(repo.customer_revisions(company_id, customer_id), context)
        except KeyError as error:
            raise HTTPException(404, "Customer not found") from error

    @application.get("/api/companies/{company_id}/events")
    def list_events(
        company_id: str,
        response: Response,
        customer_id: str | None = Query(default=None),
        include_archived: bool = Query(default=False),
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
        context: AuthContext = Depends(read_access),
    ) -> list[dict[str, Any]]:
        try:
            rows = redact(
                repo.list_events(company_id, customer_id, include_archived, limit, offset), context
            )
        except KeyError as error:
            raise HTTPException(404, "Company not found") from error
        page_headers(response, limit, offset, len(rows))
        return rows

    @application.put("/api/companies/{company_id}/events")
    def update_events(
        company_id: str,
        payload: EventsUpdate,
        context: AuthContext = Depends(crm_write),
    ) -> list[dict[str, Any]]:
        return mutate(
            context,
            f"events.sync:{company_id}",
            payload.model_dump(mode="json"),
            lambda: redact(
                [
                    {key: value for key, value in item.items() if key != "company_id"}
                    for item in repo.replace_events(
                        company_id,
                        [item.model_dump() for item in payload.events],
                        context.mutation(),
                    )
                ],
                context,
            ),
            "Company not found",
        )

    @application.post("/api/companies/{company_id}/events", status_code=201)
    def create_event(
        company_id: str,
        payload: EventCreate,
        context: AuthContext = Depends(crm_write),
    ) -> dict[str, Any]:
        require_company(company_id)
        values = payload.model_dump(exclude={"change_reason"})

        def execute() -> dict[str, Any]:
            created = repo.create_event(company_id, values, payload.change_reason, context.mutation())
            return redact(repo.event(company_id, created["event_id"]), context)

        return mutate(context, f"event.create:{company_id}", payload.model_dump(mode="json"), execute)

    @application.get("/api/companies/{company_id}/events/{event_id}")
    def get_event(
        company_id: str,
        event_id: str,
        context: AuthContext = Depends(read_access),
    ) -> dict[str, Any]:
        event = repo.event(company_id, event_id)
        if not event:
            raise HTTPException(404, "Event not found")
        return redact(event, context)

    @application.patch("/api/companies/{company_id}/events/{event_id}")
    def patch_event(
        company_id: str,
        event_id: str,
        payload: EventPatch,
        context: AuthContext = Depends(crm_write),
    ) -> dict[str, Any]:
        values = payload.model_dump(exclude_unset=True, exclude={"expected_version", "change_reason"})
        return mutate(
            context,
            f"event.update:{company_id}:{event_id}",
            payload.model_dump(mode="json", exclude_unset=True),
            lambda: redact(
                repo.update_event(
                    company_id,
                    event_id,
                    values,
                    payload.expected_version,
                    payload.change_reason,
                    context.mutation(),
                ),
                context,
            ),
            "Event not found",
        )

    def change_event_status(
        company_id: str,
        event_id: str,
        payload: EventStateChange,
        context: AuthContext,
        archived: bool,
    ) -> dict[str, Any]:
        action = "archive" if archived else "restore"
        return mutate(
            context,
            f"event.{action}:{company_id}:{event_id}",
            payload.model_dump(mode="json"),
            lambda: redact(
                repo.set_event_status(
                    company_id,
                    event_id,
                    archived,
                    payload.expected_version,
                    payload.change_reason,
                    context.mutation(),
                ),
                context,
            ),
            "Event not found",
        )

    @application.post("/api/companies/{company_id}/events/{event_id}/archive")
    def archive_event(
        company_id: str,
        event_id: str,
        payload: EventStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return change_event_status(company_id, event_id, payload, context, True)

    @application.post("/api/companies/{company_id}/events/{event_id}/restore")
    def restore_event(
        company_id: str,
        event_id: str,
        payload: EventStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return change_event_status(company_id, event_id, payload, context, False)

    @application.get("/api/companies/{company_id}/events/{event_id}/revisions")
    def event_revisions(
        company_id: str,
        event_id: str,
        context: AuthContext = Depends(read_access),
    ) -> list[dict[str, Any]]:
        try:
            return redact(repo.event_revisions(company_id, event_id), context)
        except KeyError as error:
            raise HTTPException(404, "Event not found") from error

    @application.get("/api/estimates")
    def list_estimates(
        response: Response,
        company_id: str | None = Query(default=None),
        customer_id: str | None = Query(default=None),
        event_id: str | None = Query(default=None),
        include_archived: bool = Query(default=False),
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
        context: AuthContext = Depends(read_access),
    ) -> list[dict[str, Any]]:
        rows = redact(
            repo.list_estimates(company_id, customer_id, event_id, include_archived, limit, offset),
            context,
        )
        page_headers(response, limit, offset, len(rows))
        return rows

    @application.post("/api/estimates/calculate")
    def calculate_estimate(
        draft: EstimateDraft,
        context: AuthContext = Depends(read_access),
    ) -> dict[str, Any]:
        return redact(materialize_draft(draft), context)

    @application.post("/api/estimates", status_code=201)
    def save_estimate(
        draft: EstimateDraft,
        context: AuthContext = Depends(estimate_write),
    ) -> dict[str, Any]:
        body = draft.model_dump(mode="json", by_alias=True)

        def execute() -> dict[str, Any]:
            validate_price_overrides(draft)
            payload = materialize_draft(draft, reserve_number=True)
            return redact(repo.save_estimate(payload, draft.base_revision, context.mutation()), context)

        return mutate(context, "estimate.save", body, execute, "Estimate not found")

    @application.get("/api/estimates/{estimate_number}")
    def get_estimate(
        estimate_number: str,
        revision: int | None = Query(default=None, ge=1),
        context: AuthContext = Depends(read_access),
    ) -> dict[str, Any]:
        estimate = repo.estimate(estimate_number, revision)
        if not estimate:
            raise HTTPException(404, "Estimate or revision not found")
        return redact(estimate, context)

    @application.get("/api/estimates/{estimate_number}/revisions")
    def estimate_revisions(
        estimate_number: str,
        context: AuthContext = Depends(read_access),
    ) -> list[dict[str, Any]]:
        try:
            return repo.list_revisions(estimate_number)
        except KeyError as error:
            raise HTTPException(404, "Estimate not found") from error

    def change_estimate_status(
        estimate_number: str,
        payload: EstimateStateChange,
        context: AuthContext,
        archived: bool,
    ) -> dict[str, Any]:
        action = "archive" if archived else "restore"

        def execute() -> dict[str, Any]:
            if archived:
                repo.archive_estimate(
                    estimate_number,
                    payload.base_revision,
                    payload.change_reason,
                    context.mutation(),
                )
            else:
                repo.restore_estimate(
                    estimate_number,
                    payload.base_revision,
                    payload.change_reason,
                    context.mutation(),
                )
            return {
                "estimate_number": clean_filename(estimate_number),
                "archived": archived,
                "current_revision": payload.base_revision,
            }

        return mutate(
            context,
            f"estimate.{action}:{clean_filename(estimate_number)}",
            payload.model_dump(mode="json"),
            execute,
            "Estimate not found",
        )

    @application.post("/api/estimates/{estimate_number}/archive")
    def archive_estimate(
        estimate_number: str,
        payload: EstimateStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return change_estimate_status(estimate_number, payload, context, True)

    @application.post("/api/estimates/{estimate_number}/restore")
    def restore_estimate(
        estimate_number: str,
        payload: EstimateStateChange,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        return change_estimate_status(estimate_number, payload, context, False)

    @application.delete("/api/estimates/{estimate_number}", deprecated=True)
    def archive_estimate_compatibility(
        estimate_number: str,
        context: AuthContext = Depends(archive_write),
    ) -> dict[str, Any]:
        record = repo.estimate_record(estimate_number)
        if not record:
            raise HTTPException(404, "Estimate not found")
        payload = EstimateStateChange(
            base_revision=record["current_revision"],
            change_reason="Archived through compatibility endpoint",
        )
        return change_estimate_status(estimate_number, payload, context, True)

    @application.get("/api/estimates/{estimate_number}/pdf")
    def saved_estimate_pdf(
        estimate_number: str,
        revision: int | None = Query(default=None, ge=1),
        _context: AuthContext = Depends(pii_read),
    ) -> StreamingResponse:
        payload = repo.estimate(estimate_number, revision)
        if not payload:
            raise HTTPException(404, "Estimate or revision not found")
        filename = (
            f"{clean_filename(payload['estimate_number'])}_r{payload['revision_number']}_"
            f"{clean_filename(payload['customer_name'])}.pdf"
        )
        return StreamingResponse(
            BytesIO(build_pdf(payload)),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @application.post("/api/estimates/pdf")
    def preview_estimate_pdf(
        draft: EstimateDraft,
        _context: AuthContext = Depends(pii_read),
    ) -> StreamingResponse:
        payload = materialize_draft(draft)
        filename = f"{clean_filename(payload['estimate_number'])}_{clean_filename(payload['customer_name'])}.pdf"
        return StreamingResponse(
            BytesIO(build_pdf(payload)),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @application.get("/api/admin/audit")
    def audit_log(
        response: Response,
        entity_type: str | None = Query(default=None, max_length=50),
        entity_id: str | None = Query(default=None, max_length=200),
        actor: str | None = Query(default=None, max_length=200),
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
        _context: AuthContext = Depends(admin_access),
    ) -> list[dict[str, Any]]:
        rows = repo.list_audit_log(entity_type, entity_id, actor, limit, offset)
        page_headers(response, limit, offset, len(rows))
        return rows

    @application.get("/api/admin/database")
    def database_status(_context: AuthContext = Depends(admin_access)) -> dict[str, Any]:
        return repo.database_health()

    @application.post("/api/admin/imports/browser-demo/preview", status_code=201)
    def preview_browser_import(
        payload: BrowserDemoImport,
        context: AuthContext = Depends(admin_access),
    ) -> dict[str, Any]:
        def execute() -> dict[str, Any]:
            _normalized, summary = importer.preview(payload.state)
            job_id = repo.create_import_job("browser_demo", context.actor, payload.state, summary)
            return {"job_id": job_id, "summary": summary}

        return mutate(
            context,
            "browser_import.preview",
            payload.model_dump(mode="json"),
            execute,
        )

    @application.get("/api/admin/imports/{job_id}")
    def get_import_job(
        job_id: str,
        include_payload: bool = Query(default=False),
        _context: AuthContext = Depends(admin_access),
    ) -> dict[str, Any]:
        job = repo.import_job(job_id)
        if not job:
            raise HTTPException(404, "Import job not found")
        if not include_payload:
            job.pop("payload", None)
        return job

    @application.post("/api/admin/imports/browser-demo/commit")
    def commit_browser_import(
        payload: BrowserDemoCommit,
        context: AuthContext = Depends(admin_access),
    ) -> dict[str, Any]:
        return mutate(
            context,
            f"browser_import.commit:{payload.job_id}",
            payload.model_dump(mode="json"),
            lambda: importer.commit(
                payload.job_id,
                payload.strategy,
                payload.change_reason,
                context.mutation(),
            ),
            "Import job not found",
        )

    application.state.repository = repo
    application.state.auth_manager = auth
    return application


app = create_app()
