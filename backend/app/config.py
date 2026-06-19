import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Base directory of the backend project
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    postgresql_url: str = "postgresql://finance:Lem0n4de-@localhost:5432/finance"
    secret_key: str = "super-secret-key"
    allowed_hosts: str = "*"
    cors_allowed_origins: str = "http://localhost:3000"
    log_level: str = "INFO"
    currency_url: str = "https://api.currencyfreaks.com/v2.0/rates/latest"
    currrency_api: str = ""  # Matches the exact spelling 'CURRRENCY_API' in .env.local

    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
