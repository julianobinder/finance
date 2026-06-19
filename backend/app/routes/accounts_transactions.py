from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Account, Category, Transaction

router = APIRouter()


@router.get("/{pk}/transactions/")
def get_account_transactions(
    pk: int,
    date_filter: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
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

    if date_filter:
        today = datetime.utcnow().date()
        if date_filter == "today":
            query = query.filter(
                or_(
                    Transaction.cash == today,
                    db.and_(Transaction.cash.is_(None), Transaction.entry >= today),
                )
            )
        elif date_filter == "last_30_days":
            from datetime import timedelta

            start_date = today - timedelta(days=30)
            query = query.filter(
                or_(
                    Transaction.cash >= start_date,
                    db.and_(
                        Transaction.cash.is_(None), Transaction.entry >= start_date
                    ),
                )
            )
        elif date_filter == "this_month":
            start_date = today.replace(day=1)
            query = query.filter(
                or_(
                    Transaction.cash >= start_date,
                    db.and_(
                        Transaction.cash.is_(None), Transaction.entry >= start_date
                    ),
                )
            )
        elif date_filter == "last_12_months":
            from datetime import timedelta

            start_date = today - timedelta(days=365)
            query = query.filter(
                or_(
                    Transaction.cash >= start_date,
                    db.and_(
                        Transaction.cash.is_(None), Transaction.entry >= start_date
                    ),
                )
            )

    if start_date:
        query = query.filter(Transaction.cash >= start_date)
    if end_date:
        query = query.filter(Transaction.cash <= end_date)

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
