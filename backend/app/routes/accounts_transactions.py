from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload
from app.category_utils import resolve_canonical_category_id
from app.database import get_db
from app.models import Account, Category, Payee, Transaction
from app.payee_utils import resolve_canonical_payee_id

router = APIRouter()


@router.get("/{pk}/transactions/")
def get_account_transactions(
    pk: int,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    min_amount: Optional[float] = Query(None, description="Absolute value lower bound"),
    max_amount: Optional[float] = Query(None, description="Absolute value upper bound"),
    comment: Optional[str] = Query(None, description="Substring match, case-insensitive"),
    payee_id: Optional[int] = Query(None, description="Matches this payee and any of its aliases"),
    category_id: Optional[int] = Query(None, description="Matches this category and any of its aliases"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1),
    db: Session = Depends(get_db),
):
    account = db.query(Account).filter(Account.account_id == pk).first()
    if not account:
        raise HTTPException(
            status_code=404, detail="Account not found"
        )

    # 1. Fetch ALL transactions for running balance computation
    all_txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.category))
        .filter(Transaction.account_id == pk)
        .all()
    )

    def get_tx_key(t):
        d = t.cash or t.payment or t.due or (t.entry.date() if t.entry else None)
        return (d or date(1970, 1, 1), t.transaction_id)

    all_txs.sort(key=get_tx_key)

    running_balances = {}
    running_sum = 0.0
    for t in all_txs:
        is_split = t.category.name == "Split" if t.category else False
        if not is_split:
            running_sum = round(running_sum + t.amount, 2)
        running_balances[t.transaction_id] = running_sum

    # 2. Filter query based on parameters
    query = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.payee),
            joinedload(Transaction.category).joinedload(Category.parent),
            joinedload(Transaction.transaction_type),
            joinedload(Transaction.status),
            joinedload(Transaction.original_currency),
            joinedload(Transaction.transfer_transaction).joinedload(
                Transaction.account
            ),
        )
        .filter(Transaction.account_id == pk)
    )

    # Effective date is cash-basis (Transaction.cash) when set, else falls
    # back to the entry date — mirrors the fallback get_tx_key() above uses
    # for the running balance sort.
    if start_date:
        query = query.filter(
            or_(
                Transaction.cash >= start_date,
                and_(Transaction.cash.is_(None), Transaction.entry >= start_date),
            )
        )
    if end_date:
        query = query.filter(
            or_(
                Transaction.cash <= end_date,
                and_(Transaction.cash.is_(None), Transaction.entry <= end_date),
            )
        )

    if min_amount is not None:
        query = query.filter(func.abs(Transaction.amount) >= min_amount)
    if max_amount is not None:
        query = query.filter(func.abs(Transaction.amount) <= max_amount)

    if comment:
        query = query.filter(Transaction.comment.ilike(f"%{comment}%"))

    # Payee/category merge is non-destructive (see payee_utils.py /
    # category_utils.py) — a transaction may still reference an old alias
    # id even after it's been merged into a canonical one, so filtering by
    # either the canonical or an alias must match rows using any of them.
    if payee_id:
        root_id = resolve_canonical_payee_id(db, payee_id)
        alias_ids = [
            row[0]
            for row in db.query(Payee.payee_id).filter(Payee.merged_into_payee_id == root_id).all()
        ]
        query = query.filter(Transaction.payee_id.in_([root_id, *alias_ids]))

    if category_id:
        root_id = resolve_canonical_category_id(db, category_id)
        selected = db.query(Category).filter(Category.category_id == root_id).first()

        match_ids = {root_id}
        match_ids.update(
            row[0]
            for row in db.query(Category.category_id)
            .filter(Category.merged_into_category_id == root_id)
            .all()
        )

        # A top-level category has no transactions of its own in practice —
        # everything gets tagged to one of its subcategories — so picking
        # "Bills" must roll up every "Bills: X" subcategory (and each of
        # their aliases) too, not just rows tagged to "Bills" directly.
        if selected and selected.parent_category_id is None:
            sub_ids = [
                row[0]
                for row in db.query(Category.category_id)
                .filter(Category.parent_category_id == root_id)
                .all()
            ]
            match_ids.update(sub_ids)
            if sub_ids:
                match_ids.update(
                    row[0]
                    for row in db.query(Category.category_id)
                    .filter(Category.merged_into_category_id.in_(sub_ids))
                    .all()
                )

        query = query.filter(Transaction.category_id.in_(match_ids))

    # Order newest first
    query = query.order_by(Transaction.cash.desc(), Transaction.entry.desc())

    total_count = query.count()
    offset = (page - 1) * page_size
    transactions = query.offset(offset).limit(page_size).all()

    results = []
    for transaction in transactions:
        tx_data = {
            "transaction_id": transaction.transaction_id,
            "entry": transaction.entry.isoformat() if transaction.entry else None,
            "issue": (
                transaction.issue.isoformat() if transaction.issue else None
            ),
            "date": transaction.date.isoformat() if transaction.date else None,
            "amount": transaction.amount,
            "comment": transaction.comment,
            "reference": transaction.reference,
            "payee_id": transaction.payee_id,
            "payee_name": transaction.payee.name if transaction.payee else None,
            "category_id": (
                transaction.category.parent.category_id
                if transaction.category and transaction.category.parent
                else (
                    transaction.category.category_id
                    if transaction.category
                    else None
                )
            ),
            "category_name": (
                transaction.category.parent.name
                if transaction.category and transaction.category.parent
                else (
                    transaction.category.name if transaction.category else None
                )
            ),
            "subcategory_id": (
                transaction.category.category_id
                if transaction.category and transaction.category.parent
                else None
            ),
            "subcategory_name": (
                transaction.category.name
                if transaction.category and transaction.category.parent
                else None
            ),
            "transaction_type_id": transaction.transaction_type_id,
            "transaction_type_name": (
                transaction.transaction_type.name
                if transaction.transaction_type
                else None
            ),
            "status_id": transaction.status_id,
            "status_name": (
                transaction.status.name if transaction.status else None
            ),
            "original_amount": transaction.original_amount,
            "original_currency_id": transaction.original_currency_id,
            "original_currency_code": transaction.original_currency.iso_code if transaction.original_currency else None,
            "original_currency_symbol": transaction.original_currency.symbol if transaction.original_currency else None,
            "transfer_transaction_id": None,
            "to_account_id": None,
            "to_account_name": None,
            "cash": transaction.cash.isoformat() if transaction.cash else None,
            "payment": (
                transaction.payment.isoformat() if transaction.payment else None
            ),
            "due": transaction.due.isoformat() if transaction.due else None,
            "received": (
                transaction.received.isoformat() if transaction.received else None
            ),
            "refer_to": (
                transaction.refer_to.isoformat() if transaction.refer_to else None
            ),
            "is_split": (
                transaction.category.name == "Split"
                if transaction.category
                else False
            ),
            "balance": running_balances.get(transaction.transaction_id, 0.0),
        }

        # Handle transfer references
        if transaction.transfer_transaction:
            tx_data[
                "transfer_transaction_id"
            ] = transaction.transfer_transaction.transaction_id
            if transaction.transfer_transaction.account:
                tx_data[
                    "to_account_id"
                ] = transaction.transfer_transaction.account.account_id
                tx_data[
                    "to_account_name"
                ] = transaction.transfer_transaction.account.full_name()

        results.append(tx_data)

    import math

    return {
        "results": results,
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total_count / page_size) if page_size else 1,
    }
