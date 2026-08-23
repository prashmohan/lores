import uuid

from sqlalchemy import Column, DateTime, Engine, MetaData, String, Table, create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.init_db import init_db
from app.models.user import MagicAuthToken, User
from app.models.workspace import Workspace


def test_init_db_creates_all_tables_on_fresh_database():
    engine: Engine = create_engine("sqlite:///:memory:")
    init_db(engine)

    Session = sessionmaker(bind=engine)
    with Session() as session:
        user = User(email="test@example.com", display_name="Test User")
        session.add(user)
        session.commit()

        queried = session.scalar(select(User).where(User.email == "test@example.com"))
        assert queried is not None
        assert queried.display_name == "Test User"


def test_init_db_adds_missing_columns_to_existing_tables():
    engine: Engine = create_engine("sqlite:///:memory:")

    # 1. Create an old legacy schema for magic_auth_tokens (missing failed_attempts) and workspaces (missing map_layout)
    raw_meta = MetaData()
    _legacy_tokens = Table(
        "magic_auth_tokens",
        raw_meta,
        Column("id", String(36), primary_key=True),
        Column("email", String(255), nullable=False),
        Column("code_hash", String(255), nullable=False),
        Column("token_secret", String(255), nullable=False),
        Column("expires_at", DateTime, nullable=False),
        Column("used_at", DateTime, nullable=True),
        Column("created_at", DateTime, nullable=False),
    )
    _legacy_workspaces = Table(
        "workspaces",
        raw_meta,
        Column("id", String(36), primary_key=True),
        Column("name", String(150), nullable=False),
        Column("slug", String(150), nullable=False),
        Column("description", String(500), nullable=True),
        Column("created_by_user_id", String(36), nullable=False),
        Column("created_at", DateTime, nullable=False),
        Column("updated_at", DateTime, nullable=False),
    )
    raw_meta.create_all(bind=engine)

    # 2. Run init_db which should detect missing failed_attempts on magic_auth_tokens and map_layout on workspaces
    init_db(engine)

    # 3. Verify SQLAlchemy ORM queries with full model fields now succeed without OperationalError
    Session = sessionmaker(bind=engine)
    with Session() as session:
        # Create and query magic_auth_tokens
        from datetime import UTC, datetime

        token = MagicAuthToken(
            id=uuid.uuid4(),
            email="prashmohan@gmail.com",
            code_hash="fakehash",
            token_secret="fakesecret",
            failed_attempts=0,
            expires_at=datetime.now(UTC),
        )
        session.add(token)
        session.commit()

        # Query all fields (this was the exact query that failed in production)
        active_tokens_stmt = select(MagicAuthToken).where(
            MagicAuthToken.email == "prashmohan@gmail.com",
            MagicAuthToken.used_at.is_(None),
        )
        tokens = list(session.scalars(active_tokens_stmt).all())
        assert len(tokens) == 1
        assert tokens[0].failed_attempts == 0

        # Create and query workspace with map_layout
        ws = Workspace(
            id=uuid.uuid4(),
            name="Test Family",
            slug="test-family-123",
            created_by_user_id=uuid.uuid4(),
            map_layout={"node1": {"x": 100, "y": 200}},
        )
        session.add(ws)
        session.commit()

        queried_ws = session.get(Workspace, ws.id)
        assert queried_ws is not None
        assert queried_ws.map_layout == {"node1": {"x": 100, "y": 200}}
