"""Transaction-matching assistance for obligations.

Finding which existing transaction(s) likely cover an obligation occurrence is
primarily a deterministic search problem (exact subset-sum over a bounded
candidate pool), not something to hand to an LLM -- language models are
unreliable at exact arithmetic over many candidates. An LLM is only used
afterwards, optionally, to add a short natural-language explanation/ranking
using signals (payee/comment similarity) beyond amount math -- it is never
asked to compute sums itself.
"""

from __future__ import annotations

import json
from datetime import timedelta
from itertools import combinations
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.models import Obligation, ObligationOccurrence, ObligationOccurrenceTransaction, Payee, Transaction

_AMOUNT_TOLERANCE = 0.01
_MAX_CANDIDATES = 40
_MAX_SEARCH_CANDIDATES = 150
_MAX_COMBO_POOL = 20
_AUTO_ASSIGN_TOLERANCE = 0.01


def find_candidate_transactions(
    db: Session,
    occurrence: ObligationOccurrence,
    window_days_before: int = 14,
    window_days_after: int = 45,
    unassigned_only: bool = True,
    search: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    ignore_direction: bool = False,
    all_time: bool = False,
) -> list[Transaction]:
    """Transactions in a date window around the occurrence's due date, softly
    filtered by the obligation's category/payee (only when that doesn't wipe
    out the pool -- a bill's real transaction often isn't tagged identically).

    ``search``/``min_amount``/``max_amount``/``ignore_direction``/``all_time``
    are an escape hatch for "the real transaction isn't in the suggested
    list" -- any of them being set puts this in explicit search mode, which
    widens the date window (unless overridden) and skips the soft category/
    payee narrowing entirely (that narrowing exists to sharpen the default
    suggestion list, not to fight a search the user is deliberately widening).
    """
    obligation = occurrence.obligation
    due = occurrence.due_date
    searching = bool(search) or min_amount is not None or max_amount is not None or ignore_direction or all_time

    query = db.query(Transaction).options(
        joinedload(Transaction.category),
        joinedload(Transaction.payee),
        joinedload(Transaction.account),
    )

    if unassigned_only:
        assigned_ids = db.query(ObligationOccurrenceTransaction.transaction_id)
        query = query.filter(~Transaction.transaction_id.in_(assigned_ids))

    # Hard filter (unlike the soft category/payee narrowing below): a
    # receivable (income) can only ever be covered by an incoming/positive
    # transaction, and a payable (bill) only by an outgoing/negative one --
    # this isn't a preference to fall back from, it's what the numbers mean.
    # ``ignore_direction`` is an explicit manual override for the rare case
    # the obligation's own direction was set wrong.
    if obligation is not None and not ignore_direction:
        if obligation.direction == "receivable":
            query = query.filter(Transaction.amount > 0)
        else:
            query = query.filter(Transaction.amount < 0)

    if due is not None and not all_time:
        start = due - timedelta(days=window_days_before)
        end = due + timedelta(days=window_days_after)
        query = query.filter(
            (
                (Transaction.cash.isnot(None))
                & (Transaction.cash >= start)
                & (Transaction.cash <= end)
            )
            | (
                (Transaction.cash.is_(None))
                & (Transaction.entry >= start)
                & (Transaction.entry <= end)
            )
        )

    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(Transaction.comment.ilike(like), Transaction.payee.has(Payee.name.ilike(like)))
        )
    if min_amount is not None:
        query = query.filter(func.abs(Transaction.amount) >= min_amount)
    if max_amount is not None:
        query = query.filter(func.abs(Transaction.amount) <= max_amount)

    candidates = query.order_by(Transaction.cash.desc().nullslast(), Transaction.entry.desc()).all()

    if not searching:
        if obligation and obligation.category_id:
            narrowed = [t for t in candidates if t.category_id == obligation.category_id]
            if narrowed:
                candidates = narrowed
        if obligation and obligation.payee_id:
            narrowed = [t for t in candidates if t.payee_id == obligation.payee_id]
            if narrowed:
                candidates = narrowed

    # Shortlist by proximity to the obligation's due date -- a bill is far
    # more likely paid within a few days of it than merely "most recent";
    # without this, an unrelated transaction from the far edge of the window
    # could crowd out the actual match at the top of a truncated list.
    if due is not None:
        candidates.sort(key=lambda t: abs((t.date - due).days) if t.date else 10**6)

    return candidates[: _MAX_SEARCH_CANDIDATES if searching else _MAX_CANDIDATES]


def find_matching_subsets(
    candidates: list[Transaction],
    target_amount: Optional[float],
    tolerance: float = _AMOUNT_TOLERANCE,
    max_combo_size: int = 4,
) -> list[dict]:
    """Exact bounded subset-sum search over ``candidates``: which single
    transaction or combination sums closest to ``target_amount``. Returns
    ``{transaction_ids, total, difference}`` sorted by closest/smallest combo
    first, capped at 10 results. Solves e.g. a 1500 bill paid via 100+1000+400."""
    if target_amount is None or not candidates:
        return []

    pool = [(t.transaction_id, abs(t.amount)) for t in candidates[:_MAX_COMBO_POOL]]
    max_diff = max(tolerance, target_amount * 0.15)
    results = []
    for size in range(1, min(max_combo_size, len(pool)) + 1):
        for combo in combinations(pool, size):
            total = sum(c[1] for c in combo)
            diff = abs(total - target_amount)
            if diff <= max_diff:
                ids = sorted(c[0] for c in combo)
                results.append({"transaction_ids": ids, "total": round(total, 2), "difference": round(diff, 2)})

    results.sort(key=lambda r: (r["difference"], len(r["transaction_ids"])))
    return results[:10]


