def test_import_plans_flow(client):
    # Setup dependecies: account and lookups
    res_tit = client.post("/api/accounts/titulars/", json={"name": "Primary"})
    tit_id = res_tit.json()["titular_id"]

    res_cur = client.post("/api/accounts/currencies/", json={"name": "Dollar", "iso_code": "USD", "symbol": "$", "order": 1})
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

    # 1. Create CSV Template (sending frontend alias names: map, type, format)
    template_payload = {
        "name": "Abbey Road Format",
        "fields": [
            {"name": "Transaction Date", "map": "DATE", "type": "date", "format": "DD/MM/YYYY"},
            {"name": "Cost", "map": "AMOUNT", "type": "float", "format": None},
        ]
    }
    res = client.post("/api/accounts/csv-templates/", json=template_payload)
    assert res.status_code == 201
    template = res.json()
    template_id = template["import_csv_id"]
    assert template["name"] == "Abbey Road Format"
    assert len(template["fields"]) == 2
    
    # Assert serialization utilizes the frontend alias keys
    first_field = template["fields"][0]
    assert "map" in first_field
    assert first_field["map"] == "DATE"
    assert "type" in first_field
    assert first_field["type"] == "date"
    assert "format" in first_field
    assert first_field["format"] == "DD/MM/YYYY"
    assert "map_field" not in first_field

    field_id = first_field["import_csv_field_id"]

    # List templates and verify aliases
    res = client.get("/api/accounts/csv-templates/")
    assert res.status_code == 200
    results = res.json()["results"]
    assert len(results) >= 1
    found_template = [t for t in results if t["import_csv_id"] == template_id][0]
    date_field = [f for f in found_template["fields"] if f["name"] == "Transaction Date"][0]
    assert date_field["map"] == "DATE"

    # 2. Create Import Plan
    plan_payload = {
        "name": "E2E Plan",
        "account_id": acc_id,
        "import_csv_id": template_id,
    }
    res = client.post("/api/accounts/import-plans/", json=plan_payload)
    assert res.status_code == 201
    plan = res.json()
    plan_id = plan["import_plan_id"]
    assert plan["name"] == "E2E Plan"

    # List import plans
    res = client.get("/api/accounts/import-plans/")
    assert res.status_code == 200
    assert len(res.json()["results"]) >= 1

    # 3. Create Import Plan Rule
    rule_payload = {
        "import_plan_id": plan_id,
        "import_csv_field_id": field_id,
        "pattern": "Spotify",
        "order": 1,
        "ignore": False,
        "match_type": "contains",
    }
    res = client.post("/api/accounts/import-plan-rules/", json=rule_payload)
    assert res.status_code == 201
    rule = res.json()
    assert rule["pattern"] == "Spotify"
    assert rule["import_plan_id"] == plan_id

    # List rules by plan
    res = client.get(f"/api/accounts/import-plan-rules/plan/{plan_id}/")
    assert res.status_code == 200
    rules = res.json()
    assert len(rules) >= 1
    assert rules[0]["pattern"] == "Spotify"


