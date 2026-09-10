def _create_category(client, name="Bills", parent_id=None):
    payload = {"name": name}
    if parent_id:
        payload["parent_category_id"] = parent_id
    res = client.post("/api/accounts/categories/", json=payload)
    assert res.status_code == 201
    return res.json()["category_id"]


def _setup_account_and_payee(client):
    res = client.post("/api/accounts/titulars/", json={"name": "Primary"})
    tit_id = res.json()["titular_id"]
    res = client.post(
        "/api/accounts/currencies/", json={"name": "Real", "iso_code": "BRL", "symbol": "R$", "order": 1}
    )
    cur_id = res.json()["currency_id"]
    res = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res.json()["account_type_id"]
    res = client.post(
        "/api/accounts/",
        json={
            "name": "Main",
            "titular_id": tit_id,
            "currency_id": cur_id,
            "account_type_id": type_id,
            "entry": "2026-01-01",
            "initial_balance": 0.0,
        },
    )
    acc_id = res.json()["account_id"]
    res = client.post("/api/accounts/payees/", json={"name": "Card Co", "comment": ""})
    payee_id = res.json()["payee_id"]
    return acc_id, payee_id


def _create_tx(client, acc_id, payee_id, amount, cash_date, category_id=None):
    res = client.post(
        "/api/transactions/",
        json={
            "accountId": acc_id,
            "amount": amount,
            "transactionType": "withdrawal",
            "payee_id": payee_id,
            "category_id": category_id,
            "cash": cash_date,
        },
    )
    assert res.status_code == 201
    return res.json()["transaction_id"]


