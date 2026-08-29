import pytest

from app.config import Settings, get_settings


def test_settings_load_defaults():
    settings = get_settings()
    assert settings.APP_NAME == "Lores"
    assert settings.DATABASE_URL is not None
    assert settings.JWT_SECRET is not None


def test_db_session_fixture(db_session):
    assert db_session is not None


def test_production_jwt_secret_validation():
    # Valid production secret
    valid_settings = Settings(
        ENVIRONMENT="production",
        JWT_SECRET="a-very-strong-production-secret-key-32chars!",
        _env_file=None,
    )
    assert valid_settings.ENVIRONMENT == "production"
    assert valid_settings.JWT_SECRET == "a-very-strong-production-secret-key-32chars!"

    # Rejection of default dev placeholder in production
    with pytest.raises(
        ValueError,
        match="JWT_SECRET must be at least 32 characters and cannot use default dev placeholder in production",
    ):
        Settings(
            ENVIRONMENT="production",
            JWT_SECRET="lores-dev-secret-key-change-in-production-32bytes-min",
            _env_file=None,
        )

    # Rejection of short secret in production
    with pytest.raises(
        ValueError,
        match="JWT_SECRET must be at least 32 characters and cannot use default dev placeholder in production",
    ):
        Settings(
            ENVIRONMENT="production",
            JWT_SECRET="short-secret-key",
            _env_file=None,
        )

    # Development allows default placeholder
    dev_settings = Settings(
        ENVIRONMENT="development",
        JWT_SECRET="lores-dev-secret-key-change-in-production-32bytes-min",
        _env_file=None,
    )
    assert dev_settings.ENVIRONMENT == "development"
