from app.scrapers.base import ScrapedProperty
from app.services.scrape_service import ScrapeService


def test_preview_property_derives_contact_metadata_from_phone():
    service = ScrapeService()
    listing = ScrapedProperty(
        source="zonaprop",
        source_property_id="contact-1",
        url="https://example.com/propiedad",
        phone="+5491122334455",
    )

    prop = service._preview_property(1, listing)

    assert prop.contact_status == "phone_found"
    assert prop.contact_source == "phone"
    assert prop.whatsapp_url == "https://wa.me/5491122334455"
