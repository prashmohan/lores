from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Lores"
    APP_VERSION: str = "0.1.0"
    DATABASE_URL: str = "sqlite:///./lores.db"
    JWT_SECRET: str = "lores-dev-secret-key-change-in-production-32bytes-min"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days for senior friendly sessions
    OTP_EXPIRE_MINUTES: int = 15

    # Email & SMTP Settings
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: str = "noreply@lores.family"
    EMAILS_FROM_NAME: str = "Lores Family Tree"
    SMTP_TLS: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
