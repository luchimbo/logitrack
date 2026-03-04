"""
Zone mapper: assigns Flex carriers to shipments based on partido/district mapping.
"""

from sqlalchemy.orm import Session
from models import ZoneMapping, Carrier, Shipment, DailyBatch
import re
import unicodedata

def normalize_name(name: str) -> str:
    """
    Normalize a name (partido or carrier) to slug-case.
    'San Isidro' -> 'san_isidro', 'V. López' -> 'v_lopez', 'Capital Federal' -> 'capital_federal'
    """
    if not name:
        return ""
    # Convert to NFKD to handle accents/special chars
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    # Lowercase and replace non-alphanumeric with underscore
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '_', s)
    # Remove leading/trailing underscores
    return s.strip('_')


def assign_carrier(db: Session, partido: str) -> str | None:
    """Look up which carrier is assigned to a given partido."""
    if not partido:
        return None

    norm_partido = normalize_name(partido)
    mapping = db.query(ZoneMapping).filter(
        ZoneMapping.partido == norm_partido
    ).first()

    if mapping:
        return mapping.carrier_name
    return None


def assign_carriers_to_shipments(db: Session, shipments: list[dict]) -> list[dict]:
    """Assign carriers to all Flex shipments based on zone mappings."""
    for shipment in shipments:
        if shipment.get("shipping_method") == "flex" and shipment.get("partido"):
            carrier = assign_carrier(db, shipment["partido"])
            shipment["assigned_carrier"] = carrier
    return shipments


def get_all_zones(db: Session) -> list[dict]:
    """Get all zone mappings."""
    mappings = db.query(ZoneMapping).order_by(ZoneMapping.partido).all()
    return [
        {
            "id": m.id,
            "partido": m.partido,
            "carrier_name": m.carrier_name,
        }
        for m in mappings
    ]


def upsert_zone(db: Session, partido: str, carrier_name: str) -> dict:
    """Create or update a zone mapping and reassign existing shipments."""
    norm_partido = normalize_name(partido)
    existing = db.query(ZoneMapping).filter(
        ZoneMapping.partido == norm_partido
    ).first()

    if existing:
        existing.carrier_name = carrier_name
        db.commit()
        db.refresh(existing)
    else:
        new_mapping = ZoneMapping(partido=norm_partido, carrier_name=carrier_name)
        db.add(new_mapping)
        db.commit()
        db.refresh(new_mapping)
        existing = new_mapping

    # --- Auto-reassign for today's batch ---
    from datetime import date
    today = date.today()
    batch = db.query(DailyBatch).filter(DailyBatch.date == today).first()
    if batch:
        db.query(Shipment).filter(
            Shipment.batch_id == batch.id,
            Shipment.shipping_method == "flex",
            Shipment.partido == norm_partido
        ).update({"assigned_carrier": carrier_name})
        db.commit()

    return {"id": existing.id, "partido": existing.partido, "carrier_name": existing.carrier_name}


def delete_zone(db: Session, zone_id: int) -> bool:
    """Delete a zone mapping."""
    mapping = db.query(ZoneMapping).filter(ZoneMapping.id == zone_id).first()
    if mapping:
        db.delete(mapping)
        db.commit()
        return True
    return False


# --- Carrier Management ---

def get_all_carriers(db: Session) -> list[dict]:
    """Get all registered carriers."""
    carriers = db.query(Carrier).order_by(Carrier.name).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "display_name": c.display_name or c.name,
            "color": c.color,
        }
        for c in carriers
    ]


def upsert_carrier(db: Session, name: str, display_name: str = None, color: str = None) -> dict:
    """Create or update a carrier."""
    existing = db.query(Carrier).filter(Carrier.name.ilike(name.strip())).first()

    if existing:
        if display_name is not None:
            existing.display_name = display_name
        if color is not None:
            existing.color = color
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "name": existing.name, "display_name": existing.display_name, "color": existing.color}
    else:
        new_carrier = Carrier(
            name=name.strip(),
            display_name=display_name or name.strip(),
            color=color or "#6366f1",
        )
        db.add(new_carrier)
        db.commit()
        db.refresh(new_carrier)
        return {"id": new_carrier.id, "name": new_carrier.name, "display_name": new_carrier.display_name, "color": new_carrier.color}


def delete_carrier(db: Session, carrier_id: int) -> bool:
    """Delete a carrier."""
    carrier = db.query(Carrier).filter(Carrier.id == carrier_id).first()
    if carrier:
        db.delete(carrier)
        db.commit()
        return True
    return False