def test_update_csv_template_with_rule_referenced_field(client):
    # Setup dependencies
    res_tit = client.post("/api/accounts/titulars/", json={"name": "Primary 2"})
    tit_id = res_tit.json()["titular_id"]

    res_cur = client.post("/api/accounts/currencies/", json={"name": "Euro", "iso_code": "EUR", "symbol": "€", "order": 2})
    cur_id = res_cur.json()["currency_id"]

    res_type = client.post("/api/accounts/account-types/", json={"name": "Savings", "code": 11})
    type_id = res_type.json()["account_type_id"]

    res_acc = client.post("/api/accounts/", json={
        "name": "Import Check 2",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 0.0,
    })
    acc_id = res_acc.json()["account_id"]

    # Create CSV Template
    template_payload = {
        "name": "Template With Rule Reference",
        "fields": [
            {"name": "Transaction Date", "map_field": "DATE", "type_field": "date", "format_field": "DD/MM/YYYY"},
            {"name": "Cost", "map_field": "AMOUNT", "type_field": "float", "format_field": None},
        ]
    }
    res = client.post("/api/accounts/csv-templates/", json=template_payload)
    assert res.status_code == 201
    template = res.json()
    template_id = template["import_csv_id"]
    field_id = template["fields"][0]["import_csv_field_id"]

    # Create Import Plan
    plan_payload = {
        "name": "Plan 2",
        "account_id": acc_id,
        "import_csv_id": template_id,
    }
    res = client.post("/api/accounts/import-plans/", json=plan_payload)
    assert res.status_code == 201
    plan_id = res.json()["import_plan_id"]

    # Create Import Plan Rule referencing the first field
    rule_payload = {
        "import_plan_id": plan_id,
        "import_csv_field_id": field_id,
        "pattern": "Netflix",
        "order": 1,
        "ignore": False,
        "match_type": "contains",
    }
    res = client.post("/api/accounts/import-plan-rules/", json=rule_payload)
    assert res.status_code == 201

    # Update template with the same fields (checking in-place update works and preserves IDs)
    update_payload = {
        "name": "Template With Rule Reference Updated",
        "fields": [
            {
                "import_csv_field_id": field_id,
                "name": "Transaction Date Updated",
                "map": "DATE",
                "type": "date",
                "format": "DD/MM/YYYY"
            },
            {
                "import_csv_field_id": template["fields"][1]["import_csv_field_id"],
                "name": "Cost Updated",
                "map": "AMOUNT",
                "type": "float",
                "format": None
            }
        ]
    }
    res = client.put(f"/api/accounts/csv-templates/{template_id}/", json=update_payload)
    assert res.status_code == 200
    updated_template = res.json()
    assert updated_template["name"] == "Template With Rule Reference Updated"
    
    # Assert fields retained their original IDs and updated details are serialized using aliases
    first_updated_field = updated_template["fields"][0]
    assert first_updated_field["import_csv_field_id"] == field_id
    assert first_updated_field["name"] == "Transaction Date Updated"
    assert first_updated_field["map"] == "DATE"
    assert first_updated_field["type"] == "date"
    assert first_updated_field["format"] == "DD/MM/YYYY"


def test_delete_csv_template_field_cascades_to_rules(client):
    # Setup dependencies
    res_tit = client.post("/api/accounts/titulars/", json={"name": "Primary 3"})
    tit_id = res_tit.json()["titular_id"]

    res_cur = client.post("/api/accounts/currencies/", json={"name": "Pound", "iso_code": "GBP", "symbol": "£", "order": 3})
    cur_id = res_cur.json()["currency_id"]

    res_type = client.post("/api/accounts/account-types/", json={"name": "Credit", "code": 12})
    type_id = res_type.json()["account_type_id"]

    res_acc = client.post("/api/accounts/", json={
        "name": "Import Check 3",
        "titular_id": tit_id,
        "currency_id": cur_id,
        "account_type_id": type_id,
        "entry": "2026-05-01",
        "initial_balance": 0.0,
    })
    acc_id = res_acc.json()["account_id"]

    # Create CSV Template
    template_payload = {
        "name": "Template For Deletion Cascade",
        "fields": [
            {"name": "Transaction Date", "map_field": "DATE", "type_field": "date", "format_field": "DD/MM/YYYY"},
            {"name": "Cost", "map_field": "AMOUNT", "type_field": "float", "format_field": None},
        ]
    }
    res = client.post("/api/accounts/csv-templates/", json=template_payload)
    assert res.status_code == 201
    template = res.json()
    template_id = template["import_csv_id"]
    field_id = template["fields"][0]["import_csv_field_id"]

    # Create Import Plan
    plan_payload = {
        "name": "Plan 3",
        "account_id": acc_id,
        "import_csv_id": template_id,
    }
    res = client.post("/api/accounts/import-plans/", json=plan_payload)
    assert res.status_code == 201
    plan_id = res.json()["import_plan_id"]

    # Create Import Plan Rule referencing the first field
    rule_payload = {
        "import_plan_id": plan_id,
        "import_csv_field_id": field_id,
        "pattern": "Netflix",
        "order": 1,
        "ignore": False,
        "match_type": "contains",
    }
    res = client.post("/api/accounts/import-plan-rules/", json=rule_payload)
    assert res.status_code == 201
    rule_id = res.json()["import_plan_rule_id"]

    # Update template and remove the first field (delete it)
    update_payload = {
        "name": "Template For Deletion Cascade Updated",
        "fields": [
            {
                "import_csv_field_id": template["fields"][1]["import_csv_field_id"],
                "name": "Cost",
                "map": "AMOUNT",
                "type": "float",
                "format": None
            }
        ]
    }
    res = client.put(f"/api/accounts/csv-templates/{template_id}/", json=update_payload)
    assert res.status_code == 200

    # Verify that the rule is deleted
    res = client.get(f"/api/accounts/import-plan-rules/plan/{plan_id}/")
    assert res.status_code == 200
    rules = res.json()
    assert len(rules) == 0


