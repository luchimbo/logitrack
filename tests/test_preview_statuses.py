import asyncio

from app.scrapers.base import ScrapedProperty, ScraperPageError
from app.schemas.searches import SearchFilters
from app.services.scrape_service import ScrapeService


class FakeScraper:
    def __init__(self, listings=None, error=None):
        self.listings = listings or []
        self.error = error

    async def search(self, _url):
        if self.error:
            raise self.error
        return self.listings

    async def fetch_detail(self, _url, listing):
        return listing


def listing(source: str) -> ScrapedProperty:
    return ScrapedProperty(
        source=source,
        source_property_id=f"{source}-1",
        url=f"https://example.com/{source}-1",
        title="Departamento en Palermo",
        location_label="Palermo",
        phone="+5491122334455",
        image_urls=["https://example.com/photo.jpg"],
    )


def preview_with(zonaprop: FakeScraper, argenprop: FakeScraper):
    service = ScrapeService()
    service.scrapers = {"zonaprop": zonaprop, "argenprop": argenprop}
    return asyncio.run(service.preview_filters(SearchFilters(operation="venta", location="palermo")))


def test_preview_is_success_when_all_portals_parse():
    result = preview_with(FakeScraper([listing("zonaprop")]), FakeScraper([listing("argenprop")]))

    assert result["status"] == "success"
    assert len(result["properties"]) == 2


def test_preview_is_partial_when_one_portal_fails():
    result = preview_with(
        FakeScraper([listing("zonaprop")]),
        FakeScraper(error=ScraperPageError("Argenprop devolvió una página 404")),
    )

    assert result["status"] == "partial"
    assert len(result["properties"]) == 1
    assert "argenprop" in result["message"]
    assert "404" in result["message"]


def test_preview_is_error_when_no_portal_can_parse():
    result = preview_with(
        FakeScraper(error=ScraperPageError("Zonaprop bloqueó la consulta")),
        FakeScraper(error=ScraperPageError("Argenprop devolvió una página 404")),
    )

    assert result["status"] == "error"
    assert result["properties"] == []
