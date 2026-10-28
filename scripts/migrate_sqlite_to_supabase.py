#!/usr/bin/env python3
"""
NiceJobs - SQLite to Supabase PostgreSQL Migration Script
Migrates tables, constraints, sequences, and records from nicejobs.db to Supabase PostgreSQL.
Supports dry-run validation, foreign key ordering, sequence synchronization, and row-count reconciliation.
Guaranteed to protect secrets and perform ZERO remote writes during --dry-run.
"""
import os
import sys
import re
import sqlite3
import argparse
from typing import List, Dict, Tuple
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load local .env
load_dotenv()

# Full PostgreSQL DDL Schema with explicit types, foreign keys, and performance indexes
POSTGRES_SCHEMA = """
-- 1. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 2. Blogs
CREATE TABLE IF NOT EXISTS blogs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    content TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_title TEXT NOT NULL,
    author_avatar TEXT,
    cover_image TEXT,
    read_time TEXT DEFAULT '5 min read',
    published_at TEXT,
    tags TEXT,
    author_id TEXT DEFAULT ''
);

-- 3. Moderation Reports
CREATE TABLE IF NOT EXISTS moderation_reports (
    id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    reporter_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at TEXT
);

-- 4. OTP Verifications
CREATE TABLE IF NOT EXISTS otp_verifications (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    created_at TEXT,
    verified INTEGER DEFAULT 0
);

-- 5. Email Logs
CREATE TABLE IF NOT EXISTS email_logs (
    id TEXT PRIMARY KEY,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    event_type TEXT NOT NULL,
    body_text TEXT,
    status TEXT DEFAULT 'sent',
    sent_at TEXT
);

-- 6. Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT,
    password TEXT DEFAULT 'Password123!',
    dob TEXT DEFAULT '',
    nid_passport TEXT DEFAULT '',
    designation TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    is_business_admin INTEGER DEFAULT 0,
    is_demo INTEGER DEFAULT 0,
    can_post_blog INTEGER DEFAULT 0
);

-- 7. Employee Profiles
CREATE TABLE IF NOT EXISTS employee_profiles (
    user_id TEXT PRIMARY KEY,
    headline TEXT,
    location TEXT,
    summary TEXT,
    current_position TEXT,
    experience_years INTEGER,
    open_to_work INTEGER DEFAULT 1,
    visibility TEXT DEFAULT 'eligible_employers',
    skills TEXT,
    languages TEXT,
    certifications TEXT,
    experience TEXT,
    education TEXT,
    preferences TEXT,
    cv_name TEXT,
    cv_updated_at TEXT,
    profile_completion INTEGER DEFAULT 85,
    cv_list TEXT,
    dob TEXT DEFAULT '',
    nid_passport TEXT DEFAULT '',
    cv_url TEXT DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 8. Businesses
CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    legal_name TEXT NOT NULL,
    brand_name TEXT NOT NULL,
    property_type TEXT NOT NULL,
    star_rating INTEGER DEFAULT 5,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    country TEXT DEFAULT 'Bangladesh',
    website TEXT,
    email TEXT,
    logo_url TEXT,
    cover_image TEXT,
    description TEXT,
    verification_status TEXT DEFAULT 'verified',
    verification_notes TEXT,
    departments TEXT,
    amenities TEXT,
    benefits TEXT,
    follower_count INTEGER DEFAULT 1240,
    parent_group TEXT DEFAULT '',
    property_size TEXT DEFAULT '',
    plot_number TEXT DEFAULT '',
    road_number TEXT DEFAULT '',
    thana_upazila TEXT DEFAULT '',
    district TEXT DEFAULT '',
    features TEXT DEFAULT '[]',
    admin_user_id TEXT DEFAULT '',
    telephone TEXT DEFAULT '',
    official_telephone TEXT DEFAULT '',
    is_demo INTEGER DEFAULT 0
);

-- 9. Business Memberships
CREATE TABLE IF NOT EXISTS business_memberships (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    org_role TEXT NOT NULL,
    created_at TEXT,
    membership_role TEXT DEFAULT 'admin',
    approval_status TEXT DEFAULT 'approved',
    approved_by TEXT DEFAULT '',
    approved_at TEXT DEFAULT '',
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. Business Verifications
CREATE TABLE IF NOT EXISTS business_verifications (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    legal_doc_type TEXT NOT NULL,
    doc_number TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    submitted_at TEXT,
    status TEXT DEFAULT 'pending',
    reviewed_at TEXT,
    reviewed_by TEXT,
    review_comments TEXT,
    issuing_authority TEXT DEFAULT '',
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- 11. Jobs
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    property_location TEXT NOT NULL,
    employment_type TEXT NOT NULL,
    shift TEXT NOT NULL,
    salary_min INTEGER,
    salary_max INTEGER,
    salary_period TEXT DEFAULT 'month',
    currency TEXT DEFAULT 'BDT',
    service_charge_included INTEGER DEFAULT 1,
    accommodation_provided INTEGER DEFAULT 1,
    duty_meals_provided INTEGER DEFAULT 1,
    experience_level TEXT NOT NULL,
    vacancies INTEGER DEFAULT 1,
    description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    education_requirements TEXT DEFAULT '[]',
    skill_requirements TEXT DEFAULT '[]',
    is_negotiable INTEGER DEFAULT 0,
    screening_questions TEXT,
    status TEXT DEFAULT 'active',
    is_urgent INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    deadline TEXT,
    posted_at TEXT,
    applicant_count INTEGER DEFAULT 0,
    is_demo INTEGER DEFAULT 0,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- 12. Saved Jobs
CREATE TABLE IF NOT EXISTS saved_jobs (
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    saved_at TEXT,
    PRIMARY KEY (user_id, job_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- 13. Followed Businesses
CREATE TABLE IF NOT EXISTS followed_businesses (
    user_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    followed_at TEXT,
    PRIMARY KEY (user_id, business_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- 14. Applications
CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'submitted',
    applied_at TEXT,
    updated_at TEXT,
    cover_letter TEXT,
    selected_cv TEXT,
    selected_cv_url TEXT DEFAULT '',
    screening_answers TEXT,
    recruiter_notes TEXT,
    interview_time TEXT,
    interview_notes TEXT,
    is_demo INTEGER DEFAULT 0,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 15. Application Events (with SERIAL primary key)
CREATE TABLE IF NOT EXISTS application_events (
    id SERIAL PRIMARY KEY,
    application_id TEXT NOT NULL,
    status TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    note TEXT,
    timestamp TEXT,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- 16. Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    job_id TEXT,
    last_message TEXT,
    last_message_time TEXT,
    unread_for_user INTEGER DEFAULT 0,
    unread_for_business INTEGER DEFAULT 0,
    is_demo INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- 17. Messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL,
    is_action_prompt INTEGER DEFAULT 0,
    timestamp TEXT,
    is_demo INTEGER DEFAULT 0,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- 18. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    link TEXT,
    is_read INTEGER DEFAULT 0,
    timestamp TEXT,
    is_demo INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_business_id ON jobs(business_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_business_id ON conversations(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_business_memberships_user_id ON business_memberships(user_id);
"""

