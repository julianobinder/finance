from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import (
    Account,
    Category,
    ImportCSV,
    ImportCsvField,
    ImportPlan,
    ImportPlanRule,
)
from app.schemas import (
    ImportCSVCreate,
    ImportCSVResponse,
    ImportPlanCreate,
    ImportPlanResponse,
    PaginatedResponse,
)

router = APIRouter(prefix="/accounts", tags=["Import Plans"])


def paginated_dict(results: list) -> dict:
    return {"count": len(results), "next": None, "previous": None, "results": results}


def get_importplan_response_dict(plan: ImportPlan) -> dict:
    rules = sorted(plan.rules, key=lambda r: r.order)
    serialized_rules = []
    for r in rules:
        cat_name = None
        if r.category:
            if r.category.parent:
                cat_name = f"{r.category.parent.name}: {r.category.name}"
            else:
                cat_name = r.category.name

        serialized_rules.append(
            {
                "import_plan_rule_id": r.import_plan_rule_id,
                "import_plan_id": r.import_plan_id,
                "account_name": str(plan.account) if plan.account else None,
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

    return {
        "import_plan_id": plan.import_plan_id,
        "name": plan.name,
        "account_id": plan.account_id,
        "account_name": str(plan.account) if plan.account else "",
        "import_csv_id": plan.import_csv_id,
        "import_csv_name": plan.import_csv.name if plan.import_csv else "",
        "rules_count": len(plan.rules),
        "rules": serialized_rules,
    }


# CSV Templates
@router.get("/csv-templates/", response_model=PaginatedResponse[ImportCSVResponse])
def list_csv_templates(db: Session = Depends(get_db)):
    results = (
        db.query(ImportCSV)
        .options(joinedload(ImportCSV.fields))
        .all()
    )
    return paginated_dict(results)


@router.post("/csv-templates/", response_model=ImportCSVResponse, status_code=status.HTTP_201_CREATED)
def create_csv_template(payload: ImportCSVCreate, db: Session = Depends(get_db)):
    fields_data = payload.fields or []
    import_csv = ImportCSV(name=payload.name)
    db.add(import_csv)
    db.flush()

    for f_data in fields_data:
        field = ImportCsvField(
            import_csv_id=import_csv.import_csv_id,
            name=f_data.name,
            map_field=f_data.map_field,
            type_field=f_data.type_field,
            format_field=f_data.format_field,
        )
        db.add(field)

    db.commit()
    db.refresh(import_csv)
    return import_csv


@router.get("/csv-templates/{pk}/", response_model=ImportCSVResponse)
def get_csv_template(pk: int, db: Session = Depends(get_db)):
    template = (
        db.query(ImportCSV)
        .options(joinedload(ImportCSV.fields))
        .filter(ImportCSV.import_csv_id == pk)
        .first()
    )
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="CSV template not found"
        )
    return template


@router.put("/csv-templates/{pk}/", response_model=ImportCSVResponse)
def update_csv_template(
    pk: int, payload: ImportCSVCreate, db: Session = Depends(get_db)
):
    template = db.query(ImportCSV).filter(ImportCSV.import_csv_id == pk).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="CSV template not found"
        )

    template.name = payload.name

    # Update nested fields in place to maintain integrity for rules referencing them
    existing_fields = db.query(ImportCsvField).filter(ImportCsvField.import_csv_id == pk).all()
    existing_by_id = {f.import_csv_field_id: f for f in existing_fields}
    existing_by_name = {f.name: f for f in existing_fields}

    fields_data = payload.fields or []
    updated_field_ids = set()

    for f_data in fields_data:
        matched_field = None
        if f_data.import_csv_field_id is not None:
            matched_field = existing_by_id.get(f_data.import_csv_field_id)

        if matched_field is None:
            matched_field = existing_by_name.get(f_data.name)

        if matched_field is not None:
            matched_field.name = f_data.name
            matched_field.map_field = f_data.map_field
            matched_field.type_field = f_data.type_field
            matched_field.format_field = f_data.format_field
            updated_field_ids.add(matched_field.import_csv_field_id)
        else:
            field = ImportCsvField(
                import_csv_id=pk,
                name=f_data.name,
                map_field=f_data.map_field,
                type_field=f_data.type_field,
                format_field=f_data.format_field,
            )
            db.add(field)

    # Delete fields that were removed from the template
    for f in existing_fields:
        if f.import_csv_field_id not in updated_field_ids:
            db.delete(f)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/csv-templates/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_csv_template(pk: int, db: Session = Depends(get_db)):
    template = db.query(ImportCSV).filter(ImportCSV.import_csv_id == pk).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="CSV template not found"
        )
    db.delete(template)
    db.commit()
    return None


