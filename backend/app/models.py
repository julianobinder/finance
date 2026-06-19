from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from app.database import Base


class Titular(Base):
    __tablename__ = "titular"

    titular_id = Column("titular_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", Text, nullable=False)

    def __str__(self):
        return self.name


class AccountHolder(Base):
    __tablename__ = "account_holder"

    account_holder_id = Column(
        "account_holder_id", Integer, primary_key=True, autoincrement=True
    )
    name = Column("name", Text, nullable=False)
    comments = Column("comments", Text, nullable=True)

    def __str__(self):
        return self.name


class AccountType(Base):
    __tablename__ = "account_type"

    account_type_id = Column(
        "account_type_id", Integer, primary_key=True, autoincrement=True
    )
    name = Column("name", String(255), nullable=False)
    code = Column("code", Integer, nullable=False)

    def __str__(self):
        return self.name


class Currency(Base):
    __tablename__ = "currency"

    currency_id = Column("currency_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", String(255), nullable=False)
    iso_code = Column("iso_code", String(3), nullable=False)
    symbol = Column("symbol", String(10), nullable=False)
    order = Column("order", Integer, nullable=False)

    def __str__(self):
        return f"{self.iso_code} ({self.symbol})"


class AccountGroupAccount(Base):
    __tablename__ = "account_group_account"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_group_id = Column(
        "account_group_id", Integer, ForeignKey("account_group.account_group_id")
    )
    account_id = Column("account_id", Integer, ForeignKey("account.account_id"))


class AccountGroup(Base):
    __tablename__ = "account_group"

    account_group_id = Column(
        "account_group_id", Integer, primary_key=True, autoincrement=True
    )
    name = Column("name", Text, nullable=False)
    is_hidden = Column("is_hidden", Boolean, default=False, nullable=False)
    order = Column("order", Integer, default=0, nullable=False)

    accounts = relationship(
        "Account",
        secondary="account_group_account",
        back_populates="groups",
    )

    def __str__(self):
        return self.name


class Account(Base):
    __tablename__ = "account"

    account_id = Column("account_id", Integer, primary_key=True, autoincrement=True)
    titular_id = Column("titular_id", Integer, ForeignKey("titular.titular_id"))
    account_holder_id = Column(
        "account_holder_id",
        Integer,
        ForeignKey("account_holder.account_holder_id"),
        nullable=True,
    )
    sort_code = Column("sort_code", String(50), nullable=True)
    number = Column("number", String(50), nullable=True)
    branch = Column("branch", String(50), nullable=True)
    currency_id = Column("currency_id", Integer, ForeignKey("currency.currency_id"))
    is_closed = Column("is_closed", Boolean, default=False, nullable=False)
    entry = Column("entry", Date, nullable=False)
    comment = Column("comment", Text, nullable=True)
    name = Column("name", String(50), nullable=False)
    is_hidden = Column("is_hidden", Boolean, default=False, nullable=False)
    account_type_id = Column(
        "account_type_id", Integer, ForeignKey("account_type.account_type_id")
    )
    order = Column("order", Integer, default=0, nullable=False)

    # Relationships
    titular = relationship("Titular")
    account_holder = relationship("AccountHolder")
    currency = relationship("Currency")
    account_type = relationship("AccountType")
    groups = relationship(
        "AccountGroup",
        secondary="account_group_account",
        back_populates="accounts",
    )

    def __str__(self):
        holder_name = self.account_holder.name if self.account_holder else ""
        return f"{self.account_id}: {holder_name} {self.currency.iso_code} ({self.name} - {self.titular.name})"

    def full_name(self):
        holder_name = self.account_holder.name if self.account_holder else ""
        return f"{self.account_id}: {holder_name} {self.currency.iso_code} ({self.name} - {self.titular.name})"

    @property
    def display_name(self):
        return f"{self.name} ({self.currency.symbol})"

    @property
    def is_active(self):
        return not self.is_closed and not self.is_hidden

    def get_balance(self, session):
        """Calculate account balance by summing all transaction amounts except splits"""
        result = (
            session.query(Transaction)
            .filter(Transaction.account_id == self.account_id)
            .join(Category)
            .filter(Category.name != "Split")
            .all()
        )
        return round(sum(tx.amount for tx in result), 2)

    def initial_balance(self, session):
        """Return the initial balance from the Initial Balance transaction"""
        init_tx = (
            session.query(Transaction)
            .filter(Transaction.account_id == self.account_id)
            .join(Category)
            .filter(Category.name == "Initial Balance")
            .first()
        )
        return init_tx.amount if init_tx else 0.0


class TransactionType(Base):
    __tablename__ = "transaction_type"

    transaction_type_id = Column(
        "transaction_type_id", Integer, primary_key=True, autoincrement=True
    )
    name = Column("name", String(50), nullable=False)
    code = Column("code", String(5), nullable=False)

    def __str__(self):
        return self.name


class Status(Base):
    __tablename__ = "status"

    status_id = Column("status_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", String(50), nullable=False)

    def __str__(self):
        return self.name


class Category(Base):
    __tablename__ = "category"

    category_id = Column("category_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", String(255), nullable=False)
    parent_category_id = Column(
        "parent_category_id", Integer, ForeignKey("category.category_id"), nullable=True
    )
    is_hidden = Column("is_hidden", Boolean, default=False, nullable=False)

    parent = relationship("Category", remote_side=[category_id])

    def __str__(self):
        return self.name


class Payee(Base):
    __tablename__ = "payee"

    payee_id = Column("payee_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", String(255), nullable=False)
    comment = Column("comment", Text, nullable=True)

    def __str__(self):
        return self.name


