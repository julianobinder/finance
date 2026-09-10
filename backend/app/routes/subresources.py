from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import (
    AccountGroup,
    AccountHolder,
    AccountType,
    Category,
    Currency,
    ImportPlanRule,
    Payee,
    Titular,
    Transaction,
)
from app.category_utils import resolve_canonical_category_id
from app.payee_utils import resolve_canonical_payee_id
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
    PayeeMerge,
    PayeeResponse,
    TitularCreate,
    TitularResponse,
    PaginatedResponse,
)

router = APIRouter(prefix="/accounts", tags=["Account Sub-resources"])


def paginated_dict(results: list) -> dict:
    return {"count": len(results), "next": None, "previous": None, "results": results}


def _count_by(db: Session, column) -> dict:
    """Group-count non-null values of a FK column, e.g. Transaction.payee_id.

    Used to report a "related records" total per payee/category — the
    FK (RESTRICT, no ondelete) on Transaction/ImportPlanRule/the self-merge
    columns is exactly what blocks a DELETE, so this tells the user when a
    row is actually safe to delete (count reaches 0).
    """
    return dict(
        db.query(column, func.count(column)).filter(column.isnot(None)).group_by(column).all()
    )


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
def _payee_response_dict(payee: Payee, related_count: int = 0) -> dict:
    return {
        "payee_id": payee.payee_id,
        "name": payee.name,
        "comment": payee.comment,
        "merged_into_payee_id": payee.merged_into_payee_id,
        "merged_into_payee_name": payee.merged_into.name if payee.merged_into else None,
        "related_count": related_count,
    }


@router.get("/payees/", response_model=PaginatedResponse[PayeeResponse])
def list_payees(db: Session = Depends(get_db)):
    payees = db.query(Payee).options(joinedload(Payee.merged_into)).all()

    tx_counts = _count_by(db, Transaction.payee_id)
    rule_counts = _count_by(db, ImportPlanRule.payee_id)
    alias_counts = _count_by(db, Payee.merged_into_payee_id)

    return paginated_dict([
        _payee_response_dict(
            p,
            tx_counts.get(p.payee_id, 0) + rule_counts.get(p.payee_id, 0) + alias_counts.get(p.payee_id, 0),
        )
        for p in payees
    ])


@router.post("/payees/", response_model=PayeeResponse, status_code=status.HTTP_201_CREATED)
def create_payee(payload: PayeeCreate, db: Session = Depends(get_db)):
    payee = Payee(**payload.model_dump())
    db.add(payee)
    db.commit()
    db.refresh(payee)
    return _payee_response_dict(payee)


@router.get("/payees/{pk}/", response_model=PayeeResponse)
def get_payee(pk: int, db: Session = Depends(get_db)):
    payee = (
        db.query(Payee)
        .options(joinedload(Payee.merged_into))
        .filter(Payee.payee_id == pk)
        .first()
    )
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    return _payee_response_dict(payee)


@router.put("/payees/{pk}/", response_model=PayeeResponse)
def update_payee(pk: int, payload: PayeeCreate, db: Session = Depends(get_db)):
    payee = db.query(Payee).filter(Payee.payee_id == pk).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    payee.name = payload.name
    payee.comment = payload.comment
    db.commit()
    db.refresh(payee)
    return _payee_response_dict(payee)


