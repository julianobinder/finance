"""Shared payee-alias resolution.

A payee can be marked as an alias of another via ``merged_into_payee_id``.
Unlike category merge (which rewrites history and deletes the source), payee
merge is intentionally non-destructive: the alias row is kept forever so
imports/AI suggestions can keep matching it by name (e.g. "COEMI IMOB" and
"COEMI SERVICOS IMOBILIARIOS" are the same real-world payee under different
bank-statement spellings), while new transactions are written against the
canonical payee so reporting naturally rolls up. Existing transactions that
already reference an alias are left untouched.
"""

from __future__ import annotations

from app.models import Payee

# Merges always collapse to a direct pointer at the canonical root (see
# merge_payee), so chains should never exceed length 1 in practice — this cap
# is just a defensive guard against bad data, not an expected code path.
_MAX_CHAIN = 20


def resolve_canonical_payee_id(db, payee_id: int | None) -> int | None:
    """Follow ``merged_into_payee_id`` pointers to the root canonical payee id."""
    if payee_id is None:
        return None
    current_id = payee_id
    seen = set()
    for _ in range(_MAX_CHAIN):
        if current_id in seen:
            break  # defensive: never trust a cycle even though merge prevents one
        seen.add(current_id)
        payee = db.query(Payee).filter(Payee.payee_id == current_id).first()
        if payee is None or payee.merged_into_payee_id is None:
            return current_id
        current_id = payee.merged_into_payee_id
    return current_id
