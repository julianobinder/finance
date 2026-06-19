from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routes import (
    accounts,
    accounts_extra,
    import_plans,
    settings as settings_route,
    subresources,
    transactions,
    reports,
)

app = FastAPI(
    title="Finance App API",
    description="FastAPI Backend for Finance App",
    version="1.0.0",
)

# Configure CORS
origins = []
if settings.cors_allowed_origins:
    if "," in settings.cors_allowed_origins:
        origins = [o.strip() for o in settings.cors_allowed_origins.split(",") if o]
    else:
        origins = [settings.cors_allowed_origins.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers with /api prefix
app.include_router(accounts_extra.router, prefix="/api")
app.include_router(subresources.router, prefix="/api")
app.include_router(import_plans.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(settings_route.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Finance App API is running."}
