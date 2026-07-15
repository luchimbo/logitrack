from app.services.location_service import LocationService, slug


OFFICIAL_CABA_NEIGHBORHOODS = {
    "Agronomia",
    "Almagro",
    "Balvanera",
    "Barracas",
    "Belgrano",
    "Boedo",
    "Caballito",
    "Chacarita",
    "Coghlan",
    "Colegiales",
    "Constitucion",
    "Flores",
    "Floresta",
    "La Boca",
    "La Paternal",
    "Liniers",
    "Mataderos",
    "Monte Castro",
    "Monserrat",
    "Nueva Pompeya",
    "Nunez",
    "Palermo",
    "Parque Avellaneda",
    "Parque Chacabuco",
    "Parque Chas",
    "Parque Patricios",
    "Puerto Madero",
    "Recoleta",
    "Retiro",
    "Saavedra",
    "San Cristobal",
    "San Nicolas",
    "San Telmo",
    "Versalles",
    "Villa Crespo",
    "Villa Devoto",
    "Villa General Mitre",
    "Villa Lugano",
    "Villa Luro",
    "Villa Ortuzar",
    "Villa Pueyrredon",
    "Villa Real",
    "Villa Riachuelo",
    "Villa Santa Rita",
    "Villa Soldati",
    "Villa Urquiza",
    "Villa del Parque",
    "Velez Sarsfield",
}


def test_location_catalog_includes_all_official_caba_neighborhoods():
    service = LocationService()
    known = {slug(location.label) for location in service.locations if location.id.endswith("-caba")}

    missing = {name for name in OFFICIAL_CABA_NEIGHBORHOODS if slug(name) not in known}

    assert missing == set()


def test_nueva_pompeya_is_searchable():
    results = LocationService().search("nueva pompeya", 5)

    assert results[0]["id"] == "nueva-pompeya-caba"
    assert results[0]["portal_slugs"]["zonaprop"] == "pompeya"


GBA_PARTIDOS = {
    "Almirante Brown",
    "Avellaneda",
    "Berazategui",
    "Berisso",
    "Ensenada",
    "Escobar",
    "Esteban Echeverria",
    "Ezeiza",
    "Florencio Varela",
    "General Las Heras",
    "General Rodriguez",
    "General San Martin",
    "Hurlingham",
    "Ituzaingo",
    "Jose C Paz",
    "La Matanza",
    "La Plata",
    "Lanus",
    "Lomas de Zamora",
    "Lujan",
    "Malvinas Argentinas",
    "Marcos Paz",
    "Merlo",
    "Moreno",
    "Moron",
    "Pilar",
    "Presidente Peron",
    "Quilmes",
    "San Fernando",
    "San Isidro",
    "San Miguel",
    "San Vicente",
    "Tigre",
    "Tres de Febrero",
    "Vicente Lopez",
}


def test_location_catalog_includes_requested_gba_partidos():
    service = LocationService()
    known = {slug(location.label) for location in service.locations if service.is_amba_location_id(location.id)}

    missing = {name for name in GBA_PARTIDOS if slug(name) not in known}

    assert missing == set()


def test_gba_partido_is_searchable():
    results = LocationService().search("esteban echeverria", 5)

    assert results[0]["id"] == "esteban-echeverria-gba"
    assert results[0]["portal_slugs"]["zonaprop"] == "esteban-echeverria"