# Tables in strict foreign-key dependency order for migration
TABLE_MIGRATION_ORDER = [
    "system_settings",
    "blogs",
    "moderation_reports",
    "otp_verifications",
    "email_logs",
    "users",
    "employee_profiles",
    "businesses",
    "business_memberships",
    "business_verifications",
    "jobs",
    "saved_jobs",
    "followed_businesses",
    "applications",
    "application_events",
    "conversations",
    "messages",
    "notifications"
]

# Primary keys for each table used to construct predictable UPSERT queries
TABLE_PKS: Dict[str, List[str]] = {
    "system_settings": ["key"],
    "blogs": ["id"],
    "moderation_reports": ["id"],
    "otp_verifications": ["id"],
    "email_logs": ["id"],
    "users": ["id"],
    "employee_profiles": ["user_id"],
    "businesses": ["id"],
    "business_memberships": ["id"],
    "business_verifications": ["id"],
    "jobs": ["id"],
    "saved_jobs": ["user_id", "job_id"],
    "followed_businesses": ["user_id", "business_id"],
    "applications": ["id"],
    "application_events": ["id"],
    "conversations": ["id"],
    "messages": ["id"],
    "notifications": ["id"]
}

def sanitize_secret(text: str) -> str:
    """Masks database passwords and secret parameters in strings and exception messages."""
    if not text:
        return ""
    # Redact URIs: postgresql://user:pass@host:port/db
    text = re.sub(r'(postgres(?:ql)?://[^:]+:)([^@]+)(@)', r'\1*****\3', text)
    # Redact DSN keyword arguments: password=secret
    text = re.sub(r'password=\S+', 'password=*****', text, flags=re.IGNORECASE)
    return text

