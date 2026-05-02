"""
Database migration script.

Run to apply schema changes to an existing database without Alembic.
Uses ADD COLUMN IF NOT EXISTS (PostgreSQL) — safe to run repeatedly.
"""

from app.core.database import engine, Base
from app.models import user, signal, auth  # noqa: F401 — ensure all models imported
from sqlalchemy import text


def run():
    # 1. Create any missing tables
    Base.metadata.create_all(bind=engine)

    # 2. Add new columns to existing tables
    with engine.connect() as conn:
        is_postgres = "postgresql" in str(engine.url)

        migrations = [
            # Users table — portal-token / report-sent flow
            ("ALTER TABLE users ADD COLUMN report_sent BOOLEAN NOT NULL DEFAULT false",
             "report_sent"),
            ("ALTER TABLE users ADD COLUMN portal_token VARCHAR(255)",
             "portal_token"),
            ("ALTER TABLE users ADD COLUMN portal_sent_at TIMESTAMP WITH TIME ZONE",
             "portal_sent_at"),
        ]

        for sql, col_name in migrations:
            try:
                if is_postgres:
                    conn.execute(text(sql.replace("ADD COLUMN", "ADD COLUMN IF NOT EXISTS")))
                else:
                    conn.execute(text(sql))
                print(f"  OK  {col_name}")
            except Exception as e:
                if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                    print(f"  SKIP  {col_name} (already exists)")
                else:
                    raise

        conn.commit()
        print("Migration complete.")


if __name__ == "__main__":
    run()
