from app.database import SessionLocal
from app.models import Category, Status, TransactionType


def main():
    db = SessionLocal()
    try:
        print("Seeding testing lookups...")
        # Seed Statuses
        statuses = [(1, "Reconciled"), (2, "Clear"), (3, "Unclear")]
        for sid, name in statuses:
            status = db.query(Status).filter(Status.status_id == sid).first()
            if not status:
                status = Status(status_id=sid, name=name)
                db.add(status)

        # Seed TransactionTypes
        types = [(1, "Withdrawal", "WTH"), (2, "Deposit", "DEP"), (3, "Transfer", "TRF")]
        for tid, name, code in types:
            tt = (
                db.query(TransactionType)
                .filter(TransactionType.transaction_type_id == tid)
                .first()
            )
            if not tt:
                tt = TransactionType(transaction_type_id=tid, name=name, code=code)
                db.add(tt)

        # Seed default categories
        categories = ["Initial Balance", "Split", "Transfer"]
        for cat_name in categories:
            cat = db.query(Category).filter(Category.name == cat_name).first()
            if not cat:
                cat = Category(name=cat_name, is_hidden=True)
                db.add(cat)

        db.commit()
        print("✔ Successfully seeded Statuses, TransactionTypes, and default Categories.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
