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
    merged_into_category_id = Column(
        "merged_into_category_id", Integer, ForeignKey("category.category_id"), nullable=True
    )

    parent = relationship("Category", remote_side=[category_id], foreign_keys=[parent_category_id])
    merged_into = relationship("Category", remote_side=[category_id], foreign_keys=[merged_into_category_id])

    def __str__(self):
        return self.name


class Payee(Base):
    __tablename__ = "payee"

    payee_id = Column("payee_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", String(255), nullable=False)
    comment = Column("comment", Text, nullable=True)
    # Non-destructive merge: when set, this payee is an alias of another
    # payee (the canonical/"official" one). The row itself is never deleted
    # by a merge, so import rules and AI suggestions can keep matching it by
    # name; new transactions are written against the canonical payee instead.
    merged_into_payee_id = Column(
        "merged_into_payee_id", Integer, ForeignKey("payee.payee_id"), nullable=True
    )

    merged_into = relationship("Payee", remote_side=[payee_id])

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


class ObligationImportFormat(Base):
    """Reusable column-mapping for importing obligations from an xlsx/csv file.

    Obligation-scoped only (no account/currency/titular defaults) — obligations
    are not tied to an account, only the transactions later assigned to them are.
    """

    __tablename__ = "obligation_import_format"

    obligation_import_format_id = Column(
        "obligation_import_format_id", Integer, primary_key=True, autoincrement=True
    )
    name = Column("name", String(255), nullable=False)
    file_type = Column("file_type", String(10), default="xlsx", nullable=False)
    sheet_name = Column("sheet_name", String(255), nullable=True)
    header_row = Column("header_row", Integer, default=1, nullable=False)
    date_format = Column("date_format", String(50), nullable=True)
    decimal_separator = Column("decimal_separator", String(1), default=".", nullable=False)
    # Assumed cadence when the mapped recurrence column is blank/unmapped.
    default_recurrence = Column("default_recurrence", String(10), default="monthly", nullable=True)
    default_category_id = Column(
        "default_category_id", Integer, ForeignKey("category.category_id"), nullable=True
    )
    created_at = Column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    default_category = relationship("Category")
    fields = relationship(
        "ObligationImportFormatField",
        back_populates="obligation_import_format",
        cascade="all, delete-orphan",
    )

    def __str__(self):
        return self.name


class ObligationImportFormatField(Base):
    """One column mapping: a target obligation field <- a source column name."""

    __tablename__ = "obligation_import_format_field"

    obligation_import_format_field_id = Column(
        "obligation_import_format_field_id", Integer, primary_key=True, autoincrement=True
    )
    obligation_import_format_id = Column(
        "obligation_import_format_id",
        Integer,
        ForeignKey("obligation_import_format.obligation_import_format_id", ondelete="CASCADE"),
        nullable=False,
    )
    # name | amount | due_date | period | category | payee | recurrence | is_recurring | paid | direction | note
    target_field = Column("target_field", String(30), nullable=False)
    source_column = Column("source_column", String(255), nullable=True)

    obligation_import_format = relationship("ObligationImportFormat", back_populates="fields")

    def __str__(self):
        return f"{self.target_field} <- {self.source_column}"


class ObligationGroup(Base):
    """A reusable recurring-bill template ("Aluguel", Housing:Rent, payable,
    monthly, due the 15th) that separate Obligation rows can link to.

    Exists because re-importing the same recurring bill months apart (e.g.
    next year's spreadsheet) creates a NEW Obligation each time (one per
    import batch) rather than merging into the original -- a group lets those
    separate Obligations share one canonical name/category/direction/cadence
    without forcing them into a single Obligation/Occurrence tree. Editing a
    group does NOT cascade to already-linked Obligations (they keep whatever
    they had, possibly hand-customized) -- see the explicit `/sync/` endpoint
    for pushing the group's current settings down on demand.
    """

    __tablename__ = "obligation_group"

    obligation_group_id = Column("obligation_group_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", String(255), nullable=False, index=True)
    category_id = Column("category_id", Integer, ForeignKey("category.category_id"), nullable=True)
    direction = Column("direction", String(10), default="payable", nullable=False)
    recurrence = Column("recurrence", String(10), nullable=True)  # weekly | monthly | yearly
    # Informational expected-payment-date, one or the other depending on
    # recurrence -- not currently used to compute occurrence due dates.
    expected_day_of_month = Column("expected_day_of_month", Integer, nullable=True)  # 1-31
    expected_weekday = Column("expected_weekday", String(10), nullable=True)  # monday..sunday
    created_at = Column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    category = relationship("Category")
    obligations = relationship("Obligation", back_populates="group")

    def __str__(self):
        return self.name


