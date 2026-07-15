from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.schemas.properties import PropertyRead


class SearchFilters(BaseModel):
    portal: str | None = None
    operation: str | None = None
    property_type: str | None = None
    location: str | None = None
    location_id: str | None = None
    location_display: str | None = None
    portal_slugs: dict[str, str] = Field(default_factory=dict)
    price_min: int | None = None
    price_max: int | None = None
    currency: str | None = None
    total_m2_min: int | None = None
    total_m2_max: int | None = None
    covered_m2_min: int | None = None
    covered_m2_max: int | None = None
    rooms_min: int | None = None
    bedrooms_min: int | None = None
    bathrooms_min: int | None = None
    parking_min: int | None = None
    age_max: int | None = None
    expenses_max: int | None = None
    extras: dict[str, Any] = Field(default_factory=dict)


class SearchCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    mode: str = Field(pattern="^(url|filters)$")
    portal: str | None = None
    url: HttpUrl | None = None
    filters: SearchFilters | None = None
    schedule_hours: int = Field(default=12, ge=1, le=168)
    active: bool = True


class SearchPreviewRequest(BaseModel):
    portal: str | None = None
    filters: SearchFilters


class SearchPreviewResponse(BaseModel):
    status: str
    message: str | None = None
    properties: list[PropertyRead] = Field(default_factory=list)
    generated_urls: dict[str, str] = Field(default_factory=dict)
    unsupported_filters: list[str] = Field(default_factory=list)


class SearchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    active: bool | None = None
    schedule_hours: int | None = Field(default=None, ge=1, le=168)
    filters: SearchFilters | None = None


class SearchRead(BaseModel):
    id: int
    name: str
    search_type: str
    portal: str | None
    active: bool
    schedule_hours: int
    input_url: str | None
    filters: dict
    generated_urls: dict
    unsupported_filters: list
    last_run_at: datetime | None
    created_at: datetime
    property_count: int = 0
    contact_count: int = 0

    model_config = ConfigDict(from_attributes=True)
