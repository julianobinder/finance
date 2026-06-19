from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    AccountGroup,
    AccountHolder,
    AccountType,
    Category,
    Currency,
    Payee,
    Titular,
    Transaction,
    ImportPlanRule,
)
from app.schemas import (
    AccountHolderCreate,
    AccountHolderResponse,
    AccountGroupCreate,
    AccountGroupResponse,
    AccountTypeCreate,
    AccountTypeResponse,
    CategoryCreate,
    CategoryResponse,
    CategoryMerge,
    CurrencyCreate,
    CurrencyResponse,
    PayeeCreate,
    PayeeResponse,
    TitularCreate,
    TitularResponse,
    PaginatedResponse,
)

router = APIRouter(prefix="/accounts", tags=["Account Sub-resources"])


def paginated_dict(results: list) -> dict:
    return {"count": len(results), "next": None, "previous": None, "results": results}


# Account Holders
@router.get("/account-holders/", response_model=PaginatedResponse[AccountHolderResponse])
def list_account_holders(db: Session = Depends(get_db)):
    return paginated_dict(db.query(AccountHolder).all())


@router.post("/account-holders/", response_model=AccountHolderResponse, status_code=status.HTTP_201_CREATED)
def create_account_holder(payload: AccountHolderCreate, db: Session = Depends(get_db)):
    ah = AccountHolder(**payload.model_dump())
    db.add(ah)
    db.commit()
    db.refresh(ah)
    return ah


@router.get("/account-holders/{pk}/", response_model=AccountHolderResponse)
def get_account_holder(pk: int, db: Session = Depends(get_db)):
    ah = db.query(AccountHolder).filter(AccountHolder.account_holder_id == pk).first()
    if not ah:
        raise HTTPException(status_code=404, detail="Account holder not found")
    return ah


@router.put("/account-holders/{pk}/", response_model=AccountHolderResponse)
def update_account_holder(pk: int, payload: AccountHolderCreate, db: Session = Depends(get_db)):
    ah = db.query(AccountHolder).filter(AccountHolder.account_holder_id == pk).first()
    if not ah:
        raise HTTPException(status_code=404, detail="Account holder not found")
    ah.name = payload.name
    ah.comments = payload.comments
    db.commit()
    db.refresh(ah)
    return ah


