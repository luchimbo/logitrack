# Propiedades Monitor

Monitor local para Zonaprop y Argenprop con:

- busquedas guardadas por URL o filtros
- ejecucion manual y programada cada 12 horas
- historial de precios
- alertas de dashboard por nuevas publicaciones o cambios de precio

## Ejecutar con Docker

```bash
docker compose up --build
```

App en `http://localhost:8000`.

## Ejecutar local

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e .[dev]
playwright install chromium
uvicorn app.main:app --reload
```

## Validar antes de desplegar

Con el entorno virtual activo, ejecutá `python -m pytest -q`. Playwright requiere
Chromium: instalalo una vez con `playwright install chromium`. Antes de un despliegue,
probá una búsqueda de Palermo en ambos portales desde el dashboard para confirmar que
los sitios externos siguen respondiendo.

## Estado actual

La aplicacion implementa la arquitectura base completa y scrapers iniciales por portal apoyados en HTML y metadatos embebidos. Como Zonaprop y Argenprop cambian seguido, conviene validar selectores reales antes de confiar en un scraping intensivo.
