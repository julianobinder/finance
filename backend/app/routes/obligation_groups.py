"""CRUD for ObligationGroup -- the reusable recurring-bill template that
separate Obligation rows (e.g. one per import batch) can link to. See
app.models.ObligationGroup for why this exists instead of merging them into
one Obligation.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Category, Obligation, ObligationGroup
from app.obligation_helpers import group_dict
from app.schemas import (
    ObligationGroupCreate,
    ObligationGroupResponse,
    ObligationGroupSyncResponse,
    ObligationGroupUpdate,
    PaginatedResponse,
)

router = APIRouter(prefix="/obligation-groups", tags=["Obligation Groups"])


def _get_or_404(pk: int, db: Session) -> ObligationGroup:
    g = (
        db.query(ObligationGroup)
        .options(joinedload(ObligationGroup.category))
        .filter(ObligationGroup.obligation_group_id == pk)
        .first()
    )
    if not g:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Obligation group not found")
    return g


def _validate_category(category_id: Optional[int], db: Session) -> None:
    if category_id is not None and not db.get(Category, category_id):
        raise HTTPException(status_code=400, detail="Category not found")


def _member_count(db: Session, pk: int) -> int:
    return db.query(Obligation).filter(Obligation.obligation_group_id == pk).count()


def _counts(db: Session, group_ids: list[int]) -> dict[int, int]:
    if not group_ids:
        return {}
    rows = (
        db.query(Obligation.obligation_group_id, func.count(Obligation.obligation_id))
        .filter(Obligation.obligation_group_id.in_(group_ids))
        .group_by(Obligation.obligation_group_id)
        .all()
    )
    return dict(rows)


@router.get("/", response_model=PaginatedResponse[ObligationGroupResponse])
def list_groups(search: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(ObligationGroup).options(joinedload(ObligationGroup.category))
    if search:
        query = query.filter(ObligationGroup.name.ilike(f"%{search}%"))
    groups = query.order_by(ObligationGroup.name).all()
    counts = _counts(db, [g.obligation_group_id for g in groups])
    data = [group_dict(g, counts.get(g.obligation_group_id, 0)) for g in groups]
    return {"count": len(data), "next": None, "previous": None, "results": data}


@router.post("/", response_model=ObligationGroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(payload: ObligationGroupCreate, db: Session = Depends(get_db)):
    _validate_category(payload.category_id, db)
    g = ObligationGroup(
        name=payload.name,
        category_id=payload.category_id,
        direction=payload.direction,
        recurrence=payload.recurrence,
        expected_day_of_month=payload.expected_day_of_month,
        expected_weekday=payload.expected_weekday,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return group_dict(g, 0)


@router.get("/{pk}/", response_model=ObligationGroupResponse)
def get_group(pk: int, db: Session = Depends(get_db)):
    g = _get_or_404(pk, db)
    return group_dict(g, _member_count(db, pk))


@router.put("/{pk}/", response_model=ObligationGroupResponse)
def update_group(pk: int, payload: ObligationGroupUpdate, db: Session = Depends(get_db)):
    """Updating a group's own fields never cascades to already-linked
    Obligations -- see /sync/ to push the change down explicitly."""
    g = _get_or_404(pk, db)
    _validate_category(payload.category_id, db)
    g.name = payload.name
    g.category_id = payload.category_id
    g.direction = payload.direction
    g.recurrence = payload.recurrence
    g.expected_day_of_month = payload.expected_day_of_month
    g.expected_weekday = payload.expected_weekday
    db.commit()
    return group_dict(_get_or_404(pk, db), _member_count(db, pk))


@router.delete("/{pk}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(pk: int, db: Session = Depends(get_db)):
    g = _get_or_404(pk, db)
    # Non-destructive to member Obligations -- just sever the link, they keep
    # whatever category/direction/recurrence they currently have.
    db.query(Obligation).filter(Obligation.obligation_group_id == pk).update(
        {Obligation.obligation_group_id: None}, synchronize_session=False
    )
    db.delete(g)
    db.commit()
    return None


@router.post("/{pk}/sync/", response_model=ObligationGroupSyncResponse)
def sync_group(pk: int, db: Session = Depends(get_db)):
    """Push the group's current category/direction/recurrence down onto every
    Obligation currently linked to it -- explicit and on-demand only; editing
    the group itself (PUT above) never does this automatically."""
    g = _get_or_404(pk, db)
    members = db.query(Obligation).filter(Obligation.obligation_group_id == pk).all()
    for ob in members:
        ob.category_id = g.category_id
        ob.direction = g.direction
        if g.recurrence:
            ob.recurrence = g.recurrence
            ob.is_recurring = True
    db.commit()
    return {"updated": len(members)}
