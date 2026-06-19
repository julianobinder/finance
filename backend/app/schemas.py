from datetime import date, datetime
from typing import Any, Dict, Generic, List, Optional, TypeVar
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


class SettingsConfigUpdate(BaseModel):
    currency_url: str
    currrency_api: str


