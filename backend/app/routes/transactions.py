import math
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import (
    Account,
    Category,
    Currency,
    Payee,
    Status,
    Transaction,
    TransactionType,
)
from app.schemas import PaginatedResponse, TransactionCreate, TransactionResponse
from app.routes.transactions_helpers import (
    get_tx_response_dict,
    _create_splits,
    _create_transfer,
)

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("/lookup-data/")
def transaction_lookup_data(db: Session = Depends(get_db)):
    payees = db.query(Payee).all()
    categories = (
        db.query(Category)
        .filter(Category.is_hidden == False)
        .order_by(Category.name)
        .all()
    )
    accounts = db.query(Account).filter(Account.is_hidden == False).all()
    currencies = db.query(Currency).all()
    statuses = db.query(Status).all()

    # Reuse serialization formatting from subresources
    from app.routes.accounts import get_account_response_dict

    return {
        "payees": [
            {"payee_id": p.payee_id, "name": p.name, "comment": p.comment} for p in payees
        ],
        "categories": [
            {
                "category_id": c.category_id,
                "name": c.name,
                "parent_category_id": c.parent_category_id,
                "is_hidden": c.is_hidden,
            }
            for c in categories
        ],
        "accounts": [get_account_response_dict(a, db) for a in accounts],
        "currencies": [
            {
                "currency_id": c.currency_id,
                "name": c.name,
                "iso_code": c.iso_code,
                "symbol": c.symbol,
                "order": c.order,
            }
            for c in currencies
        ],
        "statuses": [{"status_id": s.status_id, "name": s.name} for s in statuses],
    }


@router.get("/categories/{category_id}/subcategories/")
def category_subcategories(category_id: int, db: Session = Depends(get_db)):
    subs = (
        db.query(Category)
        .filter(Category.parent_category_id == category_id, Category.is_hidden == False)
        .all()
    )
    return [
        {
            "category_id": c.category_id,
            "name": c.name,
            "parent_category_id": c.parent_category_id,
            "is_hidden": c.is_hidden,
        }
        for c in subs
    ]


@router.get("/", response_model=PaginatedResponse[TransactionResponse])
def list_transactions(
    account_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).options(
        joinedload(Transaction.transaction_type),
        joinedload(Transaction.account).joinedload(Account.currency),
        joinedload(Transaction.status),
        joinedload(Transaction.payee),
        joinedload(Transaction.category).joinedload(Category.parent),
        joinedload(Transaction.original_currency),
        joinedload(Transaction.transfer_transaction).joinedload(Transaction.account),
    )

    if account_id:
        query = query.filter(Transaction.account_id == account_id)

    query = query.order_by(Transaction.entry.desc())

    total_count = query.count()
    offset = (page - 1) * page_size
    txs = query.offset(offset).limit(page_size).all()

    results = [get_tx_response_dict(tx) for tx in txs]

    return {
        "count": total_count,
        "next": None,
        "previous": None,
        "results": results,
    }


