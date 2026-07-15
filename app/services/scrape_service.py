from __future__ import annotations

import asyncio
import re
import unicodedata
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.search import Search, SearchRun
from app.schemas.properties import PropertyRead
from app.schemas.searches import SearchFilters
from app.scrapers.portals.argenprop import ArgenpropScraper
from app.scrapers.portals.zonaprop import ZonapropScraper
from app.services.agency_contact_service import AgencyContactService
from app.services.filter_translator import FilterTranslator
from app.services.location_service import LocationService
from app.services.property_service import PropertyService


class ScrapeService:
    def __init__(self):
        self.scrapers = {
            "argenprop": ArgenpropScraper(),
            "zonaprop": ZonapropScraper(),
        }
        self.property_service = PropertyService()
        self.agency_contacts = AgencyContactService()
        self.location_service = LocationService()
        self.translator = FilterTranslator()

    async def preview_filters(self, filters: SearchFilters, portal: str | None = None, db: Session | None = None) -> dict:
        filter_payload = filters.model_dump()
        translation = self.translator.translate(filter_payload, portal)
        expected_location = self._expected_location_token(filter_payload)
        preview_properties: list[PropertyRead] = []
        errors: list[str] = []

        listing_batches = await asyncio.gather(
            *(self._safe_search(source, url) for source, url in translation.urls.items()),
        )

        preview_detail_limit = get_settings().preview_detail_limit
        enriched_count = 0
        index = 1
        for source, result in listing_batches:
            if isinstance(result, Exception):
                errors.append(f"{source}: {self._friendly_error(result)}")
                continue

            scraper = self.scrapers[source]
            filtered_result = self._filter_by_expected_location(result, expected_location)
            for listing in filtered_result[:20]:
                if enriched_count < preview_detail_limit and self._needs_preview_enrichment(listing):
                    try:
                        listing = await scraper.fetch_detail(listing.url, listing)
                        enriched_count += 1
                    except Exception as exc:  # noqa: BLE001
                        errors.append(f"{source} detalle: {self._friendly_error(exc)}")
                if db:
                    self.agency_contacts.enrich_scraped_property(db, listing)
                    self.agency_contacts.learn_from_scraped_property(db, listing)
                preview_properties.append(self._preview_property(index, listing))
                index += 1

        return {
            "status": "partial" if errors and preview_properties else "error" if errors else "success",
            "message": " | ".join(errors) if errors else None,
            "properties": preview_properties,
            "generated_urls": translation.urls,
            "unsupported_filters": translation.unsupported_filters,
        }

    async def run_search(self, db: Session, search: Search) -> SearchRun:
        run = SearchRun(search_id=search.id, status="running")
        db.add(run)
        db.commit()
        db.refresh(run)

        try:
            targets = self._resolve_targets(search)
            total_seen = 0
            total_created = 0
            total_price_changes = 0
            run_detail_limit = get_settings().run_detail_limit
            for portal, url in targets.items():
                scraper = self.scrapers[portal]
                listings = await scraper.search(url)
                total_seen += len(listings)
                for listing in listings[:run_detail_limit]:
                    detail = await scraper.fetch_detail(listing.url, listing)
                    self._normalize_contact_metadata(detail)
                    _, created, price_changed = self.property_service.upsert_property(db, search, detail)
                    total_created += 1 if created else 0
                    total_price_changes += 1 if price_changed else 0
                db.commit()

            run.status = "success"
            run.properties_seen = total_seen
            run.properties_created = total_created
            run.price_changes = total_price_changes
            search.last_run_at = datetime.now(timezone.utc)
            db.add(search)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            run.status = "error"
            run.message = str(exc)
            db.add(run)
        finally:
            run.finished_at = datetime.now(timezone.utc)
            db.add(run)
            db.commit()
            db.refresh(run)
        return run

    async def run_deep_search(self, db: Session, search: Search) -> SearchRun:
        run = SearchRun(search_id=search.id, status="running")
        db.add(run)
        db.commit()
        db.refresh(run)
        return await self.run_deep_search_into_run(db, search, run)

    async def run_deep_search_into_run(self, db: Session, search: Search, run: SearchRun) -> SearchRun:
        try:
            self._validate_deep_search_scope(search)
            settings = get_settings()
            targets = self._resolve_targets(search)
            total_seen = 0
            total_created = 0
            total_price_changes = 0
            details_fetched = 0

            for portal, url in targets.items():
                scraper = self.scrapers[portal]
                listings = await scraper.search_pages(url, settings.deep_search_max_pages, settings.deep_search_page_delay_ms)
                total_seen += len(listings)
                run.properties_seen = total_seen
                run.message = f"{portal}: {len(listings)} publicaciones encontradas"
                db.add(run)
                db.commit()

                for listing in listings:
                    existing = self.property_service.find_existing(db, listing.source, listing.source_property_id)
                    should_fetch_detail = existing is None or not (existing.phone or existing.whatsapp_url)
                    detail_limit = settings.deep_search_detail_limit
                    if should_fetch_detail and (detail_limit <= 0 or details_fetched < detail_limit):
                        detail = await scraper.fetch_detail(listing.url, listing)
                        details_fetched += 1
                    else:
                        detail = listing
                    self._normalize_contact_metadata(detail)
                    _, created, price_changed = self.property_service.upsert_property(db, search, detail)
                    total_created += 1 if created else 0
                    total_price_changes += 1 if price_changed else 0
                    run.properties_seen = total_seen
                    run.properties_created = total_created
                    run.price_changes = total_price_changes
                    run.message = f"Encontradas: {total_seen}. Nuevas: {total_created}. Cambios: {total_price_changes}."
                    db.add(run)
                    db.commit()

            run.status = "success"
            run.properties_seen = total_seen
            run.properties_created = total_created
            run.price_changes = total_price_changes
            run.message = f"Búsqueda profunda completa. Detalles visitados: {details_fetched}"
            search.last_run_at = datetime.now(timezone.utc)
            db.add(search)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            run.status = "error"
            run.message = self._friendly_error(exc)
            db.add(run)
        finally:
            run.finished_at = datetime.now(timezone.utc)
            db.add(run)
            db.commit()
            db.refresh(run)
        return run

    def _resolve_targets(self, search: Search) -> dict[str, str]:
        if search.search_type.value == "url":
            if not search.portal:
                raise ValueError("Las búsquedas por URL requieren portal")
            return {search.portal.value: search.input_url}
        return search.generated_urls

    def _validate_deep_search_scope(self, search: Search) -> None:
        if search.search_type.value != "filters":
            raise ValueError("La búsqueda profunda sólo está disponible para búsquedas por filtros")
        location_id = (search.filters or {}).get("location_id")
        if not self.location_service.is_amba_location_id(location_id):
            raise ValueError("La búsqueda profunda está limitada a ubicaciones AMBA seleccionadas de la lista")

    async def _safe_search(self, source: str, url: str):
        try:
            return source, await self.scrapers[source].search(url)
        except Exception as exc:  # noqa: BLE001
            return source, exc

    def _preview_property(self, index: int, listing) -> PropertyRead:
        now = datetime.now(timezone.utc)
        self._normalize_contact_metadata(listing)
        return PropertyRead(
            id=index,
            search_id=0,
            source=listing.source,
            source_property_id=listing.source_property_id,
            url=listing.url,
            title=listing.title,
            operation=listing.operation,
            property_type=listing.property_type,
            address=listing.address,
            location_label=listing.location_label,
            price=listing.price,
            currency=listing.currency,
            expenses=listing.expenses,
            total_m2=listing.total_m2,
            covered_m2=listing.covered_m2,
            rooms=listing.rooms,
            bedrooms=listing.bedrooms,
            bathrooms=listing.bathrooms,
            parking_spaces=listing.parking_spaces,
            age_years=listing.age_years,
            floor=listing.floor,
            orientation=listing.orientation,
            condition=listing.condition,
            real_estate=listing.real_estate,
            phone=listing.phone,
            contact_status=listing.contact_status,
            contact_source=listing.contact_source,
            whatsapp_url=listing.whatsapp_url,
            description=listing.description,
            amenities=listing.amenities,
            image_urls=listing.image_urls,
            first_seen_at=now,
            last_seen_at=now,
        )

    def _friendly_error(self, exc: Exception) -> str:
        message = str(exc)
        if not message:
            message = exc.__class__.__name__
        if "Target page, context or browser has been closed" in message:
            return "el navegador interno se cerró durante la carga del portal"
        if "Timeout" in message:
            return "el portal tardó demasiado en responder"
        return message[:300]

    def _needs_preview_enrichment(self, listing) -> bool:
        return not listing.image_urls or not listing.phone

    def _normalize_contact_metadata(self, listing) -> None:
        if listing.phone:
            listing.contact_status = listing.contact_status or "phone_found"
            listing.contact_source = listing.contact_source or "phone"
            listing.whatsapp_url = listing.whatsapp_url or self._whatsapp_url(listing.phone)
            return
        listing.contact_status = listing.contact_status or "not_available"

    def _expected_location_token(self, filters: dict) -> str | None:
        value = filters.get("location_display") or filters.get("location")
        if not value:
            return None
        first_part = str(value).split(",", 1)[0]
        normalized = self._normalize_text(first_part)
        if normalized.startswith("nueva pompeya"):
            return "pompeya"
        return normalized or None

    def _filter_by_expected_location(self, listings: list, expected_location: str | None) -> list:
        if not expected_location:
            return listings
        filtered = [
            listing
            for listing in listings
            if expected_location in self._normalize_text(" ".join([listing.location_label or "", listing.address or "", listing.title or ""]))
        ]
        return filtered or listings

    def _normalize_text(self, value: str) -> str:
        text = unicodedata.normalize("NFKD", value.lower())
        ascii_text = "".join(char for char in text if not unicodedata.combining(char))
        return re.sub(r"[^a-z0-9]+", " ", ascii_text).strip()

    def _whatsapp_url(self, phone: str | None) -> str | None:
        if not phone:
            return None
        digits = "".join(char for char in str(phone) if char.isdigit())
        if len(digits) < 8:
            return None
        if digits.startswith("54"):
            return f"https://wa.me/{digits}"
        if digits.startswith("11") and len(digits) == 10:
            return f"https://wa.me/549{digits}"
        return f"https://wa.me/54{digits}"
