from __future__ import annotations

import csv
from io import StringIO
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.db.session import SessionLocal, get_db
from app.models.alert import Alert
from app.models.property import Property
from app.models.search import Search, SearchRun
from app.schemas.agency_contacts import AgencyContactCreate, AgencyContactRead
from app.schemas.properties import AlertRead, PropertyRead
from app.schemas.searches import SearchCreate, SearchPreviewRequest, SearchPreviewResponse, SearchRead, SearchUpdate
from app.services.agency_contact_service import AgencyContactService
from app.services.location_service import LocationService
from app.services.scrape_service import ScrapeService
from app.services.search_service import SearchService

router = APIRouter()
search_service = SearchService()
scrape_service = ScrapeService()
location_service = LocationService()
agency_contact_service = AgencyContactService()


@router.get("/", response_class=HTMLResponse)
def dashboard() -> str:
    return Path("app/templates/index.html").read_text(encoding="utf-8")


@router.get("/api/searches")
def list_searches(db: Session = Depends(get_db)):
    searches = search_service.list_searches(db)
    summaries = []
    for search in searches:
        property_count = db.scalar(select(func.count(Property.id)).where(Property.search_id == search.id)) or 0
        contact_count = db.scalar(
            select(func.count(Property.id)).where(
                Property.search_id == search.id,
                or_(Property.phone.is_not(None), Property.whatsapp_url.is_not(None)),
            )
        ) or 0
        summaries.append(
            {
                "id": search.id,
                "name": search.name,
                "search_type": search.search_type.value,
                "portal": search.portal.value if search.portal else None,
                "active": search.active,
                "schedule_hours": search.schedule_hours,
                "input_url": search.input_url,
                "filters": search.filters,
                "generated_urls": search.generated_urls,
                "unsupported_filters": search.unsupported_filters,
                "last_run_at": search.last_run_at,
                "created_at": search.created_at,
                "property_count": property_count,
                "contact_count": contact_count,
            }
        )
    return summaries


@router.post("/api/searches", response_model=SearchRead)
def create_search(payload: SearchCreate, db: Session = Depends(get_db)):
    return search_service.create_search(db, payload)


@router.post("/api/search/preview", response_model=SearchPreviewResponse)
async def preview_search(payload: SearchPreviewRequest, db: Session = Depends(get_db)):
    return await scrape_service.preview_filters(payload.filters, payload.portal, db)


@router.patch("/api/searches/{search_id}", response_model=SearchRead)
def update_search(search_id: int, payload: SearchUpdate, db: Session = Depends(get_db)):
    search = search_service.get_search(db, search_id)
    if not search:
        raise HTTPException(status_code=404, detail="Búsqueda no encontrada")
    return search_service.update_search(db, search, payload)


@router.post("/api/searches/{search_id}/run")
async def run_search(search_id: int, db: Session = Depends(get_db)):
    search = search_service.get_search(db, search_id)
    if not search:
        raise HTTPException(status_code=404, detail="Búsqueda no encontrada")
    run = await scrape_service.run_search(db, search)
    return {
        "id": run.id,
        "status": run.status,
        "message": run.message,
        "properties_seen": run.properties_seen,
        "properties_created": run.properties_created,
        "price_changes": run.price_changes,
    }


@router.post("/api/searches/{search_id}/run-deep")
async def run_deep_search(search_id: int, db: Session = Depends(get_db)):
    search = search_service.get_search(db, search_id)
    if not search:
        raise HTTPException(status_code=404, detail="Búsqueda no encontrada")
    run = await scrape_service.run_deep_search(db, search)
    return {
        "id": run.id,
        "status": run.status,
        "message": run.message,
        "properties_seen": run.properties_seen,
        "properties_created": run.properties_created,
        "price_changes": run.price_changes,
    }


