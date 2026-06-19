from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Transaction, Category, Account, AccountGroup, Payee, Currency

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/data/")
def get_reports_data(db: Session = Depends(get_db)):
    """Get all transaction records and metadata optimized for reporting/charts"""
    # Fetch lookups
    categories = db.query(Category).all()
    accounts = db.query(Account).options(joinedload(Account.currency)).all()
    account_groups = db.query(AccountGroup).options(joinedload(AccountGroup.accounts)).all()
    payees = db.query(Payee).all()
    currencies = db.query(Currency).order_by(Currency.order).all()

    # Create helper category map for parent category lookup
    cat_map = {c.category_id: c for c in categories}

    # Map account to group IDs
    account_to_groups = {}
    for group in account_groups:
        for acc in group.accounts:
            if acc.account_id not in account_to_groups:
                account_to_groups[acc.account_id] = []
            account_to_groups[acc.account_id].append(group.account_group_id)

    # Query all transactions (excluding parent Split records to avoid double counting)
    transactions = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.category),
            joinedload(Transaction.account).joinedload(Account.currency),
            joinedload(Transaction.payee),
            joinedload(Transaction.transaction_type)
        )
        .join(Category)
        .filter(Category.name != "Split")
        .all()
    )

    serialized_txs = []
    for tx in transactions:
        # Determine parent and subcategory names/ids
        parent_cat_id = None
        parent_cat_name = None
        cat_id = None
        cat_name = None

        if tx.category:
            if tx.category.parent_category_id:
                parent = cat_map.get(tx.category.parent_category_id)
                parent_cat_id = tx.category.parent_category_id
                parent_cat_name = parent.name if parent else ""
                cat_id = tx.category.category_id
                cat_name = tx.category.name
            else:
                parent_cat_id = tx.category.category_id
                parent_cat_name = tx.category.name

        # Determine transaction type string
        tx_type = "withdrawal"
        if tx.transaction_type:
            code = tx.transaction_type.code.upper()
            if code == "DEP":
                tx_type = "deposit"
            elif code == "TRA" or (tx.category and tx.category.name.lower() == "transfer"):
                tx_type = "transfer"
        else:
            if tx.amount > 0:
                tx_type = "deposit"
            elif tx.category and tx.category.name.lower() == "transfer":
                tx_type = "transfer"

        # Resolve date
        tx_date = tx.date
        date_str = tx_date.strftime("%Y-%m-%d") if tx_date else ""

        serialized_txs.append({
            "transaction_id": tx.transaction_id,
            "amount": tx.amount,
            "date": date_str,
            "category_id": parent_cat_id,
            "category_name": parent_cat_name,
            "subcategory_id": cat_id,
            "subcategory_name": cat_name,
            "account_id": tx.account_id,
            "account_name": tx.account.name if tx.account else f"Account {tx.account_id}",
            "account_group_ids": account_to_groups.get(tx.account_id, []),
            "payee_id": tx.payee_id,
            "payee_name": tx.payee.name if tx.payee else "",
            "type": tx_type,
            "currency_code": tx.account.currency.iso_code.upper() if (tx.account and tx.account.currency) else "USD"
        })

    return {
        "transactions": serialized_txs,
        "categories": [
            {
                "category_id": c.category_id,
                "name": c.name,
                "parent_category_id": c.parent_category_id,
                "is_hidden": c.is_hidden
            } for c in categories
        ],
        "accounts": [
            {
                "account_id": a.account_id,
                "name": a.name,
                "currency_symbol": a.currency.symbol if a.currency else "$"
            } for a in accounts
        ],
        "account_groups": [
            {
                "account_group_id": g.account_group_id,
                "name": g.name,
                "account_ids": [a.account_id for a in g.accounts]
            } for g in account_groups
        ],
        "payees": [
            {
                "payee_id": p.payee_id,
                "name": p.name
            } for p in payees
        ],
        "currencies": [
            {
                "currency_id": c.currency_id,
                "name": c.name,
                "iso_code": c.iso_code.upper(),
                "symbol": c.symbol
            } for c in currencies
        ]
    }
