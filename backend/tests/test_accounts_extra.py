import pytest
from io import BytesIO

def test_account_lookup_data(client):
    # Seed a titular, currency, holder, group, type
    res_tit = client.post("/api/accounts/titulars/", json={"name": "LookTit"})
    assert res_tit.status_code == 201
    
    res_cur = client.post("/api/accounts/currencies/", json={"name": "Euro", "iso_code": "EUR", "symbol": "€", "order": 5})
    assert res_cur.status_code == 201

    res_holder = client.post("/api/accounts/account-holders/", json={"name": "LookHolder"})
    assert res_holder.status_code == 201

    res_group = client.post("/api/accounts/account-groups/", json={"name": "LookGroup"})
    assert res_group.status_code == 201

    res_type = client.post("/api/accounts/account-types/", json={"name": "LookType", "code": 99})
    assert res_type.status_code == 201

    # Fetch lookup data
    res = client.get("/api/accounts/lookup-data/")
    assert res.status_code == 200
    data = res.json()
    
    assert any(c["iso_code"] == "EUR" for c in data["currencies"])
    assert any(t["name"] == "LookTit" for t in data["titulars"])
    assert any(h["name"] == "LookHolder" for h in data["account_holders"])
    assert any(g["name"] == "LookGroup" for g in data["account_groups"])
    assert any(at["name"] == "LookType" for at in data["account_types"])


def test_account_toggle_status_and_statistics(client):
    # Setup dependencies
    res_tit = client.post("/api/accounts/titulars/", json={"name": "StatsTit"})
    tit_id = res_tit.json()["titular_id"]

    res_cur = client.post("/api/accounts/currencies/", json={"name": "USD", "iso_code": "USD", "symbol": "$", "order": 1})
    cur_id = res_cur.json()["currency_id"]

    res_type = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res_type.json()["account_type_id"]

    # Create account A (Active, Hidden=False)
    res_accA = client.post("/api/accounts/", json={
        "name": "Checking USD",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 100.0,
        "is_hidden": False,
        "is_closed": False,
    })
    accA_id = res_accA.json()["account_id"]

    # Create account B (Hidden=True)
    res_accB = client.post("/api/accounts/", json={
        "name": "Hidden USD",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 200.0,
        "is_hidden": True,
        "is_closed": False,
    })

    # 1. Test toggle-status on account A
    res_toggle = client.post(f"/api/accounts/{accA_id}/toggle-status/")
    assert res_toggle.status_code == 200
    assert res_toggle.json()["is_closed"] is True

    # Check that account is closed now
    res_get = client.get(f"/api/accounts/{accA_id}/")
    assert res_get.json()["is_closed"] is True

    # Toggle back to open
    res_toggle2 = client.post(f"/api/accounts/{accA_id}/toggle-status/")
    assert res_toggle2.status_code == 200
    assert res_toggle2.json()["is_closed"] is False

    # Check toggle non-existent account returns 404
    res_toggle_404 = client.post("/api/accounts/99999/toggle-status/")
    assert res_toggle_404.status_code == 404

    # 2. Test account statistics
    res_stats = client.get("/api/accounts/statistics/")
    assert res_stats.status_code == 200
    stats = res_stats.json()
    assert stats["total_accounts"] >= 2
    # Checking USD is active and not hidden
    # Hidden USD is hidden (excluded from active count)
    assert stats["active_accounts"] >= 1
    assert stats["hidden_accounts"] >= 1


def test_consolidated_balances(client):
    # Setup dependencies
    res_tit = client.post("/api/accounts/titulars/", json={"name": "ConsolTit"})
    tit_id = res_tit.json()["titular_id"]

    res_cur1 = client.post("/api/accounts/currencies/", json={"name": "USD", "iso_code": "USD", "symbol": "$", "order": 1})
    cur1_id = res_cur1.json()["currency_id"]

    res_cur2 = client.post("/api/accounts/currencies/", json={"name": "EUR", "iso_code": "EUR", "symbol": "€", "order": 2})
    cur2_id = res_cur2.json()["currency_id"]

    res_type = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res_type.json()["account_type_id"]

    # Create account A (1000 USD)
    client.post("/api/accounts/", json={
        "name": "Checking USD",
        "titular_id": tit_id,
        "currency_id": cur1_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 1000.0,
    })

    # Create account B (500 EUR)
    client.post("/api/accounts/", json={
        "name": "Savings EUR",
        "titular_id": tit_id,
        "currency_id": cur2_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 500.0,
    })

    # Get consolidated balances
    res = client.get("/api/accounts/consolidated-balances/")
    assert res.status_code == 200
    data = res.json()

    assert "rates" in data
    assert "original_totals" in data
    assert "consolidated_balances" in data

    # Check EUR rate is 0.92 (default fallback rate)
    eur_rate = data["rates"]["EUR"]
    assert eur_rate == 0.92

    # Check original totals
    # Note: USD total might include USD accounts from other tests if DB not completely clean, 
    # but since db fixture has rollback-level isolation per test, it should be exactly 1000.0 USD and 500.0 EUR
    assert data["original_totals"]["USD"] == 1000.0
    assert data["original_totals"]["EUR"] == 500.0

    # Verify calculation:
    # 1000.0 USD = 1000.0 / 1.0 = 1000.0 USD
    # 500.0 EUR = 500.0 / 0.92 = 543.47826 USD
    # Total USD = 1543.47826 USD
    # Total EUR = 1543.47826 * 0.92 = 1420.0 EUR (which is 1000 * 0.92 + 500 = 920 + 500 = 1420)
    assert abs(data["consolidated_balances"]["USD"] - 1543.48) < 0.1
    assert abs(data["consolidated_balances"]["EUR"] - 1420.0) < 0.1


