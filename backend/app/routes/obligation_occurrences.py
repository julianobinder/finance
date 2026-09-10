from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.category_utils import resolve_canonical_category_id
from app.database import get_db
from app.models import Category, Obligation, ObligationOccurrence, ObligationOccurrenceTransaction, Transaction
from app.obligation_dedup import detect_duplicate_occurrence
from app.obligation_helpers import (
    assignment_totals,
    derive_period,
    generate_next_occurrence,
    occurrence_dict,
)
from app.obligation_match import find_candidate_transactions, suggest_matches
from app.routes.transactions_helpers import get_tx_response_dict
from app.schemas import (
    ObligationOccurrenceBulkDeleteResponse,
    ObligationOccurrenceIdsRequest,
    ObligationOccurrenceMarkPaid,
    ObligationOccurrenceResponse,
    ObligationOccurrenceUpdate,
    ObligationTransactionIdsRequest,
    PaginatedResponse,
    TransactionResponse,
)

router = APIRouter(prefix="/obligation-occurrences", tags=["Obligation Occurrences"])


def _load_options():
    return (
        joinedload(ObligationOccurrence.obligation).joinedload(Obligation.category),
        joinedload(ObligationOccurrence.obligation).joinedload(Obligation.payee),
    )


def _get_or_404(pk: int, db: Session) -> ObligationOccurrence:
    o = (
        db.query(ObligationOccurrence)
        .options(*_load_options())
        .filter(ObligationOccurrence.obligation_occurrence_id == pk)
        .first()
    )
    if not o:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obligation occurrence not found")
    return o


def _dict_with_totals(db: Session, o: ObligationOccurrence) -> dict:
    totals = assignment_totals(db, [o.obligation_occurrence_id])
    return occurrence_dict(o, totals)


@router.get("/", response_model=PaginatedResponse[ObligationOccurrenceResponse])
def list_occurrences(
    obligation_id: Optional[int] = Query(None),
    paid: Optional[bool] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(paid|pending|late)$"),
    is_blocked: Optional[bool] = Query(None),
    due_before: Optional[date] = Query(None),
    due_after: Optional[date] = Query(None),
    period: Optional[str] = Query(None, description='Exact "YYYY-MM"'),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    search: Optional[str] = Query(None, description="Substring match against the bill name or occurrence note"),
    direction: Optional[str] = Query(None, pattern="^(payable|receivable)$"),
    category_id: Optional[int] = Query(None, description="Matches this category and any of its aliases/subcategories"),
    db: Session = Depends(get_db),
):
    query = db.query(ObligationOccurrence).options(*_load_options())
    if obligation_id is not None:
        query = query.filter(ObligationOccurrence.obligation_id == obligation_id)
    if paid is not None:
        query = query.filter(ObligationOccurrence.paid == paid)

    if search or direction or category_id:
        # Single join, reused by whichever of the three filters below are
        # active -- joining Obligation more than once would either error or
        # duplicate rows.
        query = query.join(Obligation, ObligationOccurrence.obligation_id == Obligation.obligation_id)

    if search:
        like = f"%{search}%"
        query = query.filter(or_(Obligation.name.ilike(like), ObligationOccurrence.note.ilike(like)))

    if direction:
        query = query.filter(Obligation.direction == direction)

    if category_id:
        # Category merge is non-destructive (see category_utils.py) -- an
        # obligation may still reference an old alias id after it's been
        # merged into a canonical one, and a parent category rolls up every
        # one of its subcategories too (mirrors accounts_transactions.py's
        # transaction category filter).
        root_id = resolve_canonical_category_id(db, category_id)
        selected = db.query(Category).filter(Category.category_id == root_id).first()
        match_ids = {root_id}
        match_ids.update(
            row[0] for row in db.query(Category.category_id).filter(Category.merged_into_category_id == root_id).all()
        )
        if selected and selected.parent_category_id is None:
            sub_ids = [
                row[0] for row in db.query(Category.category_id).filter(Category.parent_category_id == root_id).all()
            ]
            match_ids.update(sub_ids)
            if sub_ids:
                match_ids.update(
                    row[0]
                    for row in db.query(Category.category_id).filter(Category.merged_into_category_id.in_(sub_ids)).all()
                )
        query = query.filter(Obligation.category_id.in_(match_ids))

    if status_filter == "paid":
        query = query.filter(ObligationOccurrence.paid.is_(True))
    elif status_filter == "late":
        query = query.filter(
            ObligationOccurrence.paid.is_(False),
            ObligationOccurrence.due_date.isnot(None),
            ObligationOccurrence.due_date < date.today(),
        )
    elif status_filter == "pending":
        query = query.filter(
            ObligationOccurrence.paid.is_(False),
            or_(ObligationOccurrence.due_date.is_(None), ObligationOccurrence.due_date >= date.today()),
        )

    if is_blocked is not None:
        query = query.filter(ObligationOccurrence.is_blocked == is_blocked)
    if due_before is not None:
        query = query.filter(ObligationOccurrence.due_date <= due_before)
    if due_after is not None:
        query = query.filter(ObligationOccurrence.due_date >= due_after)

    if period or year is not None or month is not None:
        # Falls back to due_date's own month for rows whose `period` column
        # is unset (e.g. pre-dating this field) -- matches occurrence_dict's
        # display derivation, so filtering never misses a row the UI shows.
        period_expr = func.coalesce(ObligationOccurrence.period, func.to_char(ObligationOccurrence.due_date, "YYYY-MM"))
        if period:
            query = query.filter(period_expr == period)
        if year is not None:
            query = query.filter(period_expr.like(f"{year:04d}-%"))
        if month is not None:
            query = query.filter(period_expr.like(f"%-{month:02d}"))

    results = query.order_by(ObligationOccurrence.due_date.asc().nullslast()).all()
    totals = assignment_totals(db, [o.obligation_occurrence_id for o in results])
    data = [occurrence_dict(o, totals) for o in results]
    return {"count": len(data), "next": None, "previous": None, "results": data}


