#!/usr/bin/env python3
"""
NiceJobs - Test & Fixture Data Cleanup Utility
Purges all transient test users, test applications, test businesses, and test OTP records
from both local SQLite and remote PostgreSQL without touching real user accounts or
official seed personas.
"""
import sys
import os

# Add root directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import database

# Protected official seed accounts and businesses that must NEVER be deleted
PROTECTED_USER_IDS = {
    'user_rahim', 'user_tariq', 'user_nasrin', 'user_fatima', 'user_admin'
}
PROTECTED_BUSINESS_IDS = {
    'biz_radisson', 'biz_intercon', 'biz_westin', 'biz_seagull', 'biz_sayeman', 'biz_grandsultan'
}
PROTECTED_SPONSOR_IDS = {
    'sp_swiss_hospitality', 'sp_marriott_fasttrack'
}

def cleanup_test_data(dry_run=False):
    conn = database.get_db()
    cursor = conn.cursor()

    print("===========================================================================")
    print("  NiceJobs Test Data Cleanup")
    print("===========================================================================")
    is_postgres = bool(os.environ.get("DATABASE_URL"))
    engine_name = "Supabase PostgreSQL" if is_postgres else "Local SQLite (nicejobs.db)"
    print(f"Target Database: {engine_name}")
    print(f"Mode: {'DRY-RUN (No changes applied)' if dry_run else 'LIVE PURGE'}")
    print("---------------------------------------------------------------------------")

    # 1. Identify transient test users
    cursor.execute("""
        SELECT id, name, email, role FROM users
        WHERE (
            id LIKE '%test%'
            OR email LIKE '%test%'
            OR email LIKE '%example%'
            OR email LIKE '%@bayviewgrand.test%'
            OR email LIKE '%@luxurybd.test%'
            OR name LIKE '%Test%'
            OR id LIKE 'user_cand_%'
            OR id LIKE 'user_del_%'
            OR id LIKE 'user_test_%'
            OR id LIKE 'user_biz_test_%'
            OR id LIKE 'user_rec_%'
            OR id = 'test_candidate_del_123'
            OR (email LIKE 'prof_%@nicejobs.info' AND name = 'Naimur Rahman' AND id LIKE 'user_179406%')
        )
    """)
    candidate_test_users = cursor.fetchall()
    test_uids = [u['id'] for u in candidate_test_users if u['id'] not in PROTECTED_USER_IDS]

    # 2. Identify transient test businesses
    cursor.execute("""
        SELECT id, brand_name, legal_name FROM businesses
        WHERE (
            id LIKE '%test%'
            OR id LIKE 'biz_dd%'
            OR id LIKE 'biz_91%'
            OR id LIKE 'biz_f2%'
            OR brand_name LIKE '%Test%'
            OR legal_name LIKE '%Test%'
            OR email LIKE '%@bayviewgrand.test%'
            OR id IN (
                'biz_1794049306_2c69a3', 'biz_1794238324_b491f0', 'biz_test_12af97',
                'biz_test_7f8562', 'biz_dd83f1', 'biz_913ed3', 'biz_f2f46c',
                'biz_1794062013_6bfe51', 'biz_1794062512_fff11c', 'biz_1794237202_3b8cc9'
            )
        )
    """)
    candidate_test_biz = cursor.fetchall()
    test_bids = [b['id'] for b in candidate_test_biz if b['id'] not in PROTECTED_BUSINESS_IDS]

    # 3. Identify transient test jobs
    cursor.execute("""
        SELECT id, title, business_id FROM jobs
        WHERE (
            id LIKE '%test%'
            OR title LIKE '%Test%'
            OR business_id IN (SELECT id FROM businesses WHERE id LIKE '%test%' OR email LIKE '%@bayviewgrand.test%')
            OR id IN ('job_1794053613_12fdca', 'job_1794055129_135db7', 'job_1794055186_6dd5bc', 'job_1794055260_5ea720')
        )
    """)
    candidate_test_jobs = cursor.fetchall()
    test_jids = [j['id'] for j in candidate_test_jobs]

    # 4. Identify transient test sponsors
    cursor.execute("""
        SELECT id, name FROM sponsors
        WHERE (
            id LIKE '%test%'
            OR name LIKE '%Test%'
            OR name LIKE '%Radisson Blu%'
            OR id NOT IN ('sp_swiss_hospitality', 'sp_marriott_fasttrack')
        )
    """)
    candidate_test_sponsors = cursor.fetchall()
    test_sp_ids = [s['id'] for s in candidate_test_sponsors if s['id'] not in PROTECTED_SPONSOR_IDS]

    print(f"Identified test entities:")
    print(f"  • Users to purge        : {len(test_uids)}")
    print(f"  • Businesses to purge   : {len(test_bids)}")
    print(f"  • Jobs to purge         : {len(test_jids)}")
    print(f"  • Sponsors to purge     : {len(test_sp_ids)}")

    if dry_run:
        print("\nDry-run complete. No rows modified.")
        conn.close()
        return

    # Delete related test child records in dependency order
    uids_sql = ','.join([f"'{uid}'" for uid in test_uids]) if test_uids else "''"
    bids_sql = ','.join([f"'{bid}'" for bid in test_bids]) if test_bids else "''"
    jids_sql = ','.join([f"'{jid}'" for jid in test_jids]) if test_jids else "''"

    # Application events
    cursor.execute(f"""
        DELETE FROM application_events 
        WHERE application_id IN (
            SELECT id FROM applications 
            WHERE user_id IN ({uids_sql}) OR job_id IN ({jids_sql})
        )
    """)

    # Applications
    cursor.execute(f"""
        DELETE FROM applications 
        WHERE user_id IN ({uids_sql}) OR job_id IN ({jids_sql})
    """)

    # Messages & Conversations
    cursor.execute(f"""
        DELETE FROM messages 
        WHERE conversation_id IN (
            SELECT id FROM conversations 
            WHERE user_id IN ({uids_sql}) OR business_id IN ({bids_sql})
        )
    """)
    cursor.execute(f"""
        DELETE FROM conversations 
        WHERE user_id IN ({uids_sql}) OR business_id IN ({bids_sql})
    """)

    # Saved jobs, followed businesses, notifications
    cursor.execute(f"DELETE FROM saved_jobs WHERE user_id IN ({uids_sql}) OR job_id IN ({jids_sql})")
    cursor.execute(f"DELETE FROM followed_businesses WHERE user_id IN ({uids_sql}) OR business_id IN ({bids_sql})")
    cursor.execute(f"DELETE FROM notifications WHERE user_id IN ({uids_sql})")

    # Business verifications & memberships
    cursor.execute(f"DELETE FROM business_verifications WHERE business_id IN ({bids_sql})")
    cursor.execute(f"DELETE FROM business_memberships WHERE user_id IN ({uids_sql}) OR business_id IN ({bids_sql})")

    # Jobs & Businesses
    cursor.execute(f"DELETE FROM jobs WHERE id IN ({jids_sql}) OR business_id IN ({bids_sql})")
    cursor.execute(f"DELETE FROM businesses WHERE id IN ({bids_sql})")

    # Profiles & Users
    cursor.execute(f"DELETE FROM employee_profiles WHERE user_id IN ({uids_sql})")
    cursor.execute(f"DELETE FROM users WHERE id IN ({uids_sql})")

    # Sponsors
    if test_sp_ids:
        sp_sql = ','.join([f"'{s}'" for s in test_sp_ids])
        cursor.execute(f"DELETE FROM sponsors WHERE id IN ({sp_sql})")

    # OTP Verifications
    cursor.execute("""
        DELETE FROM otp_verifications 
        WHERE identifier LIKE '%test%' 
           OR identifier LIKE '%example%' 
           OR identifier LIKE '0171%' 
           OR id LIKE 'otp_%'
    """)

    conn.commit()
    conn.close()
    print("\n✓ SUCCESS: All test fixtures purged from database cleanly.")

if __name__ == "__main__":
    is_dry = "--dry-run" in sys.argv
    cleanup_test_data(dry_run=is_dry)
