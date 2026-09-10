"""HTTP surface for the obligation spreadsheet/CSV import."""

import json
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app import obligation_import as oi
from app.database import get_db
from app.models import ObligationImportFormat, ObligationImportFormatField
from app.schemas import (
    ObligationImportFormatCreate,
    ObligationImportFormatResponse,
    PaginatedResponse,
)

router = APIRouter(prefix="/obligation-import", tags=["Obligation Import"])


def _format_to_dict(fmt: ObligationImportFormat) -> dict:
    return {
        "file_type": fmt.file_type,
        "sheet_name": fmt.sheet_name,
        "header_row": fmt.header_row,
        "date_format": fmt.date_format,
        "decimal_separator": fmt.decimal_separator,
        "default_recurrence": fmt.default_recurrence,
        "default_category_id": fmt.default_category_id,
        "fields": [
            {"target_field": f.target_field, "source_column": f.source_column} for f in fmt.fields
        ],
    }


def _resolve_format(format_id: Optional[int], format_json: Optional[str], db: Session) -> dict:
    if format_json:
        try:
            return json.loads(format_json)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid format JSON: {e}")
    if format_id is not None:
        fmt = (
            db.query(ObligationImportFormat)
            .options(joinedload(ObligationImportFormat.fields))
            .filter(ObligationImportFormat.obligation_import_format_id == format_id)
            .first()
        )
        if not fmt:
            raise HTTPException(status_code=404, detail="Import format not found")
        return _format_to_dict(fmt)
    raise HTTPException(status_code=400, detail="Provide a format_id or an inline format.")


# ── Analyze (inspect an upload to build the mapping) ──────────────────────────


@router.post("/analyze/")
async def analyze_upload(
    file: UploadFile = File(...),
    file_type: Optional[str] = Form(None),
    sheet_name: Optional[str] = Form(None),
    header_row: Optional[int] = Form(1),
):
    content = await file.read()
    ftype = file_type or ("csv" if (file.filename or "").lower().endswith(".csv") else "xlsx")
    try:
        result = oi.analyze(content, ftype, sheet_name or None, header_row or 1)
    except Exception as e:  # noqa: BLE001 - surface parse errors to the client
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")
    result["file_type"] = ftype
    result["target_fields"] = oi.TARGET_FIELDS
    return result


# ── Preview (parse + resolve + flag duplicates, no writes) ────────────────────


@router.post("/preview/")
async def preview_upload(
    file: UploadFile = File(...),
    format_id: Optional[int] = Form(None),
    format_json: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    fmt = _resolve_format(format_id, format_json, db)
    config = oi.resolve_config(fmt)
    content = await file.read()
    try:
        _, rows = oi.parse_file(content, config["file_type"], config["sheet_name"], config["header_row"])
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    records, errors = oi.build_records(rows, config)
    classified = oi.classify_and_stage(records, db)
    groups = oi.group_records(classified, db)
    preview = oi.build_preview(groups)
    preview["errors"] = errors
    if errors:
        preview["summary"]["errors"] = len(errors)
    return preview


# ── Apply (create obligations, blocking flagged duplicates) ───────────────────


@router.post("/apply/")
async def apply_upload(
    file: UploadFile = File(...),
    format_id: Optional[int] = Form(None),
    format_json: Optional[str] = Form(None),
    resolutions: str = Form("{}"),
    skip_duplicates: bool = Form(False),
    db: Session = Depends(get_db),
):
    fmt = _resolve_format(format_id, format_json, db)
    config = oi.resolve_config(fmt)
    try:
        resolution_map = json.loads(resolutions) if resolutions else {}
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid resolutions JSON: {e}")

    content = await file.read()
    try:
        _, rows = oi.parse_file(content, config["file_type"], config["sheet_name"], config["header_row"])
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    records, errors = oi.build_records(rows, config)
    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "The file has rows that could not be parsed.", "errors": errors},
        )

    classified = oi.classify_and_stage(records, db)
    groups = oi.group_records(classified, db)
    result = oi.apply_records(
        groups, resolution_map, config, db, format_id=format_id, skip_duplicates=skip_duplicates
    )

    from app.obligation_match import auto_match_occurrences

    match_stats = auto_match_occurrences(db, result["obligation_ids"])
    result["auto_matched_transactions"] = match_stats["matched"]
    return result


# ── Format CRUD ───────────────────────────────────────────────────────────────


def _apply_fields(fmt: ObligationImportFormat, payload: ObligationImportFormatCreate):
    fmt.fields.clear()
    for f in payload.fields:
        if f.source_column:
            fmt.fields.append(
                ObligationImportFormatField(target_field=f.target_field, source_column=f.source_column)
            )


@router.get("/formats/", response_model=PaginatedResponse[ObligationImportFormatResponse])
def list_formats(db: Session = Depends(get_db)):
    results = (
        db.query(ObligationImportFormat)
        .options(joinedload(ObligationImportFormat.fields))
        .order_by(ObligationImportFormat.name)
        .all()
    )
    return {"count": len(results), "next": None, "previous": None, "results": results}


@router.post(
    "/formats/", response_model=ObligationImportFormatResponse, status_code=status.HTTP_201_CREATED
)
def create_format(payload: ObligationImportFormatCreate, db: Session = Depends(get_db)):
    fmt = ObligationImportFormat(**payload.model_dump(exclude={"fields"}))
    _apply_fields(fmt, payload)
    db.add(fmt)
    db.commit()
    db.refresh(fmt)
    return fmt


@router.get("/formats/{pk}/", response_model=ObligationImportFormatResponse)
def get_format(pk: int, db: Session = Depends(get_db)):
    fmt = (
        db.query(ObligationImportFormat)
        .options(joinedload(ObligationImportFormat.fields))
        .filter(ObligationImportFormat.obligation_import_format_id == pk)
        .first()
    )
    if not fmt:
        raise HTTPException(status_code=404, detail="Import format not found")
    return fmt


@router.put("/formats/{pk}/", response_model=ObligationImportFormatResponse)
def update_format(pk: int, payload: ObligationImportFormatCreate, db: Session = Depends(get_db)):
    fmt = (
        db.query(ObligationImportFormat)
        .filter(ObligationImportFormat.obligation_import_format_id == pk)
        .first()
    )
    if not fmt:
        raise HTTPException(status_code=404, detail="Import format not found")
    for field, value in payload.model_dump(exclude={"fields"}).items():
        setattr(fmt, field, value)
    _apply_fields(fmt, payload)
    db.commit()
    db.refresh(fmt)
    return fmt


@router.delete("/formats/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_format(pk: int, db: Session = Depends(get_db)):
    fmt = (
        db.query(ObligationImportFormat)
        .filter(ObligationImportFormat.obligation_import_format_id == pk)
        .first()
    )
    if not fmt:
        raise HTTPException(status_code=404, detail="Import format not found")
    db.delete(fmt)
    db.commit()
    return None
