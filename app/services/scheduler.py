from __future__ import annotations

from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.search import Search
from app.services.scrape_service import ScrapeService

scheduler = AsyncIOScheduler()


def start_scheduler() -> None:
    settings = get_settings()
    scheduler.add_job(run_due_searches, "interval", hours=settings.run_every_hours, id="run_due_searches", replace_existing=True)
    scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


def _should_run(search: Search) -> bool:
    if not search.active:
        return False
    if not search.last_run_at:
        return True
    due_at = search.last_run_at + timedelta(hours=search.schedule_hours)
    return due_at <= datetime.now(timezone.utc)


async def run_due_searches() -> None:
    db = SessionLocal()
    try:
        searches = db.scalars(select(Search).where(Search.active.is_(True))).all()
        service = ScrapeService()
        for search in searches:
            if _should_run(search):
                await service.run_search(db, search)
    finally:
        db.close()
