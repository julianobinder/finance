import os
import subprocess
import tempfile
import zipfile
from datetime import datetime
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.config import settings as app_settings
from app.database import get_db
from app.schemas import SettingsConfigUpdate

router = APIRouter(prefix="/settings", tags=["Database Settings"])


def parse_db_url(url: str) -> dict:
    """Parse connection parameters from Postgres URL"""
    parsed = urlparse(url)
    return {
        "NAME": parsed.path.lstrip("/"),
        "USER": parsed.username or "",
        "PASSWORD": parsed.password or "",
        "HOST": parsed.hostname or "localhost",
        "PORT": str(parsed.port or 5432),
    }


@router.get("/backup/")
def backup_database():
    """Generate a zipped pg_dump custom format database backup"""
    try:
        db_config = parse_db_url(app_settings.postgresql_url)
        db_name = db_config["NAME"]
        db_user = db_config["USER"]
        db_password = db_config["PASSWORD"]
        db_host = db_config["HOST"]
        db_port = db_config["PORT"]

        dump_path = None
        zip_path = None

        try:
            # Create temporary dump file
            with tempfile.NamedTemporaryFile(
                mode="w+b", suffix=".dump", delete=False
            ) as dump_file:
                dump_path = dump_file.name

            env = os.environ.copy()
            env["PGPASSWORD"] = db_password

            # Build pg_dump command
            pg_dump_cmd = [
                "pg_dump",
                "-h",
                db_host,
                "-p",
                db_port,
                "-U",
                db_user,
                "-d",
                db_name,
                "-F",
                "c",  # Custom format
                "-f",
                dump_path,
            ]

            subprocess.run(
                pg_dump_cmd,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )

            # Create zip archive
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            zip_filename = f"finance_backup_{timestamp}.zip"

            with tempfile.NamedTemporaryFile(
                mode="w+b", suffix=".zip", delete=False
            ) as zip_file:
                zip_path = zip_file.name

                with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                    zipf.write(dump_path, f"finance_backup_{timestamp}.dump")

            with open(zip_path, "rb") as f:
                zip_content = f.read()

            # Clean up temp files
            if dump_path and os.path.exists(dump_path):
                os.unlink(dump_path)
            if zip_path and os.path.exists(zip_path):
                os.unlink(zip_path)

            return Response(
                content=zip_content,
                media_type="application/zip",
                headers={
                    "Content-Disposition": f"attachment; filename={zip_filename}",
                    "Content-Length": str(len(zip_content)),
                },
            )

        except subprocess.CalledProcessError as e:
            if dump_path and os.path.exists(dump_path):
                os.unlink(dump_path)
            if zip_path and os.path.exists(zip_path):
                os.unlink(zip_path)
            error_message = e.stderr if e.stderr else str(e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create database backup: {error_message}",
            )
        except Exception as e:
            if dump_path and os.path.exists(dump_path):
                os.unlink(dump_path)
            if zip_path and os.path.exists(zip_path):
                os.unlink(zip_path)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"An error occurred during backup: {str(e)}",
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize backup: {str(e)}",
        )


