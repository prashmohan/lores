import logging
import re

from sqlalchemy import Engine, inspect, text

from app import models
from app.db.base import Base

# Ensure all models are registered in Base.metadata
_ = models
logger = logging.getLogger("lores.db")

_VALID_IDENTIFIER_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


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
        preparer = conn.dialect.identifier_preparer
        for table_name, table in Base.metadata.tables.items():
            if not _VALID_IDENTIFIER_PATTERN.match(table_name):
                logger.warning("Skipping table with non-whitelisted identifier: %s", table_name)
                continue

            if inspector.has_table(table_name):
                existing_cols = {col["name"] for col in inspector.get_columns(table_name)}
                for col in table.columns:
                    if not _VALID_IDENTIFIER_PATTERN.match(col.name):
                        logger.warning(
                            "Skipping column with non-whitelisted identifier: %s", col.name
                        )
                        continue

                    if col.name not in existing_cols:
                        quoted_table = preparer.quote_identifier(table_name)
                        quoted_col = preparer.quote_identifier(col.name)
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
                                    safe_val = val.replace("'", "''")
                                    default_clause = f" DEFAULT '{safe_val}'"
                            else:
                                if "int" in col_type.lower():
                                    default_clause = " DEFAULT 0"
                                elif "bool" in col_type.lower():
                                    default_clause = " DEFAULT 1"
                                elif "json" in col_type.lower():
                                    default_clause = " DEFAULT '{}'"
                                else:
                                    default_clause = " DEFAULT ''"

                        alter_stmt = f"ALTER TABLE {quoted_table} ADD COLUMN {quoted_col} {col_type}{default_clause}"
                        logger.info("Auto-migrating schema: %s", alter_stmt)
                        conn.execute(text(alter_stmt))