@router.get("/upcoming/")
def upcoming_occurrences(days: int = Query(30, ge=0, le=365), db: Session = Depends(get_db)):
    """Active, unpaid, unblocked occurrences due within ``days`` (overdue included)."""
    from datetime import timedelta

    horizon = date.today() + timedelta(days=days)
    results = (
        db.query(ObligationOccurrence)
        .options(*_load_options())
        .join(Obligation)
        .filter(
            Obligation.is_active.is_(True),
            ObligationOccurrence.paid.is_(False),
            ObligationOccurrence.is_blocked.is_(False),
            ObligationOccurrence.due_date.isnot(None),
            ObligationOccurrence.due_date <= horizon,
        )
        .order_by(ObligationOccurrence.due_date.asc())
        .all()
    )
    totals = assignment_totals(db, [o.obligation_occurrence_id for o in results])
    return {"days": days, "results": [occurrence_dict(o, totals) for o in results]}


@router.post("/bulk-delete/", response_model=ObligationOccurrenceBulkDeleteResponse)
def bulk_delete_occurrences(payload: ObligationOccurrenceIdsRequest, db: Session = Depends(get_db)):
    """Delete every occurrence in the list that's safe to delete (no assigned
    transactions); anything not safe is skipped rather than failing the whole
    batch. Each delete runs in its own SAVEPOINT so one problem row (assigned
    transactions, or an FK from another occurrence's duplicate_of pointer)
    can't abort the rest of the batch."""
    ids = list(dict.fromkeys(payload.occurrence_ids))  # de-dupe, keep order
    deleted = 0
    skipped_ids: list[int] = []
    for occ_id in ids:
        o = (
            db.query(ObligationOccurrence)
            .filter(ObligationOccurrence.obligation_occurrence_id == occ_id)
            .first()
        )
        if not o or o.assignment_links:
            skipped_ids.append(occ_id)
            continue
        try:
            with db.begin_nested():
                db.delete(o)
        except IntegrityError:
            skipped_ids.append(occ_id)
            continue
        deleted += 1

    db.commit()
    return {"deleted": deleted, "skipped": len(skipped_ids), "skipped_ids": skipped_ids}


