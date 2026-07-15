from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import JSON, Boolean, DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class SearchType(str, Enum):
    url = "url"
    filters = "filters"


class Portal(str, Enum):
    zonaprop = "zonaprop"
    argenprop = "argenprop"


class Search(Base):
    __tablename__ = "searches"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    search_type: Mapped[SearchType] = mapped_column(SqlEnum(SearchType))
    portal: Mapped[Portal | None] = mapped_column(SqlEnum(Portal), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    schedule_hours: Mapped[int] = mapped_column(Integer, default=12)
    input_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    filters: Mapped[dict] = mapped_column(JSON, default=dict)
    generated_urls: Mapped[dict] = mapped_column(JSON, default=dict)
    unsupported_filters: Mapped[list] = mapped_column(JSON, default=list)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    runs: Mapped[list["SearchRun"]] = relationship(back_populates="search", cascade="all, delete-orphan")
    properties: Mapped[list["Property"]] = relationship(back_populates="search")


class SearchRun(Base):
    __tablename__ = "search_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    search_id: Mapped[int] = mapped_column(ForeignKey("searches.id"))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    properties_seen: Mapped[int] = mapped_column(Integer, default=0)
    properties_created: Mapped[int] = mapped_column(Integer, default=0)
    price_changes: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    search: Mapped[Search] = relationship(back_populates="runs")
