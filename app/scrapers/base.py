from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


class ScraperPageError(RuntimeError):
    """A portal returned a page that cannot be used as a listings result."""


@dataclass
class ScrapedProperty:
    source: str
    source_property_id: str
    url: str
    title: str | None = None
    operation: str | None = None
    property_type: str | None = None
    address: str | None = None
    location_label: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    price: float | None = None
    currency: str | None = None
    expenses: float | None = None
    expenses_currency: str | None = None
    total_m2: float | None = None
    covered_m2: float | None = None
    rooms: float | None = None
    bedrooms: float | None = None
    bathrooms: float | None = None
    parking_spaces: float | None = None
    age_years: float | None = None
    floor: str | None = None
    orientation: str | None = None
    condition: str | None = None
    real_estate: str | None = None
    phone: str | None = None
    contact_status: str | None = None
    contact_source: str | None = None
    whatsapp_url: str | None = None
    description: str | None = None
    amenities: list[str] = field(default_factory=list)
    image_urls: list[str] = field(default_factory=list)
    raw_data: dict[str, Any] = field(default_factory=dict)
