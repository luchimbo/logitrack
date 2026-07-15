from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.agency_contact import AgencyContact
from app.scrapers.base import ScrapedProperty
from app.scrapers.utils import extract_contact_phone
from app.schemas.agency_contacts import AgencyContactCreate


class AgencyContactService:
    def list_contacts(self, db: Session) -> list[AgencyContact]:
        return list(db.scalars(select(AgencyContact).order_by(AgencyContact.name)).all())

    def upsert_contact(self, db: Session, payload: AgencyContactCreate) -> AgencyContact:
        normalized_name = normalize_agency_name(payload.name)
        contact = db.scalars(select(AgencyContact).where(AgencyContact.normalized_name == normalized_name)).first()
        if contact is None:
            contact = AgencyContact(name=payload.name, normalized_name=normalized_name)

        contact.name = payload.name
        contact.phone = payload.phone or extract_contact_phone(payload.whatsapp_url or "")
        contact.whatsapp_url = payload.whatsapp_url or self._whatsapp_url(contact.phone)
        contact.notes = payload.notes
        db.add(contact)
        db.commit()
        db.refresh(contact)
        return contact

    def enrich_scraped_property(self, db: Session, scraped: ScrapedProperty) -> None:
        if scraped.phone or not scraped.real_estate:
            return

        contact = self.match_contact(db, scraped.real_estate)
        if not contact:
            return

        scraped.phone = contact.phone
        scraped.whatsapp_url = contact.whatsapp_url or self._whatsapp_url(contact.phone)
        scraped.contact_status = "phone_found"
        scraped.contact_source = "agency_contact_db"

    def learn_from_scraped_property(self, db: Session, scraped: ScrapedProperty) -> AgencyContact | None:
        if not scraped.real_estate or (not scraped.phone and not scraped.whatsapp_url):
            return None

        normalized_name = normalize_agency_name(scraped.real_estate)
        if not normalized_name:
            return None

        existing = self.match_contact(db, scraped.real_estate)
        if existing:
            changed = False
            if not existing.phone and scraped.phone:
                existing.phone = scraped.phone
                changed = True
            if not existing.whatsapp_url:
                existing.whatsapp_url = scraped.whatsapp_url or self._whatsapp_url(existing.phone or scraped.phone)
                changed = True
            if changed:
                db.add(existing)
            return existing

        contact = AgencyContact(
            name=scraped.real_estate,
            normalized_name=normalized_name,
            phone=scraped.phone,
            whatsapp_url=scraped.whatsapp_url or self._whatsapp_url(scraped.phone),
            notes="Aprendido automaticamente desde una publicacion",
        )
        db.add(contact)
        return contact

    def match_contact(self, db: Session, agency_name: str) -> AgencyContact | None:
        normalized = normalize_agency_name(agency_name)
        if not normalized:
            return None

        contacts = self.list_contacts(db)
        exact = next((contact for contact in contacts if contact.normalized_name == normalized), None)
        if exact:
            return exact

        return next(
            (
                contact
                for contact in contacts
                if contact.normalized_name
                and (contact.normalized_name in normalized or normalized in contact.normalized_name)
            ),
            None,
        )

    def _whatsapp_url(self, phone: str | None) -> str | None:
        if not phone:
            return None
        digits = "".join(char for char in str(phone) if char.isdigit())
        if len(digits) < 8:
            return None
        if digits.startswith("54"):
            return f"https://wa.me/{digits}"
        if digits.startswith("11") and len(digits) == 10:
            return f"https://wa.me/549{digits}"
        return f"https://wa.me/54{digits}"


def normalize_agency_name(value: str | None) -> str:
    if not value:
        return ""
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-zA-Z0-9]+", " ", ascii_value).lower()
    stopwords = {"inmobiliaria", "propiedades", "real", "estate", "srl", "sa", "sas"}
    tokens = [token for token in cleaned.split() if token not in stopwords]
    return " ".join(tokens)