def test_analyze_csv(client):
    csv_data = "Transaction Date,Cost,Payee,Comment\n2026-05-20,10.50,Spotify,Premium subscription\n"
    file_payload = {"file": ("statement.csv", BytesIO(csv_data.encode("utf-8")), "text/csv")}
    
    res = client.post("/api/accounts/analyze-csv/", files=file_payload)
    assert res.status_code == 200
    fields = res.json()["fields"]
    
    assert len(fields) == 4
    assert fields[0]["name"] == "Transaction Date"
    assert fields[1]["name"] == "Cost"
    assert fields[2]["name"] == "Payee"
    assert fields[3]["name"] == "Comment"


def test_import_plan_helpers(client):
    # Setup template
    template_payload = {
        "name": "Abbey Road Format",
        "fields": [
            {"name": "Date", "map_field": "DATE", "type_field": "date", "format_field": "DD/MM/YYYY"},
            {"name": "Amount", "map_field": "AMOUNT", "type_field": "float", "format_field": None},
        ]
    }
    res_template = client.post("/api/accounts/csv-templates/", json=template_payload)
    template = res_template.json()
    template_id = template["import_csv_id"]
    field_id = template["fields"][0]["import_csv_field_id"]

    # Setup account
    res_tit = client.post("/api/accounts/titulars/", json={"name": "HelperTit"})
    tit_id = res_tit.json()["titular_id"]
    res_cur = client.post("/api/accounts/currencies/", json={"name": "USD", "iso_code": "USD", "symbol": "$", "order": 1})
    cur_id = res_cur.json()["currency_id"]
    res_type = client.post("/api/accounts/account-types/", json={"name": "Checking", "code": 10})
    type_id = res_type.json()["account_type_id"]
    res_acc = client.post("/api/accounts/", json={
        "name": "Import Check",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 0.0,
    })
    acc_id = res_acc.json()["account_id"]

    # Create Import Plan
    plan_payload = {
        "name": "E2E Plan",
        "account_id": acc_id,
        "import_csv_id": template_id,
    }
    res_plan = client.post("/api/accounts/import-plans/", json=plan_payload)
    plan_id = res_plan.json()["import_plan_id"]

    # Create Import Plan Rule
    rule_payload = {
        "import_plan_id": plan_id,
        "import_csv_field_id": field_id,
        "pattern": "Spotify",
        "order": 1,
        "ignore": False,
        "match_type": "contains",
    }
    client.post("/api/accounts/import-plan-rules/", json=rule_payload)

    # 1. Test get plans by template
    res_plans_by_template = client.get(f"/api/accounts/import-plans/template/{template_id}/")
    assert res_plans_by_template.status_code == 200
    plans_by_template = res_plans_by_template.json()
    assert len(plans_by_template) >= 1
    assert plans_by_template[0]["import_plan_id"] == plan_id

    # 2. Test get import plan fields
    res_fields = client.get(f"/api/accounts/import-plans/fields/{template_id}/")
    assert res_fields.status_code == 200
    fields_list = res_fields.json()
    assert len(fields_list) >= 2
    assert any(f["import_csv_field_id"] == field_id for f in fields_list)

    # 3. Test get import plan rules by plan
    res_rules_by_plan = client.get(f"/api/accounts/import-plan-rules/plan/{plan_id}/")
    assert res_rules_by_plan.status_code == 200
    rules_by_plan = res_rules_by_plan.json()
    assert len(rules_by_plan) >= 1
    assert rules_by_plan[0]["pattern"] == "Spotify"
