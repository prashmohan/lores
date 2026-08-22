from app.config import get_settings


def test_settings_load_defaults():
    settings = get_settings()
    assert settings.APP_NAME == "Lores"
    assert settings.DATABASE_URL is not None
    assert settings.JWT_SECRET is not None


def test_db_session_fixture(db_session):
    assert db_session is not None
