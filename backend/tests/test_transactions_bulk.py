def test_transactions_bulk_flow(client):
    # Setup dependencies
    res_tit = client.post("/api/accounts/titulars/", json={"name": "Primary Bulk"})
    tit_id = res_tit.json()["titular_id"]

    res_cur = client.post("/api/accounts/currencies/", json={"name": "USD", "iso_code": "USD", "symbol": "$", "order": 1})
    cur_id = res_cur.json()["currency_id"]

    res_type = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res_type.json()["account_type_id"]

    res_acc = client.post("/api/accounts/", json={
        "name": "Checking USD Bulk",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 1000.0,
    })
    acc_id = res_acc.json()["account_id"]

    res_payee = client.post("/api/accounts/payees/", json={"name": "Acme Corp"})
    payee_id = res_payee.json()["payee_id"]

    res_cat = client.post("/api/accounts/categories/", json={"name": "Concert", "is_hidden": False})
    cat_id = res_cat.json()["category_id"]

    # 1. Valid bulk post
    payload = [
        {
            "account_id": acc_id,
            "transactionType": "withdrawal",
            "amount": 100.0,
            "cash": "2026-05-18",
            "payee_id": payee_id,
            "category_id": cat_id,
            "comment": "Bulk valid 1",
        },
        {
            "account_id": acc_id,
            "transactionType": "deposit",
            "amount": 200.0,
            "cash": "2026-05-19",
            "payee_id": payee_id,
            "category_id": cat_id,
            "comment": "Bulk valid 2",
        }
    ]
    res = client.post("/api/transactions/bulk/", json=payload)
    assert res.status_code == 201
    results = res.json()
    assert len(results) == 2
    assert results[0]["amount"] == -100.0
    assert results[1]["amount"] == 200.0

    # 2. Transaction check - both should exist
    res_list = client.get(f"/api/accounts/{acc_id}/transactions/")
    comments = [t["comment"] for t in res_list.json()["results"]]
    assert "Bulk valid 1" in comments
    assert "Bulk valid 2" in comments

    # 3. Failing bulk post (unbalanced splits) - should rollback completely
    fail_payload = [
        {
            "account_id": acc_id,
            "transactionType": "withdrawal",
            "amount": 50.0,
            "cash": "2026-05-20",
            "payee_id": payee_id,
            "category_id": cat_id,
            "comment": "Bulk failed 1",
        },
        {
            "account_id": acc_id,
            "transactionType": "withdrawal",
            "amount": 300.0,
            "cash": "2026-05-20",
            "payee_id": payee_id,
            "comment": "Bulk failed 2",
            "splits": [
                {"category_id": cat_id, "amount": 100.0, "comment": "part 1"},
                {"category_id": cat_id, "amount": 50.0, "comment": "part 2"}, # sum = 150 != 300
            ]
        }
    ]
    res_fail = client.post("/api/transactions/bulk/", json=fail_payload)
    assert res_fail.status_code == 400

    # 4. Verify database state - "Bulk failed 1" should NOT be in the transactions table
    res_list_after = client.get(f"/api/accounts/{acc_id}/transactions/")
    comments_after = [t["comment"] for t in res_list_after.json()["results"]]
    assert "Bulk failed 1" not in comments_after
    assert "Bulk failed 2" not in comments_after
