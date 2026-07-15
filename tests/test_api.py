from fastapi.testclient import TestClient
from uuid import uuid4

from app.api import routes
from app.db.session import SessionLocal
from app.main import app
from app.models.property import Property


def test_create_search_with_filters():
    with TestClient(app) as client:
        response = client.post(
            "/api/searches",
            json={
                "name": "Palermo venta",
                "mode": "filters",
                "portal": "zonaprop",
                "schedule_hours": 12,
                "active": True,
                "filters": {
                    "portal": "zonaprop",
                    "operation": "venta",
                    "property_type": "departamentos",
                    "location": "palermo",
                    "price_min": 100000,
                },
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Palermo venta"
        assert "zonaprop" in body["generated_urls"]


def test_preview_search_does_not_create_saved_search(monkeypatch):
    async def fake_preview(filters, portal=None, db=None):
        return {
            "status": "success",
            "message": None,
            "properties": [],
            "generated_urls": {"zonaprop": "https://www.zonaprop.com.ar/departamentos-venta-palermo.html"},
            "unsupported_filters": [],
        }

    monkeypatch.setattr(routes.scrape_service, "preview_filters", fake_preview)

    with TestClient(app) as client:
        before = len(client.get("/api/searches").json())
        response = client.post(
            "/api/search/preview",
            json={
                "portal": "zonaprop",
                "filters": {
                    "operation": "venta",
                    "property_type": "departamentos",
                    "location": "palermo",
                    "price_max": 100000,
                    "currency": "ARS",
                },
            },
        )
        after = len(client.get("/api/searches").json())

        assert response.status_code == 200
        assert response.json()["status"] == "success"
        assert after == before


def test_preview_search_can_return_partial_results(monkeypatch):
    async def fake_preview(filters, portal=None, db=None):
        return {
            "status": "partial",
            "message": "zonaprop: el navegador interno se cerró durante la carga del portal",
            "properties": [],
            "generated_urls": {
                "zonaprop": "https://www.zonaprop.com.ar/departamentos-venta-palermo.html",
                "argenprop": "https://www.argenprop.com/departamento/venta/palermo",
            },
            "unsupported_filters": [],
        }

    monkeypatch.setattr(routes.scrape_service, "preview_filters", fake_preview)

    with TestClient(app) as client:
        response = client.post(
            "/api/search/preview",
            json={
                "filters": {
                    "operation": "venta",
                    "location": "palermo",
                },
            },
        )

        assert response.status_code == 200
        assert response.json()["status"] == "partial"


def test_locations_endpoint_returns_ranked_structured_suggestions():
    with TestClient(app) as client:
        response = client.get("/api/locations?q=almagro")

        assert response.status_code == 200
        body = response.json()
        assert body["items"][0]["display"] == "Almagro, Capital Federal"
        assert body["items"][0]["portal_slugs"]["zonaprop"] == "almagro"
        assert any(item["display"] == "Almagro Sur, Almagro, Capital Federal" for item in body["items"])


def test_export_properties_csv_empty_has_headers():
    with TestClient(app) as client:
        response = client.get("/api/export/properties.csv")

        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "portal,titulo,precio" in response.text


def test_export_properties_csv_filters_phone():
    with TestClient(app) as client:
        unique = uuid4().hex
        search = client.post(
            "/api/searches",
            json={
                "name": f"Export test {unique}",
                "mode": "filters",
                "portal": "zonaprop",
                "filters": {"operation": "venta", "location": "palermo"},
            },
        ).json()

        db = SessionLocal()
        try:
            db.add(
                Property(
                    search_id=search["id"],
                    source="zonaprop",
                    source_property_id=f"export-phone-{unique}",
                    url="https://example.com/propiedad",
                    title=f"Depto con contacto {unique}",
                    phone="+5491122334455",
                    whatsapp_url="https://wa.me/5491122334455",
                    contact_status="phone_found",
                )
            )
            db.commit()
        finally:
            db.close()

        response = client.get("/api/export/properties.csv?with_phone=true&source=zonaprop")

        assert response.status_code == 200
        assert f"Depto con contacto {unique}" in response.text
        assert "https://wa.me/5491122334455" in response.text
