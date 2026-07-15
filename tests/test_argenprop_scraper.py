from pathlib import Path

import pytest

from app.scrapers.base import ScraperPageError
from app.scrapers.portals.argenprop import ArgenpropScraper


FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_current_argenprop_listing_fixture():
    html = (FIXTURES / "argenprop-listing.html").read_text(encoding="utf-8")

    listings = ArgenpropScraper()._parse_listing_page(html, "https://www.argenprop.com/departamentos/venta/palermo")

    assert len(listings) == 1
    assert listings[0].source_property_id == "12345678"
    assert listings[0].url.endswith("--12345678")
    assert listings[0].price == 120000
    assert listings[0].currency == "USD"
    assert listings[0].address == "Santa Fe 3200"


def test_argenprop_detects_404_fixture():
    html = (FIXTURES / "argenprop-404.html").read_text(encoding="utf-8")

    with pytest.raises(ScraperPageError, match="404"):
        ArgenpropScraper()._ensure_valid_listing_page(html, "https://www.argenprop.com/invalida")


def test_argenprop_page_url_uses_current_page_token():
    url = ArgenpropScraper().page_url("https://www.argenprop.com/departamentos/venta/palermo?moneda=USD", 2)

    assert url.endswith("?moneda=USD&pagina-2")
