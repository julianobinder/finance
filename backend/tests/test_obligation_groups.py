import json

from app import ai_categorize
from app.models import ObligationGroup


def _create_category(client, name):
    res = client.post("/api/accounts/categories/", json={"name": name})
    assert res.status_code == 201
    return res.json()["category_id"]


def _create_group(client, name, category_id=None, direction="payable", recurrence="monthly", **kwargs):
    payload = {"name": name, "category_id": category_id, "direction": direction, "recurrence": recurrence}
    payload.update(kwargs)
    res = client.post("/api/obligation-groups/", json=payload)
    assert res.status_code == 201
    return res.json()


# ── CRUD ────────────────────────────────────────────────────────────────────


def test_create_and_get_group(client):
    cat_id = _create_category(client, "Housing")
    group = _create_group(client, "Aluguel", category_id=cat_id, expected_day_of_month=15)
    assert group["direction"] == "payable"
    assert group["recurrence"] == "monthly"
    assert group["expected_day_of_month"] == 15
    assert group["obligation_count"] == 0

    res_get = client.get(f"/api/obligation-groups/{group['obligation_group_id']}/")
    assert res_get.status_code == 200
    assert res_get.json()["name"] == "Aluguel"


def test_update_group_does_not_cascade_to_members(client):
    cat_id = _create_category(client, "Housing2")
    other_cat_id = _create_category(client, "Other2")
    group = _create_group(client, "Aluguel2", category_id=cat_id)

    res_ob = client.post(
        "/api/obligations/",
        json={"name": "Aluguel Jan", "obligation_group_id": group["obligation_group_id"], "category_id": cat_id},
    )
    assert res_ob.status_code == 201
    ob_id = res_ob.json()["obligation_id"]
    assert res_ob.json()["category_id"] == cat_id

    # Change the group's category -- the already-linked obligation must keep
    # its OWN saved category, unaffected, until an explicit sync.
    res_update = client.put(
        f"/api/obligation-groups/{group['obligation_group_id']}/",
        json={"name": "Aluguel2", "category_id": other_cat_id, "direction": "payable", "recurrence": "monthly"},
    )
    assert res_update.status_code == 200

    res_ob_after = client.get(f"/api/obligations/{ob_id}/")
    assert res_ob_after.json()["category_id"] == cat_id  # unchanged


def test_sync_group_pushes_settings_to_members(client):
    cat_id = _create_category(client, "Housing3")
    new_cat_id = _create_category(client, "Housing3New")
    group = _create_group(client, "Aluguel3", category_id=cat_id, direction="payable", recurrence="monthly")

    res_ob1 = client.post(
        "/api/obligations/",
        json={"name": "Aluguel Jan", "obligation_group_id": group["obligation_group_id"], "category_id": cat_id},
    )
    res_ob2 = client.post(
        "/api/obligations/",
        json={"name": "Aluguel Feb", "obligation_group_id": group["obligation_group_id"], "category_id": cat_id},
    )
    ob1_id, ob2_id = res_ob1.json()["obligation_id"], res_ob2.json()["obligation_id"]

    client.put(
        f"/api/obligation-groups/{group['obligation_group_id']}/",
        json={
            "name": "Aluguel3",
            "category_id": new_cat_id,
            "direction": "receivable",
            "recurrence": "yearly",
        },
    )

    res_sync = client.post(f"/api/obligation-groups/{group['obligation_group_id']}/sync/")
    assert res_sync.status_code == 200
    assert res_sync.json()["updated"] == 2

    for ob_id in (ob1_id, ob2_id):
        ob = client.get(f"/api/obligations/{ob_id}/").json()
        assert ob["category_id"] == new_cat_id
        assert ob["direction"] == "receivable"
        assert ob["recurrence"] == "yearly"
        assert ob["is_recurring"] is True


def test_delete_group_unlinks_members_non_destructively(client):
    group = _create_group(client, "TempGroup")
    res_ob = client.post(
        "/api/obligations/", json={"name": "Temp Bill", "obligation_group_id": group["obligation_group_id"]}
    )
    ob_id = res_ob.json()["obligation_id"]

    res_del = client.delete(f"/api/obligation-groups/{group['obligation_group_id']}/")
    assert res_del.status_code == 204

    res_ob_after = client.get(f"/api/obligations/{ob_id}/")
    assert res_ob_after.status_code == 200  # the obligation itself survives
    assert res_ob_after.json()["obligation_group_id"] is None