@router.get("/{pk}/", response_model=ObligationOccurrenceResponse)
def get_occurrence(pk: int, db: Session = Depends(get_db)):
    return _dict_with_totals(db, _get_or_404(pk, db))


@router.put("/{pk}/", response_model=ObligationOccurrenceResponse)
def update_occurrence(pk: int, payload: ObligationOccurrenceUpdate, db: Session = Depends(get_db)):
    o = _get_or_404(pk, db)
    o.due_date = payload.due_date
    o.period = derive_period(payload.due_date, payload.period)
    o.estimated_amount = payload.estimated_amount
    o.note = payload.note
    o.paid_date = payload.paid_date
    db.commit()
    return _dict_with_totals(db, _get_or_404(pk, db))


@router.delete("/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_occurrence(pk: int, db: Session = Depends(get_db)):
    o = _get_or_404(pk, db)
    if o.assignment_links:
        raise HTTPException(
            status_code=400,
            detail=f"Occurrence has {len(o.assignment_links)} assigned transaction(s); unassign them first.",
        )
    db.delete(o)
    db.commit()
    return None


@router.post("/{pk}/unblock/", response_model=ObligationOccurrenceResponse)
def unblock_occurrence(pk: int, db: Session = Depends(get_db)):
    o = _get_or_404(pk, db)
    o.is_blocked = False
    db.commit()
    return _dict_with_totals(db, _get_or_404(pk, db))


@router.post("/{pk}/mark-paid/", response_model=ObligationOccurrenceResponse)
def mark_paid(pk: int, payload: ObligationOccurrenceMarkPaid, db: Session = Depends(get_db)):
    """Set paid=True. Fully independent of transaction assignment -- never
    touches assignment_links or Transaction, and works with zero assigned
    transactions (e.g. paid in cash)."""
    o = _get_or_404(pk, db)
    o.paid = True
    o.paid_at = payload.paid_at or datetime.now(timezone.utc)
    # Best guess absent a real one -- the due date, not "now" (marking paid
    # today doesn't mean it was actually paid today, e.g. backfilled/late
    # entries) -- always editable afterward via PUT.
    o.paid_date = payload.paid_date if payload.paid_date is not None else o.due_date

    if o.obligation.is_recurring:
        generate_next_occurrence(db, o)  # best-effort; silently no-ops if already generated

    db.commit()
    return _dict_with_totals(db, _get_or_404(pk, db))


@router.post("/{pk}/unmark-paid/", response_model=ObligationOccurrenceResponse)
def unmark_paid(pk: int, db: Session = Depends(get_db)):
    o = _get_or_404(pk, db)
    o.paid = False
    o.paid_at = None
    o.paid_date = None
    db.commit()
    return _dict_with_totals(db, _get_or_404(pk, db))


@router.get("/{pk}/assigned-transactions/", response_model=PaginatedResponse[TransactionResponse])
def assigned_transactions(pk: int, db: Session = Depends(get_db)):
    """The actual Transaction rows currently linked to this occurrence (not
    just the assigned_total/assigned_transaction_count aggregate) -- needed by
    the UI to list and individually unassign them."""
    o = _get_or_404(pk, db)
    tx_ids = [link.transaction_id for link in o.assignment_links]
    if not tx_ids:
        return {"count": 0, "next": None, "previous": None, "results": []}
    txs = db.query(Transaction).filter(Transaction.transaction_id.in_(tx_ids)).all()
    data = [get_tx_response_dict(t) for t in txs]
    return {"count": len(data), "next": None, "previous": None, "results": data}


@router.get("/{pk}/candidate-transactions/", response_model=PaginatedResponse[TransactionResponse])
def candidate_transactions(
    pk: int,
    window_days_before: int = Query(14, ge=0, le=365),
    window_days_after: int = Query(45, ge=0, le=365),
    unassigned_only: bool = Query(True),
    search: Optional[str] = Query(None, description="Substring match against comment or payee name"),
    min_amount: Optional[float] = Query(None, ge=0),
    max_amount: Optional[float] = Query(None, ge=0),
    ignore_direction: bool = Query(False, description="Include the 'wrong' sign too"),
    all_time: bool = Query(False, description="Ignore the due-date window entirely"),
    db: Session = Depends(get_db),
):
    o = _get_or_404(pk, db)
    candidates = find_candidate_transactions(
        db,
        o,
        window_days_before,
        window_days_after,
        unassigned_only=unassigned_only,
        search=search,
        min_amount=min_amount,
        max_amount=max_amount,
        ignore_direction=ignore_direction,
        all_time=all_time,
    )
    data = [get_tx_response_dict(t) for t in candidates]
    return {"count": len(data), "next": None, "previous": None, "results": data}


@router.get("/{pk}/suggest-matches/")
def suggest_matches_route(
    pk: int,
    window_days_before: int = Query(14, ge=0, le=365),
    window_days_after: int = Query(45, ge=0, le=365),
    max_combo_size: int = Query(4, ge=1, le=6),
    use_ai: bool = Query(True),
    db: Session = Depends(get_db),
):
    o = _get_or_404(pk, db)
    result = suggest_matches(
        db, o, window_days_before, window_days_after, max_combo_size=max_combo_size, use_ai=use_ai
    )
    result["occurrence"] = _dict_with_totals(db, o)
    return result


@router.post("/{pk}/assign-transactions/", response_model=ObligationOccurrenceResponse)
def assign_transactions(pk: int, payload: ObligationTransactionIdsRequest, db: Session = Depends(get_db)):
    o = _get_or_404(pk, db)
    ids = list(dict.fromkeys(payload.transaction_ids))  # de-dupe, keep order
    if not ids:
        return _dict_with_totals(db, o)

    txs = db.query(Transaction).filter(Transaction.transaction_id.in_(ids)).all()
    found_ids = {t.transaction_id for t in txs}
    missing = [i for i in ids if i not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Transaction(s) not found: {missing}")

    existing_links = (
        db.query(ObligationOccurrenceTransaction)
        .filter(ObligationOccurrenceTransaction.transaction_id.in_(ids))
        .all()
    )
    existing_by_tx = {link.transaction_id: link for link in existing_links}

    conflicts = [
        f"Transaction #{tx_id} is already assigned to occurrence #{link.obligation_occurrence_id}"
        for tx_id, link in existing_by_tx.items()
        if link.obligation_occurrence_id != pk
    ]
    if conflicts:
        raise HTTPException(status_code=400, detail="; ".join(conflicts))

    already_here = {tx_id for tx_id, link in existing_by_tx.items() if link.obligation_occurrence_id == pk}
    for tx_id in ids:
        if tx_id in already_here:
            continue
        db.add(ObligationOccurrenceTransaction(obligation_occurrence_id=pk, transaction_id=tx_id))

    db.commit()
    return _dict_with_totals(db, _get_or_404(pk, db))


@router.post("/{pk}/unassign-transactions/", response_model=ObligationOccurrenceResponse)
def unassign_transactions(pk: int, payload: ObligationTransactionIdsRequest, db: Session = Depends(get_db)):
    o = _get_or_404(pk, db)
    if payload.transaction_ids:
        db.query(ObligationOccurrenceTransaction).filter(
            ObligationOccurrenceTransaction.obligation_occurrence_id == pk,
            ObligationOccurrenceTransaction.transaction_id.in_(payload.transaction_ids),
        ).delete(synchronize_session=False)
        db.commit()
    return _dict_with_totals(db, _get_or_404(pk, db))