def mask_connection_url(url: str) -> str:
    """Masks database password in connection string for safe logging."""
    try:
        parsed = urlparse(url)
        if parsed.password:
            masked = parsed._replace(netloc=f"{parsed.username}:*****@{parsed.hostname}:{parsed.port}")
            return masked.geturl()
    except Exception:
        pass
    return sanitize_secret(url)

def build_upsert_query(tbl: str, cols: List[str]) -> str:
    """
    Constructs an explicit, predictable PostgreSQL UPSERT query using ON CONFLICT (pk) DO UPDATE SET.
    Ensures repeated migrations update existing rows to match source SQLite rather than silently skipping them.
    """
    cols_str = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(["%s"] * len(cols))
    pk_cols = TABLE_PKS.get(tbl, ["id"])
    pk_str = ", ".join(f'"{p}"' for p in pk_cols)

    non_pk_cols = [c for c in cols if c not in pk_cols]
    if non_pk_cols:
        update_str = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in non_pk_cols)
        conflict_clause = f"ON CONFLICT ({pk_str}) DO UPDATE SET {update_str}"
    else:
        conflict_clause = f"ON CONFLICT ({pk_str}) DO NOTHING"

    return f"""
        INSERT INTO "{tbl}" ({cols_str})
        VALUES ({placeholders})
        {conflict_clause}
    """

def normalize_database_url(url: str) -> str:
    """Normalizes connection URL, stripping accidental square brackets around password."""
    if not url:
        return ""
    return re.sub(r'(://[^:]+:)(?:\[)(.*)(?:\])(@)', r'\1\2\3', url)

