"""Shared response-shaping and recurrence-advancement helpers for obligations.

Split out from the two route modules (obligations.py / obligation_occurrences.py)
so both can share this logic without importing each other.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Obligation,
    ObligationGroup,
    ObligationOccurrence,
    ObligationOccurrenceTransaction,
    Transaction,
)
from app.obligation_dedup import detect_duplicate_occurrence


def derive_period(due_date: Optional[date], explicit: Optional[str] = None) -> Optional[str]:
    """"YYYY-MM" bucket for an occurrence: the explicit value if given, else
    derived from due_date, else None (an occurrence can have neither, e.g. a
    one-off with no date yet)."""
    if explicit:
        return explicit
    return due_date.strftime("%Y-%m") if due_date else None


def assignment_totals(db: Session, occurrence_ids: list[int]) -> dict[int, tuple[float, int]]:
    """Sum of assigned transactions' absolute amounts + count, per occurrence."""
    if not occurrence_ids:
        return {}
    rows = (
        db.query(
            ObligationOccurrenceTransaction.obligation_occurrence_id,
            func.coalesce(func.sum(func.abs(Transaction.amount)), 0.0),
            func.count(ObligationOccurrenceTransaction.id),
        )
        .join(Transaction, Transaction.transaction_id == ObligationOccurrenceTransaction.transaction_id)
        .filter(ObligationOccurrenceTransaction.obligation_occurrence_id.in_(occurrence_ids))
        .group_by(ObligationOccurrenceTransaction.obligation_occurrence_id)
        .all()
    )
    return {occ_id: (float(total), count) for occ_id, total, count in rows}


def occurrence_dict(o: ObligationOccurrence, totals: Optional[dict[int, tuple[float, int]]] = None) -> dict:
    total, count = (totals or {}).get(o.obligation_occurrence_id, (0.0, 0))
    obligation = o.obligation
    return {
        "obligation_occurrence_id": o.obligation_occurrence_id,
        "obligation_id": o.obligation_id,
        "obligation_name": obligation.name if obligation else "",
        "due_date": o.due_date,
        "period": derive_period(o.due_date, o.period),
        "estimated_amount": (
            o.estimated_amount if o.estimated_amount is not None
            else (obligation.estimated_amount if obligation else None)
        ),
        "paid": o.paid,
        "paid_at": o.paid_at,
        "paid_date": o.paid_date,
        "note": o.note,
        "is_blocked": o.is_blocked,
        "blocked_reason": o.blocked_reason,
        "duplicate_of_occurrence_id": o.duplicate_of_occurrence_id,
        "source": o.source,
        "created_at": o.created_at,
        "assigned_total": total,
        "assigned_transaction_count": count,
        "category_id": obligation.category_id if obligation else None,
        "category_name": obligation.category.name if obligation and obligation.category else None,
        "payee_id": obligation.payee_id if obligation else None,
        "payee_name": obligation.payee.name if obligation and obligation.payee else None,
        "direction": obligation.direction if obligation else "payable",
    }


def obligation_dict(
    ob: Obligation,
    include_occurrences: bool = False,
    occurrence_totals: Optional[dict[int, tuple[float, int]]] = None,
) -> dict:
    occurrences = sorted(ob.occurrences, key=lambda o: (o.due_date is None, o.due_date))
    open_occurrences = [o for o in occurrences if not o.paid and not o.is_blocked]
    next_due = next((o.due_date for o in open_occurrences if o.due_date), None)
    result = {
        "obligation_id": ob.obligation_id,
        "name": ob.name,
        "category_id": ob.category_id,
        "category_name": ob.category.name if ob.category else None,
        "payee_id": ob.payee_id,
        "payee_name": ob.payee.name if ob.payee else None,
        "obligation_group_id": ob.obligation_group_id,
        "obligation_group_name": ob.group.name if ob.group else None,
        "is_recurring": ob.is_recurring,
        "recurrence": ob.recurrence,
        "estimated_amount": ob.estimated_amount,
        "direction": ob.direction,
        "note": ob.note,
        "is_active": ob.is_active,
        "is_blocked": ob.is_blocked,
        "blocked_reason": ob.blocked_reason,
        "duplicate_of_obligation_id": ob.duplicate_of_obligation_id,
        "duplicate_of_obligation_name": ob.duplicate_of.name if ob.duplicate_of else None,
        "source": ob.source,
        "created_at": ob.created_at,
        "occurrence_count": len(occurrences),
        "open_occurrence_count": len(open_occurrences),
        "next_due_date": next_due,
        "occurrences": None,
    }
    if include_occurrences:
        result["occurrences"] = [occurrence_dict(o, occurrence_totals) for o in occurrences]
    return result


def group_dict(g: ObligationGroup, obligation_count: int = 0) -> dict:
    return {
        "obligation_group_id": g.obligation_group_id,
        "name": g.name,
        "category_id": g.category_id,
        "category_name": g.category.name if g.category else None,
        "direction": g.direction,
        "recurrence": g.recurrence,
        "expected_day_of_month": g.expected_day_of_month,
        "expected_weekday": g.expected_weekday,
        "created_at": g.created_at,
        "obligation_count": obligation_count,
    }


def advance_due_date(current: date, recurrence: str) -> date:
    """Return the next due date for a recurring schedule."""
    if recurrence == "weekly":
        return current + timedelta(days=7)
    if recurrence == "yearly":
        try:
            return current.replace(year=current.year + 1)
        except ValueError:  # Feb 29 -> Feb 28
            return current.replace(year=current.year + 1, day=28)
    # monthly (default for any other recurring value)
    month = current.month + 1
    year = current.year + (1 if month > 12 else 0)
    month = month - 12 if month > 12 else month
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(current.day, last_day))


def generate_next_occurrence(
    db: Session, occurrence: ObligationOccurrence
) -> tuple[Optional[ObligationOccurrence], Optional[str]]:
    """Create the next occurrence for a recurring obligation, if missing.

    Returns ``(new_occurrence, None)`` on success, or ``(None, reason)`` when
    nothing was created (not recurring, no due date to advance from, or a
    future occurrence already exists -- internal idempotency, never flagged
    as a blocked duplicate since it isn't a user-authored row).
    """
    obligation = occurrence.obligation
    if not obligation.is_recurring or not obligation.recurrence:
        return None, "Obligation is not recurring"
    if occurrence.due_date is None:
        return None, "Occurrence has no due date to advance from"

    next_due = advance_due_date(occurrence.due_date, obligation.recurrence)

    already_exists = (
        db.query(ObligationOccurrence)
        .filter(
            ObligationOccurrence.obligation_id == obligation.obligation_id,
            ObligationOccurrence.due_date >= next_due,
        )
        .first()
    )
    if already_exists:
        return None, "A future occurrence already exists"

    if detect_duplicate_occurrence(db, obligation.obligation_id, next_due, obligation.recurrence):
        return None, "Next occurrence already exists for that period"

    nxt = ObligationOccurrence(
        obligation_id=obligation.obligation_id,
        due_date=next_due,
        period=derive_period(next_due),
        estimated_amount=occurrence.estimated_amount,
        paid=False,
        note=occurrence.note,
        source="generated",
    )
    db.add(nxt)
    db.flush()
    return nxt, None
