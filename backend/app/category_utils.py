"""Shared category-alias resolution.

A category can be marked as an alias of another via ``merged_into_category_id``.
This mirrors payee merge (see app/payee_utils.py) and is intentionally
non-destructive: the alias row is kept forever so import rules/AI suggestions
can keep matching it by name, while new transactions are written against the
canonical category so reporting naturally rolls up. Existing transactions
that already reference an alias are left untouched. This replaced the
earlier destructive category merge, which deleted the source row and
rewrote all Transaction/ImportPlanRule rows referencing it.
"""

from __future__ import annotations

from app.models import Category

# Merges always collapse to a direct pointer at the canonical root (see
# merge_category), so chains should never exceed length 1 in practice — this
# cap is just a defensive guard against bad data, not an expected code path.
_MAX_CHAIN = 20


def resolve_canonical_category_id(db, category_id: int | None) -> int | None:
    """Follow ``merged_into_category_id`` pointers to the root canonical category id."""
    if category_id is None:
        return None
    current_id = category_id
    seen = set()
    for _ in range(_MAX_CHAIN):
        if current_id in seen:
            break  # defensive: never trust a cycle even though merge prevents one
        seen.add(current_id)
        category = db.query(Category).filter(Category.category_id == current_id).first()
        if category is None or category.merged_into_category_id is None:
            return current_id
        current_id = category.merged_into_category_id
    return current_id
