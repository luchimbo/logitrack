from __future__ import annotations

from contextlib import asynccontextmanager

from playwright.async_api import async_playwright

from app.core.config import get_settings


@asynccontextmanager
async def page_context():
    settings = get_settings()
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=settings.playwright_headless,
            args=[
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-software-rasterizer",
                "--no-sandbox",
            ],
        )
        page = await browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1365, "height": 900},
        )
        page.set_default_timeout(settings.scrape_timeout_ms)
        try:
            yield page
        finally:
            await browser.close()