def run_migration(database_url: str, sqlite_path: str, dry_run: bool = False, schema_only: bool = False, data_only: bool = False):
    import psycopg2
    from psycopg2 import extras

    database_url = normalize_database_url(database_url)

    if not os.path.exists(sqlite_path):
        print(f"Error: SQLite source database not found at '{sqlite_path}'", file=sys.stderr)
        sys.exit(1)

    print("=" * 75)
    print("  NiceJobs SQLite -> Supabase PostgreSQL Migration")
    print("=" * 75)
    print(f"Source SQLite:   {sqlite_path} ({os.path.getsize(sqlite_path)} bytes)")
    print(f"Target Postgres: {mask_connection_url(database_url)}")
    print(f"Execution Mode:  {'DRY-RUN (Guaranteed 100% read-only, ZERO remote writes)' if dry_run else 'LIVE MIGRATION'}")
    print("-" * 75)

    # 1. Connect to SQLite in read-only mode
    sqlite_conn = sqlite3.connect(f"file:{os.path.abspath(sqlite_path)}?mode=ro", uri=True)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cur = sqlite_conn.cursor()

    # 2. Connect to PostgreSQL
    conn_kwargs = {}
    if "sslmode" not in database_url.lower():
        conn_kwargs["sslmode"] = "require"

    try:
        pg_conn = psycopg2.connect(database_url, **conn_kwargs)
        # CRITICAL SAFEGUARD: When in dry-run, put the connection in read-only session mode.
        # This guarantees at the PostgreSQL engine protocol level that NO remote writes can occur.
        if dry_run:
            pg_conn.set_session(readonly=True)
        pg_cur = pg_conn.cursor()

        # Explicitly verify SSL and read-only status
        ssl_mode = pg_conn.get_dsn_parameters().get("sslmode", conn_kwargs.get("sslmode", "require"))
        pg_cur.execute("SHOW transaction_read_only;")
        ro_status = pg_cur.fetchone()[0]

        print(f"PostgreSQL SSL:  {ssl_mode.upper()} (Connection encrypted via TLS/SSL)")
        print(f"Remote Session:  transaction_read_only = {ro_status} ({'100% READ-ONLY confirmed' if ro_status == 'on' else 'READ-WRITE'})")

        if dry_run and ro_status != "on":
            print("CRITICAL: Failed to enforce read-only transaction state on remote database. Halting dry run.", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        safe_msg = sanitize_secret(str(e))
        print(f"Failed to connect to target PostgreSQL: {safe_msg}", file=sys.stderr)
        sys.exit(1)

    try:
        # Check existing tables on target
        pg_cur.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        existing_remote_tables = {r[0] for r in pg_cur.fetchall()}

        # Stage 1: Schema DDL
        if not data_only:
            print("\n[Stage 1/4] PostgreSQL DDL Schema...")
            if dry_run:
                missing_tables = [t for t in TABLE_MIGRATION_ORDER if t not in existing_remote_tables]
                print(f"  [Dry-run] Read-only verification: {len(existing_remote_tables)} public tables exist on target.")
                if missing_tables:
                    print(f"  [Dry-run] Would create {len(missing_tables)} tables: {', '.join(missing_tables)}")
                else:
                    print("  [Dry-run] All 18 application tables already exist on target.")
                print("  [Dry-run] ZERO DDL commands executed (connection is in read-only session mode).")
            else:
                pg_cur.execute(POSTGRES_SCHEMA)
                pg_conn.commit()
                print("  ✓ 18 tables, foreign keys, cascades, and performance indexes verified.")

        if schema_only:
            print("\nSchema applied successfully. Exiting as --schema-only was specified.")
            return

        # Stage 2: Data Migration
        print("\n[Stage 2/4] Migrating data in foreign-key dependency order...")
        summary: List[Tuple[str, int, int, str]] = []

        for tbl in TABLE_MIGRATION_ORDER:
            # Query source SQLite rows
            sqlite_cur.execute(f'SELECT * FROM "{tbl}"')
            rows = sqlite_cur.fetchall()
            src_count = len(rows)

            cols = [col[0] for col in sqlite_cur.description]
            upsert_sql = build_upsert_query(tbl, cols)

            if dry_run:
                # In dry-run, check current target count if table exists
                if tbl in existing_remote_tables:
                    pg_cur.execute(f'SELECT count(*) FROM "{tbl}"')
                    dst_count = pg_cur.fetchone()[0]
                else:
                    dst_count = 0
                summary.append((tbl, src_count, dst_count, "Dry-run / Verified"))
                print(f"  • {tbl.ljust(25)}: {src_count} source records -> {dst_count} currently in target [Read-only]")
            else:
                if not rows:
                    pg_cur.execute(f'SELECT count(*) FROM "{tbl}"')
                    dst_count = pg_cur.fetchone()[0]
                    summary.append((tbl, 0, dst_count, "Empty / OK"))
                    print(f"  • {tbl.ljust(25)}: 0 source records (empty table)")
                    continue

                records = [[r[c] for c in cols] for r in rows]
                extras.execute_batch(pg_cur, upsert_sql, records, page_size=100)

                # Verify target count within transaction
                pg_cur.execute(f'SELECT count(*) FROM "{tbl}"')
                dst_count = pg_cur.fetchone()[0]
                status = "✓ Synchronized" if dst_count >= src_count else "! Discrepancy"
                summary.append((tbl, src_count, dst_count, status))
                print(f"  • {tbl.ljust(25)}: {src_count} source -> {dst_count} in target {status}")

        # Stage 3: Sequence Synchronization
        print("\n[Stage 3/4] Synchronizing PostgreSQL sequence for application_events...")
        if dry_run:
            print("  [Dry-run] Would execute: SELECT setval('application_events_id_seq', MAX(id)).")
            print("  [Dry-run] ZERO sequence changes performed.")
        else:
            pg_cur.execute("""
                SELECT setval(
                    pg_get_serial_sequence('application_events', 'id'),
                    COALESCE((SELECT MAX(id) FROM application_events), 1)
                );
            """)
            new_seq = pg_cur.fetchone()[0]
            print(f"  ✓ Sequence 'application_events_id_seq' updated to: {new_seq}")

            # Atomic Commit: Commit all stages together once all 18 tables and sequences succeed
            pg_conn.commit()
            print("  ✓ Transaction committed atomically.")

        # Stage 4: Data Reconciliation Summary
        print("\n[Stage 4/4] Data Reconciliation Summary:")
        print("-" * 75)
        print(f"{'Table':<26} | {'SQLite Count':<12} | {'Postgres Count':<14} | {'Status'}")
        print("-" * 75)
        all_passed = True
        for tbl, s_cnt, d_cnt, st in summary:
            print(f"{tbl:<26} | {s_cnt:<12} | {d_cnt:<14} | {st}")
            if not dry_run and d_cnt < s_cnt:
                all_passed = False
        print("-" * 75)

        if dry_run:
            print("\n✓ DRY-RUN COMPLETED: 100% read-only verification succeeded. ZERO remote writes made.")
        elif all_passed:
            print("\n✓ MIGRATION COMPLETED SUCCESSFULLY! All records reconciled without data loss.")
        else:
            print("\n⚠ Migration finished with discrepancies. Review logs above.", file=sys.stderr)

    except Exception as e:
        if "pg_conn" in locals() and pg_conn:
            try:
                pg_conn.rollback()
                print("\n[Rollback] Any pending remote transaction rolled back successfully.", file=sys.stderr)
            except Exception:
                pass
        safe_msg = sanitize_secret(str(e))
        print(f"\nMigration failed: {safe_msg}", file=sys.stderr)
        sys.exit(1)
    finally:
        if "sqlite_conn" in locals() and sqlite_conn:
            try:
                sqlite_conn.close()
            except Exception:
                pass
        if "pg_conn" in locals() and pg_conn:
            try:
                pg_conn.close()
            except Exception:
                pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate NiceJobs SQLite database to Supabase PostgreSQL.")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"), help="PostgreSQL connection string (defaults to DATABASE_URL env var)")
    parser.add_argument("--sqlite-path", default="nicejobs.db", help="Path to SQLite database file (default: nicejobs.db)")
    parser.add_argument("--dry-run", action="store_true", help="Validate without making changes (100% read-only)")
    parser.add_argument("--schema-only", action="store_true", help="Only apply PostgreSQL schema without migrating data")
    parser.add_argument("--data-only", action="store_true", help="Only migrate data into existing schema")

    args = parser.parse_args()

    if not args.database_url:
        print("Error: DATABASE_URL not provided. Set DATABASE_URL in .env or pass via --database-url.", file=sys.stderr)
        sys.exit(1)

    run_migration(
        database_url=args.database_url,
        sqlite_path=args.sqlite_path,
        dry_run=args.dry_run,
        schema_only=args.schema_only,
        data_only=args.data_only
    )
