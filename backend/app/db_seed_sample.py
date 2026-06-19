import logging
from datetime import date, datetime, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.db_reinit import drop_all_public_objects, create_all_tables, seed_default_lookups
from app.models import (
    Titular,
    AccountHolder,
    AccountGroup,
    Category,
    Payee,
    Account,
    Transaction,
    Status,
    TransactionType,
    Currency,
    AccountType,
)

logger = logging.getLogger(__name__)


def seed_sample_data(db: Session) -> None:
    """Recreate database and populate it with rich, multi-currency sample records."""
    logger.info("Initializing sample database load...")
    try:
        # Rebuild standard database schema and defaults
        drop_all_public_objects(db)
        create_all_tables(db)
        seed_default_lookups(db)

        # 1. Seed Titulars (Account Owners)
        alice = Titular(name="Alice Smith")
        bob = Titular(name="Bob Smith")
        db.add_all([alice, bob])
        db.flush()

        # 2. Seed Account Holders (Financial Institutions)
        barclays = AccountHolder(name="Barclays Bank", comments="UK retail checking provider")
        hsbc = AccountHolder(name="HSBC Bank", comments="Business credit cards")
        chase = AccountHolder(name="Chase Bank", comments="US assets and savings")
        itau = AccountHolder(name="Itaú Unibanco", comments="Brazilian checking/savings")
        db.add_all([barclays, hsbc, chase, itau])
        db.flush()

        # 3. Seed Account Groups
        personal_group = AccountGroup(name="Personal", order=0)
        kids_group = AccountGroup(name="Kids", order=1)
        business_group = AccountGroup(name="Business", order=2)
        db.add_all([personal_group, kids_group, business_group])
        db.flush()

        # 4. Seed Categories and Subcategories
        # Parent categories
        housing = Category(name="Housing", is_hidden=False)
        food = Category(name="Food", is_hidden=False)
        transport = Category(name="Transportation", is_hidden=False)
        ent = Category(name="Entertainment", is_hidden=False)
        salary = Category(name="Salary", is_hidden=False)
        kids_cat = Category(name="Kids", is_hidden=False)
        business_exp = Category(name="Business Expenses", is_hidden=False)
        db.add_all([housing, food, transport, ent, salary, kids_cat, business_exp])
        db.flush()

        # Subcategories
        sub_rent = Category(name="Rent", parent_category_id=housing.category_id, is_hidden=False)
        sub_power = Category(name="Electricity & Gas", parent_category_id=housing.category_id, is_hidden=False)
        sub_groceries = Category(name="Groceries", parent_category_id=food.category_id, is_hidden=False)
        sub_restaurants = Category(name="Restaurants & Coffee", parent_category_id=food.category_id, is_hidden=False)
        sub_fuel = Category(name="Fuel", parent_category_id=transport.category_id, is_hidden=False)
        sub_uber = Category(name="Uber & Taxi", parent_category_id=transport.category_id, is_hidden=False)
        sub_movies = Category(name="Movies & Shows", parent_category_id=ent.category_id, is_hidden=False)
        sub_streaming = Category(name="Streaming Services", parent_category_id=ent.category_id, is_hidden=False)
        sub_wage = Category(name="Monthly Wage", parent_category_id=salary.category_id, is_hidden=False)
        sub_bonus = Category(name="Bonus", parent_category_id=salary.category_id, is_hidden=False)
        sub_schooling = Category(name="Schooling & Books", parent_category_id=kids_cat.category_id, is_hidden=False)
        sub_toys = Category(name="Toys & Games", parent_category_id=kids_cat.category_id, is_hidden=False)
        sub_software = Category(name="Software Tools", parent_category_id=business_exp.category_id, is_hidden=False)
        sub_travel = Category(name="Business Travel", parent_category_id=business_exp.category_id, is_hidden=False)

        db.add_all([
            sub_rent,
            sub_power,
            sub_groceries,
            sub_restaurants,
            sub_fuel,
            sub_uber,
            sub_movies,
            sub_streaming,
            sub_wage,
            sub_bonus,
            sub_schooling,
            sub_toys,
            sub_software,
            sub_travel,
        ])
        db.flush()

        # 5. Seed Payees
        payee_landlord = Payee(name="Landlord Ltd", comment="Home lease")
        payee_employer = Payee(name="Employer Corp", comment="Salary payroll")
        payee_supermarket = Payee(name="Local Supermarket", comment="Grocery vendor")
        payee_costa = Payee(name="Costa Coffee", comment="Meetings and meals")
        payee_netflix = Payee(name="Netflix", comment="Streaming media subscription")
        payee_uber = Payee(name="Uber", comment="Commute travels")
        payee_shell = Payee(name="Shell Fuel Station", comment="Gasoline station")
        payee_school = Payee(name="School Bookstore", comment="Children textbooks")
        payee_aws = Payee(name="AWS Cloud Services", comment="Server computing expenses")
        db.add_all([
            payee_landlord,
            payee_employer,
            payee_supermarket,
            payee_costa,
            payee_netflix,
            payee_uber,
            payee_shell,
            payee_school,
            payee_aws,
        ])
        db.flush()

        # 6. Seed Accounts
        initial_bal_cat = db.query(Category).filter(Category.name == "Initial Balance").first()
        initial_bal_cat_id = initial_bal_cat.category_id if initial_bal_cat else 9999

        # Checking Account (GBP)
        checking = Account(
            name="Alice Checking",
            titular_id=alice.titular_id,
            account_holder_id=barclays.account_holder_id,
            sort_code="20-30-40",
            number="12345678",
            currency_id=1,  # GBP
            is_closed=False,
            entry=date(2026, 1, 1),
            comment="Primary household current account",
            account_type_id=1,  # Current Account
            order=1,
            is_hidden=False,
        )
        checking.groups.append(personal_group)
        db.add(checking)
        db.flush()

        checking_init = Transaction(
            account_id=checking.account_id,
            transaction_type_id=2,  # Deposit
            status_id=1,  # Reconciled
            entry=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 1, 1),
            amount=2500.00,
            category_id=initial_bal_cat_id,
            comment="Initial Balance",
        )
        db.add(checking_init)

        # Business Card (GBP)
        business_card = Account(
            name="Bob Business HSBC",
            titular_id=bob.titular_id,
            account_holder_id=hsbc.account_holder_id,
            number="4567-8901-2345-6789",
            currency_id=1,  # GBP
            is_closed=False,
            entry=date(2026, 1, 1),
            comment="Bob's business credit card",
            account_type_id=2,  # Credit Card
            order=2,
            is_hidden=False,
        )
        business_card.groups.append(business_group)
        db.add(business_card)
        db.flush()

        cc_init = Transaction(
            account_id=business_card.account_id,
            transaction_type_id=2,  # Deposit
            status_id=1,  # Reconciled
            entry=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 1, 1),
            amount=5000.00,
            category_id=initial_bal_cat_id,
            comment="Initial Balance",
        )
        db.add(cc_init)

        # Kids College Fund (USD)
        kids_savings = Account(
            name="Kids College Fund",
            titular_id=alice.titular_id,
            account_holder_id=chase.account_holder_id,
            number="98765432",
            currency_id=3,  # USD
            is_closed=False,
            entry=date(2026, 1, 1),
            comment="Savings fund for kids education",
            account_type_id=6,  # Assets
            order=3,
            is_hidden=False,
        )
        kids_savings.groups.append(kids_group)
        db.add(kids_savings)
        db.flush()

        savings_init = Transaction(
            account_id=kids_savings.account_id,
            transaction_type_id=2,  # Deposit
            status_id=1,  # Reconciled
            entry=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 1, 1),
            amount=1500.00,
            category_id=initial_bal_cat_id,
            comment="Initial Balance",
        )
        db.add(savings_init)
        db.flush()

        # 7. Seed Sample Transactions
        # Salary deposit into Checking
        salary_tx = Transaction(
            account_id=checking.account_id,
            transaction_type_id=2,  # Deposit
            status_id=1,  # Reconciled
            entry=datetime(2026, 5, 25, 9, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 5, 25),
            amount=3200.00,
            category_id=sub_wage.category_id,
            payee_id=payee_employer.payee_id,
            comment="Alice Monthly Salary",
        )
        db.add(salary_tx)

        # Rent payment from checking
        rent_tx = Transaction(
            account_id=checking.account_id,
            transaction_type_id=1,  # Withdrawal
            status_id=1,  # Reconciled
            entry=datetime(2026, 6, 1, 10, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 6, 1),
            amount=-950.00,
            category_id=sub_rent.category_id,
            payee_id=payee_landlord.payee_id,
            comment="Flat lease payment",
        )
        db.add(rent_tx)

        # Subscriptions on Credit Card
        netflix_tx = Transaction(
            account_id=business_card.account_id,
            transaction_type_id=1,  # Withdrawal
            status_id=2,  # Clear
            entry=datetime(2026, 6, 5, 2, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 6, 5),
            amount=-15.99,
            category_id=sub_streaming.category_id,
            payee_id=payee_netflix.payee_id,
            comment="Monthly netflix streaming",
        )
        db.add(netflix_tx)

        aws_tx = Transaction(
            account_id=business_card.account_id,
            transaction_type_id=1,  # Withdrawal
            status_id=2,  # Clear
            entry=datetime(2026, 6, 7, 3, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 6, 7),
            amount=-280.00,
            category_id=sub_software.category_id,
            payee_id=payee_aws.payee_id,
            comment="Web computing cloud AWS",
        )
        db.add(aws_tx)

        # Groceries from checking
        groceries_tx = Transaction(
            account_id=checking.account_id,
            transaction_type_id=1,  # Withdrawal
            status_id=3,  # Unclear
            entry=datetime(2026, 6, 10, 14, 30, 0, tzinfo=timezone.utc),
            cash=date(2026, 6, 10),
            amount=-125.40,
            category_id=sub_groceries.category_id,
            payee_id=payee_supermarket.payee_id,
            comment="Weekly grocery run",
        )
        db.add(groceries_tx)

        # Kids schooling textbooks from checking
        school_tx = Transaction(
            account_id=checking.account_id,
            transaction_type_id=1,  # Withdrawal
            status_id=2,  # Clear
            entry=datetime(2026, 6, 12, 11, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 6, 12),
            amount=-75.00,
            category_id=sub_schooling.category_id,
            payee_id=payee_school.payee_id,
            comment="Alice kids textbooks",
        )
        db.add(school_tx)
        db.flush()

        # 8. Split Transaction (Costa Coffee - total -40.00, split into personal food (-15) and business travel (-25))
        split_cat = db.query(Category).filter(Category.name == "Split").first()
        split_cat_id = split_cat.category_id if split_cat else 9999

        parent_split_tx = Transaction(
            account_id=checking.account_id,
            transaction_type_id=1,  # Withdrawal
            status_id=2,  # Clear
            entry=datetime(2026, 6, 14, 15, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 6, 14),
            amount=-40.00,
            category_id=split_cat_id,
            payee_id=payee_costa.payee_id,
            comment="Coffee with client",
        )
        db.add(parent_split_tx)
        db.flush()

        child_split_1 = Transaction(
            account_id=checking.account_id,
            transaction_type_id=1,
            status_id=2,
            payee_id=payee_costa.payee_id,
            category_id=sub_restaurants.category_id,
            amount=-15.00,
            comment="Coffee with client (Split): Personal share",
            entry=parent_split_tx.entry,
            cash=parent_split_tx.cash,
        )
        child_split_2 = Transaction(
            account_id=checking.account_id,
            transaction_type_id=1,
            status_id=2,
            payee_id=payee_costa.payee_id,
            category_id=sub_travel.category_id,
            amount=-25.00,
            comment="Coffee with client (Split): Business share",
            entry=parent_split_tx.entry,
            cash=parent_split_tx.cash,
        )
        db.add_all([child_split_1, child_split_2])

        # 9. Transfer transaction (Checking GBP -> Kids Savings USD, GBP to USD rate = 1.28)
        transfer_cat = db.query(Category).filter(Category.name == "Transfer").first()
        transfer_cat_id = transfer_cat.category_id if transfer_cat else 9999

        src_transfer_tx = Transaction(
            account_id=checking.account_id,
            transaction_type_id=3,  # Transfer
            status_id=1,  # Reconciled
            entry=datetime(2026, 6, 15, 10, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 6, 15),
            amount=-200.00,
            category_id=transfer_cat_id,
            comment="College savings transfer",
            original_amount=200.00,
            original_currency_id=1,  # GBP
        )
        db.add(src_transfer_tx)
        db.flush()

        dest_transfer_tx = Transaction(
            account_id=kids_savings.account_id,
            transaction_type_id=2,  # Deposit (standard E2E type)
            status_id=1,  # Reconciled
            entry=datetime(2026, 6, 15, 10, 0, 0, tzinfo=timezone.utc),
            cash=date(2026, 6, 15),
            amount=256.00,  # 200 * 1.28
            category_id=transfer_cat_id,
            comment="College savings transfer",
            original_amount=200.00,
            original_currency_id=1,  # GBP
            rate=1.28,
            transfer_transaction_id=src_transfer_tx.transaction_id,
        )
        db.add(dest_transfer_tx)
        db.flush()

        src_transfer_tx.transfer_transaction_id = dest_transfer_tx.transaction_id
        db.flush()

        db.commit()
        logger.info("Sample database populated and committed successfully.")

        # 10. Sync auto-increment sequences
        tables_with_identity = [
            ("titular", "titular_id"),
            ("account_holder", "account_holder_id"),
            ("account_group", "account_group_id"),
            ("category", "category_id"),
            ("payee", "payee_id"),
            ("account", "account_id"),
            ("transaction", "transaction_id"),
        ]
        for table, pk in tables_with_identity:
            db.execute(text(
                f'SELECT setval(pg_get_serial_sequence(\'"{table}"\', \'{pk}\'), COALESCE(MAX("{pk}"), 1)) FROM "{table}";'
            ))
        db.commit()
        logger.info("Sample sequences synchronized.")

    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"SQLAlchemy error during sample database load: {e}")
        raise
