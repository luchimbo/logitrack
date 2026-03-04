"""
FastAPI backend for Logistics Management System.
Handles ZPL label parsing, shipment tracking, and carrier zone assignment.
"""

import os
import json
from datetime import date, datetime
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db, init_db
from models import Shipment, DailyBatch, ZoneMapping, Carrier
from zpl_parser import parse_zpl_file
from zone_mapper import (
    assign_carriers_to_shipments,
    get_all_zones, upsert_zone, delete_zone,
    get_all_carriers, upsert_carrier, delete_carrier,
)

app = FastAPI(title="Log├¡stica - Sistema de Gesti├│n", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.on_event("startup")
def startup():
    init_db()


# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
#  UPLOAD & PARSE
# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

@app.post("/api/upload")
async def upload_labels(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """Upload one or more ZPL/TXT label files and parse them.
    All uploads on the same day consolidate into a single daily batch.
    """
    all_shipments = []
    filenames = []

    for file in files:
        content = await file.read()
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1")

        filepath = os.path.join(UPLOAD_DIR, file.filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(text)
        filenames.append(file.filename)

        parsed = parse_zpl_file(text)
        parsed = assign_carriers_to_shipments(db, parsed)
        all_shipments.extend(parsed)

    # --- Daily batch: reuse today's batch or create new one ---
    today = date.today()
    batch = db.query(DailyBatch).filter(DailyBatch.date == today).first()

    if batch:
        existing_names = set((batch.filenames or "").split(", "))
        existing_names.discard("")
        for fn in filenames:
            existing_names.add(fn)
        batch.filenames = ", ".join(sorted(existing_names))
    else:
        batch = DailyBatch(
            date=today,
            total_packages=0,
            filenames=", ".join(filenames),
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)

    # Get existing tracking numbers to avoid duplicates
    existing_tracks = set(
        t[0] for t in db.query(Shipment.tracking_number)
        .filter(Shipment.batch_id == batch.id, Shipment.tracking_number.isnot(None))
        .all()
    )

    saved = []
    skipped = 0
    for s in all_shipments:
        track = s.get("tracking_number")
        if track and track in existing_tracks:
            skipped += 1
            continue

        shipment = Shipment(
            batch_id=batch.id,
            sale_type=s.get("sale_type"),
            sale_id=s.get("sale_id"),
            tracking_number=track,
            remitente_id=s.get("remitente_id"),
            product_name=s.get("product_name"),
            sku=s.get("sku"),
            color=s.get("color"),
            voltage=s.get("voltage"),
            quantity=s.get("quantity", 1),
            recipient_name=s.get("recipient_name"),
            recipient_user=s.get("recipient_user"),
            address=s.get("address"),
            postal_code=s.get("postal_code"),
            city=s.get("city"),
            partido=s.get("partido"),
            province=s.get("province"),
            reference=s.get("reference"),
            shipping_method=s.get("shipping_method"),
            carrier_code=s.get("carrier_code"),
            carrier_name=s.get("carrier_name"),
            assigned_carrier=s.get("assigned_carrier"),
            dispatch_date=s.get("dispatch_date"),
            delivery_date=s.get("delivery_date"),
            status="pendiente",
        )
        db.add(shipment)
        saved.append(shipment)
        if track:
            existing_tracks.add(track)

    batch.total_packages = (
        db.query(Shipment).filter(Shipment.batch_id == batch.id).count() + len(saved)
    )
    db.commit()

    for s in saved:
        db.refresh(s)

    return {
        "batch_id": batch.id,
        "total_parsed": len(saved),
        "total_skipped": skipped,
        "total_in_batch": batch.total_packages,
        "filenames": filenames,
        "shipments": [shipment_to_dict(s) for s in saved],
    }


# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
#  SHIPMENTS
# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

@app.get("/api/shipments")
def get_shipments(
    batch_id: Optional[int] = None,
    status: Optional[str] = None,
    shipping_method: Optional[str] = None,
    carrier: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get shipments with optional filters."""
    query = db.query(Shipment).order_by(Shipment.id.desc())

    if batch_id:
        query = query.filter(Shipment.batch_id == batch_id)
    if status:
        query = query.filter(Shipment.status == status)
    if shipping_method:
        query = query.filter(Shipment.shipping_method == shipping_method)
    if carrier:
        query = query.filter(Shipment.assigned_carrier == carrier)

    shipments = query.all()
    return [shipment_to_dict(s) for s in shipments]


@app.patch("/api/shipments/{shipment_id}/status")
def update_shipment_status(
    shipment_id: int,
    status: str = Query(...),
    db: Session = Depends(get_db),
):
    """Update shipment status: pendiente, encontrado, empaquetado, despachado."""
    valid_statuses = ["pendiente", "encontrado", "empaquetado", "despachado"]
    if status not in valid_statuses:
        raise HTTPException(400, f"Estado inv├ílido. V├ílidos: {valid_statuses}")

    shipment = db.query(Shipment).filter(Shipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(404, "Env├¡o no encontrado")

    shipment.status = status
    db.commit()
    db.refresh(shipment)
    return shipment_to_dict(shipment)


@app.patch("/api/shipments/batch-status")
def batch_update_status(
    shipment_ids: list[int] = Query(...),
    status: str = Query(...),
    db: Session = Depends(get_db),
):
    """Update status for multiple shipments at once."""
    valid_statuses = ["pendiente", "encontrado", "empaquetado", "despachado"]
    if status not in valid_statuses:
        raise HTTPException(400, f"Estado inv├ílido. V├ílidos: {valid_statuses}")

    updated = []
    for sid in shipment_ids:
        shipment = db.query(Shipment).filter(Shipment.id == sid).first()
        if shipment:
            shipment.status = status
            updated.append(shipment)

    db.commit()
    return {"updated": len(updated)}


@app.delete("/api/shipments/clear")
def clear_shipments(
    batch_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Clear all shipments, optionally by batch."""
    query = db.query(Shipment)
    if batch_id:
        query = query.filter(Shipment.batch_id == batch_id)

    count = query.delete()
    db.commit()
    return {"deleted": count}


@app.post("/api/shipments/reassign-flex")
def reassign_flex_carriers(
    batch_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Reassign flex carriers for all shipments based on current zone mappings."""
    from zone_mapper import assign_carrier
    
    query = db.query(Shipment).filter(Shipment.shipping_method == "flex")
    if batch_id:
        query = query.filter(Shipment.batch_id == batch_id)

    shipments = query.all()
    updated_count = 0
    
    for s in shipments:
        new_carrier = assign_carrier(db, s.partido)
        # also update city if needed, but in zone mapper we just use partido
        if s.assigned_carrier != new_carrier:
            s.assigned_carrier = new_carrier
            updated_count += 1
            
    db.commit()
    return {"updated": updated_count, "total_checked": len(shipments)}


# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
#  DASHBOARD
# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

@app.get("/api/dashboard")
def get_dashboard(
    batch_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Get dashboard summary metrics."""
    query = db.query(Shipment)
    if batch_id:
        query = query.filter(Shipment.batch_id == batch_id)

    shipments = query.all()

    if not shipments:
        return {
            "total_packages": 0,
            "total_units": 0,
            "by_status": {},
            "by_method": {},
            "by_carrier": {},
            "by_province": {},
        }

    total_packages = len(shipments)
    total_units = sum(s.quantity for s in shipments)

    # By status
    by_status = {}
    for s in shipments:
        by_status[s.status] = by_status.get(s.status, 0) + 1

    # By shipping method
    by_method = {}
    for s in shipments:
        method = s.shipping_method or "desconocido"
        by_method[method] = by_method.get(method, 0) + 1

    # By assigned carrier (for Flex) and carrier_name (for others)
    by_carrier = {}
    for s in shipments:
        carrier = s.assigned_carrier or s.carrier_name or "Sin asignar"
        by_carrier[carrier] = by_carrier.get(carrier, 0) + 1

    # By province
    by_province = {}
    for s in shipments:
        prov = s.province or "Desconocida"
        by_province[prov] = by_province.get(prov, 0) + 1

    return {
        "total_packages": total_packages,
        "total_units": total_units,
        "by_status": by_status,
        "by_method": by_method,
        "by_carrier": by_carrier,
        "by_province": by_province,
    }


# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
#  PICKING LIST
# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

@app.get("/api/picking-list")
def get_picking_list(
    batch_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Get consolidated picking list - products grouped by name with total quantity."""
    query = db.query(Shipment)
    if batch_id:
        query = query.filter(Shipment.batch_id == batch_id)

    shipments = query.all()

    # Group by product_name + sku + shipping_method
    products = {}
    for s in shipments:
        key = f"{s.product_name}|{s.sku or 'N/A'}|{s.shipping_method or 'colecta'}"
        if key not in products:
            products[key] = {
                "product_name": s.product_name,
                "sku": s.sku,
                "color": s.color,
                "shipping_method": s.shipping_method or "colecta",
                "total_quantity": 0,
                "shipment_count": 0,
                "shipment_ids": [],
                "statuses": [],
            }
        products[key]["total_quantity"] += s.quantity
        products[key]["shipment_count"] += 1
        products[key]["shipment_ids"].append(s.id)
        products[key]["statuses"].append(s.status)

    return list(products.values())


# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
#  ZONES
# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

@app.get("/api/zones")
def list_zones(db: Session = Depends(get_db)):
    return get_all_zones(db)


@app.post("/api/zones")
def create_zone(partido: str = Query(...), carrier_name: str = Query(...), db: Session = Depends(get_db)):
    return upsert_zone(db, partido, carrier_name)


@app.delete("/api/zones/{zone_id}")
def remove_zone(zone_id: int, db: Session = Depends(get_db)):
    if delete_zone(db, zone_id):
        return {"deleted": True}
    raise HTTPException(404, "Zona no encontrada")


# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
#  CARRIERS
# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

@app.get("/api/carriers")
def list_carriers(db: Session = Depends(get_db)):
    return get_all_carriers(db)


@app.post("/api/carriers")
def create_carrier(
    name: str = Query(...),
    display_name: Optional[str] = None,
    color: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return upsert_carrier(db, name, display_name, color)


@app.delete("/api/carriers/{carrier_id}")
def remove_carrier(carrier_id: int, db: Session = Depends(get_db)):
    if delete_carrier(db, carrier_id):
        return {"deleted": True}
    raise HTTPException(404, "Transportista no encontrado")


# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
#  BATCHES
# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

@app.get("/api/batches")
def list_batches(db: Session = Depends(get_db)):
    """List all upload batches."""
    batches = db.query(DailyBatch).order_by(DailyBatch.id.desc()).limit(20).all()
    return [
        {
            "id": b.id,
            "date": str(b.date),
            "total_packages": b.total_packages,
            "filenames": b.filenames,
            "created_at": str(b.created_at),
        }
        for b in batches
    ]


# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
#  HELPERS
# ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

def shipment_to_dict(s: Shipment) -> dict:
    return {
        "id": s.id,
        "batch_id": s.batch_id,
        "sale_type": s.sale_type,
        "sale_id": s.sale_id,
        "tracking_number": s.tracking_number,
        "remitente_id": s.remitente_id,
        "product_name": s.product_name,
        "sku": s.sku,
        "color": s.color,
        "voltage": s.voltage,
        "quantity": s.quantity,
        "recipient_name": s.recipient_name,
        "recipient_user": s.recipient_user,
        "address": s.address,
        "postal_code": s.postal_code,
        "city": s.city,
        "partido": s.partido,
        "province": s.province,
        "reference": s.reference,
        "shipping_method": s.shipping_method,
        "carrier_code": s.carrier_code,
        "carrier_name": s.carrier_name,
        "assigned_carrier": s.assigned_carrier,
        "dispatch_date": s.dispatch_date,
        "delivery_date": s.delivery_date,
        "status": s.status,
        "created_at": str(s.created_at) if s.created_at else None,
    }
