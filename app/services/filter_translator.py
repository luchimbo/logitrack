from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote_plus

from app.services.location_service import LocationService, slug


@dataclass
class TranslationResult:
    urls: dict[str, str]
    unsupported_filters: list[str]


class FilterTranslator:
    def __init__(self):
        self.location_service = LocationService()

    supported = {
        "zonaprop": {
            "operation",
            "property_type",
            "location",
            "location_id",
            "location_display",
            "portal_slugs",
            "price_min",
            "price_max",
            "currency",
            "total_m2_min",
            "total_m2_max",
            "covered_m2_min",
            "covered_m2_max",
            "rooms_min",
            "bedrooms_min",
            "bathrooms_min",
        },
        "argenprop": {
            "operation",
            "property_type",
            "location",
            "location_id",
            "location_display",
            "portal_slugs",
            "price_min",
            "price_max",
            "currency",
            "total_m2_min",
            "covered_m2_min",
            "rooms_min",
            "bedrooms_min",
            "bathrooms_min",
            "parking_min",
            "expenses_max",
        },
    }

    def translate(self, filters: dict, portal: str | None = None) -> TranslationResult:
        portals = [portal] if portal else ["zonaprop", "argenprop"]
        urls: dict[str, str] = {}
        unsupported: set[str] = set()
        for target in portals:
            url, missing = self._build_portal_url(target, filters)
            urls[target] = url
            unsupported.update(missing)
        return TranslationResult(urls=urls, unsupported_filters=sorted(unsupported))

    def _build_portal_url(self, portal: str, filters: dict) -> tuple[str, list[str]]:
        supported = self.supported[portal]
        missing = [key for key, value in filters.items() if value not in (None, "", {}, []) and key not in supported and key != "portal"]
        if portal == "zonaprop":
            return self._zonaprop_url(filters), missing
        return self._argenprop_url(filters), missing

    def _zonaprop_url(self, filters: dict) -> str:
        operation = filters.get("operation") or "venta"
        property_type = filters.get("property_type") or "departamentos"
        location = self._location_slug(filters, "zonaprop")
        path = f"https://www.zonaprop.com.ar/{property_type}-{operation}-{location}.html"
        params = []
        mapping = {
            "price_min": "precioDesde",
            "price_max": "precioHasta",
            "total_m2_min": "superficieDesde",
            "total_m2_max": "superficieHasta",
            "covered_m2_min": "cubiertaDesde",
            "covered_m2_max": "cubiertaHasta",
            "rooms_min": "ambientes",
            "bedrooms_min": "dormitorios",
            "bathrooms_min": "banos",
            "currency": "moneda",
        }
        for key, target in mapping.items():
            if filters.get(key) is not None:
                params.append(f"{target}={quote_plus(str(filters[key]))}")
        return path + (f"?{'&'.join(params)}" if params else "")

    def _argenprop_url(self, filters: dict) -> str:
        operation = filters.get("operation") or "venta"
        property_type = self._argenprop_property_type(filters.get("property_type"))
        location = self._location_slug(filters, "argenprop")
        path = f"https://www.argenprop.com/{property_type}/{operation}/{location}"
        params = []
        mapping = {
            "price_min": "desde",
            "price_max": "hasta",
            "currency": "moneda",
            "covered_m2_min": "sup-cubierta-min",
            "total_m2_min": "sup-total-min",
            "rooms_min": "ambientes",
            "bedrooms_min": "dormitorios",
            "bathrooms_min": "banos",
            "parking_min": "cocheras",
            "expenses_max": "expensas-hasta",
        }
        for key, target in mapping.items():
            if filters.get(key) is not None:
                params.append(f"{target}={quote_plus(str(filters[key]))}")
        return path + (f"?{'&'.join(params)}" if params else "")

    def _argenprop_property_type(self, value: str | None) -> str:
        """Map UI values to Argenprop's current top-level URL categories."""
        mapping = {
            "departamento": "departamentos", "departamentos": "departamentos",
            "casa": "casas", "casas": "casas", "ph": "ph",
            "terreno": "terrenos", "terrenos": "terrenos",
            "local": "locales", "locales-comerciales": "locales",
            "oficina": "oficinas", "oficinas-comerciales": "oficinas",
        }
        return mapping.get(value or "departamentos", "departamentos")

    def _location_slug(self, filters: dict, portal: str) -> str:
        portal_slugs = filters.get("portal_slugs") or {}
        if portal_slugs.get(portal):
            return slug(str(portal_slugs[portal]))

        location_id = filters.get("location_id")
        if location_id:
            for location in self.location_service.locations:
                if location.id == location_id:
                    return slug(location.portal_slugs.get(portal) or location.label)

        raw_location = str(filters.get("location") or "capital-federal")
        normalized_raw = raw_location.strip()
        for location in self.location_service.locations:
            candidates = {
                location.id,
                location.label,
                location.display,
                *location.aliases,
                *location.portal_slugs.values(),
            }
            if any(slug(candidate) == slug(normalized_raw) for candidate in candidates):
                return slug(location.portal_slugs.get(portal) or location.label)

        return slug(normalized_raw)
