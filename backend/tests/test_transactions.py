def test_transactions_flow(client):
    # 1. Setup account and lookups
    res_tit = client.post("/api/accounts/titulars/", json={"name": "Primary"})
    tit_id = res_tit.json()["titular_id"]

    res_cur1 = client.post("/api/accounts/currencies/", json={"name": "Dollar", "iso_code": "USD", "symbol": "$", "order": 1})
    cur1_id = res_cur1.json()["currency_id"]

    res_cur2 = client.post("/api/accounts/currencies/", json={"name": "Euro", "iso_code": "EUR", "symbol": "€", "order": 2})
    cur2_id = res_cur2.json()["currency_id"]

    res_type = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res_type.json()["account_type_id"]

    # Create account A (USD)
    res_accA = client.post("/api/accounts/", json={
        "name": "Checking USD",
        "titular_id": tit_id,
        "currency_id": cur1_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 1000.0,
    })
    accA_id = res_accA.json()["account_id"]

    # Create account B (EUR)
    res_accB = client.post("/api/accounts/", json={
        "name": "Savings EUR",
        "titular_id": tit_id,
        "currency_id": cur2_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 0.0,
    })
    accB_id = res_accB.json()["account_id"]

    # Create payee and category
    res_payee = client.post("/api/accounts/payees/", json={"name": "Acme Corp"})
    payee_id = res_payee.json()["payee_id"]

    res_cat = client.post("/api/accounts/categories/", json={"name": "Concert", "is_hidden": False})
    cat_id = res_cat.json()["category_id"]

    res_subcat = client.post("/api/accounts/categories/", json={"name": "Tickets", "parent_category_id": cat_id})
    subcat_id = res_subcat.json()["category_id"]

    # 2. Test Withdrawal
    withdrawal_payload = {
        "account_id": accA_id,
        "transactionType": "withdrawal",
        "amount": 150.0,
        "cash": "2026-05-18",
        "payee_id": payee_id,
        "category_id": subcat_id,
        "comment": "Withdrawal test",
    }
    res = client.post("/api/transactions/", json=withdrawal_payload)
    assert res.status_code == 201
    tx = res.json()
    assert tx["amount"] == -150.0  # Polarity must be negative
    assert tx["payee_id"] == payee_id
    assert tx["category_id"] == cat_id

    # 3. Test Deposit
    deposit_payload = {
        "account_id": accA_id,
        "transactionType": "deposit",
        "amount": 500.0,
        "cash": "2026-05-19",
        "payee_id": payee_id,
        "category_id": subcat_id,
        "comment": "Deposit test",
    }
    res = client.post("/api/transactions/", json=deposit_payload)
    assert res.status_code == 201
    assert res.json()["amount"] == 500.0  # Polarity must be positive

    # 4. Test Split Transaction
    split_payload = {
        "account_id": accA_id,
        "transactionType": "withdrawal",
        "amount": 200.0,
        "cash": "2026-05-20",
        "payee_id": payee_id,
        "comment": "Split test",
        "splits": [
            {"category_id": subcat_id, "amount": 120.0, "comment": "part 1"},
            {"category_id": subcat_id, "amount": 80.0, "comment": "part 2"},
        ]
    }
    res = client.post("/api/transactions/", json=split_payload)
    assert res.status_code == 201
    tx_split = res.json()
    assert tx_split["is_split"] is True

    # 5. Check Running Balance on account transactions endpoint
    res = client.get(f"/api/accounts/{accA_id}/transactions/")
    assert res.status_code == 200
    tx_list = res.json()["results"]
    
    withdrawal_tx = [t for t in tx_list if t["comment"] == "Withdrawal test"][0]
    assert withdrawal_tx["subcategory_id"] == subcat_id
    
    # Verify exact running balances
    balance_by_comment = {t["comment"]: t["balance"] for t in tx_list}
    assert balance_by_comment["Initial Balance"] == 1000.0
    assert balance_by_comment["Withdrawal test"] == 850.0
    assert balance_by_comment["Deposit test"] == 1350.0
    assert balance_by_comment["Split test"] == 1350.0  # Split parent doesn't change the sum
    assert balance_by_comment["Split test (Split): part 1"] == 1230.0
    assert balance_by_comment["Split test (Split): part 2"] == 1150.0

    # Test protection on Initial Balance transaction
    initial_balance_tx = [t for t in tx_list if t["comment"] == "Initial Balance"][0]
    initial_balance_tx_id = initial_balance_tx["transaction_id"]

    # Try to edit Initial Balance transaction directly (must fail)
    res_edit = client.put(f"/api/transactions/{initial_balance_tx_id}/", json={
        "account_id": accA_id,
        "transactionType": "deposit",
        "amount": 2000.0,
        "comment": "Initial Balance",
    })
    assert res_edit.status_code == 400
    assert "Initial balance transactions can only be edited" in res_edit.json()["detail"]

    # Try to delete Initial Balance transaction directly (must fail)
    res_delete = client.delete(f"/api/transactions/{initial_balance_tx_id}/")
    assert res_delete.status_code == 400
    assert "Initial balance transactions can only be deleted" in res_delete.json()["detail"]

    # Transactions should include:
    # - Initial Balance: +1000.00
    # - Withdrawal: -150.00
    # - Deposit: +500.00
    # - Split Parent: -200.00 (excluded from balance computation)
    # - Split Child 1: -120.00
    # - Split Child 2: -80.00
    # Expected final running balance = 1000.00 - 150.00 + 500.00 - 120.00 - 80.00 = 1150.00
    res_acc = client.get(f"/api/accounts/{accA_id}/")
    assert res_acc.json()["balance"] == 1150.00

    # 6. Test Cross-Currency Transfer
    transfer_payload = {
        "account_id": accA_id,
        "toAccountId": accB_id,
        "transactionType": "transfer",
        "amount": 100.0,
        "currencyRate": 0.85,
        "destinationAmount": 85.00,
        "cash": "2026-05-22",
        "toAccountCash": "2026-05-23",
        "comment": "Transfer test",
    }
    res = client.post("/api/transactions/", json=transfer_payload)
    assert res.status_code == 201
    tx_transfer = res.json()
    assert tx_transfer["amount"] == -100.0
    assert tx_transfer["to_account_id"] == accB_id
    assert tx_transfer["to_account_amount"] == 85.00

    # Verify Account A balance decreased by 100.0
    res_accA = client.get(f"/api/accounts/{accA_id}/")
    assert res_accA.json()["balance"] == 1050.00

    # Verify Account B balance increased by 85.0
    res_accB = client.get(f"/api/accounts/{accB_id}/")
    assert res_accB.json()["balance"] == 85.00

    # 7. Test Unbalanced Split Transaction (must fail)
    unbalanced_split_payload = {
        "account_id": accA_id,
        "transactionType": "withdrawal",
        "amount": 200.0,
        "cash": "2026-05-20",
        "payee_id": payee_id,
        "comment": "Unbalanced split test",
        "splits": [
            {"category_id": subcat_id, "amount": 100.0, "comment": "part 1"},
            {"category_id": subcat_id, "amount": 50.0, "comment": "part 2 (unbalanced remainder of 50)"},
        ]
    }
    res = client.post("/api/transactions/", json=unbalanced_split_payload)
    assert res.status_code == 400
    assert "The sum of split amounts must equal the transaction's total amount." in res.json()["detail"]


