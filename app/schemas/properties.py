from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PropertyRead(BaseModel):
    id: int
    search_id: int
    source: str
    source_property_id: str
    url: str
    title: str | None
    operation: str | None
    property_type: str | None
    address: str | None
    location_label: str | None
    price: float | None
    currency: str | None
    expenses: float | None
    total_m2: float | None
    covered_m2: float | None
    rooms: float | None
    bedrooms: float | None
    bathrooms: float | None
    parking_spaces: float | None
    age_years: float | None
    floor: str | None
    orientation: str | None
    condition: str | None
    real_estate: str | None
    phone: str | None
    contact_status: str | None = None
    contact_source: str | None = None
    whatsapp_url: str | None = None
    description: str | None
    amenities: list
    image_urls: list
    first_seen_at: datetime
    last_seen_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AlertRead(BaseModel):
    id: int
    property_id: int
    kind: str
    title: str
    message: str | None
    seen: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
