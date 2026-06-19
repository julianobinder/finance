FROM python:3.14-slim

# Install system dependencies (including postgresql-client for pg_dump/pg_restore dynamic libraries)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Overwrite default client binaries with PostgreSQL 18 binaries to match DB server version
RUN rm -f /usr/bin/pg_dump /usr/bin/pg_restore
COPY --from=postgres:18 /usr/lib/postgresql/18/bin/pg_dump /usr/bin/pg_dump
COPY --from=postgres:18 /usr/lib/postgresql/18/bin/pg_restore /usr/bin/pg_restore

# Copy uv binary directly from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set runtime workspace
WORKDIR /app

# Enable bytecode compilation for performance optimization
ENV UV_COMPILE_BYTECODE=1

# Populate dependencies first for Layer Cache optimization
COPY pyproject.toml uv.lock ./

# Perform dependency synchronization (excluding dev dependencies)
RUN uv sync --frozen --no-install-project --no-dev

# Copy the rest of the application codebase
COPY . .

# Complete synchronization with application package installation
RUN uv sync --frozen --no-dev

# Expose container service port
EXPOSE 8000

# Prepend virtualenv bin to PATH to make dependencies available
ENV PATH="/app/.venv/bin:$PATH"

# Execute database readiness, schema creation/verification and bootstrap server
CMD ["sh", "-c", "python -m app.docker_init && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