@router.post("/restore/")
def restore_database(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Restore database from zip backup by dropping all tables first"""
    if not file.filename.endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Please upload a .zip file.",
        )

    try:
        db_config = parse_db_url(app_settings.postgresql_url)
        db_name = db_config["NAME"]
        db_user = db_config["USER"]
        db_password = db_config["PASSWORD"]
        db_host = db_config["HOST"]
        db_port = db_config["PORT"]

        zip_path = None
        dump_path = None

        try:
            # Save uploaded zip temporarily
            with tempfile.NamedTemporaryFile(
                mode="w+b", suffix=".zip", delete=False
            ) as zip_file:
                zip_path = zip_file.name
                zip_file.write(file.file.read())

            # Extract dump file
            with zipfile.ZipFile(zip_path, "r") as zipf:
                dump_files = [f for f in zipf.namelist() if f.endswith(".dump")]
                if not dump_files:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="No .dump file found in the zip archive.",
                    )

                dump_filename = dump_files[0]
                with tempfile.NamedTemporaryFile(
                    mode="w+b", suffix=".dump", delete=False
                ) as dump_file:
                    dump_path = dump_file.name
                    dump_file.write(zipf.read(dump_filename))

            # Set PGPASSWORD
            env = os.environ.copy()
            env["PGPASSWORD"] = db_password

            # Drop all public objects first
            drop_all_sql = """
            DO $$ DECLARE
                r RECORD;
            BEGIN
                -- Drop all tables
                FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
                END LOOP;
                
                -- Drop all sequences
                FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
                    EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequence_name) || ' CASCADE';
                END LOOP;
                
                -- Drop all types
                FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'c') LOOP
                    EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
                END LOOP;
                
                -- Drop all functions
                FOR r IN (SELECT proname, oidvectortypes(proargtypes) as argtypes FROM pg_proc INNER JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'public') LOOP
                    EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.proname) || '(' || r.argtypes || ') CASCADE';
                END LOOP;
                
                -- Drop all views
                FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
                    EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.viewname) || ' CASCADE';
                END LOOP;
            END $$;
            """
            
            db.execute(text(drop_all_sql))
            db.commit()

            # Execute pg_restore
            pg_restore_cmd = [
                "pg_restore",
                "-h",
                db_host,
                "-p",
                db_port,
                "-U",
                db_user,
                "-d",
                db_name,
                "--no-owner",
                "--no-acl",
                "-F",
                "c",
                dump_path,
            ]

            subprocess.run(
                pg_restore_cmd,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )

            # Cleanup temp files
            if zip_path and os.path.exists(zip_path):
                os.unlink(zip_path)
            if dump_path and os.path.exists(dump_path):
                os.unlink(dump_path)

            return {"message": "Database restored successfully."}

        except subprocess.CalledProcessError as e:
            if zip_path and os.path.exists(zip_path):
                os.unlink(zip_path)
            if dump_path and os.path.exists(dump_path):
                os.unlink(dump_path)
            error_message = e.stderr if e.stderr else str(e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to restore database: {error_message}",
            )
        except zipfile.BadZipFile:
            if zip_path and os.path.exists(zip_path):
                os.unlink(zip_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid zip file format.",
            )
        except Exception as e:
            if zip_path and os.path.exists(zip_path):
                os.unlink(zip_path)
            if dump_path and os.path.exists(dump_path):
                os.unlink(dump_path)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"An error occurred during restore: {str(e)}",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize restore: {str(e)}",
        )


@router.post("/empty-db/")
def load_empty_database(db: Session = Depends(get_db)):
    """Drop all tables and create a fresh empty database with default lookups."""
    from sqlalchemy.exc import SQLAlchemyError
    from app.db_reinit import (
        drop_all_public_objects,
        create_all_tables,
        seed_default_lookups,
    )

    try:
        drop_all_public_objects(db)
        create_all_tables(db)
        seed_default_lookups(db)
        db.commit()
        return {"message": "Empty database loaded successfully."}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error during reinitialization: {str(e)}",
        )


@router.get("/config/")
def get_config():
    """Retrieve external integration configuration settings."""
    from app.config import settings as app_settings
    return {
        "currency_url": app_settings.currency_url,
        "currrency_api": app_settings.currrency_api,
    }


@router.post("/config/")
def update_config(payload: SettingsConfigUpdate):
    """Update external integration configurations in the environment file and in-memory."""
    import os
    from app.config import settings as app_settings, BASE_DIR

    currency_url = payload.currency_url.strip()
    currrency_api = payload.currrency_api.strip()

    env_path = os.path.join(BASE_DIR, ".env.local")
    try:
        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

        new_lines = []
        url_found = False
        api_found = False

        for line in lines:
            if line.strip().startswith("CURRENCY_URL="):
                new_lines.append(f"CURRENCY_URL={currency_url}\n")
                url_found = True
            elif line.strip().startswith("CURRRENCY_API="):
                new_lines.append(f"CURRRENCY_API={currrency_api}\n")
                api_found = True
            else:
                new_lines.append(line)

        if not url_found:
            new_lines.append(f"CURRENCY_URL={currency_url}\n")
        if not api_found:
            new_lines.append(f"CURRRENCY_API={currrency_api}\n")

        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

        # Update in-memory values immediately
        app_settings.currency_url = currency_url
        app_settings.currrency_api = currrency_api

        return {"message": "Configuration updated successfully."}
    except IOError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write configuration to .env.local: {str(e)}",
        )


@router.post("/sample-db/")
def load_sample_database(db: Session = Depends(get_db)):
    """Drop all tables and create a fresh database populated with sample data."""
    from sqlalchemy.exc import SQLAlchemyError
    from app.db_seed_sample import seed_sample_data

    try:
        seed_sample_data(db)
        return {"message": "Sample database loaded successfully."}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error during sample load: {str(e)}",
        )




