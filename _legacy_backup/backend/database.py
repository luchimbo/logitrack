import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

Base = declarative_base()

# --- Turso (cloud) or local SQLite ---
TURSO_URL = os.environ.get("TURSO_DATABASE_URL", "")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")

if TURSO_URL and TURSO_TOKEN:
    # Cloud mode: Turso via libsql_experimental (works on Vercel Linux)
    try:
        import libsql_experimental as libsql

        def _libsql_creator():
            return libsql.connect(
                database=TURSO_URL,
                auth_token=TURSO_TOKEN,
            )

        engine = create_engine(
            "sqlite://",
            creator=_libsql_creator,
            connect_args={"check_same_thread": False},
        )
    except ImportError:
        # Fallback: convert libsql:// to https:// for sqlalchemy-libsql
        http_url = TURSO_URL.replace("libsql://", "https://")
        url = f"sqlite+libsql://{http_url.replace('https://', '')}?authToken={TURSO_TOKEN}&secure=true"
        engine = create_engine(url, connect_args={"check_same_thread": False})
else:
    # Local dev mode: SQLite file
    DB_DIR = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(DB_DIR, exist_ok=True)
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'logistics.db')}"
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
