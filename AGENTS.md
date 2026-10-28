# NiceJobs — AI Coding Agent Guide & Architecture Rules

This is the single source of truth for AI coding agents (Antigravity, Claude, etc.) working on NiceJobs.

---

## 1. Project Overview

- **Purpose**: Specialized employment, recruitment, and Applicant Tracking System (ATS) tailored for luxury hotels, 5-star resorts, and hospitality professionals in Bangladesh.
- **Frontend Architecture**: High-performance Single-Page Application (SPA) written in Vanilla JavaScript (`static/js/app.js`) and modern CSS (`static/css/styles.css`).
  - Hash-based client routing (`#home`, `#jobs`, `#hotels`, `#blog`, `#profile`, `#inbox`, `#ats`, `#admin-login`).
  - Dark Glassmorphism design system (`#0a1128` background, `#ff6b00` orange accents, translucent frosted surfaces).
  - Pure vector SVG icon system via `svgIcon(name, customClass, size)` — **never use emojis as icons**.
- **Backend Architecture**: Python 3.10+ with **FastAPI** (`app.py`), ASGI server via **Uvicorn**, and Vercel serverless gateway (`api/index.py`).
- **Database Architecture**: Dual-engine data layer (`database.py`):
  - Local / Development: SQLite 3 (`nicejobs.db`).
  - Remote / Production: PostgreSQL (Supabase pooler) enabled automatically when `DATABASE_URL` is set.
- **Client-Server Communication**:
  - REST API endpoints prefixed with `/api/*`.
  - WebSocket at `/ws` (with `/api/realtime/ws` and `/ws/realtime` aliases) for instant chat and status sync.
  - Automatic fallback pipelines: Server-Sent Events (SSE) at `/api/realtime/stream` and polling at `/api/realtime/events`.

---

## 2. Directory Map

```
NiceJobs/
├── AGENTS.md                                     # THIS FILE: Single source of truth for agents
├── README.md                                     # Public project overview & quickstart
├── app.py                                        # FastAPI backend (92 routes, WebSocket, ATS, auth)
├── database.py                                   # Dual-engine DB layer (SQLite + Supabase PostgreSQL)
├── api/
│   └── index.py                                  # Vercel serverless function entrypoint
├── index.html                                    # Root SPA HTML shell (deployed to GitHub Pages)
├── requirements.txt                              # Backend Python dependencies
├── vercel.json                                   # Vercel deployment rewrites & runtime limits
├── docs/                                         # Historical documentation and requirement specs
│   ├── PROJECT_WORKFLOW_AND_UPDATES.md           # 58-item chronological evolution audit trail
│   └── NiceJobs_Product_Scope_and_Workflows.docx # Original product scope document
├── static/
│   ├── index.html                                # Canonical SPA HTML shell (served by FastAPI)
│   ├── js/
│   │   └── app.js                                # Frontend client (state, routing, 17 screens)
│   ├── css/
│   │   ├── styles.css                            # Complete CSS design system & responsive rules
│   │   └── fonts.css                             # Local @font-face declarations
│   ├── font/                                     # Self-hosted Inter & Plus Jakarta Sans woff2 files
│   └── images/                                   # Curated hospitality assets & vector SVGs
├── scripts/
│   └── migrate_sqlite_to_supabase.py             # Safe SQLite-to-PostgreSQL data migration tool
└── tests/
    ├── test_api_endpoints.py                     # Fast in-memory unit tests using TestClient
    ├── test_realtime.py                          # Live WebSocket & event pipeline tests
    ├── test_realtime_and_security.py             # Auth & security integration tests
    └── test_browser_realtime.py                  # Headless browser real-time verification
```

---

## 3. Essential Verified Commands

Run all commands from the repository root:

- **Run in-memory unit tests (Fast, standalone)**:
  ```bash
  python3 -m unittest discover tests
  # or specifically:
  python3 -m unittest tests/test_api_endpoints.py
  ```

- **Run development server locally**:
  ```bash
  uvicorn app:app --reload --port 8000
  ```

- **Verify Python syntax & compilation**:
  ```bash
  python3 -m py_compile app.py database.py api/index.py
  ```

- **Database migration dry-run (SQLite -> Supabase Postgres)**:
  ```bash
  python3 scripts/migrate_sqlite_to_supabase.py --dry-run
  ```

---

## 4. Critical Architecture & Business Rules

1. **Strict Icon Policy**:
   - **Never use emojis as icons**. Always call `svgIcon(iconName, customClass, size)` in `static/js/app.js`.

2. **Dark Glassmorphism Theme**:
   - Primary Background: `#0a1128` (deep midnight blue).
   - Accents: Orange (`#ff6b00` / `#ff7a18`) for buttons, active pills, badges; White (`#ffffff`) for crisp borders and text.
   - Glass surfaces: `background: rgba(255, 255, 255, 0.035); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.09)`.
   - Never reintroduce generic blue accents (`#2563eb`, `#1d4ed8`).

3. **Bangladesh Phone Number Formatting**:
   - Phone inputs must enforce the fixed `+88` prefix badge with an 11-digit `01...` numerical format.

4. **Business Administrator by Default**:
   - Every business representative registered or authenticated on behalf of a hotel is granted `is_business_admin: true` by default.

5. **Terminology Standards**:
   - Use **"Log In"** (not "Sign In").
   - Use **"Sign Up"** (not "Get Started").
   - Use **"Job Post" / "Job Posts"** (never "Job Vacancy" or "Vacancies").

6. **Static Parity Rule**:
   - `index.html` at repository root and `static/index.html` must remain in exact synchronization. `index.html` is used by GitHub Pages (`nicejobs.info`), while `static/index.html` is served by FastAPI.

7. **Demo OTP**:
   - Code `258330` is hardcoded across client and server for instant demo/testing without external SMS gateway dependencies.

8. **Dual-Engine DB Support**:
   - When modifying queries in `database.py`, write standard ANSI SQL or use `adapt_sql_for_postgres()` so both SQLite and PostgreSQL handle the query identically.

---

## 5. Agent Context-Loading & Investigation Workflow

When working on a bug or new feature, follow this targeted workflow:

1. **Scope the change**:
   - UI / Presentation / Client Routing -> Inspect `static/js/app.js` and `static/css/styles.css`.
   - REST API / Auth / Validation / Real-time -> Inspect `app.py`.
   - Data Schema / Seed Data / DB Queries -> Inspect `database.py`.
   - Database Migration -> Inspect `scripts/migrate_sqlite_to_supabase.py`.
2. **Do not read unrelated large files**:
   - For simple UI adjustments, do not inspect backend routes or migration scripts.
   - For backend endpoint fixes, do not inspect CSS stylesheets.
   - Historical prompt logs live in `docs/PROJECT_WORKFLOW_AND_UPDATES.md`. Only consult it when historical intent of an existing feature is ambiguous.
3. **Execute smallest safe change**:
   - Avoid rewriting entire files or large abstractions.
   - Preserve all existing function signatures and route aliases.
4. **Always verify**:
   - Run `python3 -m unittest tests/test_api_endpoints.py`.
   - Compile Python files with `python3 -m py_compile app.py database.py`.
