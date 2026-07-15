from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Property(Base):
    __tablename__ = "properties"
    __table_args__ = (UniqueConstraint("source", "source_property_id", name="uq_property_source_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    search_id: Mapped[int] = mapped_column(ForeignKey("searches.id"))
    source: Mapped[str] = mapped_column(String(32))
    source_property_id: Mapped[str] = mapped_column(String(128))
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    operation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    property_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    expenses: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    expenses_currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    total_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    covered_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    rooms: Mapped[float | None] = mapped_column(Float, nullable=True)
    bedrooms: Mapped[float | None] = mapped_column(Float, nullable=True)
    bathrooms: Mapped[float | None] = mapped_column(Float, nullable=True)
    parking_spaces: Mapped[float | None] = mapped_column(Float, nullable=True)
    age_years: Mapped[float | None] = mapped_column(Float, nullable=True)
    floor: Mapped[str | None] = mapped_column(String(60), nullable=True)
    orientation: Mapped[str | None] = mapped_column(String(80), nullable=True)
    condition: Mapped[str | None] = mapped_column(String(80), nullable=True)
    real_estate: Mapped[str | None] = mapped_column(String(160), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    contact_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contact_source: Mapped[str | None] = mapped_column(String(80), nullable=True)
    whatsapp_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    amenities: Mapped[list] = mapped_column(JSON, default=list)
    image_urls: Mapped[list] = mapped_column(JSON, default=list)
    raw_data: Mapped[dict] = mapped_column(JSON, default=dict)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    search: Mapped["Search"] = relationship(back_populates="properties")
    price_history: Mapped[list["PriceHistory"]] = relationship(back_populates="property", cascade="all, delete-orphan")
    alerts: Mapped[list["Alert"]] = relationship(back_populates="property", cascade="all, delete-orphan")


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"))
    price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    property: Mapped[Property] = relationship(back_populates="price_history")
