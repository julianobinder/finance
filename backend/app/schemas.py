from datetime import date, datetime
from typing import Any, Dict, Generic, List, Literal, Optional, TypeVar
from pydantic import BaseModel, ConfigDict, Field

# Generic type for paginated responses
T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    count: int
    next: Optional[str] = None
    previous: Optional[str] = None
    results: List[T]


class TitularBase(BaseModel):
    name: str


class TitularCreate(TitularBase):
    pass


class TitularResponse(TitularBase):
    model_config = ConfigDict(from_attributes=True)
    titular_id: int


class AccountHolderBase(BaseModel):
    name: str
    comments: Optional[str] = None


class AccountHolderCreate(AccountHolderBase):
    pass


class AccountHolderResponse(AccountHolderBase):
    model_config = ConfigDict(from_attributes=True)
    account_holder_id: int


class AccountTypeBase(BaseModel):
    name: str
    code: int


class AccountTypeCreate(AccountTypeBase):
    pass


class AccountTypeResponse(AccountTypeBase):
    model_config = ConfigDict(from_attributes=True)
    account_type_id: int


class CurrencyBase(BaseModel):
    name: str
    iso_code: str
    symbol: str
    order: int


class CurrencyCreate(CurrencyBase):
    pass


class CurrencyResponse(CurrencyBase):
    model_config = ConfigDict(from_attributes=True)
    currency_id: int


class AccountGroupBase(BaseModel):
    name: str
    is_hidden: bool = False
    order: int = 0


class AccountGroupCreate(AccountGroupBase):
    pass


class AccountGroupResponse(AccountGroupBase):
    model_config = ConfigDict(from_attributes=True)
    account_group_id: int


