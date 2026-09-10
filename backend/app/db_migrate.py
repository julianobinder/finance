"""Alembic-based schema management.

``ensure_schema`` runs on startup and handles three cases:

* **Fresh DB** (no core tables): run migrations to ``head`` to build the schema,
  then seed base reference data.
* **Legacy DB** (tables exist, no ``alembic_version``): adopt it by stamping the
  current head — the schema was previously built by ``create_all`` and already
  matches the baseline — then ensure import templates exist. No data is touched.
* **Managed DB** (``alembic_version`` present): upgrade to ``head`` to apply any
  new migrations, then ensure import templates exist.

``stamp_head`` marks a freshly (re)created schema as being at head — used by the
empty-db / sample-db reset endpoints so ``alembic_version`` stays consistent.
"""

import logging
import os

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.config import settings
from app.database import SessionLocal, engine

logger = logging.getLogger("db_migrate")

# /app  (backend project root inside the container; alembic.ini + migrations live here)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_alembic_config() -> Config:
    cfg = Config(os.path.join(BASE_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BASE_DIR, "migrations"))
    cfg.set_main_option("sqlalchemy.url", settings.postgresql_url)
    return cfg


def stamp_head() -> None:
    """Stamp the database as being at the latest revision (no schema change)."""
    command.stamp(get_alembic_config(), "head")


def _seed_base_data() -> None:
    from app.db_reinit import seed_default_lookups

    with SessionLocal() as db:
        seed_default_lookups(db)
        db.commit()


def _seed_templates() -> None:
    from app.seed_import_templates import seed_import_templates

    with SessionLocal() as db:
        seed_import_templates(db)
        db.commit()


def ensure_schema() -> None:
    inspector = inspect(engine)
    has_core = inspector.has_table("status")
    has_alembic = inspector.has_table("alembic_version")
    cfg = get_alembic_config()

    if not has_core:
        logger.info("Fresh database: running migrations to head.")
        command.upgrade(cfg, "head")
        _seed_base_data()
    elif not has_alembic:
        logger.info("Legacy database detected: adopting into Alembic (stamp head).")
        command.stamp(cfg, "head")
        _seed_templates()
    else:
        logger.info("Applying any pending migrations (upgrade head).")
        command.upgrade(cfg, "head")
        _seed_templates()
