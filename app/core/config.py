from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "local"
    database_url: str = "sqlite:///./propiedades.db"
    playwright_headless: bool = True
    scrape_timeout_ms: int = 45000
    preview_detail_limit: int = 4
    run_detail_limit: int = 25
    deep_search_max_pages: int = 25
    deep_search_page_delay_ms: int = 1500
    deep_search_detail_limit: int = 0
    run_every_hours: int = 12

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