class AccountGroupDisplay(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    account_group_id: int
    name: str
    is_hidden: bool
    order: int


class AccountBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    titular_id: int
    account_holder_id: Optional[int] = None
    sort_code: Optional[str] = Field(None, alias="sortcode")
    number: Optional[str] = None
    branch: Optional[str] = None
    currency_id: int
    is_closed: bool = False
    entry: date
    comment: Optional[str] = None
    is_hidden: bool = False
    account_type_id: int
    groups: Optional[List[Dict[str, Any]]] = []
    initial_balance: Optional[float] = 0.0
    order: int = 0


class AccountCreate(AccountBase):
    pass


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    name: str
    titular_id: int
    titular_name: str
    account_holder_id: Optional[int]
    account_holder_name: Optional[str]
    accountholder_name: Optional[str] = None
    sort_code: Optional[str]
    number: Optional[str]
    branch: Optional[str]
    currency_id: int
    currency_name: str
    currency_symbol: str
    currency_iso_code: str
    currency_string: str
    is_closed: bool
    entry: date
    comment: Optional[str]
    is_hidden: bool
    account_type_id: int
    account_type_name: str
    accounttype_name: Optional[str] = ""
    groups_display: List[AccountGroupDisplay]
    balance: float
    is_active: bool
    string_name: str
    full_name: str
    initial_balance: float
    order: int


class TransactionTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    transaction_type_id: int
    name: str
    code: str


class StatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status_id: int
    name: str


class CategoryBase(BaseModel):
    name: str
    parent_category_id: Optional[int] = None
    is_hidden: bool = False


class CategoryCreate(CategoryBase):
    category_id: Optional[int] = None


class CategoryResponse(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    category_id: int
    merged_into_category_id: Optional[int] = None
    merged_into_category_name: Optional[str] = None
    related_count: int = 0


class CategoryMerge(BaseModel):
    destination_category_id: int


class PayeeBase(BaseModel):
    name: str
    comment: Optional[str] = None


class PayeeCreate(PayeeBase):
    pass


class PayeeResponse(PayeeBase):
    model_config = ConfigDict(from_attributes=True)
    payee_id: int
    merged_into_payee_id: Optional[int] = None
    merged_into_payee_name: Optional[str] = None
    related_count: int = 0


class PayeeMerge(BaseModel):
    destination_payee_id: int


class ImportCsvFieldBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    map_field: Optional[str] = Field(None, alias="map")
    type_field: Optional[str] = Field(None, alias="type")
    format_field: Optional[str] = Field(None, alias="format")


class ImportCsvFieldCreate(ImportCsvFieldBase):
    import_csv_field_id: Optional[int] = Field(None, alias="import_csv_field_id")


class ImportCsvFieldResponse(ImportCsvFieldBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    import_csv_field_id: int


class ImportCSVBase(BaseModel):
    name: str
    fields: Optional[List[ImportCsvFieldCreate]] = []


class ImportCSVCreate(ImportCSVBase):
    pass


class ImportCSVResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    import_csv_id: int
    name: str
    fields: List[ImportCsvFieldResponse]


class ImportPlanRuleCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    import_plan_id: int = Field(..., alias="importplan")
    import_csv_field_id: int = Field(..., alias="importcsvfield")
    pattern: str
    order: int = 0
    ignore: bool = False
    match_type: str = "contains"
    payee_id: Optional[int] = None
    category_id: Optional[int] = None
    to_account_id: Optional[int] = Field(None, alias="to_account")


class ImportPlanRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    import_plan_rule_id: int
    import_plan_id: int
    account_name: Optional[str]
    import_csv_field_id: int
    import_csv_field_name: Optional[str]
    pattern: str
    order: int
    ignore: bool
    match_type: str
    payee_id: Optional[int]
    payee_name: Optional[str]
    category_id: Optional[int]
    category_name: Optional[str]
    to_account_id: Optional[int]
    to_account_name: Optional[str]


class ImportPlanCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    account_id: Optional[int] = Field(None, alias="account")
    import_csv_id: int = Field(..., alias="importcsv")


class ImportPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    import_plan_id: int
    name: str
    account_id: Optional[int]
    account_name: str
    import_csv_id: int
    import_csv_name: str
    rules_count: int
    rules: List[ImportPlanRuleResponse]


class TransactionCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    transaction_type_id: Optional[int] = None
    account_id: Optional[int] = Field(None, alias="accountId")
    status_id: Optional[int] = Field(None, alias="status")
    entry: Optional[datetime] = None
    issue: Optional[date] = None
    received: Optional[date] = None
    refer_to: Optional[date] = None
    due: Optional[date] = None
    payment: Optional[date] = None
    cash: Optional[date] = None
    payee_id: Optional[int] = None
    category_id: Optional[int] = None
    comment: Optional[str] = None
    rate: float = 1.0
    amount: float = 0.0
    reference: Optional[str] = None
    original_amount: Optional[float] = None
    original_currency_id: Optional[int] = None
    quantity: Optional[int] = None
    asset_id: Optional[int] = None

    # Write-only fields mapping from request payload
    splits: Optional[List[Dict[str, Any]]] = []
    transaction_type_string: Optional[str] = Field("withdrawal", alias="transactionType")
    to_account_id: Optional[int] = Field(None, alias="toAccountId")
    currency_rate: Optional[float] = Field(None, alias="currencyRate")
    destination_amount: Optional[float] = Field(None, alias="destinationAmount")

    # Destination account dates for transfers
    to_account_cash: Optional[date] = Field(None, alias="toAccountCash")
    to_account_issue: Optional[date] = Field(None, alias="toAccountIssue")
    to_account_received: Optional[date] = Field(None, alias="toAccountReceived")
    to_account_refer_to: Optional[date] = Field(None, alias="toAccountReferTo")
    to_account_due: Optional[date] = Field(None, alias="toAccountDue")
    to_account_payment: Optional[date] = Field(None, alias="toAccountPayment")


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: int
    transaction_type_id: int
    transaction_type_name: str
    account_id: int
    account_name: str
    status_id: int
    status_name: str
    entry: datetime
    issue: Optional[date]
    received: Optional[date]
    refer_to: Optional[date]
    due: Optional[date]
    payment: Optional[date]
    cash: Optional[date]
    date: Optional[date]
    payee_id: Optional[int]
    payee_name: Optional[str]
    category_id: int
    category_name: str
    comment: Optional[str]
    rate: float
    amount: float
    reference: Optional[str]
    transfer_transaction_id: Optional[int]
    original_amount: Optional[float]
    original_currency_id: Optional[int]
    quantity: Optional[int]
    asset_id: Optional[int]
    currency_name: str
    currency_symbol: str
    is_split: bool
    balance: float

    # Read-only fields for transfers
    to_account_id: Optional[int] = None
    to_account_name: Optional[str] = None
    to_account_cash: Optional[date] = None
    to_account_issue: Optional[date] = None
    to_account_received: Optional[date] = None
    to_account_refer_to: Optional[date] = None
    to_account_due: Optional[date] = None
    to_account_payment: Optional[date] = None
    to_account_amount: Optional[float] = None
    to_account_rate: Optional[float] = None


class ObligationImportFormatFieldCreate(BaseModel):
    target_field: str
    source_column: Optional[str] = None


class ObligationImportFormatFieldResponse(ObligationImportFormatFieldCreate):
    model_config = ConfigDict(from_attributes=True)
    obligation_import_format_field_id: int


class ObligationImportFormatCreate(BaseModel):
    name: str
    file_type: str = "xlsx"
    sheet_name: Optional[str] = None
    header_row: int = 1
    date_format: Optional[str] = None
    decimal_separator: str = "."
    default_recurrence: Optional[str] = "monthly"
    default_category_id: Optional[int] = None
    fields: List[ObligationImportFormatFieldCreate] = []


class ObligationImportFormatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    obligation_import_format_id: int
    name: str
    file_type: str
    sheet_name: Optional[str]
    header_row: int
    date_format: Optional[str]
    decimal_separator: str
    default_recurrence: Optional[str]
    default_category_id: Optional[int]
    created_at: datetime
    fields: List[ObligationImportFormatFieldResponse]


class ObligationGroupCreate(BaseModel):
    name: str
    category_id: Optional[int] = None
    direction: Literal["payable", "receivable"] = "payable"
    recurrence: Optional[Literal["weekly", "monthly", "yearly"]] = None
    # Informational only (not currently used to compute occurrence due dates):
    # one or the other depending on recurrence, e.g. 15 for "the 15th of every
    # month", "friday" for "every Friday".
    expected_day_of_month: Optional[int] = Field(None, ge=1, le=31)
    expected_weekday: Optional[
        Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    ] = None


class ObligationGroupUpdate(ObligationGroupCreate):
    pass


class ObligationGroupResponse(BaseModel):
    obligation_group_id: int
    name: str
    category_id: Optional[int]
    category_name: Optional[str]
    direction: str
    recurrence: Optional[str]
    expected_day_of_month: Optional[int]
    expected_weekday: Optional[str]
    created_at: datetime
    obligation_count: int


class ObligationGroupSyncResponse(BaseModel):
    updated: int


class ObligationOccurrenceResponse(BaseModel):
    obligation_occurrence_id: int
    obligation_id: int
    obligation_name: str
    due_date: Optional[date]
    period: Optional[str]
    estimated_amount: Optional[float]
    paid: bool
    paid_at: Optional[datetime]
    paid_date: Optional[date]
    note: Optional[str]
    is_blocked: bool
    blocked_reason: Optional[str]
    duplicate_of_occurrence_id: Optional[int]
    source: str
    created_at: datetime
    assigned_total: float
    assigned_transaction_count: int
    category_id: Optional[int]
    category_name: Optional[str]
    payee_id: Optional[int]
    payee_name: Optional[str]
    direction: str


class ObligationOccurrenceCreate(BaseModel):
    due_date: Optional[date] = None
    period: Optional[str] = None
    estimated_amount: Optional[float] = None
    note: Optional[str] = None
    paid: bool = False


class ObligationOccurrenceUpdate(BaseModel):
    due_date: Optional[date] = None
    period: Optional[str] = None
    estimated_amount: Optional[float] = None
    note: Optional[str] = None
    paid_date: Optional[date] = None


class ObligationOccurrenceMarkPaid(BaseModel):
    paid_at: Optional[datetime] = None
    # Defaults to the occurrence's due_date when omitted (see mark_paid route)
    # -- the business date it was actually paid/received, always editable.
    paid_date: Optional[date] = None


class ObligationTransactionIdsRequest(BaseModel):
    transaction_ids: List[int]


class ObligationOccurrenceIdsRequest(BaseModel):
    occurrence_ids: List[int]


class ObligationOccurrenceBulkDeleteResponse(BaseModel):
    deleted: int
    skipped: int
    skipped_ids: List[int]


class ObligationCreate(BaseModel):
    name: str
    category_id: Optional[int] = None
    payee_id: Optional[int] = None
    obligation_group_id: Optional[int] = None
    is_recurring: bool = False
    recurrence: Optional[str] = None
    estimated_amount: Optional[float] = None
    note: Optional[str] = None
    is_active: bool = True
    # payable (bill, matches outgoing transactions) | receivable (income,
    # matches incoming transactions) -- see obligation_match.py.
    direction: Literal["payable", "receivable"] = "payable"
    # Seeds the first occurrence on create; ignored on update.
    first_due_date: Optional[date] = None
    first_amount: Optional[float] = None
    first_paid: bool = False


class ObligationUpdate(BaseModel):
    name: str
    category_id: Optional[int] = None
    payee_id: Optional[int] = None
    obligation_group_id: Optional[int] = None
    is_recurring: bool = False
    recurrence: Optional[str] = None
    estimated_amount: Optional[float] = None
    note: Optional[str] = None
    is_active: bool = True
    direction: Literal["payable", "receivable"] = "payable"


class ObligationResponse(BaseModel):
    obligation_id: int
    name: str
    category_id: Optional[int]
    category_name: Optional[str]
    payee_id: Optional[int]
    payee_name: Optional[str]
    obligation_group_id: Optional[int]
    obligation_group_name: Optional[str]
    is_recurring: bool
    recurrence: Optional[str]
    estimated_amount: Optional[float]
    direction: str
    note: Optional[str]
    is_active: bool
    is_blocked: bool
    blocked_reason: Optional[str]
    duplicate_of_obligation_id: Optional[int]
    duplicate_of_obligation_name: Optional[str]
    source: str
    created_at: datetime
    occurrence_count: int
    open_occurrence_count: int
    next_due_date: Optional[date]
    occurrences: Optional[List[ObligationOccurrenceResponse]] = None


class ObligationSuggestCategoriesItem(BaseModel):
    index: int
    name: str
    note: Optional[str] = None


class ObligationSuggestCategoriesRequest(BaseModel):
    obligations: List[ObligationSuggestCategoriesItem]


class ObligationMatchCategoriesRequest(BaseModel):
    labels: List[str]


class ObligationMatchGroupsRequest(BaseModel):
    labels: List[str]


class SettingsConfigUpdate(BaseModel):
    currency_url: str
    currrency_api: str
    ai_provider: str = ""
    anthropic_api_key: str = ""
    anthropic_model: str = ""
    gemini_api_key: str = ""
    gemini_model: str = ""
    default_currency_id: str = ""
    default_locale: str = ""


