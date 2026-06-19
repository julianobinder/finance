from datetime import date


def test_create_subresources(client):
    # Test Titular creation
    res = client.post("/api/accounts/titulars/", json={"name": "Test Titular"})
    assert res.status_code == 201
    titular_id = res.json()["titular_id"]

    # Test Account Holder creation
    res = client.post("/api/accounts/account-holders/", json={"name": "Test Holder", "comments": "No comments"})
    assert res.status_code == 201
    holder_id = res.json()["account_holder_id"]

    # Test Account Type creation
    res = client.post("/api/accounts/account-types/", json={"name": "Test Type", "code": 1})
    assert res.status_code == 201
    type_id = res.json()["account_type_id"]

    # Test Currency creation
    res = client.post("/api/accounts/currencies/", json={"name": "Dollar", "iso_code": "USD", "symbol": "$", "order": 1})
    assert res.status_code == 201
    currency_id = res.json()["currency_id"]

    # Test Account Group creation
    res = client.post("/api/accounts/account-groups/", json={"name": "Test Group", "is_hidden": False})
    assert res.status_code == 201
    group_id = res.json()["account_group_id"]

    # Test Payee creation
    res = client.post("/api/accounts/payees/", json={"name": "Test Payee", "comment": "Nice payee"})
    assert res.status_code == 201
    payee_id = res.json()["payee_id"]

    # Test Category creation
    res = client.post("/api/accounts/categories/", json={"name": "Test Category", "is_hidden": False})
    assert res.status_code == 201
    category_id = res.json()["category_id"]


def test_accounts_crud(client):
    # Setup dependencies
    res_tit = client.post("/api/accounts/titulars/", json={"name": "Primary"})
    tit_id = res_tit.json()["titular_id"]

    res_cur = client.post("/api/accounts/currencies/", json={"name": "Dollar", "iso_code": "USD", "symbol": "$", "order": 1})
    cur_id = res_cur.json()["currency_id"]

    res_type = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res_type.json()["account_type_id"]

    res_holder = client.post("/api/accounts/account-holders/", json={"name": "Federal Bank"})
    holder_id = res_holder.json()["account_holder_id"]

    res_group = client.post("/api/accounts/account-groups/", json={"name": "Savings Group"})
    group_id = res_group.json()["account_group_id"]

    # Create account
    account_payload = {
        "name": "Main Checking",
        "titular_id": tit_id,
        "account_holder_id": holder_id,
        "sort_code": "12-34-56",
        "number": "987654321",
        "branch": "Main St",
        "currency_id": cur_id,
        "is_closed": False,
        "entry": "2026-05-17",
        "comment": "Test account",
        "is_hidden": False,
        "account_type_id": type_id,
        "groups": [{"account_group_id": group_id}],
        "initial_balance": 1000.0,
        "order": 5,
    }

    res = client.post("/api/accounts/", json=account_payload)
    assert res.status_code == 201
    data = res.json()
    account_id = data["account_id"]
    assert data["name"] == "Main Checking"
    assert data["initial_balance"] == 1000.0
    assert data["balance"] == 1000.0
    assert data["order"] == 5

    # Get account
    res = client.get(f"/api/accounts/{account_id}/")
    assert res.status_code == 200
    assert res.json()["name"] == "Main Checking"
    assert res.json()["order"] == 5

    # List accounts
    res = client.get("/api/accounts/")
    assert res.status_code == 200
    results = res.json()["results"]
    assert len(results) >= 1
    assert any(a["account_id"] == account_id for a in results)

    # Update account
    account_payload["name"] = "Main Checking Updated"
    account_payload["initial_balance"] = 1200.0
    account_payload["order"] = 8
    res = client.put(f"/api/accounts/{account_id}/", json=account_payload)
    assert res.status_code == 200
    assert res.json()["name"] == "Main Checking Updated"
    assert res.json()["initial_balance"] == 1200.0
    assert res.json()["balance"] == 1200.0
    assert res.json()["order"] == 8

    # Verify underlying Initial Balance transaction updated
    res_txs = client.get(f"/api/accounts/{account_id}/transactions/")
    assert res_txs.status_code == 200
    txs = res_txs.json()["results"]
    init_tx = [t for t in txs if t["comment"] == "Initial Balance"][0]
    assert init_tx["amount"] == 1200.0

    # Delete account
    res = client.delete(f"/api/accounts/{account_id}/")
    assert res.status_code == 204

    # Verify deleted
    res = client.get(f"/api/accounts/{account_id}/")
    assert res.status_code == 404


def test_accounts_listing_order(client):
    # Setup dependencies
    res_tit = client.post("/api/accounts/titulars/", json={"name": "OrderTit"})
    tit_id = res_tit.json()["titular_id"]

    res_cur = client.post("/api/accounts/currencies/", json={"name": "USD", "iso_code": "USD", "symbol": "$", "order": 1})
    cur_id = res_cur.json()["currency_id"]

    res_type = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res_type.json()["account_type_id"]

    # Create account A (order = 30)
    res_a = client.post("/api/accounts/", json={
        "name": "Account A",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "order": 30,
    })
    acc_a_id = res_a.json()["account_id"]

    # Create account B (order = 10)
    res_b = client.post("/api/accounts/", json={
        "name": "Account B",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "order": 10,
    })
    acc_b_id = res_b.json()["account_id"]

    # Create account C (order = 20)
    res_c = client.post("/api/accounts/", json={
        "name": "Account C",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "order": 20,
    })
    acc_c_id = res_c.json()["account_id"]

    # Retrieve account listing and assert ordering: Account B (10), Account C (20), Account A (30)
    res_list = client.get("/api/accounts/")
    assert res_list.status_code == 200
    results = res_list.json()["results"]
    
    # Filter only our newly created accounts to prevent collision with other tests
    relevant_ids = [a["account_id"] for a in results if a["account_id"] in (acc_a_id, acc_b_id, acc_c_id)]
    assert relevant_ids == [acc_b_id, acc_c_id, acc_a_id]