def test_move_obligation_in_and_out_of_group(client):
    group_a = _create_group(client, "GroupA")
    group_b = _create_group(client, "GroupB")
    res_ob = client.post("/api/obligations/", json={"name": "Movable Bill", "obligation_group_id": group_a["obligation_group_id"]})
    ob_id = res_ob.json()["obligation_id"]
    assert res_ob.json()["obligation_group_id"] == group_a["obligation_group_id"]

    res_move = client.put(
        f"/api/obligations/{ob_id}/",
        json={"name": "Movable Bill", "obligation_group_id": group_b["obligation_group_id"]},
    )
    assert res_move.json()["obligation_group_id"] == group_b["obligation_group_id"]

    res_remove = client.put(f"/api/obligations/{ob_id}/", json={"name": "Movable Bill", "obligation_group_id": None})
    assert res_remove.json()["obligation_group_id"] is None


def test_match_groups_requires_ai_provider(client):
    res = client.post("/api/obligations/ai/match-groups/", json={"labels": ["Aluguel"]})
    assert res.status_code == 400


# ── AI group-matching (mocked provider) ──────────────────────────────────────


def test_suggest_group_matches_returns_existing_group_id(db, monkeypatch):
    group = ObligationGroup(name="Aluguel", direction="payable", recurrence="monthly")
    db.add(group)
    db.commit()

    monkeypatch.setattr(ai_categorize.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(ai_categorize.settings, "ai_provider", "anthropic")
    canned = json.dumps([{"index": 0, "group": "Aluguel"}, {"index": 1, "group": None}])
    monkeypatch.setattr(ai_categorize, "_call_anthropic", lambda *a, **k: canned)

    results = ai_categorize.suggest_group_matches(db, ["ALUGUEL APTO CENTRO", "Something Unrelated"])
    assert results[0]["obligation_group_id"] == group.obligation_group_id
    assert results[1]["obligation_group_id"] is None


def test_suggest_group_matches_short_circuits_when_no_groups_exist(db, monkeypatch):
    monkeypatch.setattr(ai_categorize.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(ai_categorize.settings, "ai_provider", "anthropic")

    def _boom(*args, **kwargs):
        raise AssertionError("should not call the LLM when there are no groups to match against")

    monkeypatch.setattr(ai_categorize, "_call_anthropic", _boom)
    results = ai_categorize.suggest_group_matches(db, ["Aluguel"])
    assert results == [{"index": 0, "obligation_group_id": None}]


# ── Import integration ───────────────────────────────────────────────────────

_IMPORT_FMT_WITH_PERIOD = json.dumps(
    {
        "file_type": "csv",
        "header_row": 1,
        "fields": [
            {"target_field": "name", "source_column": "Name"},
            {"target_field": "amount", "source_column": "Amount"},
            {"target_field": "due_date", "source_column": "DueDate"},
            {"target_field": "period", "source_column": "Mes"},
        ],
    }
)


def test_import_exact_name_match_links_group_and_overrides_settings(client):
    cat_id = _create_category(client, "GroupCat")
    group = _create_group(client, "Aluguel4", category_id=cat_id, direction="payable", recurrence="monthly")

    # A single-row import (would normally be one-off, uncategorized) whose
    # name exactly matches the group -- the group's category+cadence should
    # win, and the row should link to it.
    csv_content = "Name,Amount,DueDate,Mes\nAluguel4,1800,2026-08-15,2026 08\n".encode("utf-8")
    res = client.post(
        "/api/obligation-import/apply/",
        files={"file": ("aluguel.csv", csv_content, "text/csv")},
        data={"format_json": _IMPORT_FMT_WITH_PERIOD},
    )
    assert res.status_code == 200
    ob_id = res.json()["obligation_ids"][0]

    ob = client.get(f"/api/obligations/{ob_id}/").json()
    assert ob["obligation_group_id"] == group["obligation_group_id"]
    assert ob["category_id"] == cat_id
    assert ob["is_recurring"] is True
    assert ob["recurrence"] == "monthly"
    occ = ob["occurrences"][0]
    assert occ["period"] == "2026-08"


def test_import_apply_with_ai_suggested_group_resolution(client):
    cat_id = _create_category(client, "GroupCat2")
    group = _create_group(client, "Salario", category_id=cat_id, direction="receivable", recurrence="monthly")

    csv_content = "Name,Amount,DueDate\nSALARIO MENSAL,3000,2026-08-05\n".encode("utf-8")
    fmt = json.dumps(
        {
            "file_type": "csv",
            "header_row": 1,
            "fields": [
                {"target_field": "name", "source_column": "Name"},
                {"target_field": "amount", "source_column": "Amount"},
                {"target_field": "due_date", "source_column": "DueDate"},
            ],
        }
    )
    res_preview = client.post(
        "/api/obligation-import/preview/",
        files={"file": ("salario.csv", csv_content, "text/csv")},
        data={"format_json": fmt},
    )
    assert res_preview.status_code == 200
    row = res_preview.json()["rows"][0]
    assert row["obligation_group_id"] is None  # "SALARIO MENSAL" != "Salario" exactly

    resolutions = json.dumps({str(row["occurrence_of_row"]): {"obligation_group_id": group["obligation_group_id"]}})
    res_apply = client.post(
        "/api/obligation-import/apply/",
        files={"file": ("salario.csv", csv_content, "text/csv")},
        data={"format_json": fmt, "resolutions": resolutions},
    )
    assert res_apply.status_code == 200
    ob_id = res_apply.json()["obligation_ids"][0]
    ob = client.get(f"/api/obligations/{ob_id}/").json()
    assert ob["obligation_group_id"] == group["obligation_group_id"]
    assert ob["category_id"] == cat_id
    assert ob["direction"] == "receivable"


def test_preview_lists_unmatched_group_names(client):
    csv_content = "Name,Amount,DueDate\nBrand New Bill,100,2026-08-05\n".encode("utf-8")
    fmt = json.dumps(
        {
            "file_type": "csv",
            "header_row": 1,
            "fields": [
                {"target_field": "name", "source_column": "Name"},
                {"target_field": "amount", "source_column": "Amount"},
                {"target_field": "due_date", "source_column": "DueDate"},
            ],
        }
    )
    res = client.post(
        "/api/obligation-import/preview/",
        files={"file": ("new.csv", csv_content, "text/csv")},
        data={"format_json": fmt},
    )
    assert res.status_code == 200
    assert "Brand New Bill" in res.json()["unmatched_group_names"]


# ── period parsing/derivation ────────────────────────────────────────────────


def test_import_period_column_parses_various_formats(client):
    csv_content = (
        "Name,Amount,DueDate,Mes\n"
        "Bill A,100,2026-08-05,2026 08\n"
        "Bill B,100,2026-09-05,09/2026\n"
        "Bill C,100,2026-10-05,Out 2026\n"
    ).encode("utf-8")
    res = client.post(
        "/api/obligation-import/apply/",
        files={"file": ("periods.csv", csv_content, "text/csv")},
        data={"format_json": _IMPORT_FMT_WITH_PERIOD},
    )
    assert res.status_code == 200
    ob_ids = res.json()["obligation_ids"]
    periods = set()
    for ob_id in ob_ids:
        ob = client.get(f"/api/obligations/{ob_id}/").json()
        for occ in ob["occurrences"]:
            periods.add(occ["period"])
    assert periods == {"2026-08", "2026-09", "2026-10"}


def test_occurrence_period_defaults_from_due_date_when_unset(client):
    res = client.post(
        "/api/obligations/",
        json={"name": "No Period Bill", "estimated_amount": 50.0, "first_due_date": "2026-08-20"},
    )
    occ = res.json()["occurrences"][0]
    assert occ["period"] == "2026-08"


# ── occurrence status/date filters ───────────────────────────────────────────


def test_occurrence_status_and_period_filters(client):
    res_late = client.post(
        "/api/obligations/",
        json={"name": "Late Bill", "estimated_amount": 50.0, "first_due_date": "2020-01-01"},
    )
    res_pending = client.post(
        "/api/obligations/",
        json={"name": "Pending Bill", "estimated_amount": 50.0, "first_due_date": "2030-01-01"},
    )
    res_paid = client.post(
        "/api/obligations/",
        json={"name": "Paid Bill", "estimated_amount": 50.0, "first_due_date": "2026-08-05", "first_paid": True},
    )
    late_occ_id = res_late.json()["occurrences"][0]["obligation_occurrence_id"]
    pending_occ_id = res_pending.json()["occurrences"][0]["obligation_occurrence_id"]
    paid_occ_id = res_paid.json()["occurrences"][0]["obligation_occurrence_id"]

    late_ids = {o["obligation_occurrence_id"] for o in client.get("/api/obligation-occurrences/?status=late").json()["results"]}
    pending_ids = {o["obligation_occurrence_id"] for o in client.get("/api/obligation-occurrences/?status=pending").json()["results"]}
    paid_ids = {o["obligation_occurrence_id"] for o in client.get("/api/obligation-occurrences/?status=paid").json()["results"]}

    assert late_occ_id in late_ids and late_occ_id not in pending_ids and late_occ_id not in paid_ids
    assert pending_occ_id in pending_ids and pending_occ_id not in late_ids and pending_occ_id not in paid_ids
    assert paid_occ_id in paid_ids and paid_occ_id not in late_ids and paid_occ_id not in pending_ids

    res_year = client.get("/api/obligation-occurrences/?year=2030")
    assert pending_occ_id in {o["obligation_occurrence_id"] for o in res_year.json()["results"]}
    assert late_occ_id not in {o["obligation_occurrence_id"] for o in res_year.json()["results"]}

    res_month = client.get("/api/obligation-occurrences/?month=8")
    assert paid_occ_id in {o["obligation_occurrence_id"] for o in res_month.json()["results"]}


def test_occurrence_search_filter_matches_name_and_note(client):
    res1 = client.post(
        "/api/obligations/",
        json={"name": "Netflix Subscription", "estimated_amount": 50.0, "first_due_date": "2026-08-05"},
    )
    res2 = client.post(
        "/api/obligations/",
        json={"name": "Water Bill", "estimated_amount": 80.0, "first_due_date": "2026-08-06"},
    )
    occ1_id = res1.json()["occurrences"][0]["obligation_occurrence_id"]
    occ2_id = res2.json()["occurrences"][0]["obligation_occurrence_id"]
    client.put(
        f"/api/obligation-occurrences/{occ2_id}/",
        json={"due_date": "2026-08-06", "estimated_amount": 80.0, "note": "unusual leak this month"},
    )

    res_name = client.get("/api/obligation-occurrences/?search=Netflix")
    name_ids = {o["obligation_occurrence_id"] for o in res_name.json()["results"]}
    assert occ1_id in name_ids
    assert occ2_id not in name_ids

    res_note = client.get("/api/obligation-occurrences/?search=unusual")
    note_ids = {o["obligation_occurrence_id"] for o in res_note.json()["results"]}
    assert occ2_id in note_ids
    assert occ1_id not in note_ids


def test_occurrence_direction_filter(client):
    res_payable = client.post(
        "/api/obligations/",
        json={"name": "Direction Payable Bill", "direction": "payable", "estimated_amount": 50.0, "first_due_date": "2026-08-05"},
    )
    res_receivable = client.post(
        "/api/obligations/",
        json={"name": "Direction Receivable Bill", "direction": "receivable", "estimated_amount": 50.0, "first_due_date": "2026-08-05"},
    )
    payable_occ_id = res_payable.json()["occurrences"][0]["obligation_occurrence_id"]
    receivable_occ_id = res_receivable.json()["occurrences"][0]["obligation_occurrence_id"]

    res_p = client.get("/api/obligation-occurrences/?direction=payable")
    p_ids = {o["obligation_occurrence_id"] for o in res_p.json()["results"]}
    assert payable_occ_id in p_ids
    assert receivable_occ_id not in p_ids

    res_r = client.get("/api/obligation-occurrences/?direction=receivable")
    r_ids = {o["obligation_occurrence_id"] for o in res_r.json()["results"]}
    assert receivable_occ_id in r_ids
    assert payable_occ_id not in r_ids


def test_occurrence_category_filter_rolls_up_subcategories(client):
    parent_cat = client.post("/api/accounts/categories/", json={"name": "OccFilterParent"}).json()["category_id"]
    sub_cat = client.post(
        "/api/accounts/categories/", json={"name": "OccFilterChild", "parent_category_id": parent_cat}
    ).json()["category_id"]
    other_cat = client.post("/api/accounts/categories/", json={"name": "OccFilterOther"}).json()["category_id"]

    res_sub = client.post(
        "/api/obligations/",
        json={"name": "Sub Category Bill", "category_id": sub_cat, "estimated_amount": 50.0, "first_due_date": "2026-08-05"},
    )
    res_other = client.post(
        "/api/obligations/",
        json={"name": "Other Category Bill", "category_id": other_cat, "estimated_amount": 50.0, "first_due_date": "2026-08-05"},
    )
    sub_occ_id = res_sub.json()["occurrences"][0]["obligation_occurrence_id"]
    other_occ_id = res_other.json()["occurrences"][0]["obligation_occurrence_id"]

    # Filtering by the PARENT category rolls up occurrences tagged to its subcategory.
    res_parent_filter = client.get(f"/api/obligation-occurrences/?category_id={parent_cat}")
    parent_ids = {o["obligation_occurrence_id"] for o in res_parent_filter.json()["results"]}
    assert sub_occ_id in parent_ids
    assert other_occ_id not in parent_ids

    # Filtering by the exact subcategory only matches that one.
    res_sub_filter = client.get(f"/api/obligation-occurrences/?category_id={sub_cat}")
    sub_ids = {o["obligation_occurrence_id"] for o in res_sub_filter.json()["results"]}
    assert sub_occ_id in sub_ids
    assert other_occ_id not in sub_ids
