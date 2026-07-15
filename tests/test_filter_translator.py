from app.services.filter_translator import FilterTranslator


def test_translate_filters_marks_unsupported_fields():
    translator = FilterTranslator()

    result = translator.translate(
        {
            "operation": "venta",
            "location": "palermo",
            "age_max": 20,
            "price_min": 100000,
        }
    )

    assert "zonaprop" in result.urls
    assert "argenprop" in result.urls
    assert "age_max" in result.unsupported_filters


def test_translate_filters_uses_portal_location_slugs():
    translator = FilterTranslator()

    result = translator.translate(
        {
            "operation": "venta",
            "location": "Almagro, Capital Federal",
            "location_id": "almagro-caba",
            "location_display": "Almagro, Capital Federal",
            "portal_slugs": {"zonaprop": "almagro", "argenprop": "almagro"},
        }
    )

    assert result.urls["zonaprop"] == "https://www.zonaprop.com.ar/departamentos-venta-almagro.html"
    assert result.urls["argenprop"] == "https://www.argenprop.com/departamentos/venta/almagro"
    assert result.unsupported_filters == []


def test_translate_filters_slugifies_free_text_neighborhoods():
    translator = FilterTranslator()

    result = translator.translate(
        {
            "operation": "venta",
            "location": "Almagro Sur",
            "portal_slugs": {},
        }
    )

    assert result.urls["zonaprop"] == "https://www.zonaprop.com.ar/departamentos-venta-almagro-sur.html"
    assert result.urls["argenprop"] == "https://www.argenprop.com/departamentos/venta/almagro-sur"


def test_translate_filters_resolves_known_accented_neighborhoods():
    translator = FilterTranslator()

    result = translator.translate(
        {
            "operation": "venta",
            "location": "Núñez",
            "portal_slugs": {},
        }
    )

    assert result.urls["zonaprop"] == "https://www.zonaprop.com.ar/departamentos-venta-nunez.html"
    assert result.urls["argenprop"] == "https://www.argenprop.com/departamentos/venta/nunez"


def test_translate_filters_uses_portal_specific_slug_for_nueva_pompeya():
    translator = FilterTranslator()

    result = translator.translate(
        {
            "operation": "venta",
            "location": "Nueva Pompeya",
            "location_id": "nueva-pompeya-caba",
            "portal_slugs": {"zonaprop": "pompeya", "argenprop": "nueva-pompeya"},
        }
    )

    assert result.urls["zonaprop"] == "https://www.zonaprop.com.ar/departamentos-venta-pompeya.html"
    assert result.urls["argenprop"] == "https://www.argenprop.com/departamentos/venta/nueva-pompeya"
