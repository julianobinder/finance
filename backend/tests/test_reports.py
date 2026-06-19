import pytest

def test_reports_data_fetching(client):
    # 1. Fetch data
    res = client.get("/api/reports/data/")
    assert res.status_code == 200
    data = res.json()
    assert "transactions" in data
    assert "categories" in data
    assert "accounts" in data
    assert "account_groups" in data
    assert "payees" in data
    assert "currencies" in data
    
    # Assert currency_code is returned in transaction data if transactions exist
    if data["transactions"]:
        for tx in data["transactions"]:
            assert "currency_code" in tx
            assert isinstance(tx["currency_code"], str)
