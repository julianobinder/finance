import time
import logging
from app.database import engine
from app.db_migrate import ensure_schema

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
    try:
        # Alembic-managed: builds/migrates the schema and seeds base data.
        # Adopts a legacy pre-Alembic database without touching existing rows.
        ensure_schema()
        logger.info("Database schema/migrations finalized successfully.")
    except Exception as e:
        logger.error(f"Critical error during database schema validation/migration: {e}")
        raise

if __name__ == "__main__":
    init_db()
