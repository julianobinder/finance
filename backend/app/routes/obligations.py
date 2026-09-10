from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Category, Obligation, ObligationGroup, ObligationOccurrence, Payee
from app.obligation_dedup import detect_duplicate_obligation, detect_duplicate_occurrence
from app.obligation_helpers import (
    assignment_totals,
    derive_period,
    generate_next_occurrence,
    obligation_dict,
    occurrence_dict,
)
from app.schemas import (
    ObligationCreate,
    ObligationMatchCategoriesRequest,
    ObligationMatchGroupsRequest,
    ObligationOccurrenceCreate,
    ObligationOccurrenceResponse,
    ObligationResponse,
    ObligationSuggestCategoriesRequest,
    ObligationUpdate,
    PaginatedResponse,
)

router = APIRouter(prefix="/obligations", tags=["Obligations"])


def _load_options():
    return (
        joinedload(Obligation.category),
        joinedload(Obligation.payee),
        joinedload(Obligation.group),
        joinedload(Obligation.duplicate_of),
        joinedload(Obligation.occurrences),
    )


def _get_or_404(pk: int, db: Session) -> Obligation:
    ob = db.query(Obligation).options(*_load_options()).filter(Obligation.obligation_id == pk).first()
    if not ob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obligation not found")
    return ob


def _validate_refs(
    category_id: Optional[int], payee_id: Optional[int], obligation_group_id: Optional[int], db: Session
) -> None:
    if category_id is not None and not db.get(Category, category_id):
        raise HTTPException(status_code=400, detail="Category not found")
    if payee_id is not None and not db.get(Payee, payee_id):
        raise HTTPException(status_code=400, detail="Payee not found")
    if obligation_group_id is not None and not db.get(ObligationGroup, obligation_group_id):
        raise HTTPException(status_code=400, detail="Obligation group not found")


@router.get("/", response_model=PaginatedResponse[ObligationResponse])
def list_obligations(
    is_active: Optional[bool] = Query(None),
    is_recurring: Optional[bool] = Query(None),
    is_blocked: Optional[bool] = Query(None),
    category_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Obligation).options(*_load_options())
    if is_active is not None:
        query = query.filter(Obligation.is_active == is_active)
    if is_recurring is not None:
        query = query.filter(Obligation.is_recurring == is_recurring)
    if is_blocked is not None:
        query = query.filter(Obligation.is_blocked == is_blocked)
    if category_id is not None:
        query = query.filter(Obligation.category_id == category_id)
    if search:
        query = query.filter(Obligation.name.ilike(f"%{search}%"))

    results = query.order_by(Obligation.name).all()
    data = [obligation_dict(o) for o in results]
    return {"count": len(data), "next": None, "previous": None, "results": data}


@router.post("/", response_model=ObligationResponse, status_code=status.HTTP_201_CREATED)
def create_obligation(payload: ObligationCreate, db: Session = Depends(get_db)):
    _validate_refs(payload.category_id, payload.payee_id, payload.obligation_group_id, db)
    if payload.is_recurring and not payload.recurrence:
        raise HTTPException(status_code=400, detail="A recurring obligation needs a recurrence cadence")

    ob = Obligation(
        name=payload.name,
        category_id=payload.category_id,
        payee_id=payload.payee_id,
        obligation_group_id=payload.obligation_group_id,
        is_recurring=payload.is_recurring,
        recurrence=payload.recurrence if payload.is_recurring else None,
        estimated_amount=payload.estimated_amount,
        direction=payload.direction,
        note=payload.note,
        is_active=payload.is_active,
        source="manual",
    )

    dup = detect_duplicate_obligation(db, payload.name, payload.category_id)
    if dup:
        ob.is_blocked = True
        ob.duplicate_of_obligation_id = dup.obligation_id
        ob.blocked_reason = f"Duplicate of obligation #{dup.obligation_id} ({dup.name})"

    db.add(ob)
    db.flush()

    first_amount = payload.first_amount if payload.first_amount is not None else payload.estimated_amount
    occurrence = ObligationOccurrence(
        obligation_id=ob.obligation_id,
        due_date=payload.first_due_date,
        period=derive_period(payload.first_due_date),
        estimated_amount=first_amount,
        paid=payload.first_paid,
        paid_at=datetime.now(timezone.utc) if payload.first_paid else None,
        paid_date=payload.first_due_date if payload.first_paid else None,
        source="manual",
    )
    db.add(occurrence)
    db.commit()

    return obligation_dict(_get_or_404(ob.obligation_id, db), include_occurrences=True)


@router.get("/{pk}/", response_model=ObligationResponse)
def get_obligation(pk: int, db: Session = Depends(get_db)):
    ob = _get_or_404(pk, db)
    totals = assignment_totals(db, [o.obligation_occurrence_id for o in ob.occurrences])
    return obligation_dict(ob, include_occurrences=True, occurrence_totals=totals)


