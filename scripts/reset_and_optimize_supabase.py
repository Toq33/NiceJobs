#!/usr/bin/env python3
"""
NiceJobs - Reset & Optimize Supabase PostgreSQL Database
Wipes accumulated test artifacts, starts fresh with clean schema & seed data,
removes redundant indexes, and executes VACUUM FULL ANALYZE to minimize disk & RAM usage.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

import database

def main():
    if not database.is_postgres():
        print("[ERROR] DATABASE_URL is not set or not pointing to PostgreSQL.")
        sys.exit(1)

    print("=======================================================")
    print("NiceJobs: Resetting and Optimizing Supabase Database")
    print("=======================================================")

    database_url = database.normalize_database_url(os.environ.get("DATABASE_URL"))
    
    # 1. Connect directly
    import psycopg2
    conn_kwargs = {
        "sslmode": "require",
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30
    }
    raw_conn = psycopg2.connect(database_url, **conn_kwargs)
    raw_conn.autocommit = True
    cur = raw_conn.cursor()

    print("[1/5] Dropping existing public tables...")
    tables_to_drop = [
        "application_events", "applications", "blogs", "business_memberships",
        "business_verifications", "businesses", "conversations", "email_logs",
        "employee_profiles", "followed_businesses", "jobs", "messages",
        "moderation_reports", "notifications", "otp_verifications",
        "saved_jobs", "system_settings", "users"
    ]
    for table in tables_to_drop:
        cur.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
    print(f"      Dropped {len(tables_to_drop)} tables successfully.")

    raw_conn.close()

    # 2. Run init_db() to recreate fresh schema
    print("[2/5] Creating clean schema and indexes...")
    database.init_db()
    print("      Fresh schema created.")

    # 3. Seed fresh baseline hospitality data
    print("[3/5] Seeding pristine hospitality data...")
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE system_settings SET value = '0' WHERE key = 'demo_data_hidden'")
    cursor.execute("SELECT count(*) FROM jobs")
    job_count = cursor.fetchone()[0]
    if job_count == 0:
        database.seed_data(cursor)
        conn.commit()
    print(f"      Seeded fresh initial records.")

    # 4. Clean up any redundant single-column indexes
    print("[4/5] Pruning redundant duplicate indexes...")
    redundant_indexes = [
        "idx_applications_job_id",
        "idx_applications_user_id",
        "idx_conversations_business_id",
        "idx_conversations_user_id",
        "idx_jobs_business_id",
        "idx_messages_conversation_id",
        "idx_notifications_user_id",
        "idx_business_memberships_user_id"
    ]
    for idx in redundant_indexes:
        try:
            cursor.execute(f"DROP INDEX IF EXISTS {idx}")
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
    conn.close()

    # 5. Run VACUUM FULL ANALYZE to reclaim all storage and compute statistics
    print("[5/5] Executing VACUUM FULL ANALYZE...")
    raw_conn = psycopg2.connect(database_url, **conn_kwargs)
    raw_conn.autocommit = True
    vac_cur = raw_conn.cursor()
    vac_cur.execute("VACUUM FULL ANALYZE;")
    print("      VACUUM FULL ANALYZE completed successfully.")

    # 6. Report final storage footprint and row counts
    print("\n-------------------------------------------------------")
    print("Post-Optimization Footprint Report:")
    print("-------------------------------------------------------")
    vac_cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)
    tables = [r[0] for r in vac_cur.fetchall()]
    total_bytes = 0

    for t in tables:
        vac_cur.execute(f"SELECT count(*) FROM {t}")
        cnt = vac_cur.fetchone()[0]
        vac_cur.execute(f"SELECT pg_total_relation_size('{t}')")
        rel_bytes = vac_cur.fetchone()[0]
        total_bytes += rel_bytes
        vac_cur.execute(f"SELECT pg_size_pretty(pg_total_relation_size('{t}'))")
        sz = vac_cur.fetchone()[0]
        print(f"  {t:<25} : {cnt:>4} rows | size: {sz}")

    vac_cur.execute(f"SELECT pg_size_pretty({total_bytes}::bigint)")
    total_pretty = vac_cur.fetchone()[0]
    print(f"\nTotal Database Storage Usage: {total_pretty} (was ~3.0 MB)")
    print("=======================================================")

    raw_conn.close()

if __name__ == "__main__":
    main()