@router.post("/api/searches/{search_id}/run-deep/start")
async def start_deep_search(search_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    search = search_service.get_search(db, search_id)
    if not search:
        raise HTTPException(status_code=404, detail="Búsqueda no encontrada")
    run = SearchRun(search_id=search.id, status="running", message="Iniciando búsqueda profunda...")
    db.add(run)
    db.commit()
    db.refresh(run)
    background_tasks.add_task(_run_deep_search_background, search.id, run.id)
    return {
        "id": run.id,
        "status": run.status,
        "message": run.message,
        "properties_seen": run.properties_seen,
        "properties_created": run.properties_created,
        "price_changes": run.price_changes,
    }


async def _run_deep_search_background(search_id: int, run_id: int):
    db = SessionLocal()
    try:
        search = search_service.get_search(db, search_id)
        run = db.get(SearchRun, run_id)
        if search and run:
            await scrape_service.run_deep_search_into_run(db, search, run)
    finally:
        db.close()


@router.get("/api/search-runs/{run_id}")
def get_search_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(SearchRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Ejecución no encontrada")
    return {
        "id": run.id,
        "search_id": run.search_id,
        "status": run.status,
        "message": run.message,
        "properties_seen": run.properties_seen,
        "properties_created": run.properties_created,
        "price_changes": run.price_changes,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
    }


@router.get("/api/locations")
def list_locations(q: str | None = None, query: str | None = None, limit: int = 8):
    return {"items": location_service.search(q or query, limit)}


@router.get("/api/agency-contacts", response_model=list[AgencyContactRead])
def list_agency_contacts(db: Session = Depends(get_db)):
    return agency_contact_service.list_contacts(db)


@router.post("/api/agency-contacts", response_model=AgencyContactRead)
def upsert_agency_contact(payload: AgencyContactCreate, db: Session = Depends(get_db)):
    if not payload.phone and not payload.whatsapp_url:
        raise HTTPException(status_code=400, detail="Cargá un teléfono o una URL de WhatsApp")
    return agency_contact_service.upsert_contact(db, payload)


@router.get("/api/export/properties.csv")
def export_properties_csv(
    search_id: int | None = None,
    with_phone: bool | None = None,
    with_whatsapp: bool | None = None,
    source: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(Property, Search.name).join(Search, Property.search_id == Search.id, isouter=True).order_by(Property.updated_at.desc())
    if search_id:
        stmt = stmt.where(Property.search_id == search_id)
    if source:
        stmt = stmt.where(Property.source == source)
    if with_phone:
        stmt = stmt.where(Property.phone.is_not(None), Property.phone != "")
    if with_whatsapp:
        stmt = stmt.where(Property.whatsapp_url.is_not(None), Property.whatsapp_url != "")

    rows = db.execute(stmt.limit(5000)).all()
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "portal",
            "titulo",
            "precio",
            "moneda",
            "ubicacion",
            "direccion",
            "ambientes",
            "dormitorios",
            "m2_cubiertos",
            "m2_totales",
            "inmobiliaria",
            "telefono",
            "whatsapp",
            "estado_contacto",
            "url",
            "fecha_detectada",
            "busqueda_origen",
        ]
    )
    for prop, search_name in rows:
        writer.writerow(
            [
                prop.source,
                prop.title,
                prop.price,
                prop.currency,
                prop.location_label,
                prop.address,
                prop.rooms,
                prop.bedrooms,
                prop.covered_m2,
                prop.total_m2,
                prop.real_estate,
                prop.phone,
                prop.whatsapp_url,
                prop.contact_status,
                prop.url,
                prop.first_seen_at.isoformat() if prop.first_seen_at else "",
                search_name or "",
            ]
        )

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="propiedades-leads.csv"'},
    )


@router.get("/api/properties", response_model=list[PropertyRead])
def list_properties(
    search_id: int | None = None,
    with_phone: bool | None = None,
    with_whatsapp: bool | None = None,
    source: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(Property).order_by(Property.updated_at.desc())
    if search_id:
        stmt = stmt.where(Property.search_id == search_id)
    if source:
        stmt = stmt.where(Property.source == source)
    if with_phone:
        stmt = stmt.where(Property.phone.is_not(None), Property.phone != "")
    if with_whatsapp:
        stmt = stmt.where(Property.whatsapp_url.is_not(None), Property.whatsapp_url != "")
    return db.scalars(stmt.limit(200)).all()


@router.get("/api/properties/{property_id}", response_model=PropertyRead)
def get_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.get(Property, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    return prop


@router.get("/api/alerts", response_model=list[AlertRead])
def list_alerts(db: Session = Depends(get_db)):
    stmt = select(Alert).options(selectinload(Alert.property)).order_by(Alert.created_at.desc())
    return db.scalars(stmt.limit(100)).all()
