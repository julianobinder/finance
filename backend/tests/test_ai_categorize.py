import json

from app import ai_categorize
from app.models import Category


def _seed_categories(db):
    income = Category(name="Income", is_hidden=False)
    rent = Category(name="Rent", is_hidden=False)
    db.add_all([income, rent])
    db.commit()
    return {"Income": income.category_id, "Rent": rent.category_id}


def test_suggest_category_matches_existing_and_proposes_new_category(db, monkeypatch):
    """Mirrors the "Preview with AI" import flow: a raw Portuguese label that
    translates to an existing category should resolve to it, while a label
    with nothing existing to match (e.g. a salary advance) should come back as
    a proposed NEW (translated) category instead of null."""
    ids = _seed_categories(db)

    monkeypatch.setattr(ai_categorize.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(ai_categorize.settings, "ai_provider", "anthropic")

    canned_response = json.dumps(
        [
            {"index": 0, "category": "Rent", "parent": None},
            {"index": 1, "category": "Salary Advance", "parent": "Income"},
        ]
    )
    monkeypatch.setattr(ai_categorize, "_call_anthropic", lambda *args, **kwargs: canned_response)

    results = ai_categorize.suggest_category_matches(db, ["Aluguel", "Adiantamento"])

    assert results[0]["category_id"] == ids["Rent"]
    assert results[0]["category"] is None  # matched existing -> nothing to create

    assert results[1]["category_id"] is None
    assert results[1]["category"] == "Salary Advance"
    assert results[1]["parent"] == "Income"


def test_match_categories_route_returns_new_category_proposal(client, db, monkeypatch):
    _seed_categories(db)

    monkeypatch.setattr(ai_categorize.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(ai_categorize.settings, "ai_provider", "anthropic")
    canned_response = json.dumps([{"index": 0, "category": "Salary Advance", "parent": "Income"}])
    monkeypatch.setattr(ai_categorize, "_call_anthropic", lambda *args, **kwargs: canned_response)

    res = client.post("/api/obligations/ai/match-categories/", json={"labels": ["Adiantamento"]})
    assert res.status_code == 200
    match = res.json()["matches"][0]
    assert match["category_id"] is None
    assert match["category"] == "Salary Advance"
    assert match["parent"] == "Income"