def _create_transaction_in_db(payload: TransactionCreate, db: Session) -> Transaction:
    tx_data = payload.model_dump(
        exclude={
            "splits",
            "transaction_type_string",
            "to_account_id",
            "currency_rate",
            "destination_amount",
            "to_account_cash",
            "to_account_issue",
            "to_account_received",
            "to_account_refer_to",
            "to_account_due",
            "to_account_payment",
            # Exclude relationship/ID fields passed as raw properties
            "transaction_type_id",
            "account_id",
            "status_id",
            "payee_id",
            "category_id",
            "original_currency_id",
        }
    )

    # Resolve IDs
    tx_data["account_id"] = payload.account_id
    tx_data["payee_id"] = payload.payee_id
    tx_data["original_currency_id"] = payload.original_currency_id

    # Default Type mapping
    if not payload.transaction_type_id:
        type_mapping = {
            "withdrawal": ["Withdrawal", "Out", "Debit"],
            "deposit": ["Deposit", "In", "Credit"],
            "transfer": ["Transfer"],
        }
        names = type_mapping.get(payload.transaction_type_string, [])
        tx_type = None
        for name in names:
            tx_type = (
                db.query(TransactionType)
                .filter(TransactionType.name.ilike(name))
                .first()
            )
            if tx_type:
                break
        tx_data["transaction_type_id"] = (
            tx_type.transaction_type_id
            if tx_type
            else db.query(TransactionType).first().transaction_type_id
        )
    else:
        tx_data["transaction_type_id"] = payload.transaction_type_id

    # Default Status mapping
    if not payload.status_id:
        tx_data["status_id"] = db.query(Status).first().status_id
    else:
        tx_data["status_id"] = payload.status_id

    # Category mapping
    if payload.transaction_type_string == "transfer":
        tx_data["payee_id"] = None
        transfer_cat = db.query(Category).filter(Category.name.ilike("Transfer")).first()
        if not transfer_cat:
            transfer_cat = Category(name="Transfer", is_hidden=True)
            db.add(transfer_cat)
            db.flush()
        tx_data["category_id"] = transfer_cat.category_id
    else:
        tx_data["category_id"] = payload.category_id or db.query(Category).first().category_id

    # Amount polarity
    amount_val = abs(payload.amount)
    if payload.transaction_type_string in ["withdrawal", "transfer"]:
        tx_data["amount"] = -amount_val
    else:
        tx_data["amount"] = amount_val

    # Override category to Split if splits present
    if payload.splits:
        sum_splits = sum(abs(float(s.get("amount") or 0)) for s in payload.splits)
        if not math.isclose(sum_splits, abs(payload.amount), abs_tol=0.01):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The sum of split amounts must equal the transaction's total amount.",
            )
        split_cat = db.query(Category).filter(Category.name.ilike("Split")).first()
        if not split_cat:
            split_cat = Category(name="Split", is_hidden=True)
            db.add(split_cat)
            db.flush()
        tx_data["category_id"] = split_cat.category_id

    # Create transaction
    tx = Transaction(**tx_data)
    db.add(tx)
    db.flush()

    # Create splits
    if payload.splits:
        _create_splits(tx, payload.splits, db)

    # Create transfer
    if payload.transaction_type_string == "transfer" and payload.to_account_id:
        dates = {
            "cash": payload.to_account_cash,
            "issue": payload.to_account_issue,
            "received": payload.to_account_received,
            "refer_to": payload.to_account_refer_to,
            "due": payload.to_account_due,
            "payment": payload.to_account_payment,
        }
        to_acc = db.query(Account).filter(Account.account_id == payload.to_account_id).first()
        if to_acc and payload.currency_rate and tx.account.currency_id != to_acc.currency_id:
            tx.original_amount = abs(tx.amount)
            tx.original_currency_id = tx.account.currency_id
            db.flush()

        _create_transfer(
            tx,
            payload.to_account_id,
            payload.currency_rate,
            abs(tx.amount),
            payload.destination_amount,
            dates,
            db,
        )
    return tx


@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(payload: TransactionCreate, db: Session = Depends(get_db)):
    tx = _create_transaction_in_db(payload, db)
    db.commit()
    db.refresh(tx)

    # Load relations for serialization
    tx_loaded = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.transaction_type),
            joinedload(Transaction.account).joinedload(Account.currency),
            joinedload(Transaction.status),
            joinedload(Transaction.payee),
            joinedload(Transaction.category).joinedload(Category.parent),
            joinedload(Transaction.original_currency),
            joinedload(Transaction.transfer_transaction).joinedload(
                Transaction.account
            ),
        )
        .filter(Transaction.transaction_id == tx.transaction_id)
        .first()
    )

    return get_tx_response_dict(tx_loaded)


@router.post("/bulk/", response_model=List[TransactionResponse], status_code=status.HTTP_201_CREATED)
def create_transactions_bulk(payload: List[TransactionCreate], db: Session = Depends(get_db)):
    txs = []
    try:
        with db.begin_nested():
            for item in payload:
                tx = _create_transaction_in_db(item, db)
                txs.append(tx)
        db.commit()
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    # Load relations for serialization
    results = []
    for tx in txs:
        db.refresh(tx)
        tx_loaded = (
            db.query(Transaction)
            .options(
                joinedload(Transaction.transaction_type),
                joinedload(Transaction.account).joinedload(Account.currency),
                joinedload(Transaction.status),
                joinedload(Transaction.payee),
                joinedload(Transaction.category).joinedload(Category.parent),
                joinedload(Transaction.original_currency),
                joinedload(Transaction.transfer_transaction).joinedload(
                    Transaction.account
                ),
            )
            .filter(Transaction.transaction_id == tx.transaction_id)
            .first()
        )
        results.append(get_tx_response_dict(tx_loaded))
    return results


@router.get("/{pk}/", response_model=TransactionResponse)
def get_transaction(pk: int, db: Session = Depends(get_db)):
    tx = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.transaction_type),
            joinedload(Transaction.account).joinedload(Account.currency),
            joinedload(Transaction.status),
            joinedload(Transaction.payee),
            joinedload(Transaction.category).joinedload(Category.parent),
            joinedload(Transaction.original_currency),
            joinedload(Transaction.transfer_transaction).joinedload(
                Transaction.account
            ),
        )
        .filter(Transaction.transaction_id == pk)
        .first()
    )
    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )
    return get_tx_response_dict(tx)


