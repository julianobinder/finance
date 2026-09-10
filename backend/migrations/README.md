# Database migrations (Alembic)

Schema is managed by **Alembic**. Config: `backend/alembic.ini` +
`backend/migrations/env.py` (reads the DB URL from `POSTGRESQL_URL` and diffs
against `app.models.Base.metadata`). Revisions live in `versions/`; `0001` is
the baseline (full schema via `create_all`).

## On startup

`app/db_migrate.py::ensure_schema` runs from `app/docker_init.py`:

- **Fresh DB** → `alembic upgrade head` builds the schema, then seeds base data
  (lookups + import templates).
- **Legacy DB** (tables exist, no `alembic_version`) → stamped to `head`
  (adopted in place, no data touched), then import templates ensured.
- **Managed DB** → `alembic upgrade head` applies any new revisions.

The empty-db / sample-db reset endpoints and restore re-stamp `head` so
`alembic_version` stays consistent, and re-seed the import templates.

## Adding a migration

1. Edit `app/models.py`.
2. Autogenerate against a DB that is currently at head (e.g. the running dev DB):

   ```bash
   docker exec -w /app finance-backend alembic revision --autogenerate -m "add X"
   ```

   The new file is written to `versions/`. **Review it** (autogenerate misses
   some changes: enum value changes, column type nuances, data migrations).
3. Apply it: restart the backend (`docker compose up -d backend`) — startup runs
   `upgrade head` — or run `docker exec -w /app finance-backend alembic upgrade head`.

Useful: `alembic current`, `alembic history`, `alembic check`
(fails if the models have un-migrated changes — good for CI).

> Do **not** evolve the schema with `Base.metadata.create_all` anymore; it can't
> `ALTER` existing tables. `create_all` is only used to build the `0001` baseline.