# Import Plans
@router.get("/import-plans/", response_model=PaginatedResponse[ImportPlanResponse])
def list_import_plans(db: Session = Depends(get_db)):
    plans = (
        db.query(ImportPlan)
        .options(
            joinedload(ImportPlan.account)
            .joinedload(Account.account_holder),
            joinedload(ImportPlan.account).joinedload(Account.currency),
            joinedload(ImportPlan.account).joinedload(Account.titular),
            joinedload(ImportPlan.import_csv),
            joinedload(ImportPlan.rules)
            .joinedload(ImportPlanRule.import_csv_field),
            joinedload(ImportPlan.rules).joinedload(ImportPlanRule.payee),
            joinedload(ImportPlan.rules)
            .joinedload(ImportPlanRule.category)
            .joinedload(Category.parent),
            joinedload(ImportPlan.rules).joinedload(ImportPlanRule.to_account),
        )
        .all()
    )
    results = [get_importplan_response_dict(p) for p in plans]
    return paginated_dict(results)


@router.post("/import-plans/", response_model=ImportPlanResponse, status_code=status.HTTP_201_CREATED)
def create_import_plan(payload: ImportPlanCreate, db: Session = Depends(get_db)):
    plan = ImportPlan(
        name=payload.name,
        account_id=payload.account_id,
        import_csv_id=payload.import_csv_id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    plan_loaded = (
        db.query(ImportPlan)
        .options(
            joinedload(ImportPlan.account),
            joinedload(ImportPlan.import_csv),
            joinedload(ImportPlan.rules),
        )
        .filter(ImportPlan.import_plan_id == plan.import_plan_id)
        .first()
    )
    return get_importplan_response_dict(plan_loaded)


@router.get("/import-plans/{pk}/", response_model=ImportPlanResponse)
def get_import_plan(pk: int, db: Session = Depends(get_db)):
    plan = (
        db.query(ImportPlan)
        .options(
            joinedload(ImportPlan.account),
            joinedload(ImportPlan.import_csv),
            joinedload(ImportPlan.rules)
            .joinedload(ImportPlanRule.import_csv_field),
            joinedload(ImportPlan.rules).joinedload(ImportPlanRule.payee),
            joinedload(ImportPlan.rules)
            .joinedload(ImportPlanRule.category)
            .joinedload(Category.parent),
            joinedload(ImportPlan.rules).joinedload(ImportPlanRule.to_account),
        )
        .filter(ImportPlan.import_plan_id == pk)
        .first()
    )
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import plan not found"
        )
    return get_importplan_response_dict(plan)


@router.put("/import-plans/{pk}/", response_model=ImportPlanResponse)
def update_import_plan(
    pk: int, payload: ImportPlanCreate, db: Session = Depends(get_db)
):
    plan = db.query(ImportPlan).filter(ImportPlan.import_plan_id == pk).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import plan not found"
        )

    plan.name = payload.name
    plan.account_id = payload.account_id
    plan.import_csv_id = payload.import_csv_id

    db.commit()
    db.refresh(plan)

    plan_loaded = (
        db.query(ImportPlan)
        .options(
            joinedload(ImportPlan.account),
            joinedload(ImportPlan.import_csv),
            joinedload(ImportPlan.rules)
            .joinedload(ImportPlanRule.import_csv_field),
            joinedload(ImportPlan.rules).joinedload(ImportPlanRule.payee),
            joinedload(ImportPlan.rules)
            .joinedload(ImportPlanRule.category)
            .joinedload(Category.parent),
            joinedload(ImportPlan.rules).joinedload(ImportPlanRule.to_account),
        )
        .filter(ImportPlan.import_plan_id == pk)
        .first()
    )
    return get_importplan_response_dict(plan_loaded)


@router.delete("/import-plans/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_import_plan(pk: int, db: Session = Depends(get_db)):
    plan = db.query(ImportPlan).filter(ImportPlan.import_plan_id == pk).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Import plan not found"
        )
    db.delete(plan)
    db.commit()
    return None


# Helper routes
@router.get("/import-plans/template/{import_csv_id}/")
def import_plans_by_template(import_csv_id: int, db: Session = Depends(get_db)):
    plans = (
        db.query(ImportPlan)
        .options(
            joinedload(ImportPlan.account),
            joinedload(ImportPlan.import_csv),
            joinedload(ImportPlan.rules),
        )
        .filter(ImportPlan.import_csv_id == import_csv_id)
        .all()
    )
    results = [get_importplan_response_dict(p) for p in plans]
    return results


@router.get("/import-plans/fields/{import_csv_id}/")
def import_plan_fields(import_csv_id: int, db: Session = Depends(get_db)):
    fields = (
        db.query(ImportCsvField)
        .filter(ImportCsvField.import_csv_id == import_csv_id)
        .all()
    )
    return fields


# Include sub-routes for import plan rules
from app.routes.import_plan_rules import router as rules_router
router.include_router(rules_router)