@router.put("/{pk}/", response_model=ObligationResponse)
def update_obligation(pk: int, payload: ObligationUpdate, db: Session = Depends(get_db)):
    ob = _get_or_404(pk, db)
    _validate_refs(payload.category_id, payload.payee_id, payload.obligation_group_id, db)
    if payload.is_recurring and not payload.recurrence:
        raise HTTPException(status_code=400, detail="A recurring obligation needs a recurrence cadence")

    ob.name = payload.name
    ob.category_id = payload.category_id
    ob.payee_id = payload.payee_id
    ob.obligation_group_id = payload.obligation_group_id
    ob.is_recurring = payload.is_recurring
    ob.recurrence = payload.recurrence if payload.is_recurring else None
    ob.estimated_amount = payload.estimated_amount
    ob.direction = payload.direction
    ob.note = payload.note
    ob.is_active = payload.is_active
    db.commit()
    return obligation_dict(_get_or_404(pk, db), include_occurrences=True)


@router.delete("/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_obligation(pk: int, db: Session = Depends(get_db)):
    ob = _get_or_404(pk, db)
    assigned = sum(len(o.assignment_links) for o in ob.occurrences)
    if assigned:
        raise HTTPException(
            status_code=400,
            detail=f"Obligation has {assigned} assigned transaction(s); unassign them first.",
        )
    # Any obligation flagged as a duplicate of this one would otherwise hit an
    # FK violation on delete; since the target is going away, that flag no
    # longer means anything -- clear it instead of leaving a dangling pointer.
    db.query(Obligation).filter(Obligation.duplicate_of_obligation_id == pk).update(
        {
            Obligation.duplicate_of_obligation_id: None,
            Obligation.is_blocked: False,
            Obligation.blocked_reason: None,
        },
        synchronize_session=False,
    )
    db.delete(ob)
    db.commit()
    return None


@router.post("/{pk}/unblock/", response_model=ObligationResponse)
def unblock_obligation(pk: int, db: Session = Depends(get_db)):
    ob = _get_or_404(pk, db)
    ob.is_blocked = False
    db.commit()
    return obligation_dict(_get_or_404(pk, db), include_occurrences=True)


@router.post(
    "/{pk}/occurrences/",
    response_model=ObligationOccurrenceResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_occurrence(pk: int, payload: ObligationOccurrenceCreate, db: Session = Depends(get_db)):
    ob = _get_or_404(pk, db)
    occurrence = ObligationOccurrence(
        obligation_id=ob.obligation_id,
        due_date=payload.due_date,
        period=derive_period(payload.due_date, payload.period),
        estimated_amount=(
            payload.estimated_amount if payload.estimated_amount is not None else ob.estimated_amount
        ),
        paid=payload.paid,
        paid_at=datetime.now(timezone.utc) if payload.paid else None,
        paid_date=payload.due_date if payload.paid else None,
        note=payload.note,
        source="manual",
    )

    dup = detect_duplicate_occurrence(db, ob.obligation_id, payload.due_date, ob.recurrence)
    if dup:
        occurrence.is_blocked = True
        occurrence.duplicate_of_occurrence_id = dup.obligation_occurrence_id
        occurrence.blocked_reason = (
            f"Duplicate of occurrence #{dup.obligation_occurrence_id} ({dup.due_date})"
        )

    db.add(occurrence)
    db.commit()
    db.refresh(occurrence)
    return occurrence_dict(occurrence)


@router.post("/{pk}/generate-next-occurrence/")
def generate_next(pk: int, db: Session = Depends(get_db)):
    ob = _get_or_404(pk, db)
    dated = [o for o in ob.occurrences if o.due_date is not None]
    if not dated:
        raise HTTPException(status_code=400, detail="Obligation has no dated occurrences to advance from")
    latest = max(dated, key=lambda o: o.due_date)

    nxt, reason = generate_next_occurrence(db, latest)
    if nxt is None:
        return {"generated": False, "occurrence": None, "reason": reason}
    db.commit()
    db.refresh(nxt)
    return {"generated": True, "occurrence": occurrence_dict(nxt), "reason": None}


@router.post("/ai/suggest-categories/")
def suggest_categories(payload: ObligationSuggestCategoriesRequest, db: Session = Depends(get_db)):
    from app.ai_categorize import AICategorizationError, suggest_obligation_categories

    items = [o.model_dump() for o in payload.obligations]
    try:
        suggestions = suggest_obligation_categories(db, items)
    except AICategorizationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"suggestions": suggestions}


@router.post("/ai/match-categories/")
def match_categories(payload: ObligationMatchCategoriesRequest, db: Session = Depends(get_db)):
    """Translation-aware match of raw labels (e.g. from a spreadsheet import)
    to existing categories -- see app.ai_categorize.suggest_category_matches."""
    from app.ai_categorize import AICategorizationError, suggest_category_matches

    try:
        matches = suggest_category_matches(db, payload.labels)
    except AICategorizationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"matches": matches}


@router.post("/ai/match-groups/")
def match_groups(payload: ObligationMatchGroupsRequest, db: Session = Depends(get_db)):
    """Match raw obligation names (e.g. from a spreadsheet import) to an
    EXISTING ObligationGroup -- see app.ai_categorize.suggest_group_matches.
    Never proposes creating a new group; groups are created manually only."""
    from app.ai_categorize import AICategorizationError, suggest_group_matches

    try:
        matches = suggest_group_matches(db, payload.labels)
    except AICategorizationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"matches": matches}
