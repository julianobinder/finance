from app.database import engine, Base
# Import all models to ensure they are registered with the Base metadata
from app.models import *


def main():
    print("Creating database tables using SQLAlchemy Base.metadata.create_all...")
    Base.metadata.create_all(bind=engine)
    print("Database tables validated/created successfully.")


if __name__ == "__main__":
    main()
