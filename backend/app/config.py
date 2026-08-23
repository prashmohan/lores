from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Lores"
    APP_VERSION: str = "0.1.0"
    APP_URL: str = "http://localhost:8156"
    DATABASE_URL: str = "sqlite:///./lores.db"
    JWT_SECRET: str = "lores-dev-secret-key-change-in-production-32bytes-min"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = (
        60 * 24 * 30
    )  # 30 days for persistent, seamless family sessions
    OTP_EXPIRE_MINUTES: int = 15

    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = ""

    # Email & SMTP Settings
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: str = "noreply@lores.family"
    EMAILS_FROM_NAME: str = "Lores Family Tree"
    SMTP_TLS: bool = True

    # Google OAuth / SSO Settings
    GOOGLE_CLIENT_ID: str | None = None

    @property
    def cors_origins_list(self) -> list[str]:
        if not self.CORS_ORIGINS or self.CORS_ORIGINS.strip() == "*":
            if self.ENVIRONMENT == "production":
                return [self.APP_URL]
            return [
                "http://localhost",
                "http://localhost:3000",
                "http://localhost:5173",
                "http://localhost:8156",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:3000",
                "http://127.0.0.1:8156",
            ]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