def test_create_obligation_creates_first_occurrence(client):
    cat_id = _create_category(client, "Housing")
    res = client.post(
        "/api/obligations/",
        json={
            "name": "Rent",
            "category_id": cat_id,
            "is_recurring": True,
            "recurrence": "monthly",
            "estimated_amount": 1800.0,
            "first_due_date": "2026-08-05",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["is_blocked"] is False
    assert data["occurrence_count"] == 1
    assert len(data["occurrences"]) == 1
    occ = data["occurrences"][0]
    assert occ["due_date"] == "2026-08-05"
    assert occ["estimated_amount"] == 1800.0
    assert occ["paid"] is False


def test_obligation_direction_defaults_payable_and_is_editable(client):
    cat_id = _create_category(client, "Income")
    res = client.post(
        "/api/obligations/", json={"name": "Freelance Gig", "category_id": cat_id, "estimated_amount": 500.0}
    )
    assert res.status_code == 201
    assert res.json()["direction"] == "payable"  # default, unless specified

    ob_id = res.json()["obligation_id"]
    res_update = client.put(
        f"/api/obligations/{ob_id}/",
        json={"name": "Freelance Gig", "category_id": cat_id, "estimated_amount": 500.0, "direction": "receivable"},
    )
    assert res_update.status_code == 200
    assert res_update.json()["direction"] == "receivable"


def test_duplicate_obligation_is_blocked_not_rejected(client):
    cat_id = _create_category(client, "Utilities")
    res1 = client.post(
        "/api/obligations/", json={"name": "Hydro", "category_id": cat_id, "estimated_amount": 200.0}
    )
    assert res1.status_code == 201
    ob1_id = res1.json()["obligation_id"]

    res2 = client.post(
        "/api/obligations/", json={"name": "Hydro", "category_id": cat_id, "estimated_amount": 210.0}
    )
    assert res2.status_code == 201
    data2 = res2.json()
    assert data2["is_blocked"] is True
    assert data2["duplicate_of_obligation_id"] == ob1_id

    res1_get = client.get(f"/api/obligations/{ob1_id}/")
    assert res1_get.json()["is_blocked"] is False

    ob2_id = data2["obligation_id"]
    res_unblock = client.post(f"/api/obligations/{ob2_id}/unblock/")
    assert res_unblock.status_code == 200
    unblocked = res_unblock.json()
    assert unblocked["is_blocked"] is False
    assert unblocked["duplicate_of_obligation_id"] == ob1_id  # kept, not cleared


def test_delete_canonical_obligation_unblocks_its_duplicates(client):
    cat_id = _create_category(client, "DelCanon")
    res1 = client.post(
        "/api/obligations/", json={"name": "Netflix", "category_id": cat_id, "estimated_amount": 55.0}
    )
    canonical_id = res1.json()["obligation_id"]

    res2 = client.post(
        "/api/obligations/", json={"name": "Netflix", "category_id": cat_id, "estimated_amount": 55.0}
    )
    dup_id = res2.json()["obligation_id"]
    assert res2.json()["is_blocked"] is True
    assert res2.json()["duplicate_of_obligation_id"] == canonical_id

    res_del = client.delete(f"/api/obligations/{canonical_id}/")
    assert res_del.status_code == 204

    res_dup = client.get(f"/api/obligations/{dup_id}/")
    assert res_dup.status_code == 200
    assert res_dup.json()["is_blocked"] is False
    assert res_dup.json()["duplicate_of_obligation_id"] is None


def test_mark_paid_independent_of_assignment(client):
    cat_id = _create_category(client, "Cards")
    res = client.post(
        "/api/obligations/",
        json={
            "name": "Credit Card",
            "category_id": cat_id,
            "estimated_amount": 1500.0,
            "first_due_date": "2026-08-10",
        },
    )
    occ_id = res.json()["occurrences"][0]["obligation_occurrence_id"]

    res_paid = client.post(f"/api/obligation-occurrences/{occ_id}/mark-paid/", json={})
    assert res_paid.status_code == 200
    assert res_paid.json()["paid"] is True
    assert res_paid.json()["assigned_transaction_count"] == 0

    res_unpaid = client.post(f"/api/obligation-occurrences/{occ_id}/unmark-paid/")
    assert res_unpaid.status_code == 200
    assert res_unpaid.json()["paid"] is False


def test_mark_paid_defaults_paid_date_to_due_date_and_is_editable(client):
    cat_id = _create_category(client, "PaidDate")
    res = client.post(
        "/api/obligations/",
        json={
            "name": "Internet",
            "category_id": cat_id,
            "estimated_amount": 100.0,
            "first_due_date": "2026-08-10",
        },
    )
    occ_id = res.json()["occurrences"][0]["obligation_occurrence_id"]

    res_paid = client.post(f"/api/obligation-occurrences/{occ_id}/mark-paid/", json={})
    assert res_paid.json()["paid_date"] == "2026-08-10"  # defaulted from due_date, not "today"

    res_unpaid = client.post(f"/api/obligation-occurrences/{occ_id}/unmark-paid/")
    assert res_unpaid.json()["paid_date"] is None  # cleared alongside paid

    res_paid_explicit = client.post(
        f"/api/obligation-occurrences/{occ_id}/mark-paid/", json={"paid_date": "2026-08-12"}
    )
    assert res_paid_explicit.json()["paid_date"] == "2026-08-12"  # explicit override wins

    res_edit = client.put(
        f"/api/obligation-occurrences/{occ_id}/",
        json={"due_date": "2026-08-10", "estimated_amount": 100.0, "paid_date": "2026-08-15"},
    )
    assert res_edit.status_code == 200
    assert res_edit.json()["paid_date"] == "2026-08-15"  # manually correctable afterward


def test_assign_multiple_transactions_covers_estimate_independent_of_paid(client):
    acc_id, payee_id = _setup_account_and_payee(client)
    cat_id = _create_category(client, "Cards2")
    res = client.post(
        "/api/obligations/",
        json={
            "name": "Credit Card Bill",
            "category_id": cat_id,
            "payee_id": payee_id,
            "estimated_amount": 1500.0,
            "first_due_date": "2026-08-15",
        },
    )
    occ_id = res.json()["occurrences"][0]["obligation_occurrence_id"]

    tx1 = _create_tx(client, acc_id, payee_id, 100.0, "2026-08-01", cat_id)
    tx2 = _create_tx(client, acc_id, payee_id, 1000.0, "2026-08-05", cat_id)
    tx3 = _create_tx(client, acc_id, payee_id, 400.0, "2026-08-10", cat_id)

    res_assign = client.post(
        f"/api/obligation-occurrences/{occ_id}/assign-transactions/",
        json={"transaction_ids": [tx1, tx2, tx3]},
    )
    assert res_assign.status_code == 200
    data = res_assign.json()
    assert data["assigned_total"] == 1500.0
    assert data["assigned_transaction_count"] == 3
    assert data["paid"] is False  # assignment never auto-flips paid

    res_paid = client.post(f"/api/obligation-occurrences/{occ_id}/mark-paid/", json={})
    assert res_paid.json()["paid"] is True
    assert res_paid.json()["assigned_total"] == 1500.0  # unaffected by paid flag

    res2 = client.post(
        "/api/obligations/",
        json={"name": "Other Bill", "category_id": cat_id, "estimated_amount": 50.0, "first_due_date": "2026-08-20"},
    )
    occ2_id = res2.json()["occurrences"][0]["obligation_occurrence_id"]
    res_conflict = client.post(
        f"/api/obligation-occurrences/{occ2_id}/assign-transactions/", json={"transaction_ids": [tx1]}
    )
    assert res_conflict.status_code == 400

    res_unassign = client.post(
        f"/api/obligation-occurrences/{occ_id}/unassign-transactions/",
        json={"transaction_ids": [tx1, tx2, tx3]},
    )
    assert res_unassign.json()["assigned_total"] == 0.0
    assert res_unassign.json()["assigned_transaction_count"] == 0


def test_delete_guarded_by_assigned_transactions(client):
    acc_id, payee_id = _setup_account_and_payee(client)
    cat_id = _create_category(client, "Del")
    res = client.post(
        "/api/obligations/",
        json={"name": "Del Bill", "category_id": cat_id, "estimated_amount": 100.0, "first_due_date": "2026-09-01"},
    )
    ob_id = res.json()["obligation_id"]
    occ_id = res.json()["occurrences"][0]["obligation_occurrence_id"]
    tx = _create_tx(client, acc_id, payee_id, 100.0, "2026-09-01", cat_id)
    client.post(f"/api/obligation-occurrences/{occ_id}/assign-transactions/", json={"transaction_ids": [tx]})

    res_del = client.delete(f"/api/obligations/{ob_id}/")
    assert res_del.status_code == 400

    client.post(f"/api/obligation-occurrences/{occ_id}/unassign-transactions/", json={"transaction_ids": [tx]})
    res_del2 = client.delete(f"/api/obligations/{ob_id}/")
    assert res_del2.status_code == 204


def test_recurring_mark_paid_generates_next_occurrence_idempotently(client):
    cat_id = _create_category(client, "Recur")
    res = client.post(
        "/api/obligations/",
        json={
            "name": "Netflix",
            "category_id": cat_id,
            "is_recurring": True,
            "recurrence": "monthly",
            "estimated_amount": 55.0,
            "first_due_date": "2026-08-01",
        },
    )
    ob_id = res.json()["obligation_id"]
    occ_id = res.json()["occurrences"][0]["obligation_occurrence_id"]

    res_paid = client.post(f"/api/obligation-occurrences/{occ_id}/mark-paid/", json={})
    assert res_paid.status_code == 200

    res_ob = client.get(f"/api/obligations/{ob_id}/")
    occs = res_ob.json()["occurrences"]
    assert len(occs) == 2
    next_occ = next(o for o in occs if o["obligation_occurrence_id"] != occ_id)
    assert next_occ["due_date"] == "2026-09-01"

    # Re-marking the SAME occurrence paid must not generate a second "next"
    # occurrence -- the idempotency guard is scoped to the occurrence being
    # advanced from, not the obligation as a whole.
    res_paid_again = client.post(f"/api/obligation-occurrences/{occ_id}/mark-paid/", json={})
    assert res_paid_again.status_code == 200
    res_ob_after_repeat = client.get(f"/api/obligations/{ob_id}/")
    assert len(res_ob_after_repeat.json()["occurrences"]) == 2

    # On-demand advance always progresses from the latest occurrence, so this
    # legitimately creates a third (October) occurrence, not a no-op.
    res_gen = client.post(f"/api/obligations/{ob_id}/generate-next-occurrence/")
    assert res_gen.status_code == 200
    assert res_gen.json()["generated"] is True
    assert res_gen.json()["occurrence"]["due_date"] == "2026-10-01"

    res_ob2 = client.get(f"/api/obligations/{ob_id}/")
    assert len(res_ob2.json()["occurrences"]) == 3


def test_candidate_transactions_shortlist_sorted_by_date_proximity(client):
    acc_id, payee_id = _setup_account_and_payee(client)
    cat_id = _create_category(client, "Proximity")
    res = client.post(
        "/api/obligations/",
        json={
            "name": "Rent Proximity",
            "category_id": cat_id,
            "payee_id": payee_id,
            "estimated_amount": 1000.0,
            "first_due_date": "2026-08-15",
        },
    )
    occ_id = res.json()["occurrences"][0]["obligation_occurrence_id"]

    # Deliberately create the FARTHEST-from-due-date transaction first so a
    # naive "most recent" sort would rank it above the closer ones.
    tx_far = _create_tx(client, acc_id, payee_id, 100.0, "2026-08-30", cat_id)  # 15 days after
    tx_near = _create_tx(client, acc_id, payee_id, 100.0, "2026-08-16", cat_id)  # 1 day after
    tx_mid = _create_tx(client, acc_id, payee_id, 100.0, "2026-08-20", cat_id)  # 5 days after

    res_cand = client.get(f"/api/obligation-occurrences/{occ_id}/candidate-transactions/")
    ids = [t["transaction_id"] for t in res_cand.json()["results"]]
    assert ids == [tx_near, tx_mid, tx_far]


def test_candidate_transactions_filters_by_window_and_assignment(client):
    acc_id, payee_id = _setup_account_and_payee(client)
    cat_id = _create_category(client, "Cand")
    res = client.post(
        "/api/obligations/",
        json={
            "name": "Insurance",
            "category_id": cat_id,
            "payee_id": payee_id,
            "estimated_amount": 300.0,
            "first_due_date": "2026-10-15",
        },
    )
    occ_id = res.json()["occurrences"][0]["obligation_occurrence_id"]

    tx_in_window = _create_tx(client, acc_id, payee_id, 300.0, "2026-10-10", cat_id)
    tx_out_of_window = _create_tx(client, acc_id, payee_id, 300.0, "2026-01-01", cat_id)

    res_cand = client.get(f"/api/obligation-occurrences/{occ_id}/candidate-transactions/")
    ids = [t["transaction_id"] for t in res_cand.json()["results"]]
    assert tx_in_window in ids
    assert tx_out_of_window not in ids

    client.post(
        f"/api/obligation-occurrences/{occ_id}/assign-transactions/", json={"transaction_ids": [tx_in_window]}
    )
    res_cand2 = client.get(f"/api/obligation-occurrences/{occ_id}/candidate-transactions/")
    ids2 = [t["transaction_id"] for t in res_cand2.json()["results"]]
    assert tx_in_window not in ids2

    res_cand3 = client.get(f"/api/obligation-occurrences/{occ_id}/candidate-transactions/?unassigned_only=false")
    ids3 = [t["transaction_id"] for t in res_cand3.json()["results"]]
    assert tx_in_window in ids3
