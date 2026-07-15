from __future__ import annotations

import unicodedata
from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class Location:
    id: str
    label: str
    secondary: str
    type: str
    portal_slugs: dict[str, str]
    aliases: list[str] = field(default_factory=list)

    @property
    def display(self) -> str:
        return f"{self.label}, {self.secondary}"

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["display"] = self.display
        return payload


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value.lower())
    return "".join(char for char in text if not unicodedata.combining(char))


def slug(value: str) -> str:
    cleaned = normalize(value)
    allowed = [char if char.isalnum() else "-" for char in cleaned]
    return "-".join(part for part in "".join(allowed).split("-") if part)


def _location(
    location_id: str,
    label: str,
    secondary: str,
    *,
    type_: str = "barrio",
    zonaprop: str | None = None,
    argenprop: str | None = None,
    aliases: list[str] | None = None,
) -> Location:
    default_slug = slug(label)
    return Location(
        id=location_id,
        label=label,
        secondary=secondary,
        type=type_,
        portal_slugs={
            "zonaprop": zonaprop or default_slug,
            "argenprop": argenprop or default_slug,
        },
        aliases=aliases or [],
    )


LOCATIONS: list[Location] = [
    _location("almagro-caba", "Almagro", "Capital Federal", aliases=["caba", "capital federal"]),
    _location("almagro-sur-caba", "Almagro Sur", "Almagro, Capital Federal", aliases=["almagro"]),
    _location("almagro-norte-caba", "Almagro Norte", "Almagro, Capital Federal", aliases=["almagro"]),
    _location("palermo-caba", "Palermo", "Capital Federal", aliases=["caba"]),
    _location("palermo-hollywood-caba", "Palermo Hollywood", "Palermo, Capital Federal", aliases=["palermo"]),
    _location("palermo-soho-caba", "Palermo Soho", "Palermo, Capital Federal", aliases=["palermo"]),
    _location("belgrano-caba", "Belgrano", "Capital Federal"),
    _location("belgrano-r-caba", "Belgrano R", "Belgrano, Capital Federal", aliases=["belgrano"]),
    _location("caballito-caba", "Caballito", "Capital Federal"),
    _location("villa-urquiza-caba", "Villa Urquiza", "Capital Federal"),
    _location("recoleta-caba", "Recoleta", "Capital Federal"),
    _location("nunez-caba", "Núñez", "Capital Federal", zonaprop="nunez", argenprop="nunez", aliases=["nuñez"]),
    _location("flores-caba", "Flores", "Capital Federal"),
    _location("villa-crespo-caba", "Villa Crespo", "Capital Federal"),
    _location("colegiales-caba", "Colegiales", "Capital Federal"),
    _location("chacarita-caba", "Chacarita", "Capital Federal"),
    _location("boedo-caba", "Boedo", "Capital Federal"),
    _location("san-telmo-caba", "San Telmo", "Capital Federal"),
    _location("barrio-norte-caba", "Barrio Norte", "Capital Federal"),
    _location("puerto-madero-caba", "Puerto Madero", "Capital Federal"),
    _location("retiro-caba", "Retiro", "Capital Federal"),
    _location("monserrat-caba", "Monserrat", "Capital Federal"),
    _location("balvanera-caba", "Balvanera", "Capital Federal", aliases=["once"]),
    _location("barracas-caba", "Barracas", "Capital Federal"),
    _location("parque-patricios-caba", "Parque Patricios", "Capital Federal"),
    _location("villa-devoto-caba", "Villa Devoto", "Capital Federal"),
    _location("villa-del-parque-caba", "Villa del Parque", "Capital Federal"),
    _location("mataderos-caba", "Mataderos", "Capital Federal"),
    _location("liniers-caba", "Liniers", "Capital Federal"),
    _location("saavedra-caba", "Saavedra", "Capital Federal"),
    _location("coghlan-caba", "Coghlan", "Capital Federal"),
    _location("vicente-lopez-gba", "Vicente López", "GBA Norte", type_="localidad", aliases=["zona norte"]),
    _location("olivos-gba", "Olivos", "Vicente López, GBA Norte", type_="localidad"),
    _location("san-isidro-gba", "San Isidro", "GBA Norte", type_="localidad"),
    _location("martinez-gba", "Martínez", "San Isidro, GBA Norte", type_="localidad"),
    _location("tigre-gba", "Tigre", "GBA Norte", type_="localidad"),
    _location("nordelta-gba", "Nordelta", "Tigre, GBA Norte", type_="localidad"),
    _location("moron-gba", "Morón", "GBA Oeste", type_="localidad"),
    _location("ramos-mejia-gba", "Ramos Mejía", "La Matanza, GBA Oeste", type_="localidad"),
    _location("lanus-gba", "Lanús", "GBA Sur", type_="localidad"),
    _location("lomas-de-zamora-gba", "Lomas de Zamora", "GBA Sur", type_="localidad"),
    _location("quilmes-gba", "Quilmes", "GBA Sur", type_="localidad"),
    _location("la-plata-buenos-aires", "La Plata", "Buenos Aires", type_="ciudad"),
    _location("mar-del-plata-buenos-aires", "Mar del Plata", "Buenos Aires", type_="ciudad"),
    _location("rosario-santa-fe", "Rosario", "Santa Fe", type_="ciudad"),
    _location("cordoba-cordoba", "Córdoba", "Córdoba", type_="ciudad", zonaprop="cordoba", argenprop="cordoba"),
    _location("mendoza-mendoza", "Mendoza", "Mendoza", type_="ciudad"),
    _location("salta-salta", "Salta", "Salta", type_="ciudad"),
    _location("diego-de-almagro-salta", "Diego de Almagro", "Salta", type_="localidad", aliases=["almagro"]),
    _location("neuquen-neuquen", "Neuquén", "Neuquén", type_="ciudad", zonaprop="neuquen", argenprop="neuquen"),
    _location("agronomia-caba", "Agronomia", "Capital Federal", aliases=["agronomia"]),
    _location("constitucion-caba", "Constitucion", "Capital Federal", aliases=["constitucion"]),
    _location("floresta-caba", "Floresta", "Capital Federal"),
    _location("la-boca-caba", "La Boca", "Capital Federal", zonaprop="boca", argenprop="la-boca", aliases=["boca"]),
    _location("la-paternal-caba", "La Paternal", "Capital Federal", aliases=["paternal"]),
    _location("monte-castro-caba", "Monte Castro", "Capital Federal"),
    _location("nueva-pompeya-caba", "Nueva Pompeya", "Capital Federal", zonaprop="pompeya", aliases=["pompeya"]),
    _location("parque-avellaneda-caba", "Parque Avellaneda", "Capital Federal"),
    _location("parque-chacabuco-caba", "Parque Chacabuco", "Capital Federal"),
    _location("parque-chas-caba", "Parque Chas", "Capital Federal"),
    _location("san-cristobal-caba", "San Cristobal", "Capital Federal", aliases=["san cristobal"]),
    _location("san-nicolas-caba", "San Nicolas", "Capital Federal", aliases=["san nicolas"]),
    _location("versalles-caba", "Versalles", "Capital Federal"),
    _location("villa-general-mitre-caba", "Villa General Mitre", "Capital Federal"),
    _location("villa-lugano-caba", "Villa Lugano", "Capital Federal"),
    _location("villa-luro-caba", "Villa Luro", "Capital Federal"),
    _location("villa-ortuzar-caba", "Villa Ortuzar", "Capital Federal", aliases=["villa ortuzar"]),
    _location("villa-pueyrredon-caba", "Villa Pueyrredon", "Capital Federal", aliases=["villa pueyrredon"]),
    _location("villa-real-caba", "Villa Real", "Capital Federal"),
    _location("villa-riachuelo-caba", "Villa Riachuelo", "Capital Federal"),
    _location("villa-santa-rita-caba", "Villa Santa Rita", "Capital Federal"),
    _location("villa-soldati-caba", "Villa Soldati", "Capital Federal"),
    _location("velez-sarsfield-caba", "Velez Sarsfield", "Capital Federal", aliases=["velez sarsfield"]),
    _location("almirante-brown-gba", "Almirante Brown", "GBA Sur", type_="partido"),
    _location("avellaneda-gba", "Avellaneda", "GBA Sur", type_="partido"),
    _location("berazategui-gba", "Berazategui", "GBA Sur", type_="partido"),
    _location("berisso-gba", "Berisso", "GBA Sur", type_="partido"),
    _location("ensenada-gba", "Ensenada", "GBA Sur", type_="partido"),
    _location("escobar-gba", "Escobar", "GBA Norte", type_="partido"),
    _location("esteban-echeverria-gba", "Esteban Echeverria", "GBA Sur", type_="partido", aliases=["esteban echeverría"]),
    _location("ezeiza-gba", "Ezeiza", "GBA Sur", type_="partido"),
    _location("florencio-varela-gba", "Florencio Varela", "GBA Sur", type_="partido"),
    _location("general-las-heras-gba", "General Las Heras", "GBA Oeste", type_="partido"),
    _location("general-rodriguez-gba", "General Rodriguez", "GBA Oeste", type_="partido", aliases=["general rodríguez"]),
    _location("general-san-martin-gba", "General San Martin", "GBA Norte", type_="partido", aliases=["general san martín", "san martin", "san martín"]),
    _location("hurlingham-gba", "Hurlingham", "GBA Oeste", type_="partido"),
    _location("ituzaingo-gba", "Ituzaingo", "GBA Oeste", type_="partido", aliases=["ituzaingó"]),
    _location("jose-c-paz-gba", "Jose C Paz", "GBA Norte", type_="partido", aliases=["josé c paz", "jose c. paz", "josé c. paz"]),
    _location("la-matanza-gba", "La Matanza", "GBA Oeste", type_="partido"),
    _location("la-plata-gba", "La Plata", "GBA Sur", type_="partido"),
    _location("lujan-gba", "Lujan", "GBA Oeste", type_="partido", aliases=["luján"]),
    _location("malvinas-argentinas-gba", "Malvinas Argentinas", "GBA Norte", type_="partido"),
    _location("marcos-paz-gba", "Marcos Paz", "GBA Oeste", type_="partido"),
    _location("merlo-gba", "Merlo", "GBA Oeste", type_="partido"),
    _location("moreno-gba", "Moreno", "GBA Oeste", type_="partido"),
    _location("pilar-gba", "Pilar", "GBA Norte", type_="partido"),
    _location("presidente-peron-gba", "Presidente Peron", "GBA Sur", type_="partido", aliases=["presidente perón"]),
    _location("san-fernando-gba", "San Fernando", "GBA Norte", type_="partido"),
    _location("san-miguel-gba", "San Miguel", "GBA Norte", type_="partido"),
    _location("san-vicente-gba", "San Vicente", "GBA Sur", type_="partido"),
    _location("tres-de-febrero-gba", "Tres de Febrero", "GBA Oeste", type_="partido"),
]