@router.put("/{pk}/", response_model=TransactionResponse)
def update_transaction(
    pk: int, payload: TransactionCreate, db: Session = Depends(get_db)
):
    tx = db.query(Transaction).filter(Transaction.transaction_id == pk).first()
    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    # Prevent edit of Initial Balance
    if tx.category and tx.category.name == "Initial Balance":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Initial balance transactions can only be edited in the account form.",
        )

    # Update basic fields
    tx.comment = payload.comment
    tx.reference = payload.reference
    tx.issue = payload.issue
    tx.received = payload.received
    tx.refer_to = payload.refer_to
    tx.due = payload.due
    tx.payment = payload.payment
    tx.cash = payload.cash
    tx.rate = payload.rate
    tx.quantity = payload.quantity
    tx.asset_id = payload.asset_id

    # Handle polarity
    amount_val = abs(payload.amount)
    if payload.transaction_type_string == "deposit":
        tx.amount = amount_val
    elif payload.transaction_type_string == "withdrawal":
        tx.amount = -amount_val
    elif payload.transaction_type_string == "transfer":
        if tx.amount > 0:
            tx.amount = amount_val
        else:
            tx.amount = -amount_val

    # Break linked transfer if type changed
    if payload.transaction_type_string != "transfer" and tx.transfer_transaction_id:
        linked = (
            db.query(Transaction)
            .filter(Transaction.transaction_id == tx.transfer_transaction_id)
            .first()
        )
        tx.transfer_transaction_id = None
        db.flush()
        if linked:
            db.delete(linked)

    # Handle transfer editing
    if payload.transaction_type_string == "transfer" and payload.to_account_id:
        current_dest = None
        if tx.transfer_transaction:
            current_dest = tx.transfer_transaction.account_id

        dates = {
            "cash": payload.to_account_cash,
            "issue": payload.to_account_issue,
            "received": payload.to_account_received,
            "refer_to": payload.to_account_refer_to,
            "due": payload.to_account_due,
            "payment": payload.to_account_payment,
        }

        if current_dest != payload.to_account_id:
            # Delete old, create new
            if tx.transfer_transaction:
                db.delete(tx.transfer_transaction)
                tx.transfer_transaction_id = None
                db.flush()

            _create_transfer(
                tx,
                payload.to_account_id,
                payload.currency_rate,
                abs(tx.amount),
                payload.destination_amount,
                dates,
                db,
            )
        else:
            # Update existing
            if tx.transfer_transaction:
                dest = tx.transfer_transaction
                dest.comment = tx.comment or dest.comment
                dest.reference = tx.reference
                if payload.to_account_cash:
                    dest.cash = payload.to_account_cash
                if payload.to_account_issue:
                    dest.issue = payload.to_account_issue
                if payload.to_account_received:
                    dest.received = payload.to_account_received
                if payload.to_account_refer_to:
                    dest.refer_to = payload.to_account_refer_to
                if payload.to_account_due:
                    dest.due = payload.to_account_due
                if payload.to_account_payment:
                    dest.payment = payload.to_account_payment

                is_incoming = tx.amount > 0
                if payload.currency_rate and payload.destination_amount:
                    dest.amount = (
                        -payload.destination_amount
                        if is_incoming
                        else payload.destination_amount
                    )
                    dest.rate = payload.currency_rate
                    if tx.account_id != dest.account_id:
                        dest.original_amount = abs(tx.amount)
                        dest.original_currency_id = tx.account.currency_id
                else:
                    dest.amount = -tx.amount

    # Update category to Split if splits present
    if payload.splits:
        sum_splits = sum(abs(float(s.get("amount") or 0)) for s in payload.splits)
        if not math.isclose(sum_splits, abs(payload.amount), abs_tol=0.01):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The sum of split amounts must equal the transaction's total amount.",
            )
        split_cat = db.query(Category).filter(Category.name.ilike("Split")).first()
        if not split_cat:
            split_cat = Category(name="Split", is_hidden=True)
            db.add(split_cat)
            db.flush()
        tx.category_id = split_cat.category_id

        # Delete existing child splits
        db.query(Transaction).filter(
            Transaction.account_id == tx.account_id,
            Transaction.comment.like(f"{tx.comment} (Split)%"),
        ).delete()

        _create_splits(tx, payload.splits, db)

    db.commit()
    db.refresh(tx)

    tx_loaded = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.transaction_type),
            joinedload(Transaction.account).joinedload(Account.currency),
            joinedload(Transaction.status),
            joinedload(Transaction.payee),
            joinedload(Transaction.category).joinedload(Category.parent),
            joinedload(Transaction.original_currency),
            joinedload(Transaction.transfer_transaction).joinedload(
                Transaction.account
            ),
        )
        .filter(Transaction.transaction_id == pk)
        .first()
    )
    return get_tx_response_dict(tx_loaded)


@router.delete("/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(pk: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.transaction_id == pk).first()
    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    # Prevent deletion of Initial Balance
    if tx.category and tx.category.name == "Initial Balance":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Initial balance transactions can only be deleted in the account form.",
        )

    linked = tx.transfer_transaction

    db.delete(tx)
    db.flush()

    if linked:
        db.delete(linked)

    db.commit()
    return None
