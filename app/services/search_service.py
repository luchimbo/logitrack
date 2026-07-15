from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.search import Portal, Search, SearchType
from app.schemas.searches import SearchCreate, SearchUpdate
from app.services.filter_translator import FilterTranslator


class SearchService:
    def __init__(self):
        self.translator = FilterTranslator()

    def list_searches(self, db: Session) -> list[Search]:
        return db.scalars(select(Search).order_by(Search.created_at.desc())).all()

    def get_search(self, db: Session, search_id: int) -> Search | None:
        return db.get(Search, search_id)

    def create_search(self, db: Session, payload: SearchCreate) -> Search:
        filters = payload.filters.model_dump() if payload.filters else {}
        translation = self.translator.translate(filters, payload.portal)
        search = Search(
            name=payload.name,
            search_type=SearchType(payload.mode),
            portal=Portal(payload.portal) if payload.portal else None,
            active=payload.active,
            schedule_hours=payload.schedule_hours,
            input_url=str(payload.url) if payload.url else None,
            filters=filters,
            generated_urls=translation.urls,
            unsupported_filters=translation.unsupported_filters,
        )
        db.add(search)
        db.commit()
        db.refresh(search)
        return search

    def update_search(self, db: Session, search: Search, payload: SearchUpdate) -> Search:
        if payload.name is not None:
            search.name = payload.name
        if payload.active is not None:
            search.active = payload.active
        if payload.schedule_hours is not None:
            search.schedule_hours = payload.schedule_hours
        if payload.filters is not None:
            filters = payload.filters.model_dump()
            search.filters = filters
            translation = self.translator.translate(filters, search.portal.value if search.portal else None)
            search.generated_urls = translation.urls
            search.unsupported_filters = translation.unsupported_filters
        db.add(search)
        db.commit()
        db.refresh(search)
        return search
