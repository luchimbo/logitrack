import asyncio
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from app.api.routes import router
from app.db.base import Base
from app.db.migrations import ensure_runtime_columns
from app.db.session import engine
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_runtime_columns(engine)
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(title="Propiedades Monitor", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.include_router(router)
