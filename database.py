"""
NiceJobs - Hospitality Careers, Connected
Database and Seed Data Layer
"""
import sqlite3
import json
import os
import shutil
import re
from typing import Optional
from datetime import datetime
from dotenv import load_dotenv

# Load local environment configuration
load_dotenv()

def is_production() -> bool:
    """Detects whether code is running in a live production or serverless environment."""
    return bool(
        os.environ.get("VERCEL")
        or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
        or os.environ.get("ENVIRONMENT", "").lower() in ("production", "prod")
    )

def is_postgres() -> bool:
    """Checks if a PostgreSQL database URL is configured."""
    return bool(os.environ.get("DATABASE_URL"))

class PostgresRow(dict):
    """
    Dict-like and indexable row representation mimicking sqlite3.Row.
    Supports row['col'], row[0], dict(row), row.get('col'), and JSON serialization.
    """
    def __init__(self, description, values):
        self._keys = [col.name for col in description] if description else []
        self._values = tuple(values) if values is not None else ()
        super().__init__(zip(self._keys, self._values))

    def __getitem__(self, item):
        if isinstance(item, int):
            return self._values[item]
        return super().__getitem__(item)


def adapt_sql_for_postgres(sql: str) -> str:
    """
    Adapts SQLite-style parameter placeholders (?) to PostgreSQL format (%s)
    and converts ASCII case-insensitive LIKE to ILIKE outside string literals.
    """
    parts = re.split(r"('(?:''|[^'])*')", sql)
    for i in range(0, len(parts), 2):
        parts[i] = parts[i].replace('?', '%s')
        parts[i] = re.sub(r'\bLIKE\b', 'ILIKE', parts[i], flags=re.IGNORECASE)
    return ''.join(parts)


class PostgresCursorWrapper:
    """Cursor wrapper that translates query placeholders and wraps results in PostgresRow."""
    def __init__(self, cursor):
        self._cursor = cursor

    @property
    def description(self):
        return self._cursor.description

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def execute(self, query, params=None):
        adapted_query = adapt_sql_for_postgres(query)
        if params is not None:
            self._cursor.execute(adapted_query, params)
        else:
            self._cursor.execute(adapted_query)
        return self

    def executemany(self, query, seq_of_parameters):
        adapted_query = adapt_sql_for_postgres(query)
        self._cursor.executemany(adapted_query, seq_of_parameters)
        return self

    def executescript(self, script):
        for stmt in script.split(';'):
            stmt = stmt.strip()
            if stmt:
                adapted = adapt_sql_for_postgres(stmt)
                self._cursor.execute(adapted)
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return PostgresRow(self._cursor.description, row)

    def fetchall(self):
        rows = self._cursor.fetchall()
        if not rows:
            return []
        desc = self._cursor.description
        return [PostgresRow(desc, r) for r in rows]

    def fetchmany(self, size=None):
        rows = self._cursor.fetchmany(size) if size else self._cursor.fetchmany()
        if not rows:
            return []
        desc = self._cursor.description
        return [PostgresRow(desc, r) for r in rows]

    def close(self):
        self._cursor.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class PostgresConnectionWrapper:
    """Connection wrapper ensuring consistent commit, rollback, and cursor wrapping."""
    def __init__(self, conn, pool=None):
        self._conn = conn
        self._pool = pool

    def cursor(self):
        return PostgresCursorWrapper(self._conn.cursor())

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        if self._pool is not None and not self._conn.closed:
            try:
                self._conn.rollback()
                self._pool.putconn(self._conn)
            except Exception:
                try:
                    self._conn.close()
                except Exception:
                    pass
        elif not self._conn.closed:
            self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        else:
            self.commit()
        self.close()


def get_db_path():
    # Detect Vercel serverless environment (read-only filesystem)
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        tmp_db = "/tmp/nicejobs.db"
        if not os.path.exists(tmp_db):
            source_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nicejobs.db")
            if os.path.exists(source_db):
                try:
                    shutil.copy2(source_db, tmp_db)
                except Exception:
                    pass
        return tmp_db
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "nicejobs.db")

DB_FILE = get_db_path()

def normalize_database_url(url: Optional[str]) -> Optional[str]:
    """Normalizes connection URL, stripping accidental square brackets around password from template copy-paste."""
    if not url:
        return url
    return re.sub(r'(://[^:]+:)(?:\[)(.*)(?:\])(@)', r'\1\2\3', url)

_pg_pool = None
_pool_lock = None

def get_pg_pool():
    global _pg_pool, _pool_lock
    if _pool_lock is None:
        import threading
        _pool_lock = threading.Lock()

    if _pg_pool is not None:
        return _pg_pool

    with _pool_lock:
        if _pg_pool is not None:
            return _pg_pool
        database_url = normalize_database_url(os.environ.get("DATABASE_URL"))
        if not database_url:
            return None
        from psycopg2.pool import ThreadedConnectionPool
        conn_kwargs = {}
        if "sslmode" not in database_url.lower():
            conn_kwargs["sslmode"] = "require"
        try:
            _pg_pool = ThreadedConnectionPool(
                minconn=2,
                maxconn=20,
                dsn=database_url,
                **conn_kwargs
            )
        except Exception as e:
            print(f"[WARN] Failed to initialize PostgreSQL connection pool: {e}")
            _pg_pool = None
        return _pg_pool

