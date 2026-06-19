import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

# Ensure test environment config uses the unit test DB
os.environ["POSTGRESQL_URL"] = "postgresql://finance:Lem0n4de-@localhost:5432/finance_unit_test"

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models import (
    Account,
    AccountGroup,
    AccountGroupAccount,
    AccountHolder,
    AccountType,
    Category,
    Currency,
    ImportCSV,
    ImportCsvField,
    ImportPlan,
    ImportPlanRule,
    Payee,
    Status,
    Transaction,
    TransactionType,
)

engine = create_engine(settings.postgresql_url)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    # Create tables
    Base.metadata.create_all(bind=engine)

    # Seed static lookup values required by business logic
    session = TestingSessionLocal()
    try:
        # Seed Statuses
        statuses = [(1, "Reconciled"), (2, "Clear"), (3, "Unclear")]
        for sid, name in statuses:
            if not session.query(Status).filter(Status.status_id == sid).first():
                session.add(Status(status_id=sid, name=name))

        # Seed TransactionTypes
        types = [(1, "Withdrawal", "WTH"), (2, "Deposit", "DEP"), (3, "Transfer", "TRF")]
        for tid, name, code in types:
            if not session.query(TransactionType).filter(TransactionType.transaction_type_id == tid).first():
                session.add(TransactionType(transaction_type_id=tid, name=name, code=code))

        # Seed default Categories
        categories = ["Initial Balance", "Split", "Transfer"]
        for cat_name in categories:
            if not session.query(Category).filter(Category.name == cat_name).first():
                session.add(Category(name=cat_name, is_hidden=True))

        session.commit()
    finally:
        session.close()

    yield

    # Teardown tables
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    """Connection-level transaction rollback fixture for test isolation"""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    """FastAPI TestClient with overridden get_db dependency"""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
