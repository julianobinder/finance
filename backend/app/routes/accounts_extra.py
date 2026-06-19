import csv
import io
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings as app_settings
from app.models import (
    Account,
    AccountGroup,
    AccountHolder,
    AccountType,
    Currency,
    Titular,
)

router = APIRouter(prefix="/accounts", tags=["Accounts Operations"])


@router.get("/lookup-data/")
def account_lookup_data(db: Session = Depends(get_db)):
    """Get lookup data for account creation forms"""
    account_types = db.query(AccountType).all()
    currencies = db.query(Currency).order_by(Currency.order).all()
    titulars = db.query(Titular).all()
    account_holders = db.query(AccountHolder).all()
    account_groups = db.query(AccountGroup).order_by(AccountGroup.order, AccountGroup.account_group_id).all()

    return {
        "account_types": [
            {
                "account_type_id": at.account_type_id,
                "name": at.name,
                "code": at.code,
            }
            for at in account_types
        ],
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
        "titulars": [
            {"titular_id": t.titular_id, "name": t.name} for t in titulars
        ],
        "account_holders": [
            {
                "account_holder_id": ah.account_holder_id,
                "name": ah.name,
                "comments": ah.comments,
            }
            for ah in account_holders
        ],
        "account_groups": [
            {
                "account_group_id": ag.account_group_id,
                "name": ag.name,
                "is_hidden": ag.is_hidden,
                "order": ag.order,
            }
            for ag in account_groups
        ],
    }


@router.post("/{pk}/toggle-status/")
def account_toggle_status(pk: int, db: Session = Depends(get_db)):
    """Toggle the closed status of an account"""
    account = db.query(Account).filter(Account.account_id == pk).first()
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    account.is_closed = not account.is_closed
    db.commit()

    return {
        "account_id": account.account_id,
        "is_closed": account.is_closed,
        "message": f"Account {'closed' if account.is_closed else 'opened'} successfully",
    }


@router.get("/statistics/")
def account_statistics(db: Session = Depends(get_db)):
    """Retrieve statistical distribution of accounts"""
    total_accounts = db.query(Account).count()
    active_accounts = (
        db.query(Account)
        .filter(Account.is_closed == False, Account.is_hidden == False)
        .count()
    )
    closed_accounts = db.query(Account).filter(Account.is_closed == True).count()
    hidden_accounts = db.query(Account).filter(Account.is_hidden == True).count()

    # Currency distributions
    currencies = db.query(Currency).all()
    currency_stats = []
    for cur in currencies:
        count = db.query(Account).filter(Account.currency_id == cur.currency_id).count()
        if count > 0:
            currency_stats.append(
                {
                    "currency_name": cur.name,
                    "currency_symbol": cur.symbol,
                    "count": count,
                }
            )

    # Group distributions
    groups = db.query(AccountGroup).order_by(AccountGroup.order, AccountGroup.account_group_id).all()
    group_stats = []
    for gp in groups:
        count = db.query(Account).filter(Account.groups.any(account_group_id=gp.account_group_id)).count()
        if count > 0:
            group_stats.append({"group_name": gp.name, "count": count})

    return {
        "total_accounts": total_accounts,
        "active_accounts": active_accounts,
        "closed_accounts": closed_accounts,
        "hidden_accounts": hidden_accounts,
        "currency_distribution": currency_stats,
        "group_distribution": group_stats,
    }


@router.get("/consolidated-balances/")
def consolidated_balances(db: Session = Depends(get_db)):
    """Calculate consolidated balances of active accounts using exchange rates"""
    api_key = app_settings.currrency_api
    url = app_settings.currency_url

    # Base/default rates (USD base)
    rates = {"USD": 1.0, "GBP": 0.78, "EUR": 0.92, "BRL": 5.25}
    rates_fetched = False

    if api_key:
        try:
            params = {"apikey": api_key}
            query_string = urllib.parse.urlencode(params)
            full_url = f"{url}?{query_string}"

            req = urllib.request.Request(
                full_url, headers={"User-Agent": "Mozilla/5.0"}
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    api_data = json.loads(response.read().decode("utf-8"))
                    api_rates = api_data.get("rates", {})
                    for cur in ["USD", "GBP", "EUR", "BRL"]:
                        if cur in api_rates:
                            rates[cur] = float(api_rates[cur])
                    rates_fetched = True
        except Exception as e:
            # Fallback gracefully
            print(f"Error fetching live rates: {e}")

    active_accounts = (
        db.query(Account)
        .filter(Account.is_closed == False, Account.is_hidden == False)
        .all()
    )

    original_totals = {"USD": 0.0, "GBP": 0.0, "EUR": 0.0, "BRL": 0.0}

    for account in active_accounts:
        iso = account.currency.iso_code.upper() if account.currency else ""
        balance = account.get_balance(db)
        if iso in original_totals:
            original_totals[iso] += balance

    consolidated = {"USD": 0.0, "GBP": 0.0, "EUR": 0.0, "BRL": 0.0}

    for target_iso in consolidated.keys():
        total = 0.0
        for orig_iso, amount in original_totals.items():
            if amount == 0.0:
                continue
            # Convert orig_iso to USD first
            amount_usd = amount / rates[orig_iso]
            # Convert USD to target_iso
            amount_target = amount_usd * rates[target_iso]
            total += amount_target
        consolidated[target_iso] = total

    return {
        "rates": rates,
        "rates_fetched": rates_fetched,
        "original_totals": original_totals,
        "consolidated_balances": consolidated,
    }


@router.post("/analyze-csv/")
def analyze_csv_headers(file: UploadFile = File(...)):
    """Parse upload CSV headers and format field definitions"""
    try:
        content = file.file.read().decode("utf-8")
        csv_reader = csv.reader(io.StringIO(content))
        headers = next(csv_reader)

        fields = []
        for header in headers:
            fields.append(
                {
                    "name": header.strip(),
                    "map_field": "NONE",
                    "type_field": "TEXT",
                    "format_field": "",
                }
            )

        return {"fields": fields}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )
