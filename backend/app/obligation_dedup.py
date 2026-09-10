"""Duplicate detection for obligations — create-but-block, never reject.

A duplicate obligation/occurrence is still inserted, but flagged (`is_blocked`)
so it doesn't clutter the default view; the user reviews and unblocks it
manually. `duplicate_of_*_id` is diagnostic metadata, not a live redirect
(unlike the Category/Payee merge alias pattern), so unblocking never clears it.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.category_utils import resolve_canonical_category_id
from app.models import Obligation, ObligationOccurrence


def _norm(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


def detect_duplicate_obligation(
    db: Session, name: str, category_id: Optional[int], exclude_id: Optional[int] = None
) -> Optional[Obligation]:
    """Existing unblocked obligation with the same normalized name in the same
    canonical category (or same "no category" bucket when category_id is None)."""
    canonical_category_id = resolve_canonical_category_id(db, category_id) if category_id else None
    norm_name = _norm(name)
    if not norm_name:
        return None

    q = db.query(Obligation).filter(
        Obligation.is_blocked.is_(False),
        func.lower(func.trim(Obligation.name)) == norm_name,
    )
    q = (
        q.filter(Obligation.category_id == canonical_category_id)
        if canonical_category_id is not None
        else q.filter(Obligation.category_id.is_(None))
    )
    if exclude_id:
        q = q.filter(Obligation.obligation_id != exclude_id)
    return q.first()


def _period_bounds(due_date: date, recurrence: Optional[str]) -> tuple[date, date]:
    if recurrence == "weekly":
        start = due_date - timedelta(days=due_date.weekday())
        return start, start + timedelta(days=6)
    if recurrence == "yearly":
        return date(due_date.year, 1, 1), date(due_date.year, 12, 31)
    if recurrence == "monthly":
        last_day = calendar.monthrange(due_date.year, due_date.month)[1]
        return date(due_date.year, due_date.month, 1), date(due_date.year, due_date.month, last_day)
    # One-off: only an exact same-day match counts as a duplicate.
    return due_date, due_date


def detect_duplicate_occurrence(
    db: Session,
    obligation_id: int,
    due_date: Optional[date],
    recurrence: Optional[str],
    exclude_id: Optional[int] = None,
) -> Optional[ObligationOccurrence]:
    """Existing unblocked occurrence of the same obligation due in the same period."""
    if due_date is None:
        return None
    period_start, period_end = _period_bounds(due_date, recurrence)
    q = db.query(ObligationOccurrence).filter(
        ObligationOccurrence.obligation_id == obligation_id,
        ObligationOccurrence.is_blocked.is_(False),
        ObligationOccurrence.due_date >= period_start,
        ObligationOccurrence.due_date <= period_end,
    )
    if exclude_id:
        q = q.filter(ObligationOccurrence.obligation_occurrence_id != exclude_id)
    return q.first()
