# nicejobs.info — Hospitality Careers, Connected

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite3-003B57.svg)](https://www.sqlite.org/)
[![Design](https://img.shields.io/badge/UI-Dark%20Glassmorphism-ff6b00.svg)](https://nicejobs.info)

A specialized hospitality employment platform connecting certified hotel leaders, chefs, front office supervisors, and resort teams with verified 5-star luxury properties across Bangladesh.

---

## 🌟 Key Features

### 1. Modern Dark Glassmorphism Aesthetic
- **Curated Color Palette**: Deep midnight background (`#0a1128`), translucent frosted white glass surfaces (`rgba(255, 255, 255, 0.035)`), crisp 1px borders (`rgba(255, 255, 255, 0.09)`), and high-contrast orange focal points (`#ff6b00`).
- **Floating Pill Frosted Navigation**: Responsive floating header capsule with typographic branding (`nicejobs.info`), active underline indicators, glass action pills, and persona switcher.
- **100% Vector SVG Icons**: Modern, scalable SVG icon system throughout navigation, forms, modals, search bars, and communication pills.

### 2. Candidate Experience
- **Candidate Hub**: Search console positioned directly at the top with live trust metrics (`500+ Active Roles`, `100% Direct Hotel HR`, `Zero Recruitment Fees`).
- **Interactive Open to Work Toggle**: Persistent live toggle (`● Open to Work` vs `○ Not Looking for Work`) synchronized directly with the SQLite database.
- **Instant Profile Access**: Direct navigation to `#profile` via the interactive top avatar/name badge.
- **Multi-CV Portfolio**: Upload and organize multiple tailored resumes per hospitality discipline.
- **Real-Time Notification Badges**: Live counters for unseen application status changes and unread recruiter messages.

### 3. Hotel Employer Workspace
- **Multi-Step Vacancy Publishing**: Structured job creator with salary toggles (`BDT Range` vs `Negotiable`), educational multi-select schemas, 80+ hotel department skills, and hotel departments.
- **Applicant Tracking & Pipeline**: Review candidate profiles, match scores, certifications, and manage hiring stages (`Reviewing`, `Shortlisted`, `Interviewing`, `Offered`, `Rejected`).
- **Direct Candidate Messenger**: Scrollable conversation stream with message history and real-time messaging.

### 4. Hospitality Blog Hub
- Dedicated `#blog` screen featuring hospitality industry insights, AHLEI certifications, Swiss hospitality standards, and career guidance.
- Dynamic category pill filters (`All`, `Career Advice`, `Industry Trends`, `Leadership`, `Culinary Arts`), live keyword search, and reading modal with vector close buttons.

### 5. Secure Admin Portal
- Discreet footer portal link (`#admin-login`) with minimalist interface (Email, Password, Master Key, Login button).
- Multi-layered security: multi-factor authentication, IP/identity brute-force rate limiter with 60s lockout, 192-bit CSPRNG cryptographic session token issuance, and permanent moderation audit logging.

---

## 🛠️ Technology Stack

- **Backend**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+), [Uvicorn](https://www.uvicorn.org/)
- **Database**: [SQLite3](https://www.sqlite.org/) (auto-initializes with comprehensive seed data)
- **Frontend**: Vanilla JavaScript (SPA architecture with hash-based routing `#home`, `#jobs`, `#hotels`, `#blog`, `#profile`, `#inbox`, `#admin-login`), Vanilla CSS (CSS Custom Properties & Glassmorphism)
- **Email Notifications**: Built-in notification dispatcher with fallback simulation logging.

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10 or higher
- `pip` package manager

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Toq33/NiceJobs.git
   cd NiceJobs
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the development server**:
   ```bash
   uvicorn app:app --reload --port 8000
   ```

4. **Open in your browser**:
   Navigate to [http://localhost:8000](http://localhost:8000)

---

## 🔑 Demo Personas & Credentials

The platform includes demo accounts seeded automatically on first launch:

| Role | Name / Organization | Email | Access |
| :--- | :--- | :--- | :--- |
| **Candidate** | Arif Rahman | `arif@example.com` | Full candidate profile, applications & inbox |
| **Hotel Employer** | Tanvir Ahmed (Radisson Blu) | `tanvir@radissonbd.com` | Vacancy publishing, applicant review & messaging |
| **Guest Visitor** | Public Mode | N/A | Public discovery, job search & blog exploration |
| **Administrator** | Root Admin | `admin@nicejobs.info` | Level 4 system moderation & platform control |

> **OTP Verification**: For local testing and demonstrations, enter demo OTP code **`258330`**.

---

## 📂 Project Structure

```
NiceJobs/
├── app.py                                        # FastAPI application & REST endpoints
├── database.py                                   # SQLite schema definitions & seed data
├── nicejobs.db                                   # SQLite database file
├── requirements.txt                              # Python package dependencies
├── PROJECT_WORKFLOW_AND_UPDATES.md               # Detailed changelog and architectural logs
├── static/
│   ├── index.html                                # Main Single Page Application shell
│   ├── css/
│   │   └── styles.css                            # Dark Glassmorphism design system & responsive layout
│   ├── js/
│   │   └── app.js                                # Client routing, UI rendering & state management
│   └── images/
│       ├── bell_image.png                        # Hero luxury concierge bell visual
│       └── ...                                   # Hotel brand assets and sponsor visual banners
└── README.md                                     # Project overview and documentation
```

---

## 📄 License
This project is proprietary and developed for specialized hospitality staffing in Bangladesh.