def test_transactions_date_filtering(client):
    # Setup dependencies
    res_tit = client.post("/api/accounts/titulars/", json={"name": "Date Filtering Titular"})
    tit_id = res_tit.json()["titular_id"]

    res_cur = client.post("/api/accounts/currencies/", json={"name": "Dollar", "iso_code": "USD", "symbol": "$", "order": 1})
    cur_id = res_cur.json()["currency_id"]

    res_type = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res_type.json()["account_type_id"]

    res_acc = client.post("/api/accounts/", json={
        "name": "Date Filtering Checking",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 100.0,
    })
    acc_id = res_acc.json()["account_id"]

    # Create payee and category
    res_payee = client.post("/api/accounts/payees/", json={"name": "Store"})
    payee_id = res_payee.json()["payee_id"]

    res_cat = client.post("/api/accounts/categories/", json={"name": "Food", "is_hidden": False})
    cat_id = res_cat.json()["category_id"]

    # Insert transactions at different dates
    tx_dates = ["2026-05-01", "2026-05-10", "2026-05-20", "2026-05-30"]
    for idx, tx_date in enumerate(tx_dates):
        payload = {
            "account_id": acc_id,
            "transactionType": "withdrawal",
            "amount": 10.0 + idx,
            "cash": tx_date,
            "payee_id": payee_id,
            "category_id": cat_id,
            "comment": f"Tx {tx_date}",
        }
        res = client.post("/api/transactions/", json=payload)
        assert res.status_code == 201

    # Test filtering with start_date and end_date
    res = client.get(f"/api/accounts/{acc_id}/transactions/", params={"start_date": "2026-05-10", "end_date": "2026-05-25"})
    assert res.status_code == 200
    results = res.json()["results"]
    
    # Expected transactions: Tx 2026-05-10 and Tx 2026-05-20 (initial balance might also be included if its cash matches, but let's check comments)
    filtered_comments = [t["comment"] for t in results if t["comment"] != "Initial Balance"]
    assert len(filtered_comments) == 2
    assert "Tx 2026-05-10" in filtered_comments
    assert "Tx 2026-05-20" in filtered_comments
    assert "Tx 2026-05-01" not in filtered_comments
    assert "Tx 2026-05-30" not in filtered_comments