class LocationService:
    def __init__(self, locations: list[Location] | None = None) -> None:
        self.locations = locations or LOCATIONS

    def search(self, query: str | None = None, limit: int = 8) -> list[dict]:
        query = (query or "").strip()
        limit = max(1, min(limit, 25))
        if not query:
            return [location.to_dict() for location in self.locations[:limit]]

        normalized_query = normalize(query)
        ranked: list[tuple[int, int, Location]] = []
        for index, location in enumerate(self.locations):
            haystacks = [
                location.label,
                location.secondary,
                location.display,
                location.id,
                *location.aliases,
                *location.portal_slugs.values(),
            ]
            normalized = [normalize(item) for item in haystacks]
            score = self._score(normalized_query, normalized)
            if score is not None:
                ranked.append((score, index, location))

        ranked.sort(key=lambda item: (item[0], 0 if self.is_amba_location_id(item[2].id) else 1, item[1]))
        return [location.to_dict() for _, _, location in ranked[:limit]]

    def is_amba_location_id(self, location_id: str | None) -> bool:
        if not location_id:
            return False
        location = next((item for item in self.locations if item.id == location_id), None)
        if not location:
            return False
        secondary = normalize(location.secondary)
        return location.id.endswith("-caba") or location.id.endswith("-gba") or "capital federal" in secondary or "gba" in secondary

    @staticmethod
    def _score(query: str, values: list[str]) -> int | None:
        if any(value == query for value in values):
            return 0
        if any(value.startswith(query) for value in values):
            return 1
        if any(part.startswith(query) for value in values for part in value.split()):
            return 2
        if any(query in value for value in values):
            return 3
        return None