def _tx_brief(t: Transaction) -> dict:
    return {
        "transaction_id": t.transaction_id,
        "date": t.date.isoformat() if t.date else None,
        "amount": t.amount,
        "comment": t.comment,
        "payee_name": t.payee.name if t.payee else None,
        "category_name": t.category.name if t.category else None,
        "account_name": t.account.name if t.account else None,
    }


def _annotate(result: dict, by_id: dict[int, Transaction]) -> dict:
    return {**result, "transactions": [_tx_brief(by_id[i]) for i in result["transaction_ids"] if i in by_id]}


def _explain_with_ai(occurrence: ObligationOccurrence, candidates: list[Transaction], subsets: list[dict]) -> Optional[str]:
    from app.ai_categorize import call_llm_text

    obligation = occurrence.obligation
    target = occurrence.estimated_amount or (obligation.estimated_amount if obligation else None)
    context = (
        f"Obligation: {obligation.name if obligation else '?'}, estimated amount: {target}, "
        f"due {occurrence.due_date}."
    )
    payload = {
        "candidates": [_tx_brief(t) for t in candidates[:_MAX_COMBO_POOL]],
        "computed_matches": subsets[:5],
    }
    prompt = (
        "The candidate transactions and amount-matching combinations below were computed "
        "deterministically (exact sums, already correct). In 1-2 sentences, say which one "
        "you'd pick as the real match and why, using payee/description similarity as a "
        "tiebreaker between equally-close amount matches. Do not recompute or second-guess "
        "the sums.\n" + json.dumps(payload, ensure_ascii=False, default=str)
    )
    return call_llm_text(context, prompt, max_tokens=300).strip()


def suggest_matches(
    db: Session,
    occurrence: ObligationOccurrence,
    window_days_before: int = 14,
    window_days_after: int = 45,
    max_combo_size: int = 4,
    use_ai: bool = True,
) -> dict:
    candidates = find_candidate_transactions(db, occurrence, window_days_before, window_days_after)
    target = occurrence.estimated_amount or (occurrence.obligation.estimated_amount if occurrence.obligation else None)

    subsets = find_matching_subsets(candidates, target, max_combo_size=max_combo_size)
    single = [r for r in subsets if len(r["transaction_ids"]) == 1]
    combos = [r for r in subsets if len(r["transaction_ids"]) > 1]

    ai_explanation = None
    if use_ai and subsets:
        from app.ai_categorize import AICategorizationError, resolve_provider

        if resolve_provider() is not None:
            try:
                ai_explanation = _explain_with_ai(occurrence, candidates, subsets)
            except AICategorizationError:
                ai_explanation = None

    by_id = {t.transaction_id: t for t in candidates}
    return {
        "candidates": [_tx_brief(t) for t in candidates],
        "suggested_single": [_annotate(r, by_id) for r in single],
        "suggested_combinations": [_annotate(r, by_id) for r in combos],
        "ai_explanation": ai_explanation,
    }


def auto_match_occurrences(db: Session, obligation_ids: list[int]) -> dict:
    """Best-effort, non-destructive auto-assignment run right after an import:
    for each newly created (unblocked) occurrence, assign a transaction only
    when the deterministic search finds exactly one match -- single
    transaction or exact combination -- within a cent of the target, with no
    other equally-good candidate. Anything softer (multiple candidates, a
    combo tied with a single, or no due_date to bound the search window) is
    left alone for manual review via the existing suggest-matches UI, rather
    than guessing.

    Candidates are already sign-filtered by the obligation's direction (see
    find_candidate_transactions) -- a receivable only ever considers incoming
    transactions, a payable only outgoing -- so the abs()-based sum matching
    here (find_matching_subsets) never has to guess about polarity.
    """
    if not obligation_ids:
        return {"considered": 0, "matched": 0}

    occurrences = (
        db.query(ObligationOccurrence)
        .join(Obligation)
        .filter(
            ObligationOccurrence.obligation_id.in_(obligation_ids),
            ObligationOccurrence.is_blocked.is_(False),
            Obligation.is_blocked.is_(False),
            ObligationOccurrence.due_date.isnot(None),
        )
        .all()
    )

    considered = matched = 0
    for occ in occurrences:
        considered += 1
        candidates = find_candidate_transactions(db, occ)
        target = occ.estimated_amount or (occ.obligation.estimated_amount if occ.obligation else None)
        subsets = find_matching_subsets(candidates, target)
        exact = [s for s in subsets if s["difference"] <= _AUTO_ASSIGN_TOLERANCE]
        if len(exact) != 1:
            continue  # none, or ambiguous -- leave for manual review

        for tx_id in exact[0]["transaction_ids"]:
            db.add(
                ObligationOccurrenceTransaction(
                    obligation_occurrence_id=occ.obligation_occurrence_id, transaction_id=tx_id
                )
            )
        # Flush (not just add) so the next occurrence's unassigned-only
        # candidate search -- run against this same uncommitted session --
        # doesn't re-offer a transaction just claimed by this one.
        db.flush()
        matched += 1

    if matched:
        db.commit()
    return {"considered": considered, "matched": matched}
