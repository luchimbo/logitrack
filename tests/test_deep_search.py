from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import routes
from app.db.session import SessionLocal
from app.main import app
from app.models.property import Property
from app.scrapers.base import ScrapedProperty
from app.scrapers.portals.argenprop import ArgenpropScraper
from app.scrapers.portals.zonaprop import ZonapropScraper
from app.services.scrape_service import ScrapeService


def test_zonaprop_page_url_preserves_query():
    scraper = ZonapropScraper()

    assert (
        scraper.page_url("https://www.zonaprop.com.ar/departamentos-venta-belgrano.html?precioHasta=150000", 3)
        == "https://www.zonaprop.com.ar/departamentos-venta-belgrano-pagina-3.html?precioHasta=150000"
    )


def test_argenprop_page_url_adds_pagina_query():
    scraper = ArgenpropScraper()

    assert (
        scraper.page_url("https://www.argenprop.com/departamento/venta/belgrano?hasta=150000", 2)
        == "https://www.argenprop.com/departamento/venta/belgrano?hasta=150000&pagina-2"
    )


@pytest.mark.asyncio
async def test_search_pages_stops_when_no_new_ids(monkeypatch):
    scraper = ZonapropScraper()
    calls = []

    async def fake_search(url):
        calls.append(url)
        return [ScrapedProperty(source="zonaprop", source_property_id="same", url=url)]

    monkeypatch.setattr(scraper, "search", fake_search)

    results = await scraper.search_pages("https://www.zonaprop.com.ar/departamentos-venta-belgrano.html", 25)

    assert len(results) == 1
    assert len(calls) == 2


def test_run_deep_search_endpoint_returns_metrics(monkeypatch):
    async def fake_run_deep(db, search):
        run = search.runs[0] if search.runs else None
        if run is None:
            from app.models.search import SearchRun

            run = SearchRun(search_id=search.id)
        run.status = "success"
        run.message = "ok"
        run.properties_seen = 3
        run.properties_created = 2
        run.price_changes = 1
        return run

    monkeypatch.setattr(routes.scrape_service, "run_deep_search", fake_run_deep)

    with TestClient(app) as client:
        search = client.post(
            "/api/searches",
            json={
                "name": f"Deep API {uuid4().hex}",
                "mode": "filters",
                "portal": "zonaprop",
                "filters": {"operation": "venta", "location": "palermo", "location_id": "palermo-caba"},
            },
        ).json()

        response = client.post(f"/api/searches/{search['id']}/run-deep")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert body["properties_seen"] == 3
        assert body["properties_created"] == 2
        assert body["price_changes"] == 1


def test_start_deep_search_returns_run_id_and_run_endpoint(monkeypatch):
    async def fake_run_deep_into_run(db, search, run):
        run.status = "success"
        run.message = "ok"
        run.properties_seen = 7
        run.properties_created = 4
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    monkeypatch.setattr(routes.scrape_service, "run_deep_search_into_run", fake_run_deep_into_run)

    with TestClient(app) as client:
        search = client.post(
            "/api/searches",
            json={
                "name": f"Deep progress {uuid4().hex}",
                "mode": "filters",
                "portal": "zonaprop",
                "filters": {"operation": "venta", "location": "palermo", "location_id": "palermo-caba"},
            },
        ).json()

        start = client.post(f"/api/searches/{search['id']}/run-deep/start")

        assert start.status_code == 200
        run_id = start.json()["id"]

        progress = client.get(f"/api/search-runs/{run_id}")

        assert progress.status_code == 200
        body = progress.json()
        assert body["status"] == "success"
        assert body["properties_seen"] == 7
        assert body["properties_created"] == 4


@pytest.mark.asyncio
async def test_run_deep_search_rejects_non_amba_search():
    with TestClient(app) as client:
        search = client.post(
            "/api/searches",
            json={
                "name": f"Deep outside AMBA {uuid4().hex}",
                "mode": "filters",
                "portal": "zonaprop",
                "filters": {"operation": "venta", "location": "cordoba", "location_id": "cordoba-cordoba"},
            },
        ).json()

    db = SessionLocal()
    try:
        db_search = routes.search_service.get_search(db, search["id"])
        run = await ScrapeService().run_deep_search(db, db_search)
        assert run.status == "error"
        assert "AMBA" in run.message
    finally:
        db.close()


@pytest.mark.asyncio
async def test_run_deep_search_fetches_detail_only_for_new_or_contactless(monkeypatch):
    unique = uuid4().hex

    with TestClient(app) as client:
        search = client.post(
            "/api/searches",
            json={
                "name": f"Deep service {unique}",
                "mode": "filters",
                "portal": "zonaprop",
                "filters": {"operation": "venta", "location": "palermo", "location_id": "palermo-caba"},
            },
        ).json()

    db = SessionLocal()
    service = ScrapeService()
    detail_calls = []

    class FakeScraper:
        async def search_pages(self, url, max_pages, delay_ms=0):
            return [
                ScrapedProperty(source="zonaprop", source_property_id=f"{unique}-new", url="https://example.com/new", real_estate="Acme"),
                ScrapedProperty(source="zonaprop", source_property_id=f"{unique}-old-phone", url="https://example.com/old-phone"),
                ScrapedProperty(source="zonaprop", source_property_id=f"{unique}-old-empty", url="https://example.com/old-empty"),
            ]

        async def fetch_detail(self, url, listing):
            detail_calls.append(listing.source_property_id)
            listing.phone = "+5491111111111"
            listing.whatsapp_url = "https://wa.me/5491111111111"
            return listing

    try:
        db.add(
            Property(
                search_id=search["id"],
                source="zonaprop",
                source_property_id=f"{unique}-old-phone",
                url="https://example.com/old-phone",
                phone="+5491122223333",
                whatsapp_url="https://wa.me/5491122223333",
            )
        )
        db.add(
            Property(
                search_id=search["id"],
                source="zonaprop",
                source_property_id=f"{unique}-old-empty",
                url="https://example.com/old-empty",
            )
        )
        db.commit()
        service.scrapers = {"zonaprop": FakeScraper()}
        db_search = routes.search_service.get_search(db, search["id"])

        run = await service.run_deep_search(db, db_search)

        assert run.status == "success"
        assert run.properties_seen == 3
        assert run.properties_created == 1
        assert set(detail_calls) == {f"{unique}-new", f"{unique}-old-empty"}
    finally:
        db.close()
