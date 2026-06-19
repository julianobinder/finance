from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import (
    Account,
    AccountGroupAccount,
    Category,
    Status,
    Transaction,
    TransactionType,
)
from app.schemas import AccountCreate, AccountResponse, PaginatedResponse

router = APIRouter(prefix="/accounts", tags=["Accounts"])


def get_account_response_dict(account: Account, session: Session) -> dict:
    """Helper to convert Account model with relations into the expected frontend dictionary shape"""
    groups_display = [
        {
            "account_group_id": g.account_group_id,
            "name": g.name,
            "is_hidden": g.is_hidden,
            "order": g.order,
        }
        for g in account.groups
    ]
    return {
        "account_id": account.account_id,
        "name": account.name,
        "titular_id": account.titular_id,
        "titular_name": account.titular.name if account.titular else "",
        "account_holder_id": account.account_holder_id,
        "account_holder_name": (
            account.account_holder.name if account.account_holder else None
        ),
        "accountholder_name": (
            account.account_holder.name if account.account_holder else None
        ),
        "sort_code": account.sort_code,
        "number": account.number,
        "branch": account.branch,
        "currency_id": account.currency_id,
        "currency_name": account.currency.name if account.currency else "",
        "currency_symbol": account.currency.symbol if account.currency else "",
        "currency_iso_code": account.currency.iso_code if account.currency else "",
        "currency_string": str(account.currency) if account.currency else "",
        "is_closed": account.is_closed,
        "entry": account.entry,
        "comment": account.comment,
        "is_hidden": account.is_hidden,
        "account_type_id": account.account_type_id,
        "account_type_name": (
            account.account_type.name if account.account_type else ""
        ),
        "accounttype_name": (
            account.account_type.name if account.account_type else ""
        ),
        "groups_display": groups_display,
        "balance": account.get_balance(session),
        "is_active": account.is_active,
        "string_name": str(account),
        "full_name": account.full_name(),
        "initial_balance": account.initial_balance(session),
        "order": account.order,
    }


@router.get("/", response_model=PaginatedResponse[AccountResponse])
def list_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Account)
        .options(
            joinedload(Account.titular),
            joinedload(Account.account_holder),
            joinedload(Account.currency),
            joinedload(Account.account_type),
            joinedload(Account.groups),
        )
        .order_by(Account.order, Account.name)
    )

    total_count = query.count()
    offset = (page - 1) * page_size
    accounts = query.offset(offset).limit(page_size).all()

    results = [get_account_response_dict(acc, db) for acc in accounts]

    return {
        "count": total_count,
        "next": None,
        "previous": None,
        "results": results,
    }


@router.post("/", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(payload: AccountCreate, db: Session = Depends(get_db)):
    account_data = payload.model_dump(exclude={"groups", "initial_balance"})

    # Map fields
    account_data["titular_id"] = payload.titular_id
    account_data["account_holder_id"] = payload.account_holder_id
    account_data["currency_id"] = payload.currency_id
    account_data["account_type_id"] = payload.account_type_id

    # Delete mapped keys to avoid duplicate parameter errors
    account_data.pop("titular", None)
    account_data.pop("accountholder", None)
    account_data.pop("currency", None)
    account_data.pop("accounttype", None)

    account = Account(**account_data)

    db.add(account)
    db.flush()  # Fetch generated account_id

    # Handle groups
    if payload.groups:
        for group in payload.groups:
            link = AccountGroupAccount(
                account_id=account.account_id,
                account_group_id=group["account_group_id"],
            )
            db.add(link)

    category = db.query(Category).filter(Category.name == "Initial Balance").first()
    if not category:
        category = Category(name="Initial Balance", is_hidden=True)
        db.add(category)
        db.flush()

    status_obj = db.query(Status).filter(Status.status_id == 2).first()
    if not status_obj:
        status_obj = db.query(Status).first()
    if not status_obj:
        status_obj = Status(status_id=2, name="Clear")
        db.add(status_obj)
        db.flush()

    tx_type = db.query(TransactionType).filter(TransactionType.code == "DEP").first()
    if not tx_type:
        tx_type = db.query(TransactionType).first()
    if not tx_type:
        tx_type = TransactionType(transaction_type_id=2, name="Deposit", code="DEP")
        db.add(tx_type)
        db.flush()

    initial_tx = Transaction(
        account_id=account.account_id,
        transaction_type_id=tx_type.transaction_type_id,
        category_id=category.category_id,
        status_id=status_obj.status_id,
        amount=payload.initial_balance if payload.initial_balance is not None else 0.0,
        cash=account.entry,
        comment="Initial Balance",
    )
    db.add(initial_tx)

    db.commit()
    db.refresh(account)

    return get_account_response_dict(account, db)


@router.get("/{pk}/", response_model=AccountResponse)
def get_account(pk: int, db: Session = Depends(get_db)):
    account = (
        db.query(Account)
        .options(
            joinedload(Account.titular),
            joinedload(Account.account_holder),
            joinedload(Account.currency),
            joinedload(Account.account_type),
            joinedload(Account.groups),
        )
        .filter(Account.account_id == pk)
        .first()
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )
    return get_account_response_dict(account, db)


@router.put("/{pk}/", response_model=AccountResponse)
def update_account(pk: int, payload: AccountCreate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.account_id == pk).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    # Update attributes
    account.name = payload.name
    account.titular_id = payload.titular_id
    account.account_holder_id = payload.account_holder_id
    account.sort_code = payload.sort_code
    account.number = payload.number
    account.branch = payload.branch
    account.currency_id = payload.currency_id
    account.is_closed = payload.is_closed
    account.entry = payload.entry
    account.comment = payload.comment
    account.is_hidden = payload.is_hidden
    account.account_type_id = payload.account_type_id
    account.order = payload.order

    # Update groups
    db.query(AccountGroupAccount).filter(
        AccountGroupAccount.account_id == pk
    ).delete()
    if payload.groups:
        for group in payload.groups:
            link = AccountGroupAccount(
                account_id=pk, account_group_id=group["account_group_id"]
            )
            db.add(link)

    # Update initial balance transaction
    category = db.query(Category).filter(Category.name == "Initial Balance").first()
    if category:
        init_tx = (
            db.query(Transaction)
            .filter(
                Transaction.account_id == pk,
                Transaction.category_id == category.category_id,
            )
            .first()
        )
        if init_tx:
            init_tx.amount = (
                payload.initial_balance
                if payload.initial_balance is not None
                else 0.0
            )
            init_tx.cash = account.entry
        else:
            # Recreate if missing
            status_obj = db.query(Status).filter(Status.status_id == 2).first()
            tx_type = (
                db.query(TransactionType)
                .filter(TransactionType.code == "DEP")
                .first()
            )
            if status_obj and tx_type:
                new_init_tx = Transaction(
                    account_id=pk,
                    transaction_type_id=tx_type.transaction_type_id,
                    category_id=category.category_id,
                    status_id=status_obj.status_id,
                    amount=(
                        payload.initial_balance
                        if payload.initial_balance is not None
                        else 0.0
                    ),
                    cash=account.entry,
                    comment="Initial Balance",
                )
                db.add(new_init_tx)

    db.commit()
    db.refresh(account)
    return get_account_response_dict(account, db)


@router.delete("/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(pk: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.account_id == pk).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )
    db.query(AccountGroupAccount).filter(
        AccountGroupAccount.account_id == pk
    ).delete()
    db.delete(account)
    db.commit()
    return None


# Include sub-routes for transactions
from app.routes.accounts_transactions import router as trans_router
router.include_router(trans_router)
