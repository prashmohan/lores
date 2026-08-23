import logging

from sqlalchemy import Engine, inspect, text

from app import models
from app.db.base import Base

# Ensure all models are registered in Base.metadata
_ = models
logger = logging.getLogger("lores.db")


def init_db(engine: Engine) -> None:
    """
    Initialize database tables and automatically synchronize schema by adding
    any missing columns to existing tables (lightweight auto-migration for SQLite/Postgres).
    """
    # 1. Create any missing tables
    Base.metadata.create_all(bind=engine)

    # 2. Inspect existing tables and add any missing columns
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table_name, table in Base.metadata.tables.items():
            if inspector.has_table(table_name):
                existing_cols = {col["name"] for col in inspector.get_columns(table_name)}
                for col in table.columns:
                    if col.name not in existing_cols:
                        col_type = col.type.compile(engine.dialect)
                        # Determine default if not nullable
                        default_clause = ""
                        if not col.nullable:
                            val = getattr(col.default, "arg", None)
                            if val is not None and getattr(col.default, "is_scalar", False):
                                if isinstance(val, (int, float)):
                                    default_clause = f" DEFAULT {val}"
                                elif isinstance(val, bool):
                                    default_clause = f" DEFAULT {1 if val else 0}"
                                elif isinstance(val, str):
                                    default_clause = f" DEFAULT '{val}'"
                            else:
                                if "int" in col_type.lower():
                                    default_clause = " DEFAULT 0"
                                elif "bool" in col_type.lower():
                                    default_clause = " DEFAULT 1"
                                elif "json" in col_type.lower():
                                    default_clause = " DEFAULT '{}'"
                                else:
                                    default_clause = " DEFAULT ''"

                        alter_stmt = f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}{default_clause}"
                        logger.info("Auto-migrating schema: %s", alter_stmt)
                        conn.execute(text(alter_stmt))
