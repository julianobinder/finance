import logging
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.database import Base
from app.models import *  # Ensure all models register with Base.metadata

logger = logging.getLogger(__name__)

def drop_all_public_objects(db: Session) -> None:
    """Drop all tables, sequences, types, functions, and views in the public schema."""
    logger.info("Dropping all public database schema objects...")
    drop_all_sql = """
    DO $$ DECLARE
        r RECORD;
    BEGIN
        -- Drop all tables
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
        
        -- Drop all sequences
        FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
            EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequence_name) || ' CASCADE';
        END LOOP;
        
        -- Drop all types
        FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'c') LOOP
            EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
        
        -- Drop all functions
        FOR r IN (SELECT proname, oidvectortypes(proargtypes) as argtypes FROM pg_proc INNER JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public') LOOP
            EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.proname) || '(' || r.argtypes || ') CASCADE';
        END LOOP;
        
        -- Drop all views
        FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.viewname) || ' CASCADE';
        END LOOP;
    END $$;
    """
    try:
        db.execute(text(drop_all_sql))
        db.flush()  # Use flush/commit depending on transaction context
        logger.info("Database schema dropped successfully.")
    except SQLAlchemyError as e:
        logger.error(f"SQLAlchemy error during schema drop: {e}")
        raise

def create_all_tables(db: Session) -> None:
    """Create all tables registered on SQLAlchemy Base metadata using the session's connection."""
    logger.info("Recreating database tables...")
    try:
        Base.metadata.create_all(bind=db.connection())
        logger.info("Database tables created successfully.")
    except SQLAlchemyError as e:
        logger.error(f"SQLAlchemy error during table creation: {e}")
        raise

def seed_default_lookups(db: Session) -> None:
    """Seed standard system configuration and lookup records."""
    logger.info("Seeding system lookup data...")
    try:
        # 1. Seed Statuses
        statuses = [(1, "Reconciled"), (2, "Clear"), (3, "Unclear")]
        for sid, name in statuses:
            db.add(Status(status_id=sid, name=name))
        
        # 2. Seed TransactionTypes
        types = [(1, "Withdrawal", "WTH"), (2, "Deposit", "DEP"), (3, "Transfer", "TRF")]
        for tid, name, code in types:
            db.add(TransactionType(transaction_type_id=tid, name=name, code=code))

        # 3. Seed Currencies
        currencies = [
            (1, 'British Pound (GBP)', 'GBP', '£', 1),
            (2, 'Brazilian Real (BRL)', 'BRL', 'R$', 4),
            (3, 'U.S. Dollar (USD)', 'USD', 'US$', 3),
            (4, 'Euro (EUR)', 'EUR', '€', 2)
        ]
        for cid, name, iso, symbol, order in currencies:
            db.add(Currency(currency_id=cid, name=name, iso_code=iso, symbol=symbol, order=order))

        # 4. Seed Account Types
        account_types = [
            (1, 'Current Account', 1),
            (2, 'Credit Card', 2),
            (3, 'Cash', 3),
            (6, 'Assets', 4)
        ]
        for atid, name, code in account_types:
            db.add(AccountType(account_type_id=atid, name=name, code=code))

        # 5. Seed Category ID 9999 (Uncategorized fallback)
        db.add(Category(category_id=9999, name="Uncategorized", is_hidden=True))

        # 6. Seed default hidden categories
        hidden_categories = ["Initial Balance", "Split", "Transfer"]
        for cat_name in hidden_categories:
            db.add(Category(name=cat_name, is_hidden=True))

        db.flush()
        logger.info("Lookup data flushed successfully.")

        # 7. Reset Serial Sequences to prevent PK collision issues
        tables_with_identity = [
            ("currency", "currency_id"),
            ("account_type", "account_type_id"),
            ("transaction_type", "transaction_type_id"),
            ("status", "status_id"),
            ("category", "category_id"),
        ]
        for table, pk in tables_with_identity:
            db.execute(text(
                f'SELECT setval(pg_get_serial_sequence(\'"{table}"\', \'{pk}\'), COALESCE(MAX("{pk}"), 1)) FROM "{table}";'
            ))
        db.flush()
        logger.info("Database auto-increment serial sequences reset successfully.")

    except SQLAlchemyError as e:
        logger.error(f"SQLAlchemy error during lookup seeding: {e}")
        raise
