from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.scrapers.base import ScrapedProperty
from app.schemas.agency_contacts import AgencyContactCreate
from app.services.agency_contact_service import AgencyContactService


def test_agency_contact_api_derives_phone_from_whatsapp_url():
    unique = uuid4().hex[:8]
    with TestClient(app) as client:
        response = client.post(
            "/api/agency-contacts",
            json={
                "name": f"Inmobiliaria Norte {unique}",
                "whatsapp_url": "https://web.whatsapp.com/send?phone=5491122334455",
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["phone"] == "+5491122334455"
        assert body["whatsapp_url"] == "https://web.whatsapp.com/send?phone=5491122334455"


def test_agency_contact_enriches_scraped_property_by_agency_name():
    unique = uuid4().hex[:8]
    service = AgencyContactService()
    db = SessionLocal()
    try:
        service.upsert_contact(
            db,
            payload=AgencyContactCreate(name=f"Acme Propiedades {unique}", phone="+5491199998888"),
        )
        scraped = ScrapedProperty(
            source="zonaprop",
            source_property_id=f"agency-{unique}",
            url="https://example.com",
            real_estate=f"Acme Propiedades {unique} - Sucursal Belgrano",
        )

        service.enrich_scraped_property(db, scraped)

        assert scraped.phone == "+5491199998888"
        assert scraped.whatsapp_url == "https://wa.me/5491199998888"
        assert scraped.contact_source == "agency_contact_db"
    finally:
        db.close()


def test_agency_contact_learns_and_reuses_scraped_whatsapp():
    unique = uuid4().hex[:8]
    service = AgencyContactService()
    db = SessionLocal()
    try:
        first = ScrapedProperty(
            source="zonaprop",
            source_property_id=f"learn-{unique}-1",
            url="https://example.com/1",
            real_estate=f"Aprende Propiedades {unique}",
            phone="+5491177776666",
            whatsapp_url="https://wa.me/5491177776666",
        )
        service.learn_from_scraped_property(db, first)
        db.commit()

        second = ScrapedProperty(
            source="argenprop",
            source_property_id=f"learn-{unique}-2",
            url="https://example.com/2",
            real_estate=f"Aprende Propiedades {unique} - Belgrano",
        )
        service.enrich_scraped_property(db, second)

        assert second.phone == "+5491177776666"
        assert second.whatsapp_url == "https://wa.me/5491177776666"
        assert second.contact_source == "agency_contact_db"
    finally:
        db.close()
