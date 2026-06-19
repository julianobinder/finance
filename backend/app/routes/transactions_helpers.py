from typing import Optional
from sqlalchemy.orm import Session
from app.models import Account, Category, Transaction, TransactionType

def get_tx_response_dict(tx: Transaction) -> dict:
    """Map Transaction ORM object to expected frontend dictionary layout"""
    is_split = tx.category.name == "Split" if tx.category else False

    # Check for linked transfer transactions
    to_account_id = None
    to_account_name = None
    to_account_cash = None
    to_account_issue = None
    to_account_received = None
    to_account_refer_to = None
    to_account_due = None
    to_account_payment = None
    to_account_amount = None
    to_account_rate = None

    if tx.transfer_transaction:
        to_tx = tx.transfer_transaction
        if to_tx.account:
            to_account_id = to_tx.account.account_id
            to_account_name = to_tx.account.full_name()
        to_account_cash = to_tx.cash
        to_account_issue = to_tx.issue
        to_account_received = to_tx.received
        to_account_refer_to = to_tx.refer_to
        to_account_due = to_tx.due
        to_account_payment = to_tx.payment
        to_account_amount = to_tx.amount
        to_account_rate = to_tx.rate

    # Category name resolution
    cat_id = None
    cat_name = None
    sub_id = None
    sub_name = None

    if tx.category:
        if tx.category.parent:
            cat_id = tx.category.parent.category_id
            cat_name = tx.category.parent.name
            sub_id = tx.category.category_id
            sub_name = tx.category.name
        else:
            cat_id = tx.category.category_id
            cat_name = tx.category.name

    return {
        "transaction_id": tx.transaction_id,
        "transaction_type_id": tx.transaction_type_id,
        "transaction_type_name": tx.transaction_type.name if tx.transaction_type else "",
        "account_id": tx.account_id,
        "account_name": tx.account.name if tx.account else "",
        "status_id": tx.status_id,
        "status_name": tx.status.name if tx.status else "",
        "entry": tx.entry,
        "issue": tx.issue,
        "received": tx.received,
        "refer_to": tx.refer_to,
        "due": tx.due,
        "payment": tx.payment,
        "cash": tx.cash,
        "date": tx.date,
        "payee_id": tx.payee_id,
        "payee_name": tx.payee.name if tx.payee else None,
        "category_id": cat_id,
        "category_name": cat_name,
        "subcategory_id": sub_id,
        "subcategory_name": sub_name,
        "comment": tx.comment,
        "rate": tx.rate,
        "amount": tx.amount,
        "reference": tx.reference,
        "transfer_transaction_id": tx.transfer_transaction_id,
        "original_amount": tx.original_amount,
        "original_currency_id": tx.original_currency_id,
        "quantity": tx.quantity,
        "asset_id": tx.asset_id,
        "currency_name": (
            tx.account.currency.name if tx.account and tx.account.currency else ""
        ),
        "currency_symbol": (
            tx.account.currency.symbol if tx.account and tx.account.currency else ""
        ),
        "is_split": is_split,
        "balance": 0.0,  # Computed at the account level
        "to_account_id": to_account_id,
        "to_account_name": to_account_name,
        "to_account_cash": to_account_cash,
        "to_account_issue": to_account_issue,
        "to_account_received": to_account_received,
        "to_account_refer_to": to_account_refer_to,
        "to_account_due": to_account_due,
        "to_account_payment": to_account_payment,
        "to_account_amount": to_account_amount,
        "to_account_rate": to_account_rate,
    }


def _create_splits(tx: Transaction, splits_data: list, db: Session):
    for split in splits_data:
        cat_id = split.get("category_id") or split.get("category")
        amount = split.get("amount")
        comment = split.get("comment", "")
        if not cat_id or amount is None:
            continue

        split_comment = f"{tx.comment} (Split)"
        if comment:
            split_comment = f"{split_comment}: {comment}"

        child = Transaction(
            account_id=tx.account_id,
            transaction_type_id=tx.transaction_type_id,
            status_id=tx.status_id,
            payee_id=tx.payee_id,
            category_id=cat_id,
            amount=-abs(float(amount)),
            comment=split_comment,
            reference=tx.reference,
            entry=tx.entry,
            issue=tx.issue,
            received=tx.received,
            refer_to=tx.refer_to,
            due=tx.due,
            payment=tx.payment,
            cash=tx.cash,
            original_amount=tx.original_amount,
            original_currency_id=tx.original_currency_id,
        )
        db.add(child)


def _create_transfer(
    src_tx: Transaction,
    to_account_id: int,
    rate: Optional[float],
    amount: float,
    dest_amount: Optional[float],
    dates: dict,
    db: Session,
):
    to_account = db.query(Account).filter(Account.account_id == to_account_id).first()
    if not to_account:
        return

    # Currency rate check
    if rate is not None and src_tx.account.currency_id != to_account.currency_id:
        converted_amount = dest_amount if dest_amount is not None else amount * rate
        original_amount = amount
        original_currency = src_tx.account.currency_id
    else:
        converted_amount = amount
        original_amount = None
        original_currency = None

    transfer_category = db.query(Category).filter(Category.name == "Transfer").first()
    category_id = (
        transfer_category.category_id
        if transfer_category
        else db.query(Category).first().category_id
    )

    dep_type = db.query(TransactionType).filter(TransactionType.code == "DEP").first()
    if not dep_type:
        dep_type = db.query(TransactionType).filter(TransactionType.name.ilike("Deposit")).first()
    dest_tx_type_id = dep_type.transaction_type_id if dep_type else db.query(TransactionType).first().transaction_type_id

    dest_tx = Transaction(
        account_id=to_account_id,
        transaction_type_id=dest_tx_type_id,
        status_id=src_tx.status_id,
        amount=converted_amount,
        payee_id=None,
        category_id=category_id,
        comment=src_tx.comment or f"Transfer from {src_tx.account.name}",
        reference=src_tx.reference,
        entry=src_tx.entry,
        issue=dates.get("issue") or src_tx.issue,
        received=dates.get("received") or src_tx.received,
        refer_to=dates.get("refer_to") or src_tx.refer_to,
        due=dates.get("due") or src_tx.due,
        payment=dates.get("payment") or src_tx.payment,
        cash=dates.get("cash") or src_tx.cash,
        original_amount=original_amount,
        original_currency_id=original_currency,
        transfer_transaction_id=src_tx.transaction_id,
        rate=rate or 1.0,
    )
    db.add(dest_tx)
    db.flush()

    # Link back to source
    src_tx.transfer_transaction_id = dest_tx.transaction_id