@router.delete("/account-holders/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_account_holder(pk: int, db: Session = Depends(get_db)):
    ah = db.query(AccountHolder).filter(AccountHolder.account_holder_id == pk).first()
    if not ah:
        raise HTTPException(status_code=404, detail="Account holder not found")
    db.delete(ah)
    db.commit()
    return None


# Titulars
@router.get("/titulars/", response_model=PaginatedResponse[TitularResponse])
def list_titulars(db: Session = Depends(get_db)):
    return paginated_dict(db.query(Titular).all())


@router.post("/titulars/", response_model=TitularResponse, status_code=status.HTTP_201_CREATED)
def create_titular(payload: TitularCreate, db: Session = Depends(get_db)):
    titular = Titular(**payload.model_dump())
    db.add(titular)
    db.commit()
    db.refresh(titular)
    return titular


@router.get("/titulars/{pk}/", response_model=TitularResponse)
def get_titular(pk: int, db: Session = Depends(get_db)):
    titular = db.query(Titular).filter(Titular.titular_id == pk).first()
    if not titular:
        raise HTTPException(status_code=404, detail="Titular not found")
    return titular


@router.put("/titulars/{pk}/", response_model=TitularResponse)
def update_titular(pk: int, payload: TitularCreate, db: Session = Depends(get_db)):
    titular = db.query(Titular).filter(Titular.titular_id == pk).first()
    if not titular:
        raise HTTPException(status_code=404, detail="Titular not found")
    titular.name = payload.name
    db.commit()
    db.refresh(titular)
    return titular


@router.delete("/titulars/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_titular(pk: int, db: Session = Depends(get_db)):
    titular = db.query(Titular).filter(Titular.titular_id == pk).first()
    if not titular:
        raise HTTPException(status_code=404, detail="Titular not found")
    db.delete(titular)
    db.commit()
    return None


# Currencies
@router.get("/currencies/", response_model=PaginatedResponse[CurrencyResponse])
def list_currencies(db: Session = Depends(get_db)):
    return paginated_dict(db.query(Currency).all())


@router.post("/currencies/", response_model=CurrencyResponse, status_code=status.HTTP_201_CREATED)
def create_currency(payload: CurrencyCreate, db: Session = Depends(get_db)):
    currency = Currency(**payload.model_dump())
    db.add(currency)
    db.commit()
    db.refresh(currency)
    return currency


@router.get("/currencies/{pk}/", response_model=CurrencyResponse)
def get_currency(pk: int, db: Session = Depends(get_db)):
    currency = db.query(Currency).filter(Currency.currency_id == pk).first()
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    return currency


@router.put("/currencies/{pk}/", response_model=CurrencyResponse)
def update_currency(pk: int, payload: CurrencyCreate, db: Session = Depends(get_db)):
    currency = db.query(Currency).filter(Currency.currency_id == pk).first()
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    currency.name = payload.name
    currency.iso_code = payload.iso_code
    currency.symbol = payload.symbol
    currency.order = payload.order
    db.commit()
    db.refresh(currency)
    return currency


@router.delete("/currencies/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_currency(pk: int, db: Session = Depends(get_db)):
    currency = db.query(Currency).filter(Currency.currency_id == pk).first()
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    db.delete(currency)
    db.commit()
    return None


# Account Groups
@router.get("/account-groups/", response_model=PaginatedResponse[AccountGroupResponse])
def list_account_groups(db: Session = Depends(get_db)):
    return paginated_dict(db.query(AccountGroup).order_by(AccountGroup.order, AccountGroup.account_group_id).all())


@router.post("/account-groups/", response_model=AccountGroupResponse, status_code=status.HTTP_201_CREATED)
def create_account_group(payload: AccountGroupCreate, db: Session = Depends(get_db)):
    ag = AccountGroup(**payload.model_dump())
    db.add(ag)
    db.commit()
    db.refresh(ag)
    return ag


@router.get("/account-groups/{pk}/", response_model=AccountGroupResponse)
def get_account_group(pk: int, db: Session = Depends(get_db)):
    ag = db.query(AccountGroup).filter(AccountGroup.account_group_id == pk).first()
    if not ag:
        raise HTTPException(status_code=404, detail="Account group not found")
    return ag


@router.put("/account-groups/{pk}/", response_model=AccountGroupResponse)
def update_account_group(pk: int, payload: AccountGroupCreate, db: Session = Depends(get_db)):
    ag = db.query(AccountGroup).filter(AccountGroup.account_group_id == pk).first()
    if not ag:
        raise HTTPException(status_code=404, detail="Account group not found")
    ag.name = payload.name
    ag.is_hidden = payload.is_hidden
    ag.order = payload.order
    db.commit()
    db.refresh(ag)
    return ag


@router.delete("/account-groups/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_account_group(pk: int, db: Session = Depends(get_db)):
    ag = db.query(AccountGroup).filter(AccountGroup.account_group_id == pk).first()
    if not ag:
        raise HTTPException(status_code=404, detail="Account group not found")
    db.delete(ag)
    db.commit()
    return None


# Payees
@router.get("/payees/", response_model=PaginatedResponse[PayeeResponse])
def list_payees(db: Session = Depends(get_db)):
    return paginated_dict(db.query(Payee).all())


@router.post("/payees/", response_model=PayeeResponse, status_code=status.HTTP_201_CREATED)
def create_payee(payload: PayeeCreate, db: Session = Depends(get_db)):
    payee = Payee(**payload.model_dump())
    db.add(payee)
    db.commit()
    db.refresh(payee)
    return payee


@router.get("/payees/{pk}/", response_model=PayeeResponse)
def get_payee(pk: int, db: Session = Depends(get_db)):
    payee = db.query(Payee).filter(Payee.payee_id == pk).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    return payee


@router.put("/payees/{pk}/", response_model=PayeeResponse)
def update_payee(pk: int, payload: PayeeCreate, db: Session = Depends(get_db)):
    payee = db.query(Payee).filter(Payee.payee_id == pk).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    payee.name = payload.name
    payee.comment = payload.comment
    db.commit()
    db.refresh(payee)
    return payee


@router.delete("/payees/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_payee(pk: int, db: Session = Depends(get_db)):
    payee = db.query(Payee).filter(Payee.payee_id == pk).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    db.delete(payee)
    db.commit()
    return None


# Account Types
@router.get("/account-types/", response_model=PaginatedResponse[AccountTypeResponse])
def list_account_types(db: Session = Depends(get_db)):
    return paginated_dict(db.query(AccountType).all())


@router.post("/account-types/", response_model=AccountTypeResponse, status_code=status.HTTP_201_CREATED)
def create_account_type(payload: AccountTypeCreate, db: Session = Depends(get_db)):
    at = AccountType(**payload.model_dump())
    db.add(at)
    db.commit()
    db.refresh(at)
    return at


@router.get("/account-types/{pk}/", response_model=AccountTypeResponse)
def get_account_type(pk: int, db: Session = Depends(get_db)):
    at = db.query(AccountType).filter(AccountType.account_type_id == pk).first()
    if not at:
        raise HTTPException(status_code=404, detail="Account type not found")
    return at


@router.put("/account-types/{pk}/", response_model=AccountTypeResponse)
def update_account_type(pk: int, payload: AccountTypeCreate, db: Session = Depends(get_db)):
    at = db.query(AccountType).filter(AccountType.account_type_id == pk).first()
    if not at:
        raise HTTPException(status_code=404, detail="Account type not found")
    at.name = payload.name
    at.code = payload.code
    db.commit()
    db.refresh(at)
    return at


@router.delete("/account-types/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_account_type(pk: int, db: Session = Depends(get_db)):
    at = db.query(AccountType).filter(AccountType.account_type_id == pk).first()
    if not at:
        raise HTTPException(status_code=404, detail="Account type not found")
    db.delete(at)
    db.commit()
    return None


# Categories
@router.get("/categories/", response_model=PaginatedResponse[CategoryResponse])
def list_categories(
    parent: Optional[str] = Query(None),
    roots: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Category).filter(Category.is_hidden == False)
    if parent is not None:
        if parent.lower() == "null":
            query = query.filter(Category.parent_category_id.is_(None))
        else:
            try:
                query = query.filter(Category.parent_category_id == int(parent))
            except ValueError:
                query = query.filter(Category.category_id == -1)
    elif roots and roots.lower() == "true":
        query = query.filter(Category.parent_category_id.is_(None))

    results = query.order_by(Category.name).all()
    return paginated_dict(results)


@router.post("/categories/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"category_id"})
    parent_id = data.get("parent_category_id")
    if parent_id == 0:
        data["parent_category_id"] = None

    category = Category(**data)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/categories/{pk}/", response_model=CategoryResponse)
def get_category(pk: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.category_id == pk).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


@router.put("/categories/{pk}/", response_model=CategoryResponse)
def update_category(pk: int, payload: CategoryCreate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.category_id == pk).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.name = payload.name
    cat.parent_category_id = payload.parent_category_id if payload.parent_category_id != 0 else None
    cat.is_hidden = payload.is_hidden
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(pk: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.category_id == pk).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return None


@router.post("/categories/{pk}/merge/", status_code=status.HTTP_200_OK)
def merge_category(pk: int, payload: CategoryMerge, db: Session = Depends(get_db)):
    source_cat = db.query(Category).filter(Category.category_id == pk).first()
    if not source_cat:
        raise HTTPException(status_code=404, detail="Source category not found")

    dest_cat = db.query(Category).filter(Category.category_id == payload.destination_category_id).first()
    if not dest_cat:
        raise HTTPException(status_code=404, detail="Destination category not found")

    if source_cat.category_id == dest_cat.category_id:
        raise HTTPException(status_code=400, detail="Cannot merge a category into itself")

    try:
        db.query(Transaction).filter(Transaction.category_id == source_cat.category_id).update(
            {Transaction.category_id: dest_cat.category_id},
            synchronize_session=False
        )

        db.query(ImportPlanRule).filter(ImportPlanRule.category_id == source_cat.category_id).update(
            {ImportPlanRule.category_id: dest_cat.category_id},
            synchronize_session=False
        )

        db.delete(source_cat)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during merge: {str(e)}")

    return {"detail": f"Successfully merged category {source_cat.name} into {dest_cat.name}"}
