from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.property import PriceHistory, Property
from app.models.search import Search
from app.scrapers.base import ScrapedProperty
from app.services.agency_contact_service import AgencyContactService


class PropertyService:
    def __init__(self):
        self.agency_contacts = AgencyContactService()

    def find_existing(self, db: Session, source: str, source_property_id: str) -> Property | None:
        stmt = select(Property).where(
            Property.source == source,
            Property.source_property_id == source_property_id,
        )
        return db.scalars(stmt).first()

    def upsert_property(self, db: Session, search: Search, scraped: ScrapedProperty) -> tuple[Property, bool, bool]:
        self.agency_contacts.enrich_scraped_property(db, scraped)
        self.agency_contacts.learn_from_scraped_property(db, scraped)

        existing = self.find_existing(db, scraped.source, scraped.source_property_id)
        now = datetime.now(timezone.utc)
        created = False
        price_changed = False

        if existing is None:
            existing = Property(
                search_id=search.id,
                source=scraped.source,
                source_property_id=scraped.source_property_id,
                url=scraped.url,
                first_seen_at=now,
            )
            created = True

        old_price = existing.price
        old_phone = existing.phone
        for key, value in scraped.__dict__.items():
            if hasattr(existing, key):
                setattr(existing, key, value)
        existing.search_id = search.id
        existing.last_seen_at = now

        if old_price != self._decimal_or_none(scraped.price):
            price_changed = old_price is not None and scraped.price is not None
            db.add(
                PriceHistory(
                    property=existing,
                    price=scraped.price,
                    currency=scraped.currency,
                )
            )

        db.add(existing)
        db.flush()

        if created:
            db.add(Alert(property=existing, kind="new", title="Nuevo aviso detectado", message=existing.title or existing.url))
        elif price_changed:
            db.add(Alert(property=existing, kind="price_change", title="Cambio de precio", message=existing.title or existing.url))
        elif not old_phone and existing.phone:
            db.add(Alert(property=existing, kind="contact_found", title="Nuevo contacto detectado", message=existing.title or existing.url))

        return existing, created, price_changed

    def _decimal_or_none(self, value: float | None):
        if value is None:
            return None
        return Decimal(str(value))
