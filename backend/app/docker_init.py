import time
import logging
from sqlalchemy import inspect
from app.database import engine, SessionLocal
from app.models import Base
from app.db_reinit import seed_default_lookups

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docker_init")

def wait_for_db():
    retries = 30
    while retries > 0:
        try:
            # Attempt db connection check
            conn = engine.connect()
            conn.close()
            logger.info("Database connection verified successfully.")
            return True
        except Exception as e:
            logger.info(f"Database connection offline, retrying in 2 seconds... ({retries} retries left): {e}")
            time.sleep(2)
            retries -= 1
    raise RuntimeError("Critical: Timeout waiting for PostgreSQL database availability.")

def init_db():
    logger.info("Initializing database checks...")
    wait_for_db()
    
    db = SessionLocal()
    try:
        inspector = inspect(engine)
        # Check if the primary 'status' lookup table exists
        if not inspector.has_table("status"):
            logger.info("Tables not found. Generating schema from SQLAlchemy metadata...")
            Base.metadata.create_all(bind=engine)
            logger.info("Schema generated. Seeding standard system lookup data...")
            seed_default_lookups(db)
            db.commit()
            logger.info("Database schema creation and seeding finalized successfully.")
        else:
            logger.info("Database tables detected. Skipping schema generation and seeding.")
    except Exception as e:
        logger.error(f"Critical error during database schema validation/seeding: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