def get_db():
    database_url = normalize_database_url(os.environ.get("DATABASE_URL"))

    # Guard: Production environments must NEVER silently fall back to local/bundled SQLite
    if is_production() and not database_url:
        raise RuntimeError(
            "CRITICAL: DATABASE_URL is not set in production. "
            "NiceJobs strictly forbids silent fallback to local/bundled SQLite in production environments."
        )

    if database_url:
        pool = get_pg_pool()
        if pool:
            raw_conn = None
            for _ in range(3):
                try:
                    raw_conn = pool.getconn()
                    if raw_conn.closed:
                        pool.putconn(raw_conn, close=True)
                        raw_conn = None
                        continue
                    # Quick alive check
                    with raw_conn.cursor() as cur:
                        cur.execute("SELECT 1")
                    return PostgresConnectionWrapper(raw_conn, pool=pool)
                except Exception:
                    if raw_conn and not raw_conn.closed:
                        try:
                            pool.putconn(raw_conn, close=True)
                        except Exception:
                            pass
                    raw_conn = None

        # Fallback to direct connection if pool exhausted or unavailable
        import psycopg2
        conn_kwargs = {}
        if "sslmode" not in database_url.lower():
            conn_kwargs["sslmode"] = "require"
        raw_conn = psycopg2.connect(database_url, **conn_kwargs)
        return PostgresConnectionWrapper(raw_conn)

    # Local development SQLite connection
    conn = sqlite3.connect(get_db_path(), timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def ensure_db_ready():
    """
    Lightweight health check for serverless environments.
    Verifies database connectivity without executing heavy DDL or migrations.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT 1")
    conn.close()

def reset_demo_data():
    """
    Safely resets demo fixture records to their pristine initial state.
    Guaranteed NEVER to delete the physical database file or touch non-demo user records.
    """
    conn = get_db()
    cursor = conn.cursor()
    try:
        # Clear volatile demo-only records
        cursor.execute("DELETE FROM messages WHERE conversation_id = 'conv_rahim_radisson'")
        cursor.execute("DELETE FROM application_events WHERE application_id = 'app_rahim_radisson'")
        cursor.execute("DELETE FROM notifications WHERE id IN ('notif_1', 'notif_2') OR (user_id IN ('user_rahim', 'user_fatima', 'user_admin') AND is_demo = 1)")
        cursor.execute("DELETE FROM business_verifications WHERE id IN ('verif_sayeman', 'verif_seagull')")
        cursor.execute("DELETE FROM moderation_reports WHERE id = 'rep_101'")

        # Explicitly restore demo persona credentials and names
        cursor.execute("UPDATE users SET name = 'Rahim Ahmed', email = 'rahim.ahmed@example.bd', phone = '+880 1711 234567', role = 'jobseeker', password = 'Password123!', is_demo = 1 WHERE id = 'user_rahim'")
        cursor.execute("UPDATE users SET name = 'Fatima Khan', email = 'fatima.khan@radissondhaka.com', phone = '+880 1819 876543', role = 'recruiter', password = 'Password123!', is_demo = 1 WHERE id = 'user_fatima'")
        cursor.execute("UPDATE users SET name = 'Tariqul Islam (Trust & Safety)', email = 'admin@nicejobs.bd', phone = '+880 1912 334455', role = 'admin', password = 'Password123!', is_demo = 1 WHERE id = 'user_admin'")

        # Re-seed demo entities (uses ON CONFLICT DO UPDATE so real records are never affected)
        seed_data(cursor)

        # Ensure re-seeded notifications are marked as demo
        cursor.execute("UPDATE notifications SET is_demo = 1 WHERE id IN ('notif_1', 'notif_2')")

        conn.commit()
    finally:
        conn.close()



def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Schema definition based on Product Scope & Workflows doc
    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        role TEXT NOT NULL, -- 'jobseeker', 'recruiter', 'admin'
        avatar_url TEXT,
        created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS employee_profiles (
        user_id TEXT PRIMARY KEY,
        headline TEXT,
        location TEXT,
        summary TEXT,
        current_position TEXT,
        experience_years INTEGER,
        open_to_work INTEGER DEFAULT 1,
        visibility TEXT DEFAULT 'eligible_employers', -- 'public', 'registered_users', 'eligible_employers', 'private'
        skills TEXT, -- JSON array
        languages TEXT, -- JSON array
        certifications TEXT, -- JSON array
        experience TEXT, -- JSON array
        education TEXT, -- JSON array
        preferences TEXT, -- JSON object
        cv_name TEXT,
        cv_updated_at TEXT,
        profile_completion INTEGER DEFAULT 85,
        cv_list TEXT, -- JSON array of multiple CVs
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS otp_verifications (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        otp_code TEXT NOT NULL,
        purpose TEXT NOT NULL, -- 'candidate_signup', 'business_signup', 'contact_change'
        created_at TEXT,
        verified INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS businesses (
        id TEXT PRIMARY KEY,
        legal_name TEXT NOT NULL,
        brand_name TEXT NOT NULL,
        property_type TEXT NOT NULL, -- 'Luxury Hotel', 'Beach Resort', 'Boutique Hotel', 'Eco Resort'
        star_rating INTEGER DEFAULT 5,
        city TEXT NOT NULL,
        address TEXT NOT NULL,
        country TEXT DEFAULT 'Bangladesh',
        website TEXT,
        email TEXT,
        logo_url TEXT,
        cover_image TEXT,
        description TEXT,
        verification_status TEXT DEFAULT 'verified', -- 'verified', 'pending', 'rejected'
        verification_notes TEXT,
        departments TEXT, -- JSON array
        amenities TEXT, -- JSON array
        benefits TEXT, -- JSON array
        follower_count INTEGER DEFAULT 1240
    );

    CREATE TABLE IF NOT EXISTS business_memberships (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        org_role TEXT NOT NULL, -- 'Owner', 'Admin', 'HR Manager', 'Recruiter', 'Hiring Manager'
        created_at TEXT,
        FOREIGN KEY (business_id) REFERENCES businesses(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        title TEXT NOT NULL,
        department TEXT NOT NULL, -- 'Front Office', 'Food & Beverage', 'Culinary / Kitchen', 'Housekeeping', 'Sales & Marketing', 'Engineering'
        property_location TEXT NOT NULL,
        employment_type TEXT NOT NULL, -- 'Full-time', 'Contract', 'Part-time', 'Internship'
        shift TEXT NOT NULL, -- 'Rotational', 'Morning', 'Night', 'Split Shift'
        salary_min INTEGER,
        salary_max INTEGER,
        salary_period TEXT DEFAULT 'month',
        currency TEXT DEFAULT 'BDT',
        service_charge_included INTEGER DEFAULT 1,
        accommodation_provided INTEGER DEFAULT 1,
        duty_meals_provided INTEGER DEFAULT 1,
        experience_level TEXT NOT NULL, -- 'Entry Level', '1-3 Years', '3-5 Years', '5+ Years'
        vacancies INTEGER DEFAULT 1,
        description TEXT NOT NULL,
        requirements TEXT NOT NULL, -- JSON array
        education_requirements TEXT DEFAULT '[]', -- JSON array of degrees & fields
        skill_requirements TEXT DEFAULT '[]', -- JSON array of skills
        is_negotiable INTEGER DEFAULT 0,
        screening_questions TEXT, -- JSON array
        status TEXT DEFAULT 'active', -- 'draft', 'active', 'paused', 'closed'
        is_urgent INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 0,
        deadline TEXT,
        posted_at TEXT,
        applicant_count INTEGER DEFAULT 0,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT DEFAULT 'submitted', -- 'submitted', 'under_review', 'shortlisted', 'interview_scheduled', 'offer', 'hired', 'rejected', 'withdrawn'
        applied_at TEXT,
        updated_at TEXT,
        cover_letter TEXT,
        selected_cv TEXT,
        screening_answers TEXT, -- JSON object
        recruiter_notes TEXT, -- Private internal notes
        interview_time TEXT,
        interview_notes TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS application_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id TEXT NOT NULL,
        status TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        note TEXT,
        timestamp TEXT,
        FOREIGN KEY (application_id) REFERENCES applications(id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        job_id TEXT,
        last_message TEXT,
        last_message_time TEXT,
        unread_for_user INTEGER DEFAULT 0,
        unread_for_business INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_role TEXT NOT NULL, -- 'user' or 'business'
        sender_name TEXT NOT NULL,
        content TEXT NOT NULL,
        is_action_prompt INTEGER DEFAULT 0,
        timestamp TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS saved_jobs (
        user_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        saved_at TEXT,
        PRIMARY KEY (user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS followed_businesses (
        user_id TEXT NOT NULL,
        business_id TEXT NOT NULL,
        followed_at TEXT,
        PRIMARY KEY (user_id, business_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL, -- 'application', 'message', 'job_alert', 'verification'
        link TEXT,
        is_read INTEGER DEFAULT 0,
        timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS email_logs (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        event_type TEXT NOT NULL,
        body_text TEXT,
        status TEXT DEFAULT 'sent',
        sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS business_verifications (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        legal_doc_type TEXT NOT NULL,
        doc_number TEXT NOT NULL,
        submitted_by TEXT NOT NULL,
        submitted_at TEXT,
        status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
        reviewed_at TEXT,
        reviewed_by TEXT,
        review_comments TEXT,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
    );

    CREATE TABLE IF NOT EXISTS moderation_reports (
        id TEXT PRIMARY KEY,
        item_type TEXT NOT NULL, -- 'job', 'business', 'user'
        item_id TEXT NOT NULL,
        reporter_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'open', -- 'open', 'resolved', 'dismissed'
        created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS blogs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        category TEXT NOT NULL, -- 'Hotel Standards', 'Career Advice', 'Interview Prep', 'Culinary & F&B'
        excerpt TEXT NOT NULL,
        content TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_title TEXT NOT NULL,
        author_avatar TEXT,
        cover_image TEXT,
        read_time TEXT DEFAULT '5 min read',
        published_at TEXT,
        tags TEXT -- JSON array
    );
    """)

    conn.commit()

    # Safe migrations for extended Phase 2 doc fields
    for col, typ in [
        ("password", "TEXT DEFAULT 'Password123!'"),
        ("dob", "TEXT DEFAULT ''"),
        ("nid_passport", "TEXT DEFAULT ''"),
        ("designation", "TEXT DEFAULT ''"),
        ("status", "TEXT DEFAULT 'active'"),
        ("is_business_admin", "INTEGER DEFAULT 0"),
        ("is_demo", "INTEGER DEFAULT 0")
    ]:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col} {typ}")
        except Exception:
            pass

    for col, typ in [
        ("parent_group", "TEXT DEFAULT ''"),
        ("property_size", "TEXT DEFAULT ''"),
        ("plot_number", "TEXT DEFAULT ''"),
        ("road_number", "TEXT DEFAULT ''"),
        ("thana_upazila", "TEXT DEFAULT ''"),
        ("district", "TEXT DEFAULT ''"),
        ("features", "TEXT DEFAULT '[]'"),
        ("admin_user_id", "TEXT DEFAULT ''"),
        ("telephone", "TEXT DEFAULT ''"),
        ("official_telephone", "TEXT DEFAULT ''"),
        ("is_demo", "INTEGER DEFAULT 0")
    ]:
        try:
            cursor.execute(f"ALTER TABLE businesses ADD COLUMN {col} {typ}")
        except Exception:
            pass

    try:
        cursor.execute("UPDATE businesses SET telephone = '+880 2 9834555', official_telephone = '+880 2 9834555' WHERE id = 'biz_radisson' AND (telephone IS NULL OR telephone = '')")
        cursor.execute("UPDATE businesses SET telephone = '+880 2 9891988', official_telephone = '+880 2 9891988' WHERE id = 'biz_westin' AND (telephone IS NULL OR telephone = '')")
        cursor.execute("UPDATE businesses SET telephone = '+880 341 51301', official_telephone = '+880 341 51301' WHERE id = 'biz_sayeman' AND (telephone IS NULL OR telephone = '')")
    except Exception:
        pass

    for col, typ in [
        ("membership_role", "TEXT DEFAULT 'admin'"),
        ("approval_status", "TEXT DEFAULT 'approved'"),
        ("approved_by", "TEXT DEFAULT ''"),
        ("approved_at", "TEXT DEFAULT ''")
    ]:
        try:
            cursor.execute(f"ALTER TABLE business_memberships ADD COLUMN {col} {typ}")
        except Exception:
            pass

    for col, typ in [
        ("dob", "TEXT DEFAULT ''"),
        ("nid_passport", "TEXT DEFAULT ''"),
        ("cv_url", "TEXT DEFAULT ''")
    ]:
        try:
            cursor.execute(f"ALTER TABLE employee_profiles ADD COLUMN {col} {typ}")
        except Exception:
            pass

    for col, typ in [("issuing_authority", "TEXT DEFAULT ''")]:
        try:
            cursor.execute(f"ALTER TABLE business_verifications ADD COLUMN {col} {typ}")
        except Exception:
            pass

    for col, typ in [
        ("is_negotiable", "INTEGER DEFAULT 0"),
        ("education_requirements", "TEXT DEFAULT '[]'"),
        ("skill_requirements", "TEXT DEFAULT '[]'"),
        ("is_demo", "INTEGER DEFAULT 0")
    ]:
        try:
            cursor.execute(f"ALTER TABLE jobs ADD COLUMN {col} {typ}")
        except Exception:
            pass

    for tbl in ["applications", "notifications", "conversations", "messages"]:
        try:
            cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN is_demo INTEGER DEFAULT 0")
        except Exception:
            pass

    for col, typ in [
        ("status", "TEXT DEFAULT 'sent'"),
        ("delivered_at", "TEXT"),
        ("read_at", "TEXT")
    ]:
        try:
            cursor.execute(f"ALTER TABLE messages ADD COLUMN {col} {typ}")
        except Exception:
            pass

    for idx_sql in [
        "CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages (conversation_id, timestamp ASC)",
        "CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_conversations_biz ON conversations (business_id)"
    ]:
        try:
            cursor.execute(idx_sql)
        except Exception:
            pass

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    """)
    cursor.execute("INSERT INTO system_settings (key, value) VALUES ('demo_data_hidden', '1') ON CONFLICT (key) DO NOTHING")

    cursor.execute("UPDATE users SET is_business_admin = 1 WHERE role = 'recruiter'")
    cursor.execute("UPDATE business_memberships SET membership_role = 'admin' WHERE membership_role IS NULL OR membership_role = '' OR membership_role = 'moderator'")
    cursor.execute("UPDATE businesses SET admin_user_id = 'user_fatima' WHERE id = 'biz_radisson' AND (admin_user_id IS NULL OR admin_user_id = '')")

    # Mark demo fixture rows with is_demo = 1
    try:
        cursor.execute("UPDATE users SET is_demo = 1 WHERE id IN ('user_rahim', 'user_fatima', 'user_admin')")
        cursor.execute("UPDATE businesses SET is_demo = 1 WHERE id IN ('biz_radisson', 'biz_intercon', 'biz_westin', 'biz_seagull', 'biz_sayeman', 'biz_grandsultan') OR id LIKE 'biz_1792337641%'")
        cursor.execute("UPDATE jobs SET is_demo = 1 WHERE business_id IN (SELECT id FROM businesses WHERE is_demo = 1) OR id LIKE 'job_%'")
        cursor.execute("UPDATE applications SET is_demo = 1 WHERE user_id = 'user_rahim' OR job_id IN (SELECT id FROM jobs WHERE is_demo = 1)")
        cursor.execute("UPDATE notifications SET is_demo = 1 WHERE user_id IN ('user_rahim', 'user_fatima', 'user_admin')")
        cursor.execute("UPDATE conversations SET is_demo = 1 WHERE user_id IN ('user_rahim', 'user_fatima') OR business_id IN (SELECT id FROM businesses WHERE is_demo = 1)")
    except Exception:
        pass

    conn.commit()

    # Seed rich initial data only if demo data is not intentionally removed/hidden
    cursor.execute("SELECT value FROM system_settings WHERE key = 'demo_data_hidden'")
    row = cursor.fetchone()
    is_hidden = row and row[0] == '1'

    if not is_hidden:
        cursor.execute("SELECT count(*) FROM jobs")
        if cursor.fetchone()[0] == 0:
            seed_data(cursor)
            conn.commit()

    conn.close()

def seed_data(cursor):
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    # 1. Users
    users = [
        ("user_rahim", "Rahim Ahmed", "rahim.ahmed@example.bd", "+880 1711 234567", "jobseeker", "/static/images/candidate_rahim.jpg", now),
        ("user_fatima", "Fatima Khan", "fatima.khan@radissondhaka.com", "+880 1819 876543", "recruiter", "/static/images/candidate_rahim.jpg", now),
        ("user_admin", "Tariqul Islam (Trust & Safety)", "admin@nicejobs.bd", "+880 1912 334455", "admin", "", now)
    ]
    cursor.executemany("""
    INSERT INTO users (id, name, email, phone, role, avatar_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO NOTHING
    """, users)

    # 2. Employee Profile for Rahim Ahmed
    skills = json.dumps([
        "Opera PMS 5.5", "Micros POS", "Guest Relations", "VIP Concierge", 
        "Revenue Management Basics", "Complaint Resolution", "Shift Handover & Auditing", "Night Audit"
    ])
    languages = json.dumps([
        {"name": "Bengali", "level": "Native"},
        {"name": "English", "level": "Fluent (IELTS 7.0)"},
        {"name": "Arabic", "level": "Conversational"}
    ])
    certs = json.dumps([
        {"title": "Certified Front Office Professional (CFOP)", "issuer": "American Hotel & Lodging Educational Institute (AHLEI)", "year": "2023"},
        {"title": "Hospitality Health, Safety & Hygiene Standard", "issuer": "Bangladesh Tourism Board", "year": "2022"}
    ])
    exp = json.dumps([
        {
            "role": "Assistant Front Desk Manager",
            "hotel": "InterContinental Dhaka",
            "period": "2023 - Present",
            "description": "Supervising 14 front desk receptionists, managing VIP guest arrivals, handling Opera PMS billing disputes and daily room occupancy reports."
        },
        {
            "role": "Front Office Supervisor",
            "hotel": "Pan Pacific Sonargaon",
            "period": "2021 - 2023",
            "description": "Led shift check-in/out procedures, achieved 94% guest satisfaction KPI, trained 8 new front desk executives on POS/PMS software."
        }
    ])
    edu = json.dumps([
        {
            "degree": "BBA in Tourism and Hospitality Management",
            "institution": "University of Dhaka",
            "year": "2017 - 2021"
        }
    ])
    prefs = json.dumps({
        "target_roles": ["Front Office Manager", "Duty Manager", "Guest Relations Director"],
        "locations": ["Dhaka", "Cox's Bazar", "Sylhet"],
        "expected_salary": "BDT 60,000 - 80,000 / month",
        "notice_period": "1 Month",
        "willing_to_relocate": True
    })

    cv_list = json.dumps([
        {
            "id": "cv_1",
            "name": "Rahim_Ahmed_Front_Office_Executive_CV.pdf",
            "title": "Front Office & Guest Relations Executive CV",
            "uploaded_at": "2026-10-12",
            "size": "245 KB",
            "is_default": True
        },
        {
            "id": "cv_2",
            "name": "Rahim_Ahmed_Rooms_Division_Manager_CV.pdf",
            "title": "Rooms Division & Opera Cloud Manager CV",
            "uploaded_at": "2026-10-14",
            "size": "210 KB",
            "is_default": False
        },
        {
            "id": "cv_3",
            "name": "Rahim_Ahmed_Hospitality_Operations_Resume.pdf",
            "title": "Hospitality Operations & Night Audit Resume",
            "uploaded_at": "2026-10-15",
            "size": "180 KB",
            "is_default": False
        }
    ])

    cursor.execute("""
    INSERT INTO employee_profiles (
        user_id, headline, location, summary, current_position, experience_years,
        open_to_work, visibility, skills, languages, certifications, experience,
        education, preferences, cv_name, cv_updated_at, profile_completion, cv_list
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET
        headline = excluded.headline,
        location = excluded.location,
        summary = excluded.summary,
        current_position = excluded.current_position,
        experience_years = excluded.experience_years,
        open_to_work = excluded.open_to_work,
        visibility = excluded.visibility,
        skills = excluded.skills,
        languages = excluded.languages,
        certifications = excluded.certifications,
        experience = excluded.experience,
        education = excluded.education,
        preferences = excluded.preferences,
        cv_name = excluded.cv_name,
        cv_updated_at = excluded.cv_updated_at,
        profile_completion = excluded.profile_completion,
        cv_list = excluded.cv_list
    """, (
        "user_rahim",
        "Experienced Front Office Supervisor | Opera PMS Expert | 5-Star Hotel Professional",
        "Gulshan-2, Dhaka, Bangladesh",
        "Dedicated and charismatic hospitality professional with 5+ years of front desk and guest experience leadership in premier 5-star hotels in Dhaka. Proven track record in achieving 95%+ guest satisfaction ratings and operating Opera PMS at peak efficiency.",
        "Assistant Front Desk Manager",
        5,
        1,
        "eligible_employers",
        skills,
        languages,
        certs,
        exp,
        edu,
        prefs,
        "Rahim_Ahmed_Front_Office_Executive_CV.pdf",
        "Updated 3 days ago",
        92,
        cv_list
    ))

    # 3. Businesses (Hotels & Resorts in Bangladesh)
    businesses = [
        (
            "biz_radisson",
            "Sena Hotel Developments Ltd.",
            "Radisson Blu Dhaka Water Garden",
            "Luxury Hotel",
            5,
            "Dhaka",
            "Airport Road, Dhaka Cantonment, Dhaka 1206",
            "Bangladesh",
            "https://www.radissonhotels.com",
            "hr@radissondhaka.com",
            "/static/images/hero_lobby.jpg",
            "/static/images/hero_lobby.jpg",
            "Nestled in 7 acres of tranquil gardens with luxury rooms, 5 premier international restaurants, grand ballrooms, and an outdoor heated pool. Known for world-class hospitality in the capital.",
            "verified",
            "Verified by NiceJobs Trust Team via Trade License & Ministry of Civil Aviation and Tourism certificate.",
            json.dumps(["Front Office", "Food & Beverage", "Culinary", "Housekeeping", "Sales & Banquets", "Engineering"]),
            json.dumps(["Health Club & Spa", "Outdoor Heated Pool", "5 Restaurants & Bars", "Grand Ballroom", "Staff Accommodation", "Duty Meals"]),
            json.dumps(["Competitive Service Charge Pool", "Health & Life Insurance", "Duty Meals on Shift", "Global Radisson Hotel Employee Discounts", "Annual Bonus"]),
            2450
        ),
        (
            "biz_sayeman",
            "Sayeman Beach Resort Ltd.",
            "Sayeman Beach Resort Cox's Bazar",
            "Beach Resort",
            5,
            "Cox's Bazar",
            "Marine Drive Road, Kolatoli, Cox's Bazar",
            "Bangladesh",
            "https://sayemanresort.com",
            "careers@sayemanresort.com",
            "/static/images/resort_beach.jpg",
            "/static/images/resort_beach.jpg",
            "Legendary hospitality on the shores of the Bay of Bengal. Sayeman Beach Resort blends heritage with ocean-view suites, infinity pool, surfside dining, and luxury event facilities.",
            "verified",
            "Verified official hospitality license by NiceJobs verification desk.",
            json.dumps(["Front Office", "Resort Operations", "F&B Service", "Culinary", "Housekeeping", "Recreation & Spa"]),
            json.dumps(["Infinity Pool", "Private Beach Access", "Taranga Restaurant", "Seafood BBQ", "Staff Living Quarters"]),
            json.dumps(["On-site Staff Accommodation", "3 Times Daily Meals", "Overtime Allowance", "Tips & Service Pool", "Festival Bonuses"]),
            1890
        ),
        (
            "biz_westin",
            "Unique Hotel & Resorts PLC",
            "The Westin Dhaka",
            "Luxury Hotel",
            5,
            "Dhaka",
            "Gulshan Avenue, Gulshan 2, Dhaka 1212",
            "Bangladesh",
            "https://www.marriott.com",
            "careers@westindhaka.com",
            "/static/images/hero_lobby.jpg",
            "/static/images/hero_lobby.jpg",
            "Located in prime Gulshan diplomatic enclave. A pinnacle of modern luxury with Westin Heavenly Bed, Heavenly Spa, Prego Italian fine dining, and Panash rooftop.",
            "verified",
            "Verified enterprise license.",
            json.dumps(["Front Office", "Culinary", "Food & Beverage", "Housekeeping", "Revenue Management", "Human Resources"]),
            json.dumps(["Heavenly Spa", "Prego Italian Fine Dining", "Gym & Pool", "Corporate Business Center"]),
            json.dumps(["Marriott Explore Rate Worldwide", "Medical Cover", "Provident Fund", "High Service Charge Rate"]),
            3100
        ),
        (
            "biz_grandsultan",
            "Grand Sultan Tea Resort & Golf Ltd.",
            "Grand Sultan Tea Resort & Golf",
            "Eco Resort",
            5,
            "Sreemangal, Sylhet",
            "Radhanagar, Sreemangal, Moulvibazar",
            "Bangladesh",
            "https://grandsultanresort.com",
            "hr@grandsultanresort.com",
            "/static/images/resort_beach.jpg",
            "/static/images/resort_beach.jpg",
            "5-star opulence nestled among the serene rolling green tea gardens of Sreemangal. Featuring golf, 3 temperature-controlled pools, spa, and indigenous tea experiences.",
            "verified",
            "Verified hospitality resort.",
            json.dumps(["Front Office", "Culinary", "Eco Tours & Recreation", "F&B", "Housekeeping"]),
            json.dumps(["Golf Putting Green", "3 Swimming Pools", "Spa & Sauna", "Tea Tasting Pavilions", "Staff Quarters"]),
            json.dumps(["Full Board Staff Accommodation", "Free Transport", "Health Allowance", "Yearly Increment"]),
            1420
        ),
        (
            "biz_intercon",
            "Bangladesh Services Limited",
            "InterContinental Dhaka",
            "Luxury Hotel",
            5,
            "Dhaka",
            "1 Minto Road, Dhaka 1000",
            "Bangladesh",
            "https://www.ihg.com",
            "talent@intercondhaka.com",
            "/static/images/hero_lobby.jpg",
            "/static/images/hero_lobby.jpg",
            "Historic luxury icon renovated to modern grandeur with diplomatic heritage, 226 spacious rooms, signature IHG hospitality, and premier banquet halls.",
            "verified",
            "Government & IHG authorized operator verification.",
            json.dumps(["Front Office", "Banquet Operations", "Kitchen", "Housekeeping", "Engineering"]),
            json.dumps(["Temperature Pool", "Diplomatic Lounge", "5 Specialty Restaurants", "Fitness Centre"]),
            json.dumps(["Government Grade Pay & Perks", "IHG Employee Rates", "Comprehensive Medical Scheme"]),
            2800
        )
    ]
    cursor.executemany("""
    INSERT INTO businesses (
        id, legal_name, brand_name, property_type, star_rating, city,
        address, country, website, email, logo_url, cover_image,
        description, verification_status, verification_notes, departments,
        amenities, benefits, follower_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        legal_name = excluded.legal_name,
        brand_name = excluded.brand_name,
        property_type = excluded.property_type,
        star_rating = excluded.star_rating,
        city = excluded.city,
        address = excluded.address,
        country = excluded.country,
        website = excluded.website,
        email = excluded.email,
        logo_url = excluded.logo_url,
        cover_image = excluded.cover_image,
        description = excluded.description,
        verification_status = excluded.verification_status,
        verification_notes = excluded.verification_notes,
        departments = excluded.departments,
        amenities = excluded.amenities,
        benefits = excluded.benefits,
        follower_count = excluded.follower_count
    """, businesses)

    # 4. Business Memberships
    memberships = [
        ("mem_1", "biz_radisson", "user_fatima", "HR Manager", now)
    ]
    cursor.executemany("""
    INSERT INTO business_memberships (
        id, business_id, user_id, org_role, created_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        business_id = excluded.business_id,
        user_id = excluded.user_id,
        org_role = excluded.org_role,
        created_at = excluded.created_at
    """, memberships)

    # 5. Realistic Hospitality Jobs
    jobs = [
        (
            "job_fo_sup",
            "biz_radisson",
            "Front Office Supervisor (Guest Relations)",
            "Front Office",
            "Airport Road, Dhaka",
            "Full-time",
            "Rotational (Morning / Evening)",
            50000,
            70000,
            "month",
            "BDT",
            1, # Service charge included
            1, # Accommodation
            1, # Duty meals
            "3-5 Years",
            2,
            "Radisson Blu Dhaka Water Garden is seeking an energetic, customer-centric Front Office Supervisor to oversee guest check-in/out, supervise reception associates, resolve guest feedback promptly, and coordinate VIP amenities. The candidate must uphold Radisson's 'Yes I Can!' service philosophy.",
            json.dumps([
                "Minimum 3 years of front office experience in a 4-star or 5-star hotel.",
                "High proficiency in Opera PMS (Version 5 or Opera Cloud).",
                "Excellent verbal and written communication in English and Bengali.",
                "Strong conflict resolution, leadership, and night audit oversight skills.",
                "Bachelor's degree in Tourism/Hospitality Management preferred."
            ]),
            json.dumps([
                {"q": "How many years of hands-on Opera PMS experience do you possess?", "type": "text"},
                {"q": "Are you comfortable working rotating morning, evening, and occasional night shifts?", "type": "boolean"},
                {"q": "What is your earliest joining date or notice period?", "type": "text"}
            ]),
            "active",
            1, # Urgent
            1, # Featured
            "2026-11-15",
            "2026-10-12",
            14
        ),
        (
            "job_sous_chef",
            "biz_radisson",
            "Executive Sous Chef (Continental & Bengali Fine Dining)",
            "Culinary / Kitchen",
            "Airport Road, Dhaka",
            "Full-time",
            "Straight Shift",
            75000,
            110000,
            "month",
            "BDT",
            1,
            1,
            1,
            "5+ Years",
            1,
            "Lead culinary operations across our signature restaurants and VIP banquet kitchens. Responsible for menu engineering, HACCP food hygiene compliance, food cost optimization, and culinary team mentoring.",
            json.dumps([
                "5+ years culinary leadership in upscale hotel dining or fine dining restaurants.",
                "HACCP / ISO 22000 certified food safety knowledge.",
                "Proven creativity in high-volume banqueting and contemporary plating.",
                "Strict food cost tracking and inventory control expertise."
            ]),
            json.dumps([
                {"q": "Do you hold a current HACCP or Food Safety certification?", "type": "boolean"},
                {"q": "What is your primary culinary specialization (Continental, Pan-Asian, Bengali)?", "type": "text"}
            ]),
            "active",
            0,
            1,
            "2026-11-20",
            "2026-10-14",
            8
        ),
        (
            "job_fb_capt",
            "biz_sayeman",
            "F&B Service Captain (Beachfront Restaurant & Infinity Bar)",
            "Food & Beverage",
            "Marine Drive, Cox's Bazar",
            "Full-time",
            "Evening / Dinner Shift",
            35000,
            50000,
            "month",
            "BDT",
            1,
            1, # On-site beach staff housing
            1,
            "1-3 Years",
            3,
            "Join Sayeman Beach Resort's beachfront Taranga Restaurant. Lead service stewards, maintain flawless table settings, advise guests on fresh seafood pairings and beverage selections, and ensure 5-star hospitality at sunset dining.",
            json.dumps([
                "2+ years experience in restaurant service or luxury resort dining.",
                "Familiarity with Micros POS software and bill settlements.",
                "Polite, engaging personality with guest-first service mindset.",
                "Ability to live and work on-site in Cox's Bazar."
            ]),
            json.dumps([
                {"q": "Are you able to relocate to staff housing in Cox's Bazar immediately?", "type": "boolean"},
                {"q": "Have you used Micros POS or similar restaurant ordering systems?", "type": "boolean"}
            ]),
            "active",
            1,
            1,
            "2026-11-10",
            "2026-10-10",
            21
        ),
        (
            "job_hk_exec",
            "biz_westin",
            "Housekeeping Floor Executive",
            "Housekeeping",
            "Gulshan-2, Dhaka",
            "Full-time",
            "Morning Shift",
            32000,
            45000,
            "month",
            "BDT",
            1,
            0, # Offsite accommodation subsidy
            1,
            "1-3 Years",
            2,
            "Ensure Westin guest rooms and suites meet impeccable Marriott global cleanliness and hygiene benchmarks. Inspect guest rooms, coordinate linen laundry, and oversee housekeeping room attendants.",
            json.dumps([
                "2+ years housekeeping inspection experience in recognized hotels.",
                "Eye for detail and knowledge of chemical sanitization standards.",
                "Proficiency in updating room status on PMS software."
            ]),
            json.dumps([
                {"q": "Are you familiar with Marriott cleanliness audit guidelines?", "type": "boolean"}
            ]),
            "active",
            0,
            0,
            "2026-11-18",
            "2026-10-13",
            6
        ),
        (
            "job_banquet_sales",
            "biz_intercon",
            "Banquet & Wedding Sales Manager",
            "Sales & Marketing",
            "Minto Road, Dhaka",
            "Full-time",
            "General Shift",
            60000,
            90000,
            "month",
            "BDT",
            1,
            0,
            1,
            "3-5 Years",
            1,
            "Drive banquet sales for corporate summits, diplomatic galas, and lavish weddings at InterContinental Dhaka. Build strong relationships with event planners, execute venue tours, and close banquet contracts.",
            json.dumps([
                "3+ years corporate or wedding banquet sales experience in Dhaka.",
                "Demonstrated track record of achieving banquet revenue quotas.",
                "Strong contract negotiation and event coordination acumen."
            ]),
            json.dumps([
                {"q": "What was your annual corporate/wedding banquet sales volume in your previous role?", "type": "text"}
            ]),
            "active",
            0,
            1,
            "2026-11-25",
            "2026-10-15",
            11
        ),
        (
            "job_eco_guide",
            "biz_grandsultan",
            "Eco-Tour & Guest Recreation Specialist",
            "Front Office",
            "Sreemangal, Sylhet",
            "Full-time",
            "Day Shift",
            30000,
            42000,
            "month",
            "BDT",
            1,
            1,
            1,
            "1-3 Years",
            2,
            "Guide luxury resort guests through pristine rainforest treks, indigenous tea garden trails, and bird-watching excursions. Organize evening cultural campfires and recreation activities.",
            json.dumps([
                "Passion for eco-tourism and nature conservation.",
                "Fluent English communication for international resort guests.",
                "First aid and outdoor safety certification is a big plus."
            ]),
            json.dumps([
                {"q": "Do you hold a basic First Aid or CPR certification?", "type": "boolean"}
            ]),
            "active",
            0,
            0,
            "2026-11-30",
            "2026-10-11",
            9
        ),
        (
            "job_gm_intercon",
            "biz_intercon",
            "General Manager / Resident Hotel Manager",
            "Executive Leadership",
            "Minto Road, Dhaka",
            "Full-time",
            "General Shift",
            180000,
            250000,
            "month",
            "BDT",
            1,
            1,
            1,
            "10+ Years",
            1,
            "Strategic leadership of 5-star hotel operations, international guest experience, revenue optimization, and brand standards compliance.",
            json.dumps([
                "10+ years senior hospitality management experience in luxury 5-star hotels.",
                "Demonstrated P&L management, GOP targets, and staff leadership.",
                "Global chain accreditation or AHLEI Certified Hotel Administrator (CHA)."
            ]),
            json.dumps([
                {"q": "Have you managed a 5-star property with 200+ keys?", "type": "boolean"}
            ]),
            "active",
            1,
            1,
            "2026-12-15",
            "2026-10-16",
            5
        ),
        (
            "job_eng_duty",
            "biz_westin",
            "Duty Engineer (HVAC & Facilities)",
            "Engineering",
            "Gulshan-2, Dhaka",
            "Full-time",
            "Rotational Shift",
            45000,
            60000,
            "month",
            "BDT",
            1,
            0,
            1,
            "3-5 Years",
            2,
            "Maintain building management systems, HVAC chillers, backup generators, and fire safety systems at The Westin Dhaka.",
            json.dumps([
                "Diploma or B.Sc in Electrical or Mechanical Engineering.",
                "3+ years building maintenance experience in luxury hotels or corporate towers."
            ]),
            json.dumps([
                {"q": "Do you have hands-on experience with commercial water-cooled chiller plants?", "type": "boolean"}
            ]),
            "active",
            0,
            0,
            "2026-11-28",
            "2026-10-15",
            7
        ),
        (
            "job_hk_attendant",
            "biz_radisson",
            "Housekeeping Attendant / Associate",
            "Housekeeping",
            "Airport Road, Dhaka",
            "Full-time",
            "Morning / Evening",
            25000,
            32000,
            "month",
            "BDT",
            1,
            1,
            1,
            "Entry Level",
            5,
            "Provide spotless cleaning, turndown amenities, and linen restocking for guest rooms upholding 5-star Radisson standards.",
            json.dumps([
                "SSC or NHTTI housekeeping certificate preferred.",
                "Strong work ethic, attention to detail, and guest courtesy."
            ]),
            json.dumps([
                {"q": "Are you comfortable with physical standing and room cleaning shifts?", "type": "boolean"}
            ]),
            "active",
            0,
            0,
            "2026-11-25",
            "2026-10-17",
            12
        )
    ]
    cursor.executemany("""
    INSERT INTO jobs (
        id, business_id, title, department, property_location,
        employment_type, shift, salary_min, salary_max, salary_period,
        currency, service_charge_included, accommodation_provided,
        duty_meals_provided, experience_level, vacancies, description,
        requirements, screening_questions, status, is_urgent,
        is_featured, deadline, posted_at, applicant_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        business_id = excluded.business_id,
        title = excluded.title,
        department = excluded.department,
        property_location = excluded.property_location,
        employment_type = excluded.employment_type,
        shift = excluded.shift,
        salary_min = excluded.salary_min,
        salary_max = excluded.salary_max,
        salary_period = excluded.salary_period,
        currency = excluded.currency,
        service_charge_included = excluded.service_charge_included,
        accommodation_provided = excluded.accommodation_provided,
        duty_meals_provided = excluded.duty_meals_provided,
        experience_level = excluded.experience_level,
        vacancies = excluded.vacancies,
        description = excluded.description,
        requirements = excluded.requirements,
        screening_questions = excluded.screening_questions,
        status = excluded.status,
        is_urgent = excluded.is_urgent,
        is_featured = excluded.is_featured,
        deadline = excluded.deadline,
        posted_at = excluded.posted_at,
        applicant_count = excluded.applicant_count
    """, jobs)

    # 6. Seed Application: Rahim Ahmed applied to Radisson Blu Front Office Supervisor
    cursor.execute("""
    INSERT INTO applications (
        id, job_id, user_id, status, applied_at, updated_at,
        cover_letter, selected_cv, screening_answers, recruiter_notes,
        interview_time, interview_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        job_id = excluded.job_id,
        user_id = excluded.user_id,
        status = excluded.status,
        applied_at = excluded.applied_at,
        updated_at = excluded.updated_at,
        cover_letter = excluded.cover_letter,
        selected_cv = excluded.selected_cv,
        screening_answers = excluded.screening_answers,
        recruiter_notes = excluded.recruiter_notes,
        interview_time = excluded.interview_time,
        interview_notes = excluded.interview_notes
    """, (
        "app_rahim_radisson",
        "job_fo_sup",
        "user_rahim",
        "interview_scheduled",
        "2026-10-13 11:20",
        "2026-10-15 16:30",
        "Dear Hiring Team, With over 5 years of dedicated front desk and Opera PMS experience at InterContinental and Pan Pacific, I am thrilled to apply for the Front Office Supervisor role at Radisson Blu Dhaka Water Garden.",
        "Rahim_Ahmed_Front_Office_Executive_CV.pdf",
        json.dumps({
            "How many years of hands-on Opera PMS experience do you possess?": "4.5 years",
            "Are you comfortable working rotating morning, evening, and occasional night shifts?": "Yes, completely comfortable.",
            "What is your earliest joining date or notice period?": "1 month notice period (negotiable to 2 weeks)"
        }),
        "Candidate scored 94% on front desk simulation. Exceptional Opera PMS mastery and polite demeanor. Highly recommended for in-person interview with Director of Rooms.",
        "2026-10-18 at 02:30 PM (Radisson Executive Lounge)",
        "Please bring physical copies of certificates and NID."
    ))

    # Application Events (Status History)
    events = [
        ("app_rahim_radisson", "submitted", "Rahim Ahmed", "Application submitted with tailored hospitality CV.", "2026-10-13 11:20"),
        ("app_rahim_radisson", "under_review", "Fatima Khan (HR Manager)", "Profile reviewed; Opera PMS certification verified.", "2026-10-14 09:15"),
        ("app_rahim_radisson", "shortlisted", "Fatima Khan (HR Manager)", "Candidate shortlisted for Front Office leadership assessment.", "2026-10-14 15:40"),
        ("app_rahim_radisson", "interview_scheduled", "Fatima Khan (HR Manager)", "Scheduled 1st Round Interview with Director of Rooms for Oct 18, 02:30 PM.", "2026-10-15 16:30")
    ]
    for ev in events:
        cursor.execute("INSERT INTO application_events (application_id, status, actor_name, note, timestamp) VALUES (?, ?, ?, ?, ?)", ev)

    # 7. Seed Conversation between Rahim and Fatima Khan (Radisson HR)
    cursor.execute("""
    INSERT INTO conversations (
        id, user_id, business_id, job_id, last_message,
        last_message_time, unread_for_user, unread_for_business
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        user_id = excluded.user_id,
        business_id = excluded.business_id,
        job_id = excluded.job_id,
        last_message = excluded.last_message,
        last_message_time = excluded.last_message_time,
        unread_for_user = excluded.unread_for_user,
        unread_for_business = excluded.unread_for_business
    """, (
        "conv_rahim_radisson",
        "user_rahim",
        "biz_radisson",
        "job_fo_sup",
        "Thank you Ms. Fatima. I will be at the Executive Lounge on Sunday at 2:30 PM.",
        "2026-10-15 17:15",
        1, # Unread for user (demonstrates unseen text message badge)
        0  # Unread for business
    ))

    messages = [
        ("msg_1", "conv_rahim_radisson", "user_fatima", "business", "Fatima Khan (Radisson HR)", "Hello Rahim, thank you for applying for the Front Office Supervisor vacancy. Your Opera PMS background at InterContinental looks impressive.", 0, "2026-10-15 16:25"),
        ("msg_2", "conv_rahim_radisson", "user_fatima", "business", "Fatima Khan (Radisson HR)", "We would like to invite you for an in-person interview this Sunday, Oct 18 at 02:30 PM at the Radisson Executive Boardroom.", 1, "2026-10-15 16:30"),
        ("msg_3", "conv_rahim_radisson", "user_rahim", "user", "Rahim Ahmed", "Thank you Ms. Fatima. I will be at the Executive Lounge on Sunday at 2:30 PM sharp with all credentials. Looking forward to meeting the team!", 0, "2026-10-15 17:15")
    ]
    cursor.executemany("""
    INSERT INTO messages (
        id, conversation_id, sender_id, sender_role, sender_name,
        content, is_action_prompt, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        conversation_id = excluded.conversation_id,
        sender_id = excluded.sender_id,
        sender_role = excluded.sender_role,
        sender_name = excluded.sender_name,
        content = excluded.content,
        is_action_prompt = excluded.is_action_prompt,
        timestamp = excluded.timestamp
    """, messages)

    # 8. Saved Job & Followed Business
    cursor.execute("INSERT INTO saved_jobs (user_id, job_id, saved_at) VALUES (?, ?, ?) ON CONFLICT (user_id, job_id) DO NOTHING", ("user_rahim", "job_sous_chef", "2026-10-14 10:00"))
    cursor.execute("INSERT INTO followed_businesses (user_id, business_id, followed_at) VALUES (?, ?, ?) ON CONFLICT (user_id, business_id) DO NOTHING", ("user_rahim", "biz_radisson", "2026-10-12 09:00"))
    cursor.execute("INSERT INTO followed_businesses (user_id, business_id, followed_at) VALUES (?, ?, ?) ON CONFLICT (user_id, business_id) DO NOTHING", ("user_rahim", "biz_sayeman", "2026-10-12 09:30"))

    # 9. Notifications for Rahim
    notifications = [
        ("notif_1", "user_rahim", "Interview Invitation!", "Radisson Blu Dhaka scheduled your interview for Front Office Supervisor on Oct 18.", "application", "#applications", 0, "2026-10-15 16:30"),
        ("notif_2", "user_rahim", "New Job from Sayeman Beach Resort", "A new vacancy for F&B Service Captain in Cox's Bazar was posted.", "job_alert", "#job-details?id=job_fb_capt", 1, "2026-10-10 14:00")
    ]
    cursor.executemany("""
    INSERT INTO notifications (
        id, user_id, title, message, type, link, is_read, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        user_id = excluded.user_id,
        title = excluded.title,
        message = excluded.message,
        type = excluded.type,
        link = excluded.link,
        is_read = excluded.is_read,
        timestamp = excluded.timestamp
    """, notifications)

    # 10. Admin Verification Queue
    cursor.execute("""
    INSERT INTO business_verifications (
        id, business_id, legal_doc_type, doc_number, submitted_by,
        submitted_at, status, reviewed_at, reviewed_by, review_comments
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        business_id = excluded.business_id,
        legal_doc_type = excluded.legal_doc_type,
        doc_number = excluded.doc_number,
        submitted_by = excluded.submitted_by,
        submitted_at = excluded.submitted_at,
        status = excluded.status,
        reviewed_at = excluded.reviewed_at,
        reviewed_by = excluded.reviewed_by,
        review_comments = excluded.review_comments
    """, (
        "verif_sayeman",
        "biz_sayeman",
        "Ministry of Civil Aviation & Tourism License",
        "CAT-HOTEL-2024-88419",
        "Sayeman Managing Director",
        "2026-10-01 10:00",
        "approved",
        "2026-10-02 12:00",
        "admin@nicejobs.bd",
        "Verified official registration certificate."
    ))

    # Add a pending verification for demo
    cursor.execute("""
    INSERT INTO businesses (
        id, legal_name, brand_name, property_type, star_rating, city,
        address, country, website, email, logo_url, cover_image,
        description, verification_status, verification_notes, departments,
        amenities, benefits, follower_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        legal_name = excluded.legal_name,
        brand_name = excluded.brand_name,
        property_type = excluded.property_type,
        star_rating = excluded.star_rating,
        city = excluded.city,
        address = excluded.address,
        country = excluded.country,
        website = excluded.website,
        email = excluded.email,
        logo_url = excluded.logo_url,
        cover_image = excluded.cover_image,
        description = excluded.description,
        verification_status = excluded.verification_status,
        verification_notes = excluded.verification_notes,
        departments = excluded.departments,
        amenities = excluded.amenities,
        benefits = excluded.benefits,
        follower_count = excluded.follower_count
    """, (
        "biz_seagull",
        "Seagull Hotels Ltd.",
        "Seagull Hotel Cox's Bazar",
        "Beach Resort",
        4,
        "Cox's Bazar",
        "Hotel Motel Zone, Cox's Bazar",
        "Bangladesh",
        "https://seagullhotelbd.com",
        "info@seagullhotelbd.com",
        "/static/images/resort_beach.jpg",
        "/static/images/resort_beach.jpg",
        "One of the earliest premier beach hotels in Cox's Bazar, featuring large grounds, multi-cuisine dining, and beach access.",
        "pending",
        "Verification submission pending administrative review.",
        json.dumps(["Front Office", "F&B", "Housekeeping"]),
        json.dumps(["Swimming Pool", "Conference Hall", "Restaurant"]),
        json.dumps(["Duty Meals", "Accommodation Pool"]),
        850
    ))

    cursor.execute("""
    INSERT INTO business_verifications (
        id, business_id, legal_doc_type, doc_number, submitted_by,
        submitted_at, status, reviewed_at, reviewed_by, review_comments
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        business_id = excluded.business_id,
        legal_doc_type = excluded.legal_doc_type,
        doc_number = excluded.doc_number,
        submitted_by = excluded.submitted_by,
        submitted_at = excluded.submitted_at,
        status = excluded.status,
        reviewed_at = excluded.reviewed_at,
        reviewed_by = excluded.reviewed_by,
        review_comments = excluded.review_comments
    """, (
        "verif_seagull",
        "biz_seagull",
        "Dhaka & Chittagong Trade License #994821",
        "TL-CTG-2025-994821",
        "Operations Director (Seagull)",
        "2026-10-14 15:00",
        "pending",
        None,
        None,
        "Awaiting Trust & Moderation team inspection."
    ))

    # 11. Moderation Report Sample
    cursor.execute("""
    INSERT INTO moderation_reports (
        id, item_type, item_id, reporter_name, reason, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        item_type = excluded.item_type,
        item_id = excluded.item_id,
        reporter_name = excluded.reporter_name,
        reason = excluded.reason,
        status = excluded.status,
        created_at = excluded.created_at
    """, (
        "rep_101",
        "job",
        "job_suspicious_demo",
        "System Automated Scanner",
        "Detected unverified third-party recruitment fee mention in candidate review note. Flags safety rule #11.",
        "open",
        "2026-10-15 08:30"
    ))

    # 12. Hospitality Blog Articles
    blogs = [
        (
            "blog_opera_pms",
            "Mastering Opera Cloud & PMS 5.5: What 5-Star Hotel HR Looks For",
            "mastering-opera-cloud-pms-hospitality",
            "Hotel Standards",
            "Front office recruiters in premier luxury properties prioritize candidates who demonstrate audit speed, room assignment logic, and billing dispute resolution in Opera.",
            "<h3>The Core Operational Backbone of Luxury Hospitality</h3><p>In 5-star properties across Dhaka, Chittagong, and Cox's Bazar, Opera PMS (both Version 5.5 and Opera Cloud) remains the single most scrutinized technical skill on candidate CVs. Front desk executives are evaluated not just on pleasant greetings, but on rapid terminal dexterity during high-volume check-in surges.</p><h3>Key Workflows Every Front Desk Supervisor Must Master</h3><ul><li><strong>VIP Profile Routing & Tracing:</strong> Setting guest preferences, billing windows, and amenity delivery alerts before arrival.</li><li><strong>Rate Code & Room Inventory Parity:</strong> Handling room type upgrades, connecting suite locks, and early check-in overrides without revenue leakage.</li><li><strong>Night Audit Balancing:</strong> Running daily room postings, POS interface synchronization, cashier drop verifications, and ledger reconciliations.</li></ul><h3>Interview Tip</h3><p>When asked about Opera experience in an interview, do not simply say you used it. Explain how you handled an overbooked night or resolved a split-folio corporate billing dispute using Opera routing rules.</p>",
            "Rahim Ahmed",
            "Front Office Supervisor & Hospitality Systems Trainer",
            "/static/images/candidate_rahim.jpg",
            "/static/images/hero_desk_bell.jpg",
            "5 min read",
            "2026-10-16",
            json.dumps(["Opera PMS", "Front Desk", "Hotel Systems", "Audit"])
        ),
        (
            "blog_interview_prep",
            "Acing the 5-Star Hotel Interview: From Trade Tests to GM Round",
            "acing-5-star-hotel-interview-guide",
            "Interview Prep",
            "Hospitality interviews evaluate poise under pressure, grooming standards, and behavioral crisis management. Here is your step-by-step preparation playbook.",
            "<h3>Understanding the 3-Tier Hospitality Interview</h3><p>Securing a position at an internationally branded hotel like Radisson Blu, The Westin, or InterContinental involves three distinct evaluation stages: HR Screening, Departmental Trade Assessment, and Executive Committee / General Manager Approval.</p><h3>Stage 1: HR & Grooming Screen</h3><p>Hospitality HR evaluates immaculate professional presentation, posture, and verbal fluency in English and Bengali. Punctuality is strictly non-negotiable—arriving 10 minutes early reflects shift reliability.</p><h3>Stage 2: The Trade Test</h3><p>Unlike corporate roles, hospitality candidates are frequently tested in real-time simulations:</p><ul><li><strong>Front Office:</strong> Roleplay handling a disgruntled guest whose reserved presidential suite is not yet serviced.</li><li><strong>F&B / Sommelier:</strong> Wine presentation, five-course banquet table laying, and allergy safety protocol.</li><li><strong>Kitchen / Culinary:</strong> Knife skill precision, sauce reduction, and 30-minute hot plate production under chef observation.</li></ul><h3>Stage 3: The GM Round</h3><p>General Managers look for emotional intelligence, long-term brand alignment, and the innate desire to deliver genuine warmth. Keep answers structured, positive, and focused on guest satisfaction metrics.</p>",
            "Fatima Khan",
            "HR Director, Radisson Blu Dhaka Water Garden",
            "/static/images/candidate_rahim.jpg",
            "/static/images/hero_lobby.jpg",
            "6 min read",
            "2026-10-17",
            json.dumps(["Interview Tips", "Hospitality Careers", "Trade Tests", "HR"])
        ),
        (
            "blog_salary_benchmark",
            "2026 Bangladesh Hospitality Compensation & Service Charge Benchmark",
            "2026-bangladesh-hospitality-salary-service-charge-guide",
            "Career Advice",
            "A comprehensive breakdown of base salaries, monthly service charge distributions, and total take-home pay structures across 5-star properties in Bangladesh.",
            "<h3>The Composition of Hospitality Earnings</h3><p>One of the unique aspects of career compensation in luxury hotels is the service charge dividend. In top 5-star properties in Bangladesh, total monthly remuneration is composed of:</p><ol><li><strong>Basic Salary:</strong> Fixed monthly contractual compensation.</li><li><strong>Service Charge Pool:</strong> A shared percentage of hotel gross revenues divided among all eligible operational staff, often adding BDT 15,000 to BDT 35,000+ monthly during peak season.</li><li><strong>Perks & Provisions:</strong> On-duty meals, shift transport allowances, health insurance, and accommodation allowances.</li></ol><h3>Current Market Salary Ranges</h3><ul><li><strong>Front Office Supervisor / Duty Manager:</strong> BDT 50,000 – BDT 80,000 / month + Service Charge</li><li><strong>Executive Sous Chef:</strong> BDT 75,000 – BDT 120,000 / month</li><li><strong>F&B Captain / Banquet Supervisor:</strong> BDT 35,000 – BDT 55,000 / month + Service Charge</li><li><strong>Housekeeping Executive:</strong> BDT 40,000 – BDT 65,000 / month</li></ul>",
            "Tanvir Hossain",
            "Hospitality Compensation Analyst",
            "/static/images/candidate_rahim.jpg",
            "/static/images/resort_beach.jpg",
            "4 min read",
            "2026-10-18",
            json.dumps(["Salary Guide", "Service Charge", "Compensation", "Hospitality Pay"])
        ),
        (
            "blog_culinary_trends",
            "Culinary Leadership: Managing High-Volume Banquet & Fine Dining Kitchens",
            "culinary-leadership-banquets-fine-dining",
            "Culinary & F&B",
            "Executive Chefs share how HACCP food safety compliance, precision food costing, and kitchen brigade leadership define modern culinary excellence.",
            "<h3>The Modern Hotel Kitchen Hierarchy</h3><p>Running a luxury hotel kitchen requires blending creative culinary passion with industrial precision. When catering for a 1,000-guest state banquet or plating an intimate 8-course degustation menu, kitchen leadership rests on disciplined execution.</p><h3>Key Focus Areas for Aspiring Kitchen Leaders</h3><ul><li><strong>HACCP & Hygiene Compliance:</strong> Maintaining strict cold chain records, cross-contamination prevention, and deep cleaning schedules.</li><li><strong>Yield Management & Food Costing:</strong> Calculating portion cost to three decimal places while eliminating prep waste.</li><li><strong>Staff Mentorship:</strong> Developing Commis chefs and apprentices in knife technique, timing, and composure on the hot pass line.</li></ul><p>Hospitality properties on NiceJobs actively seek certified culinary professionals who demonstrate strong kitchen management alongside culinary artistry.</p>",
            "Chef Tariq Rahman",
            "Executive Sous Chef, InterContinental Dhaka",
            "/static/images/candidate_rahim.jpg",
            "/static/images/hero_desk_bell.jpg",
            "7 min read",
            "2026-10-19",
            json.dumps(["Culinary", "Kitchen Leadership", "HACCP", "Food & Beverage"])
        )
    ]

    cursor.executemany("""
    INSERT INTO blogs (
        id, title, slug, category, excerpt, content, author_name, author_title,
        author_avatar, cover_image, read_time, published_at, tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
        title = excluded.title,
        slug = excluded.slug,
        category = excluded.category,
        excerpt = excluded.excerpt,
        content = excluded.content,
        author_name = excluded.author_name,
        author_title = excluded.author_title,
        author_avatar = excluded.author_avatar,
        cover_image = excluded.cover_image,
        read_time = excluded.read_time,
        published_at = excluded.published_at,
        tags = excluded.tags
    """, blogs)