@router.delete("/payees/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_payee(pk: int, db: Session = Depends(get_db)):
    payee = db.query(Payee).filter(Payee.payee_id == pk).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    db.delete(payee)
    db.commit()
    return None


@router.post("/payees/{pk}/merge/", response_model=PayeeResponse)
def merge_payee(pk: int, payload: PayeeMerge, db: Session = Depends(get_db)):
    """Mark ``pk`` as an alias of the destination payee.

    Unlike category merge, this is non-destructive: the source row is kept
    (never deleted) and existing transactions keep whichever payee they
    already reference — only new transactions going forward resolve to the
    canonical payee (see ``resolve_canonical_payee_id``). This lets import
    rules and AI suggestions keep matching old bank-statement spellings
    (e.g. "COEMI IMOB") by name while reporting rolls everything up under
    one "official" payee.
    """
    source = db.query(Payee).filter(Payee.payee_id == pk).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source payee not found")

    destination = (
        db.query(Payee).filter(Payee.payee_id == payload.destination_payee_id).first()
    )
    if not destination:
        raise HTTPException(status_code=404, detail="Destination payee not found")

    if source.payee_id == destination.payee_id:
        raise HTTPException(status_code=400, detail="Cannot merge a payee into itself")

    # Always collapse to the destination's own root canonical, so chains
    # never exceed length 1 and "merge A into B" behaves the same whether or
    # not B is itself already an alias of something else.
    root_id = resolve_canonical_payee_id(db, destination.payee_id)
    if root_id == source.payee_id:
        raise HTTPException(
            status_code=400,
            detail="Destination is already an alias of this payee",
        )

    try:
        # Re-point any payees currently aliased to the source so they follow
        # it into the new group instead of being left pointing at a payee
        # that is itself now an alias.
        db.query(Payee).filter(Payee.merged_into_payee_id == source.payee_id).update(
            {Payee.merged_into_payee_id: root_id}, synchronize_session=False
        )
        source.merged_into_payee_id = root_id
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during merge: {str(e)}")

    db.refresh(source)
    return _payee_response_dict(source)


@router.post("/payees/{pk}/unmerge/", response_model=PayeeResponse)
def unmerge_payee(pk: int, db: Session = Depends(get_db)):
    """Detach a payee from its canonical group, making it standalone again."""
    payee = db.query(Payee).filter(Payee.payee_id == pk).first()
    if not payee:
        raise HTTPException(status_code=404, detail="Payee not found")
    payee.merged_into_payee_id = None
    db.commit()
    db.refresh(payee)
    return _payee_response_dict(payee)


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
def _category_response_dict(cat: Category, related_count: int = 0) -> dict:
    return {
        "category_id": cat.category_id,
        "name": cat.name,
        "parent_category_id": cat.parent_category_id,
        "is_hidden": cat.is_hidden,
        "merged_into_category_id": cat.merged_into_category_id,
        "merged_into_category_name": cat.merged_into.name if cat.merged_into else None,
        "related_count": related_count,
    }


@router.get("/categories/", response_model=PaginatedResponse[CategoryResponse])
def list_categories(
    parent: Optional[str] = Query(None),
    roots: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Category)
        .options(joinedload(Category.merged_into))
        .filter(Category.is_hidden == False)
    )
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

    tx_counts = _count_by(db, Transaction.category_id)
    rule_counts = _count_by(db, ImportPlanRule.category_id)
    alias_counts = _count_by(db, Category.merged_into_category_id)
    # A parent category also can't be deleted while it still has
    # sub-categories pointing at it via parent_category_id (RESTRICT) — count
    # those too, or a parent could show 0 and still 500 on delete.
    child_counts = _count_by(db, Category.parent_category_id)

    return paginated_dict([
        _category_response_dict(
            c,
            tx_counts.get(c.category_id, 0)
            + rule_counts.get(c.category_id, 0)
            + alias_counts.get(c.category_id, 0)
            + child_counts.get(c.category_id, 0),
        )
        for c in results
    ])


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
    return _category_response_dict(category)


@router.get("/categories/{pk}/", response_model=CategoryResponse)
def get_category(pk: int, db: Session = Depends(get_db)):
    cat = (
        db.query(Category)
        .options(joinedload(Category.merged_into))
        .filter(Category.category_id == pk)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return _category_response_dict(cat)


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
    return _category_response_dict(cat)


@router.delete("/categories/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(pk: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.category_id == pk).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return None


@router.post("/categories/{pk}/merge/", response_model=CategoryResponse)
def merge_category(pk: int, payload: CategoryMerge, db: Session = Depends(get_db)):
    """Mark ``pk`` as an alias of the destination category.

    Non-destructive, mirroring payee merge (see ``merge_payee``): the source
    row is kept (never deleted) and existing transactions/import rules keep
    whichever category they already reference — only new transactions going
    forward resolve to the canonical category (see
    ``resolve_canonical_category_id``).
    """
    source_cat = db.query(Category).filter(Category.category_id == pk).first()
    if not source_cat:
        raise HTTPException(status_code=404, detail="Source category not found")

    dest_cat = db.query(Category).filter(Category.category_id == payload.destination_category_id).first()
    if not dest_cat:
        raise HTTPException(status_code=404, detail="Destination category not found")

    if source_cat.category_id == dest_cat.category_id:
        raise HTTPException(status_code=400, detail="Cannot merge a category into itself")

    # Always collapse to the destination's own root canonical, so chains
    # never exceed length 1 and "merge A into B" behaves the same whether or
    # not B is itself already an alias of something else.
    root_id = resolve_canonical_category_id(db, dest_cat.category_id)
    if root_id == source_cat.category_id:
        raise HTTPException(
            status_code=400,
            detail="Destination is already an alias of this category",
        )

    try:
        # Re-point any categories currently aliased to the source so they
        # follow it into the new group instead of being left pointing at a
        # category that is itself now an alias.
        db.query(Category).filter(Category.merged_into_category_id == source_cat.category_id).update(
            {Category.merged_into_category_id: root_id}, synchronize_session=False
        )
        source_cat.merged_into_category_id = root_id
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during merge: {str(e)}")

    db.refresh(source_cat)
    return _category_response_dict(source_cat)


@router.post("/categories/{pk}/unmerge/", response_model=CategoryResponse)
def unmerge_category(pk: int, db: Session = Depends(get_db)):
    """Detach a category from its canonical group, making it standalone again."""
    cat = db.query(Category).filter(Category.category_id == pk).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.merged_into_category_id = None
    db.commit()
    db.refresh(cat)
    return _category_response_dict(cat)
