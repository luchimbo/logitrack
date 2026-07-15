from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


PROPERTY_COLUMN_MIGRATIONS = {
    "contact_status": "VARCHAR(32)",
    "contact_source": "VARCHAR(80)",
    "whatsapp_url": "TEXT",
}


def ensure_runtime_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    if "properties" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("properties")}
    missing = {name: ddl for name, ddl in PROPERTY_COLUMN_MIGRATIONS.items() if name not in existing}
    if not missing:
        return

    with engine.begin() as connection:
        for name, ddl in missing.items():
            connection.execute(text(f"ALTER TABLE properties ADD COLUMN {name} {ddl}"))
