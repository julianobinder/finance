import pytest

def test_category_merge_success(client):
    # 1. Create a parent category
    res = client.post("/api/accounts/categories/", json={"name": "Parent Category"})
    assert res.status_code == 201
    parent_id = res.json()["category_id"]

    # 2. Create two sub-categories
    res = client.post("/api/accounts/categories/", json={
        "name": "Sub A",
        "parent_category_id": parent_id,
        "is_hidden": False
    })
    assert res.status_code == 201
    sub_a_id = res.json()["category_id"]

    res = client.post("/api/accounts/categories/", json={
        "name": "Sub B",
        "parent_category_id": parent_id,
        "is_hidden": False
    })
    assert res.status_code == 201
    sub_b_id = res.json()["category_id"]

    # 3. Setup dependencies for transactions/rules
    # Create titular, currency, account-type, payee and account
    res = client.post("/api/accounts/titulars/", json={"name": "Primary"})
    tit_id = res.json()["titular_id"]

    res = client.post("/api/accounts/currencies/", json={"name": "Dollar", "iso_code": "USD", "symbol": "$", "order": 1})
    cur_id = res.json()["currency_id"]

    res = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res.json()["account_type_id"]

    res = client.post("/api/accounts/payees/", json={"name": "Merchant", "comment": ""})
    payee_id = res.json()["payee_id"]

    res = client.post("/api/accounts/", json={
        "name": "Merge Account",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 100.0,
    })
    acc_id = res.json()["account_id"]

    # 4. Create a transaction referencing Sub A
    res = client.post("/api/transactions/", json={
        "accountId": acc_id,
        "amount": 50.0,
        "transactionType": "withdrawal",
        "payee_id": payee_id,
        "category_id": sub_a_id,
        "issue": "2026-06-01",
        "cash": "2026-06-01"
    })
    assert res.status_code == 201
    tx_id = res.json()["transaction_id"]

    # 5. Create an ImportPlan and ImportPlanRule referencing Sub A
    res = client.post("/api/accounts/csv-templates/", json={
        "name": "CSV Temp",
        "fields": [{"name": "Col", "map": "DATE", "type": "date"}]
    })
    template_id = res.json()["import_csv_id"]
    field_id = res.json()["fields"][0]["import_csv_field_id"]

    res = client.post("/api/accounts/import-plans/", json={
        "name": "Plan for Merge",
        "account": acc_id,
        "importcsv": template_id
    })
    plan_id = res.json()["import_plan_id"]

    res = client.post("/api/accounts/import-plan-rules/", json={
        "importplan": plan_id,
        "importcsvfield": field_id,
        "pattern": "Test Pattern",
        "category_id": sub_a_id,
        "payee_id": payee_id
    })
    assert res.status_code == 201
    rule_id = res.json()["import_plan_rule_id"]

    # 6. Perform the merge operation
    res = client.post(f"/api/accounts/categories/{sub_a_id}/merge/", json={
        "destination_category_id": sub_b_id
    })
    assert res.status_code == 200
    assert "merged" in res.json()["detail"].lower()

    # 7. Assert source sub-category is deleted
    res = client.get(f"/api/accounts/categories/{sub_a_id}/")
    assert res.status_code == 404

    # 8. Assert transaction subcategory is updated to destination (Sub B)
    res = client.get(f"/api/accounts/{acc_id}/transactions/")
    assert res.status_code == 200
    txs = res.json()["results"]
    merge_tx = [t for t in txs if t["transaction_id"] == tx_id][0]
    assert merge_tx["subcategory_id"] == sub_b_id

    # 9. Assert import plan rule category is updated to destination (Sub B)
    res = client.get(f"/api/accounts/import-plan-rules/plan/{plan_id}/")
    assert res.status_code == 200
    rules = res.json()
    assert len(rules) == 1
    assert rules[0]["category_id"] == sub_b_id


def test_category_merge_validation(client):
    # Create parent category
    res = client.post("/api/accounts/categories/", json={"name": "Parent Category"})
    parent_id = res.json()["category_id"]

    # Create sub category
    res = client.post("/api/accounts/categories/", json={
        "name": "Sub A",
        "parent_category_id": parent_id
    })
    sub_a_id = res.json()["category_id"]

    # Merge into self
    res = client.post(f"/api/accounts/categories/{sub_a_id}/merge/", json={
        "destination_category_id": sub_a_id
    })
    assert res.status_code == 400
    assert "cannot merge a category into itself" in res.json()["detail"].lower()

    # Merge non-existent source
    res = client.post("/api/accounts/categories/999999/merge/", json={
        "destination_category_id": sub_a_id
    })
    assert res.status_code == 404
    assert "source category not found" in res.json()["detail"].lower()

    # Merge into non-existent destination
    res = client.post(f"/api/accounts/categories/{sub_a_id}/merge/", json={
        "destination_category_id": 999999
    })
    assert res.status_code == 404
    assert "destination category not found" in res.json()["detail"].lower()
