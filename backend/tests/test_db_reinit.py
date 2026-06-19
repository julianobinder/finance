import pytest
from app.models import Status, TransactionType, Currency, AccountType, Category

def test_load_empty_database_success(client, db):
    # 1. Trigger the empty database reload via settings endpoint
    response = client.post("/api/settings/empty-db/")
    assert response.status_code == 200
    assert "empty database loaded successfully" in response.json()["message"].lower()
    
    # 2. Check status lookup table seeding
    statuses = db.query(Status).all()
    assert len(statuses) == 3
    assert {s.name for s in statuses} == {"Reconciled", "Clear", "Unclear"}
    assert {s.status_id for s in statuses} == {1, 2, 3}
    
    # 3. Check transaction types lookup seeding
    t_types = db.query(TransactionType).all()
    assert len(t_types) == 3
    assert {t.code for t in t_types} == {"WTH", "DEP", "TRF"}
    assert {t.transaction_type_id for t in t_types} == {1, 2, 3}
    
    # 4. Check currencies lookup seeding
    currencies = db.query(Currency).all()
    assert len(currencies) == 4
    assert {c.iso_code for c in currencies} == {"GBP", "BRL", "USD", "EUR"}
    
    # 5. Check account types lookup seeding
    acc_types = db.query(AccountType).all()
    assert len(acc_types) == 4
    assert {a.name for a in acc_types} == {"Current Account", "Credit Card", "Cash", "Assets"}
    
    # 6. Check default / hidden categories seeding
    categories = db.query(Category).all()
    cat_names = {c.name for c in categories}
    assert "Initial Balance" in cat_names
    assert "Split" in cat_names
    assert "Transfer" in cat_names
    assert "Uncategorized" in cat_names
    
    # 7. Validate specific category ID values
    uncat = db.query(Category).filter(Category.category_id == 9999).first()
    assert uncat is not None
    assert uncat.name == "Uncategorized"
    assert uncat.is_hidden is True


def test_settings_config_flow(client):
    # 1. Get the current configuration settings
    response = client.get("/api/settings/config/")
    assert response.status_code == 200
    data = response.json()
    assert "currency_url" in data
    assert "currrency_api" in data

    # 2. Update the configuration settings
    original_url = data["currency_url"]
    original_api = data["currrency_api"]

    new_url = "https://example.com/rates"
    new_api = "test-api-key-12345"

    update_response = client.post("/api/settings/config/", json={
        "currency_url": new_url,
        "currrency_api": new_api
    })
    assert update_response.status_code == 200
    assert "updated successfully" in update_response.json()["message"].lower()

    # 3. Verify in-memory values were updated immediately
    get_response = client.get("/api/settings/config/")
    assert get_response.status_code == 200
    updated_data = get_response.json()
    assert updated_data["currency_url"] == new_url
    assert updated_data["currrency_api"] == new_api

    # Restore the original config to prevent side effects in other tests
    restore_response = client.post("/api/settings/config/", json={
        "currency_url": original_url,
        "currrency_api": original_api
    })
    assert restore_response.status_code == 200


def test_load_sample_database_success(client, db):
    # 1. Trigger the sample database reload endpoint
    response = client.post("/api/settings/sample-db/")
    assert response.status_code == 200
    assert "sample database loaded successfully" in response.json()["message"].lower()

    # 2. Check that the titulars, holders, groups, accounts, and transactions exist
    from app.models import Titular, AccountHolder, AccountGroup, Account, Transaction

    # Titulars
    titulars = db.query(Titular).all()
    assert len(titulars) == 2
    assert {t.name for t in titulars} == {"Alice Smith", "Bob Smith"}

    # Holders
    holders = db.query(AccountHolder).all()
    assert len(holders) == 4
    assert {h.name for h in holders} == {"Barclays Bank", "HSBC Bank", "Chase Bank", "Itaú Unibanco"}

    # Groups
    groups = db.query(AccountGroup).all()
    assert len(groups) == 3
    assert {g.name for g in groups} == {"Personal", "Kids", "Business"}

    # Accounts
    accounts = db.query(Account).all()
    assert len(accounts) == 3
    assert {a.name for a in accounts} == {"Alice Checking", "Bob Business HSBC", "Kids College Fund"}

    # Transactions
    txs = db.query(Transaction).all()
    assert len(txs) > 10

    # Verify split Coffee transaction parent has Split category
    coffee_parent = db.query(Transaction).filter(Transaction.comment == "Coffee with client").first()
    assert coffee_parent is not None
    assert coffee_parent.category.name == "Split"

    # Verify transfer exists and is linked
    transfer_src = db.query(Transaction).filter(Transaction.comment == "College savings transfer", Transaction.amount == -200.00).first()
    transfer_dest = db.query(Transaction).filter(Transaction.comment == "College savings transfer", Transaction.amount == 256.00).first()
    assert transfer_src is not None
    assert transfer_dest is not None
    assert transfer_src.transfer_transaction_id == transfer_dest.transaction_id
    assert transfer_dest.transfer_transaction_id == transfer_src.transaction_id


