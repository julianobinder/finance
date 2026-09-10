"""Idempotently seed the default CSV/statement import templates.

These templates define the column -> transaction-field mapping the client
import pipeline applies. Their field names must match the canonical headers
emitted by ``app/statement_parser.py`` (case-insensitive) so uploaded
statements map cleanly.

Seeding is keyed by template name and only creates a template when one with
that name does not already exist, so it is safe to run on every startup and
never clobbers user edits.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import ImportCSV, ImportCsvField

logger = logging.getLogger("seed_import_templates")

# name -> list of (field_name, map_field, type_field, format_field)
DEFAULT_TEMPLATES: dict[str, list[tuple[str, str, str, str]]] = {
    "Nubank": [
        ("Data", "DATE", "DATE", "DD/MM/YYYY"),
        ("Valor", "AMOUNT", "NUMERIC", ""),
        ("Identificador", "REFERENCE", "TEXT", ""),
        ("Descrição", "COMMENTS", "TEXT", ""),
    ],
    # Santander current (.xls) and PDF statements are both normalized to the
    # same canonical columns, so a single template serves both sources.
    "Santander": [
        ("Data", "DATE", "DATE", "DD/MM/YYYY"),
        ("Descrição", "COMMENTS", "TEXT", ""),
        ("Documento", "REFERENCE", "TEXT", ""),
        ("Valor", "AMOUNT", "NUMERIC", ""),
    ],
}


def seed_import_templates(db: Session, commit: bool = True) -> None:
    """Idempotently seed the default import templates.

    Adds and flushes only; commits by default so it can be called standalone.
    Pass ``commit=False`` when composing inside another seeding transaction
    (e.g. from ``seed_default_lookups``) so the caller controls the commit.
    """
    created = []
    for name, fields in DEFAULT_TEMPLATES.items():
        exists = db.query(ImportCSV).filter(ImportCSV.name == name).first()
        if exists:
            continue
        template = ImportCSV(name=name)
        db.add(template)
        db.flush()
        for field_name, map_field, type_field, format_field in fields:
            db.add(
                ImportCsvField(
                    import_csv_id=template.import_csv_id,
                    name=field_name,
                    map_field=map_field,
                    type_field=type_field,
                    format_field=format_field,
                )
            )
        created.append(name)

    if created:
        db.flush()
        if commit:
            db.commit()
        logger.info("Seeded default import templates: %s", ", ".join(created))