class ImportCSV(Base):
    __tablename__ = "import_csv"

    import_csv_id = Column("import_csv_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", String(255), nullable=False)

    fields = relationship(
        "ImportCsvField",
        back_populates="import_csv",
        cascade="all, delete-orphan",
    )

    def __str__(self):
        return self.name


class ImportCsvField(Base):
    __tablename__ = "import_csv_field"

    import_csv_field_id = Column(
        "import_csv_field_id", Integer, primary_key=True, autoincrement=True
    )
    import_csv_id = Column("import_csv_id", Integer, ForeignKey("import_csv.import_csv_id"), nullable=False)
    name = Column("name", String(255), nullable=False)
    map_field = Column("map", String(255), nullable=True)
    type_field = Column("type", String(50), nullable=True)
    format_field = Column("format", String(255), nullable=True)

    import_csv = relationship("ImportCSV", back_populates="fields")
    rules = relationship(
        "ImportPlanRule",
        back_populates="import_csv_field",
        cascade="all, delete-orphan",
    )

    def __str__(self):
        return f"{self.name} ({self.map_field})"


class ImportPlan(Base):
    __tablename__ = "import_plan"

    import_plan_id = Column("import_plan_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", String(255), nullable=False)
    account_id = Column("account_id", Integer, ForeignKey("account.account_id"))
    import_csv_id = Column("import_csv_id", Integer, ForeignKey("import_csv.import_csv_id"), nullable=False)

    account = relationship("Account", backref="csv_import_plans")
    import_csv = relationship("ImportCSV", backref="import_plans")
    rules = relationship(
        "ImportPlanRule", back_populates="import_plan", cascade="all, delete-orphan"
    )

    def __str__(self):
        return f"{self.name} [{self.import_csv}]"


class ImportPlanRule(Base):
    __tablename__ = "import_plan_rule"

    import_plan_rule_id = Column(
        "import_plan_rule_id", Integer, primary_key=True, autoincrement=True
    )
    import_plan_id = Column("import_plan_id", Integer, ForeignKey("import_plan.import_plan_id"), nullable=False)
    import_csv_field_id = Column(
        "import_csv_field_id",
        Integer,
        ForeignKey("import_csv_field.import_csv_field_id", ondelete="CASCADE"),
        nullable=False
    )
    pattern = Column("pattern", String(255), nullable=False)
    order = Column("order", Integer, default=0, nullable=False)
    ignore = Column("ignore", Boolean, default=False, nullable=False)
    payee_id = Column("payee_id", Integer, ForeignKey("payee.payee_id"), nullable=True)
    category_id = Column(
        "category_id", Integer, ForeignKey("category.category_id"), nullable=True
    )
    to_account_id = Column("to_account_id", Integer, ForeignKey("account.account_id"), nullable=True)
    match_type = Column("match_type", String(20), default="contains", nullable=False)

    import_plan = relationship("ImportPlan", back_populates="rules")
    import_csv_field = relationship("ImportCsvField", back_populates="rules")
    payee = relationship("Payee", backref="import_plan_rules")
    category = relationship("Category", backref="import_plan_rules")
    to_account = relationship("Account", foreign_keys=[to_account_id], backref="transfer_import_plan_rules")

    def __str__(self):
        return self.pattern


class Transaction(Base):
    __tablename__ = "transaction"

    transaction_id = Column("transaction_id", Integer, primary_key=True, autoincrement=True)
    transaction_type_id = Column(
        "transaction_type_id", Integer, ForeignKey("transaction_type.transaction_type_id")
    )
    account_id = Column("account_id", Integer, ForeignKey("account.account_id"))
    status_id = Column("status_id", Integer, ForeignKey("status.status_id"))
    entry = Column("entry", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    issue = Column("issue", Date, nullable=True)
    received = Column("received", Date, nullable=True)
    refer_to = Column("refer_to", Date, nullable=True)
    due = Column("due", Date, nullable=True)
    payment = Column("payment", Date, nullable=True)
    cash = Column("cash", Date, nullable=True)
    payee_id = Column("payee_id", Integer, ForeignKey("payee.payee_id"), nullable=True)
    category_id = Column("category_id", Integer, ForeignKey("category.category_id"))
    comment = Column("comment", Text, nullable=True)
    rate = Column("rate", Float, default=1.0, nullable=False)
    amount = Column("amount", Float, default=0.0, nullable=False)
    reference = Column("reference", String(50), nullable=True)
    transfer_transaction_id = Column(
        "transfer_transaction_id",
        Integer,
        ForeignKey("transaction.transaction_id"),
        nullable=True,
    )
    original_amount = Column("original_amount", Float, nullable=True)
    original_currency_id = Column(
        "original_currency_id", Integer, ForeignKey("currency.currency_id"), nullable=True
    )
    quantity = Column("quantity", Integer, nullable=True)
    asset_id = Column("asset_id", Integer, nullable=True)

    # Relationships
    transaction_type = relationship("TransactionType")
    account = relationship("Account", foreign_keys=[account_id], backref="transactions")
    status = relationship("Status")
    payee = relationship("Payee")
    category = relationship("Category")
    original_currency = relationship("Currency")

    # Self-referencing relationship for transfers with post_update=True to avoid circular dependencies
    transfer_transaction = relationship(
        "Transaction",
        remote_side=[transaction_id],
        foreign_keys=[transfer_transaction_id],
        post_update=True,
    )

    def __str__(self):
        return f"Transaction {self.transaction_id} - {self.amount}"

    @property
    def date(self):
        if self.cash is not None:
            return self.cash
        if self.payment is not None:
            return self.payment
        if self.due is not None:
            return self.due
        return self.entry.date() if isinstance(self.entry, datetime) else self.entry

