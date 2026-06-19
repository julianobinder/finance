from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

# Create engine with pooling and pre-ping safety check
engine = create_engine(
    settings.postgresql_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI Dependency injection for database session management"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