class Obligation(Base):
    """A recurring or one-off bill/obligation definition.

    Not a ledger row: never touches Transaction or reports. estimated_amount is
    a budgeted default; actual coverage is tracked by linking existing
    transactions onto its occurrences (see ObligationOccurrence /
    ObligationOccurrenceTransaction), independently of the manual `paid` flag.
    """

    __tablename__ = "obligation"

    obligation_id = Column("obligation_id", Integer, primary_key=True, autoincrement=True)
    name = Column("name", String(255), nullable=False, index=True)
    category_id = Column("category_id", Integer, ForeignKey("category.category_id"), nullable=True)
    payee_id = Column("payee_id", Integer, ForeignKey("payee.payee_id"), nullable=True)
    obligation_group_id = Column(
        "obligation_group_id", Integer, ForeignKey("obligation_group.obligation_group_id"), nullable=True
    )
    is_recurring = Column("is_recurring", Boolean, default=False, nullable=False)
    recurrence = Column("recurrence", String(10), nullable=True)  # weekly | monthly | yearly
    estimated_amount = Column("estimated_amount", Float, nullable=True)
    # payable (a bill -- covered by outgoing/negative transactions) | receivable
    # (income -- covered by incoming/positive transactions). Drives matching
    # (see obligation_match.find_candidate_transactions) and status wording.
    direction = Column("direction", String(10), default="payable", nullable=False)
    note = Column("note", Text, nullable=True)
    is_active = Column("is_active", Boolean, default=True, nullable=False)
    source = Column("source", String(20), default="manual", nullable=False)  # manual | import
    created_via_format_id = Column(
        "created_via_format_id",
        Integer,
        ForeignKey("obligation_import_format.obligation_import_format_id"),
        nullable=True,
    )
    is_blocked = Column("is_blocked", Boolean, default=False, nullable=False)
    blocked_reason = Column("blocked_reason", Text, nullable=True)
    duplicate_of_obligation_id = Column(
        "duplicate_of_obligation_id", Integer, ForeignKey("obligation.obligation_id"), nullable=True
    )
    created_at = Column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    category = relationship("Category")
    payee = relationship("Payee")
    group = relationship("ObligationGroup", back_populates="obligations")
    duplicate_of = relationship("Obligation", remote_side=[obligation_id])
    created_via_format = relationship("ObligationImportFormat")
    occurrences = relationship(
        "ObligationOccurrence",
        back_populates="obligation",
        cascade="all, delete-orphan",
        order_by="ObligationOccurrence.due_date",
    )

    def __str__(self):
        return self.name


class ObligationOccurrence(Base):
    """One period instance of an Obligation: its due date, estimate and paid flag.

    A one-off (non-recurring) Obligation just has a single occurrence.
    """

    __tablename__ = "obligation_occurrence"

    obligation_occurrence_id = Column(
        "obligation_occurrence_id", Integer, primary_key=True, autoincrement=True
    )
    obligation_id = Column(
        "obligation_id", Integer, ForeignKey("obligation.obligation_id"), nullable=False, index=True
    )
    due_date = Column("due_date", Date, nullable=True, index=True)
    # "YYYY-MM" bucket, independent of due_date (can exist even when the exact
    # day isn't known yet) -- defaults to due_date's month when left unset.
    period = Column("period", String(7), nullable=True, index=True)
    # Falls back to obligation.estimated_amount when null.
    estimated_amount = Column("estimated_amount", Float, nullable=True)
    # Fully independent manual toggle: assigning/unassigning transactions never
    # changes this, and it may be true with zero assigned transactions (e.g.
    # paid in cash) or false while fully covered.
    paid = Column("paid", Boolean, default=False, nullable=False)
    paid_at = Column("paid_at", DateTime(timezone=True), nullable=True)
    # The business/calendar date it was actually paid or received -- distinct
    # from paid_at (a record-keeping timestamp). Defaults to due_date when
    # marked paid (import or manual) since that's the best guess absent a
    # real one, but is always independently editable afterward.
    paid_date = Column("paid_date", Date, nullable=True)
    note = Column("note", Text, nullable=True)
    source = Column("source", String(20), default="manual", nullable=False)  # manual | import | generated
    created_via_format_id = Column(
        "created_via_format_id",
        Integer,
        ForeignKey("obligation_import_format.obligation_import_format_id"),
        nullable=True,
    )
    is_blocked = Column("is_blocked", Boolean, default=False, nullable=False)
    blocked_reason = Column("blocked_reason", Text, nullable=True)
    duplicate_of_occurrence_id = Column(
        "duplicate_of_occurrence_id",
        Integer,
        ForeignKey("obligation_occurrence.obligation_occurrence_id"),
        nullable=True,
    )
    created_at = Column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    obligation = relationship("Obligation", back_populates="occurrences")
    duplicate_of = relationship("ObligationOccurrence", remote_side=[obligation_occurrence_id])
    created_via_format = relationship("ObligationImportFormat")
    assignment_links = relationship(
        "ObligationOccurrenceTransaction",
        back_populates="occurrence",
        cascade="all, delete-orphan",
    )
    transactions = relationship(
        "Transaction", secondary="obligation_occurrence_transaction", viewonly=True
    )

    def __str__(self):
        return f"ObligationOccurrence {self.obligation_occurrence_id} ({self.due_date})"


class ObligationOccurrenceTransaction(Base):
    """Links an existing ledger Transaction as (partial) coverage of an occurrence.

    transaction_id is unique: a transaction covers at most one occurrence at a
    time (many transactions -> one occurrence is the supported direction, e.g.
    a bill paid across several partial payments). Never mutates Transaction.
    """

    __tablename__ = "obligation_occurrence_transaction"

    id = Column(Integer, primary_key=True, autoincrement=True)
    obligation_occurrence_id = Column(
        "obligation_occurrence_id",
        Integer,
        ForeignKey("obligation_occurrence.obligation_occurrence_id"),
        nullable=False,
    )
    transaction_id = Column(
        "transaction_id", Integer, ForeignKey("transaction.transaction_id"), nullable=False, unique=True
    )
    created_at = Column(
        "created_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    occurrence = relationship("ObligationOccurrence", back_populates="assignment_links")
    transaction = relationship("Transaction")

