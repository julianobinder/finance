from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Category, ImportPlan, ImportPlanRule
from app.schemas import ImportPlanRuleCreate, ImportPlanRuleResponse

router = APIRouter()


@router.post("/import-plan-rules/", response_model=ImportPlanRuleResponse, status_code=status.HTTP_201_CREATED)
def create_import_plan_rule(
    payload: ImportPlanRuleCreate, db: Session = Depends(get_db)
):
    plan = (
        db.query(ImportPlan)
        .filter(ImportPlan.import_plan_id == payload.import_plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(
            status_code=400, detail="Import plan not found"
        )

    rule = ImportPlanRule(
        import_plan_id=payload.import_plan_id,
        import_csv_field_id=payload.import_csv_field_id,
        pattern=payload.pattern,
        order=payload.order,
        ignore=payload.ignore,
        match_type=payload.match_type,
        payee_id=payload.payee_id,
        category_id=payload.category_id,
        to_account_id=payload.to_account_id,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    rule_loaded = (
        db.query(ImportPlanRule)
        .options(
            joinedload(ImportPlanRule.import_plan).joinedload(ImportPlan.account),
            joinedload(ImportPlanRule.import_csv_field),
            joinedload(ImportPlanRule.payee),
            joinedload(ImportPlanRule.category).joinedload(Category.parent),
            joinedload(ImportPlanRule.to_account),
        )
        .filter(ImportPlanRule.import_plan_rule_id == rule.import_plan_rule_id)
        .first()
    )

    cat_name = None
    if rule_loaded.category:
        if rule_loaded.category.parent:
            cat_name = f"{rule_loaded.category.parent.name}: {rule_loaded.category.name}"
        else:
            cat_name = rule_loaded.category.name

    return {
        "import_plan_rule_id": rule_loaded.import_plan_rule_id,
        "import_plan_id": rule_loaded.import_plan_id,
        "account_name": (
            str(rule_loaded.import_plan.account)
            if rule_loaded.import_plan and rule_loaded.import_plan.account
            else None
        ),
        "import_csv_field_id": rule_loaded.import_csv_field_id,
        "import_csv_field_name": (
            rule_loaded.import_csv_field.name if rule_loaded.import_csv_field else None
        ),
        "pattern": rule_loaded.pattern,
        "order": rule_loaded.order,
        "ignore": rule_loaded.ignore,
        "match_type": rule_loaded.match_type,
        "payee_id": rule_loaded.payee_id,
        "payee_name": rule_loaded.payee.name if rule_loaded.payee else None,
        "category_id": rule_loaded.category_id,
        "category_name": cat_name,
        "to_account_id": rule_loaded.to_account_id,
        "to_account_name": (
            str(rule_loaded.to_account) if rule_loaded.to_account else None
        ),
    }


@router.get("/import-plan-rules/{pk}/", response_model=ImportPlanRuleResponse)
def get_import_plan_rule(pk: int, db: Session = Depends(get_db)):
    r = (
        db.query(ImportPlanRule)
        .options(
            joinedload(ImportPlanRule.import_plan).joinedload(ImportPlan.account),
            joinedload(ImportPlanRule.import_csv_field),
            joinedload(ImportPlanRule.payee),
            joinedload(ImportPlanRule.category).joinedload(Category.parent),
            joinedload(ImportPlanRule.to_account),
        )
        .filter(ImportPlanRule.import_plan_rule_id == pk)
        .first()
    )
    if not r:
        raise HTTPException(
            status_code=404,
            detail="Import plan rule not found",
        )

    cat_name = None
    if r.category:
        if r.category.parent:
            cat_name = f"{r.category.parent.name}: {r.category.name}"
        else:
            cat_name = r.category.name

    return {
        "import_plan_rule_id": r.import_plan_rule_id,
        "import_plan_id": r.import_plan_id,
        "account_name": (
            str(r.import_plan.account)
            if r.import_plan and r.import_plan.account
            else None
        ),
        "import_csv_field_id": r.import_csv_field_id,
        "import_csv_field_name": r.import_csv_field.name if r.import_csv_field else None,
        "pattern": r.pattern,
        "order": r.order,
        "ignore": r.ignore,
        "match_type": r.match_type,
        "payee_id": r.payee_id,
        "payee_name": r.payee.name if r.payee else None,
        "category_id": r.category_id,
        "category_name": cat_name,
        "to_account_id": r.to_account_id,
        "to_account_name": str(r.to_account) if r.to_account else None,
    }


@router.put("/import-plan-rules/{pk}/", response_model=ImportPlanRuleResponse)
def update_import_plan_rule(
    pk: int, payload: ImportPlanRuleCreate, db: Session = Depends(get_db)
):
    rule = db.query(ImportPlanRule).filter(ImportPlanRule.import_plan_rule_id == pk).first()
    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Import plan rule not found",
        )

    rule.import_plan_id = payload.import_plan_id
    rule.import_csv_field_id = payload.import_csv_field_id
    rule.pattern = payload.pattern
    rule.order = payload.order
    rule.ignore = payload.ignore
    rule.match_type = payload.match_type
    rule.payee_id = payload.payee_id
    rule.category_id = payload.category_id
    rule.to_account_id = payload.to_account_id

    db.commit()

    r = (
        db.query(ImportPlanRule)
        .options(
            joinedload(ImportPlanRule.import_plan).joinedload(ImportPlan.account),
            joinedload(ImportPlanRule.import_csv_field),
            joinedload(ImportPlanRule.payee),
            joinedload(ImportPlanRule.category).joinedload(Category.parent),
            joinedload(ImportPlanRule.to_account),
        )
        .filter(ImportPlanRule.import_plan_rule_id == pk)
        .first()
    )

    cat_name = None
    if r.category:
        if r.category.parent:
            cat_name = f"{r.category.parent.name}: {r.category.name}"
        else:
            cat_name = r.category.name

    return {
        "import_plan_rule_id": r.import_plan_rule_id,
        "import_plan_id": r.import_plan_id,
        "account_name": (
            str(r.import_plan.account)
            if r.import_plan and r.import_plan.account
            else None
        ),
        "import_csv_field_id": r.import_csv_field_id,
        "import_csv_field_name": r.import_csv_field.name if r.import_csv_field else None,
        "pattern": r.pattern,
        "order": r.order,
        "ignore": r.ignore,
        "match_type": r.match_type,
        "payee_id": r.payee_id,
        "payee_name": r.payee.name if r.payee else None,
        "category_id": r.category_id,
        "category_name": cat_name,
        "to_account_id": r.to_account_id,
        "to_account_name": str(r.to_account) if r.to_account else None,
    }


@router.delete("/import-plan-rules/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_import_plan_rule(pk: int, db: Session = Depends(get_db)):
    rule = db.query(ImportPlanRule).filter(ImportPlanRule.import_plan_rule_id == pk).first()
    if not rule:
        raise HTTPException(
            status_code=404,
            detail="Import plan rule not found",
        )
    db.delete(rule)
    db.commit()
    return None


@router.get("/import-plan-rules/plan/{import_plan_id}/")
def import_plan_rules_by_plan(import_plan_id: int, db: Session = Depends(get_db)):
    rules = (
        db.query(ImportPlanRule)
        .options(
            joinedload(ImportPlanRule.import_plan).joinedload(ImportPlan.account),
            joinedload(ImportPlanRule.import_csv_field),
            joinedload(ImportPlanRule.payee),
            joinedload(ImportPlanRule.category).joinedload(Category.parent),
            joinedload(ImportPlanRule.to_account),
        )
        .filter(ImportPlanRule.import_plan_id == import_plan_id)
        .order_by(ImportPlanRule.order)
        .all()
    )

    results = []
    for r in rules:
        cat_name = None
        if r.category:
            if r.category.parent:
                cat_name = f"{r.category.parent.name}: {r.category.name}"
            else:
                cat_name = r.category.name

        results.append(
            {
                "import_plan_rule_id": r.import_plan_rule_id,
                "import_plan_id": r.import_plan_id,
                "account_name": (
                    str(r.import_plan.account)
                    if r.import_plan and r.import_plan.account
                    else None
                ),
                "import_csv_field_id": r.import_csv_field_id,
                "import_csv_field_name": (
                    r.import_csv_field.name if r.import_csv_field else None
                ),
                "pattern": r.pattern,
                "order": r.order,
                "ignore": r.ignore,
                "match_type": r.match_type,
                "payee_id": r.payee_id,
                "payee_name": r.payee.name if r.payee else None,
                "category_id": r.category_id,
                "category_name": cat_name,
                "to_account_id": r.to_account_id,
                "to_account_name": str(r.to_account) if r.to_account else None,
            }
        )

    return results
