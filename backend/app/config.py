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

    # Optional: enables AI-assisted transaction categorization on import.
    # Keys are supplied via env / .env.local (never hardcoded), like CURRRENCY_API.
    ai_provider: str = ""  # "anthropic" | "gemini" | "" (auto-detect from whichever key is set)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-lite"

    # Display defaults: used to format amounts/dates wherever there's no
    # more specific context (e.g. Obligations, which aren't tied to an
    # account/currency) and to drive number/date formatting style everywhere
    # else, without overriding any account/transaction's own currency symbol.
    default_currency_id: str = ""
    default_locale: str = "en-US"

    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
