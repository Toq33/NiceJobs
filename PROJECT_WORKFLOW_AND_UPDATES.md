# NiceJobs — Hospitality Employment Platform
## Complete Technical Architecture, Workflow Specifications & Chronological Update Log

> **Note for Future AI Assistants:** This document contains the definitive record of the NiceJobs codebase architecture, system components, user instructions, and all workflow iterations. When starting a new conversation, consult this document first to maintain total continuity and adhere strictly to the user's requirements.

---

## 1. Executive Summary & Product Vision

**NiceJobs** (`NiceJobs Hospitality`) is a dedicated employment and recruitment web platform tailored specifically for the 5-star hotel, luxury resort, fine dining, and hospitality sector in Bangladesh.

Unlike generic job portals, NiceJobs integrates:
- Specialized hospitality job discovery with industry-specific attributes (rotational shifts, service charge pool inclusion, duty meals, staff accommodation, department categorizations).
- Structured candidate profiles highlighting PMS (Property Management Systems like Opera 5.5/Cloud), Micros POS, culinary certifications, guest relations excellence, and multiple tailored CV uploads.
- Dual-pathway business onboarding for establishments:
  - **New Business Registration (Route A):** Property branding, segmented address across all 64 Bangladesh districts, searchable hotel/resort types schema, guest amenities schema, and automatic designation of the founding representative as the **Business Administrator**.
  - **Team Member Onboarding (Route B):** Joining an existing registered property with notification dispatched to the Business Admin for approval.
- Dual-part Business Sign-In where representatives authenticate on behalf of a verified establishment and are granted **Administrator authority by default**.
- Full-cycle Applicant Tracking System (ATS) with interview scheduling, candidate pipeline stages, and private recruiter notes.
- Platform Administrator Console with root oversight of users, business verifications, job moderation, and live metrics.

---

## 2. Technology Stack & Codebase Structure

```
NiceJobs/
├── app.py                                   # FastAPI backend (61 REST API endpoints)
├── database.py                              # SQLite schema, migrations, helper DB methods, seed data
├── nicejobs.db                              # SQLite 3 runtime database
├── extracted_prompt.txt                     # Original system scope and product prompt
├── NiceJobs_Product_Scope_and_Workflows.docx# Original client requirements doc
├── PROJECT_WORKFLOW_AND_UPDATES.md          # THIS MASTER DOCUMENT
├── NiceJobs_Project_Documentation.doc       # Word-compatible offline documentation
└── static/
    ├── index.html                           # Single-Page Application (SPA) HTML shell & demo switcher
    ├── css/
    │   └── styles.css                       # Complete Vanilla CSS design system & responsive styling
    ├── js/
    │   └── app.js                           # Frontend client application (state, routing, 17 screens)
    └── images/                              # High-resolution hospitality assets and avatars
        ├── candidate_rahim.jpg
        ├── hero_lobby.jpg
        ├── hero_hospitality_banner_*.jpg
        ├── hospitality_professional_man_*.jpg
        └── resort_beach.jpg
```

### Core Technologies
1. **Backend**: Python 3.10+ with **FastAPI** (`Uvicorn` ASGI server) and standard library `sqlite3`, `pydantic`, `hashlib`, `uuid`.
2. **Database**: SQLite 3 with WAL mode, JSON-serialized list/dict columns for schemas, and foreign key relations.
3. **Frontend**: Pure Vanilla HTML5 and Modern JavaScript (ES6+), Vanilla CSS3 with CSS variables (no TailwindCSS or heavy dependencies).
4. **State Management**: Reactive in-memory state objects (`state`, `loginState`, `signupState`, `adminState`) driving dynamic DOM rendering in `#app-viewport`.

---

## 3. Design System & Theme Styling

The visual identity follows a modern, dark luxury aesthetic designed to evoke premium 5-star hospitality:

| Design Token | Value | Purpose / Usage |
| :--- | :--- | :--- |
| **Primary Theme Color** | `#2563eb` / `#3b82f6` (Vibrant Blue) | Primary branding, buttons, active tabs, links |
| **Secondary Accent Color** | `#f97316` / `#fb923c` (Warm Orange) | Urgent badges, CTAs, highlight actions, warnings |
| **Tertiary Accent Color** | `#10b981` / `#34d399` (Emerald Green)| Verified badges, approval notices, success states |
| **Dark Base Background** | `#0b1120` (Midnight Navy) | Global body background |
| **Card / Surface Surface** | `#111827` / `#1e293b` (Rich Slate) | Content containers, modal dialogs, data tables |
| **Subtle Borders** | `rgba(255, 255, 255, 0.08)` | Glassmorphism card borders, divider lines |
| **Typography** | `Plus Jakarta Sans`, `Inter`, sans-serif | Modern editorial typography loaded from Google Fonts |

---

## 4. System Roles & Access Control

1. **Candidate / Job Seeker (`role: 'jobseeker'`)**:
   - Persona: Rahim Ahmed (Front Office Supervisor).
   - Capabilities: Browse jobs, apply with tailored CVs, track application milestones, message recruiters, save jobs, manage profile.
2. **Hotel Employer / Recruiter (`role: 'recruiter'`)**:
   - Persona: Fatima Khan (Director of Human Resources, Radisson Blu Dhaka Water Garden).
   - Capabilities: Access Recruiter Dashboard, view active vacancies, review applicants in ATS, schedule interviews, chat with candidates.
   - **Administrator Status**: The person signing in on behalf of the business is **Business Administrator by default** (`is_business_admin = true`, `membership_role = 'admin'`).
3. **Platform Administrator (`role: 'admin'`)**:
   - Persona: Tariqul Islam (Trust & Safety Lead).
   - Capabilities: Full root oversight via `/admin` console, approve/reject business trade licenses, moderate job posts, manage users, review pending requests, 1-click demo reset.
4. **Guest Visitor (`role: 'guest'`)**:
   - Browsing mode for unauthenticated users. Can explore public job listings and hotel directory. Prompted to sign in when attempting to view candidate CVs or apply.

---

## 5. Complete Authentication & Onboarding Workflows

### A. Dual-Mode Single-Screen Login (`#login`)
- **Segmented Toggle**: `[ Candidate ]` vs `[ Hotel Employer ]`.
- **Candidate Login**: Personal Email + Password.
- **Business Login (2-Part Verification)**:
  - **Part 1 (Establishment Verification)**: User enters official business email (e.g. `hr@radissondhaka.com`). Backend verifies whether the hotel is listed in the directory.
    - *If unlisted*: Shows notice card: *"This business doesn't have an account"* with a direct CTA button to register the property.
    - *If listed*: Transitions to Part 2 with matched hotel header card.
  - **Part 2 (Representative Verification)**: User enters personal work email on behalf of the hotel (e.g. `fatima.khan@radissondhaka.com`) + Password (with eye toggle).
    - *If not listed as team member*: Shows notice card: *"This user is not listed in this business account"* with CTA to join team.
    - *If listed*: Authenticates successfully, automatically grants **Business Administrator** status (`is_business_admin: true`), and opens the Recruiter Workspace.

---

### B. Candidate Registration Flow (`#signup`, 4 Stages)
1. **Stage 1: Personal Details & Contact**
   - Preset Profile Photo (PFP) avatar selector.
   - Full Name.
   - Date of Birth (DOB).
   - NID / Passport (Optional).
   - Mobile Cell Phone with **fixed `+88` prefix** (enforcing exactly 11 digits `01...`).
   - Personal Email.
   - Action: `Continue →`.
2. **Stage 2: Hospitality Background & Skills**
   - Professional Bio / Summary textarea.
   - Main CV File Upload.
   - Education multi-entry card (Institute name, degree/certificate, GPA).
   - **Hospitality Skills Schema System**: Searchable chip pool (Opera PMS, Micros POS, Guest Relations, Food Safety, Night Audit, Concierge, etc.) with custom skill addition chip.
   - Languages schema (Bengali, English, Arabic, etc.).
   - **Previous Experience Multi-Entry Card**: Hotel name, role, years of service, acquired skills, with `+ Add Another Experience Entry` and `✕ Remove` actions.
   - Action: `Continue →`.
3. **Stage 3: Account Security**
   - Password + Confirm Password with eye visibility toggles.
   - Action: `Continue →`.
4. **Stage 4: OTP Verification & Activation**
   - 6-digit security code sent to phone & email.
   - Demo Auto-Fill bar (default mock code: `258330`).
   - Action: `Verify & Submit Registration ✓`.

---

### C. Business Onboarding Flow (`#signup`, Route Choice)
User chooses between:
- `🏨 New Business Account` (Registering a new hotel/resort).
- `👥 Add New User` (Joining an existing registered property).

#### Route A: New Business Registration (6 Stages)
1. **Stage 1: Establishment Profile & Segmented Location**
   - Business Brand Name (e.g. Radisson Blu Dhaka Water Garden).
   - Legal Registered Company Name (e.g. Sena Hotel Developments Ltd.).
   - **Hospitality Property Type Schema**: Searchable selector (5-Star Luxury Hotel, Beach Resort, Boutique Hotel, Eco Resort, Heritage Palace, etc.) with custom type addition.
   - **Location Segmentation**:
     - Plot / Holding Number.
     - Road / Street Name.
     - Thana / Upazila.
     - **District Dropdown**: Contains all **64 Districts of Bangladesh** organized alphabetically.
   - Official Website URL.
   - Official Business Email.
   - Action: `Continue →`.
2. **Stage 2: Property Amenities & Facilities Schema**
   - Comprehensive amenities tag pool (Infinity Pool, Luxury Spa, 24/7 Gym, Multi-Cuisine Restaurant, High-Speed Wi-Fi, Valet Parking, Executive Lounge, Helipad, Banquet Hall, etc.).
   - Live filter search bar + `+ Add custom facility` button.
   - Selected amenities counter chips with individual remove buttons.
   - Action: `Continue →`.
3. **Stage 3: Representative On Behalf of Business**
   - Representative PFP avatar chip picker.
   - Full Name.
   - Mobile Cell Phone with **fixed `+88` prefix** (11 digits `01...`).
   - Personal Work Email.
   - Date of Birth (DOB).
   - Designation / Role in Business (e.g. Director of Human Resources).
   - Action: `Continue →`.
4. **Stage 4: Account Credentials**
   - Set Password & Confirm Password (with eye toggles).
   - Action: `Continue →`.
5. **Stage 5: Security OTP Verification**
   - 6-digit verification code sent to phone and official email.
   - 1-click Auto-Fill bar (`258330`).
   - Action: `Verify & Submit Property Registration ✓`.
6. **Stage 6: Queued for Verification Screen**
   - Reassurance message: *"Registration Queued for Verification — We are notified and please wait for verification"*.
   - Explains that the creator has been designated as the **Business Administrator**.
   - Direct Trust Desk contact pills:
     - 💬 WhatsApp: `+880 1819-876543` (clickable `https://wa.me/8801819876543`).
     - ✉️ Email: `trust@nicejobs.bd` (`mailto:`).
   - Action: `Go to Business Workspace →`.

#### Route B: Add Team Member to Existing Hotel (6 Stages)
1. **Stage 1: Find Business**: User inputs official business email (`hr@radissondhaka.com`) -> verified against database.
2. **Stage 2: Credentials**: Shows matched hotel card and admin name -> enter personal work email and password.
3. **Stage 3: Profile Details**: PFP avatar, Full Name, Cell Phone (`+88` fixed), DOB, Designation.
4. **Stage 4: Confirm Password**: Confirm password with eye toggle.
5. **Stage 5: Mobile OTP**: Verification code dispatched to representative's mobile.
6. **Stage 6: Waiting for Admin Approval Screen**: Informs user that notification was dispatched to the Hotel Business Administrator asking: *"A team member (Name, Designation) is trying to join. Do you approve or not?"*. User account is held in `pending_admin_approval` until approved.

---

## 6. Complete Single-Page Application (SPA) Screens

The application renders 17 screens dynamically into `#app-viewport`:

| Screen Route | View Function | Key Features & Workflow |
| :--- | :--- | :--- |
| `home` | `renderHomeScreen` | Hero banner with search bar; filter tags; featured hotel cards; active jobs listing with salary, location, and department pills. |
| `job-details` | `renderJobDetailsScreen` | Full vacancy spec; service charge pool & perks breakdown; screening questions; 1-click apply modal with CV selector. |
| `hotels` | `renderHotelsScreen` | Directory of verified hospitality properties in Bangladesh; search by city and star rating; follower counter. |
| `hotel-details` | `renderHotelDetailsScreen` | Hotel overview, brand photos, departments list, property amenities, active job vacancies, 1-click follow toggle. |
| `login` | `renderLoginPage` | Segmented Candidate vs Hotel Employer login; 2-part business verification check. |
| `signup` | `renderSignupPage` | 4-stage candidate onboarding; Route choice; 6-stage New Business setup; 6-stage Team Member setup. |
| `profile` | `renderProfileScreen` | Candidate profile view; profile completeness bar; multi-CV repository (upload, preview, set default); skills & languages display. |
| `applications` | `renderApplicationsScreen` | Candidate application history with interactive visual milestone tracker (`submitted` ➔ `under_review` ➔ `shortlisted` ➔ `interview_scheduled` ➔ `offer`/`hired`). |
| `saved` | `renderSavedJobsScreen` | Saved bookmarks for rapid access and application. |
| `inbox` | `renderInboxScreen` | Real-time dual-perspective chat threads; interview invitation action cards with confirmation buttons. |
| `recruiter-dashboard` | `renderRecruiterDashboard` | Hotel employer dashboard; metrics (Active Jobs, Applicants, Shortlisted, Interviews); active vacancies table with applicant count; + Post Vacancy CTA. |
| `ats` | `renderAtsScreen` | Applicant Tracking System pipeline; candidate filter by stage; resume view; screening answers viewer; stage progression dropdown; private recruiter notes; Schedule Interview modal. |
| `resources` | `renderResourcesScreen` | Hospitality training guides (Opera PMS, F&B service standards, HACCP food hygiene). |
| `admin` | `renderAdminScreen` | Platform root administrator console; live counts; candidate users management table; business employers table; job vacancy moderation; team member requests queue; business license verifications queue; 1-click demo reset. |

---

## 7. Backend REST API Surface (61 Endpoints)

### A. Authentication & Onboarding
- `POST /api/auth/login`: Authenticates candidate (email+pwd) or business (business_email + user_email + pwd). Automatically designates business sign-in as Admin.
- `POST /api/auth/check-business`: Checks if an official business email exists in the directory.
- `POST /api/auth/register-candidate`: Creates candidate user and initial `employee_profile`.
- `POST /api/auth/register-business`: Registers new business property, creates founding user as Admin, creates membership, generates trade license verification ticket.
- `POST /api/auth/register-business-user`: Creates team member account with `pending_admin_approval` status.
- `POST /api/auth/send-otp`: Generates and dispatches 6-digit OTP (returns demo OTP for mock testing).
- `POST /api/auth/verify-otp`: Validates 6-digit OTP.

### B. Hospitality Jobs & Directory
- `GET /api/jobs`: List and filter vacancies (department, location, property_type, experience, status).
- `POST /api/jobs`: Post a new vacancy (authorized business members).
- `GET /api/jobs/{job_id}`: Retrieve detailed job record.
- `PATCH /api/jobs/{job_id}/status`: Update job status (`active`, `paused`, `closed`).
- `GET /api/businesses`: List verified hotels and hospitality employers.
- `GET /api/businesses/{business_id}`: Hotel details, amenities, active jobs, departments.
- `POST /api/businesses/{business_id}/follow`: Toggle candidate following a hotel.

### C. Applications & ATS Pipeline
- `GET /api/applications`: Get applications filtered by `user_id` or `business_id`.
- `POST /api/applications`: Submit job application with selected CV, cover letter, and screening answers.
- `GET /api/applications/{app_id}/cv`: Retrieve attached CV filename and content.
- `PATCH /api/applications/{app_id}/status`: Transition applicant stage (`submitted`, `under_review`, `shortlisted`, `interview_scheduled`, `offer`, `hired`, `rejected`) and append audit event.

### D. Team & Membership Management
- `GET /api/business/members`: List team members of an establishment.
- `POST /api/business/members/{id}/approve`: Business Admin approves pending member.
- `POST /api/business/members/{id}/reject`: Business Admin rejects member request.
- `POST /api/business/members/{id}/promote-admin`: Transfer/grant Business Admin authority.

### E. Messaging & Notifications
- `GET /api/conversations`: List active message threads.
- `GET /api/conversations/{conv_id}/messages`: Fetch chat history.
- `POST /api/messages`: Send chat message or action prompt.
- `GET /api/notifications`: Retrieve user notification alerts.
- `POST /api/notifications/read-all`: Mark all alerts as read.

### F. Candidate Profile & Multi-CV Management
- `GET /api/profile`: Retrieve candidate profile details.
- `POST /api/profile/edit`: Update bio, education, skills, experience.
- `GET /api/profile/cvs`: List all uploaded CV documents for candidate.
- `POST /api/profile/cvs`: Upload/add a new tailored CV.
- `DELETE /api/profile/cvs/{cv_id}`: Delete a tailored CV.
- `PATCH /api/profile/cvs/{cv_id}/default`: Set designated default CV.

### G. Root Platform Administrator Console
- `GET /api/admin/overview`: Platform metrics summary (total candidates, business reps, properties, active jobs, pending verifications, pending moderators).
- `GET /api/admin/users`: All platform users with search, role filters, and status.
- `POST /api/admin/users/{user_id}/status`: Suspend or activate user account.
- `DELETE /api/admin/users/{user_id}`: Delete user record.
- `GET /api/admin/jobs-list`: All platform jobs with status and moderation controls.
- `POST /api/admin/jobs/{job_id}/status`: Pause, close, or activate job.
- `POST /api/admin/jobs/{job_id}/feature`: Toggle featured job status.
- `DELETE /api/admin/jobs/{job_id}`: Delete job listing.
- `GET /api/admin/businesses-list`: All registered businesses with verification status.
- `POST /api/admin/verify-business/{id}`: Directly verify an establishment.
- `GET /api/admin/verifications`: Trade license review queue.
- `POST /api/admin/verifications/{id}/review`: Approve or reject trade license document.
- `GET /api/admin/moderator-requests`: Global queue of team member join requests.
- `POST /api/admin/reset-demo`: Reset SQLite database to pristine demo seed data.

### H. Administrator Authentication & Complete Security Architecture
- **Login Endpoint**: `POST /api/admin/login` (payload: `{ email, password, master_key }`).
- **UI Architecture**: Ultra-minimalist interface containing solely 4 input elements:
  1. Email field (`id="admin-input-email"`)
  2. Password field (`id="admin-input-password"`)
  3. Master Key field (`id="admin-input-pin"`)
  4. Submit Button (`id="admin-submit-btn"` with label `"Login"`)
  - Zero extraneous text, zero headlines/subheadings, zero encryption disclosures, zero banners.
  - Zero fancy colors, glowing borders, or highlights; clean, neutral, sober platform surfaces.
  - Clean placeholders (`Email`, `Password`, `Master Key`) with no hardcoded prefilled credential strings.
- **Backend Security Architecture Specifications**:
  - **Multi-Factor Authentication**: Requires valid root administrator email, root password, and 2FA Master Token (`258330`).
  - **Brute-Force Rate Limiting Engine**: Per-IP and per-account in-memory tracker (`_admin_login_attempts`) enforcing a 5-attempt threshold. Sixth failure triggers an automated 60-second penalty lockout.
  - **Timing-Safe Role Validation**: Constant-time checks verifying `role == 'admin'`, completely preventing non-admin user access and stopping username enumeration.
  - **Cryptographic Session Token Issuance**: Root tokens generated via Python `secrets.token_hex(24)` (192-bit CSPRNG entropy).
  - **Immutable Audit Logging**: Every admin authorization attempt (success, bad credentials, lockout) is permanently recorded in `moderation_reports` with IP address, timestamp, and audit classification (`ADMIN_LOGIN_SUCCESS`, `ADMIN_LOGIN_BAD_CREDENTIALS`, `ADMIN_LOGIN_LOCKED_OUT`).
  - **Client & Server Route Guards**: Unauthenticated route hits to `#admin` redirect directly to `#admin-login`; all `/api/admin/*` endpoints enforce administrative session verification.
  - **Safe Session Termination**: `adminSignOut()` resets local session storage, revokes in-memory session token, clears `state.currentUser`, and redirects safely to the candidate/guest home screen.
  - **Default Administrator Credentials**:
    - Email: `admin@nicejobs.bd`
    - Password: `Password123!`
    - Master Key: `258330`

---

## 8. Database Schema & Relational Models (14 Tables)

1. `users`: System users (`id`, `name`, `email`, `phone`, `password`, `role`, `avatar_url`, `created_at`, `dob`, `designation`, `status`, `is_business_admin`).
2. `employee_profiles`: Hospitality candidate profile details (`user_id`, `headline`, `current_position`, `department`, `location`, `experience_years`, `recent_employer`, `summary`, `skills`, `languages`, `certifications`, `experience`, `education`, `preferences`, `cv_name`, `cv_url`, `dob`, `nid_passport`, `profile_completion`, `cv_list`).
3. `businesses`: Hotel & resort profiles (`id`, `legal_name`, `brand_name`, `property_type`, `star_rating`, `city`, `address`, `country`, `website`, `email`, `logo_url`, `cover_image`, `description`, `verification_status`, `verification_notes`, `departments`, `amenities`, `benefits`, `follower_count`, `parent_group`, `property_size`, `plot_number`, `road_number`, `thana_upazila`, `district`, `features`, `admin_user_id`).
4. `business_memberships`: User-to-hotel organizational links (`id`, `business_id`, `user_id`, `org_role`, `created_at`, `membership_role`, `approval_status`, `approved_by`, `approved_at`).
5. `jobs`: Hotel job postings (`id`, `business_id`, `title`, `department`, `property_location`, `employment_type`, `shift`, `salary_min`, `salary_max`, `salary_period`, `currency`, `service_charge_included`, `accommodation_provided`, `duty_meals_provided`, `experience_level`, `vacancies`, `description`, `requirements`, `screening_questions`, `status`, `is_urgent`, `is_featured`, `deadline`, `posted_at`, `applicant_count`).
6. `applications`: Candidate job applications (`id`, `job_id`, `user_id`, `status`, `applied_at`, `updated_at`, `cover_letter`, `selected_cv`, `screening_answers`, `recruiter_notes`, `interview_time`, `interview_notes`).
7. `application_events`: Audit trail for application state changes (`id`, `application_id`, `status`, `actor_name`, `note`, `timestamp`).
8. `conversations`: Messaging threads (`id`, `user_id`, `business_id`, `job_id`, `last_message`, `last_message_time`, `unread_for_user`, `unread_for_business`).
9. `messages`: Thread messages (`id`, `conversation_id`, `sender_id`, `sender_role`, `sender_name`, `content`, `is_action_prompt`, `timestamp`).
10. `saved_jobs`: Bookmarked jobs (`user_id`, `job_id`, `saved_at`).
11. `followed_businesses`: Hotel follow relationships (`user_id`, `business_id`, `followed_at`).
12. `notifications`: In-app notification cards (`id`, `user_id`, `title`, `message`, `type`, `link`, `is_read`, `timestamp`).
13. `business_verifications`: Trade license verification tickets (`id`, `business_id`, `legal_doc_type`, `doc_number`, `submitted_by`, `submitted_at`, `status`, `reviewed_at`, `reviewed_by`, `review_comments`, `issuing_authority`).
14. `otp_verifications`: OTP verification logs (`id`, `identifier`, `otp_code`, `purpose`, `created_at`, `verified`).
15. `email_logs`: Dispatched system emails audit trail (`id`, `recipient`, `subject`, `event_type`, `body_text`, `status`, `sent_at`).

---

## 9. Chronological Log of User Instructions & System Updates

| # | User Request / Instruction | System Implementation Details | Status |
| :---: | :--- | :--- | :---: |
| **1** | Build the website product based on `NiceJobs_Product_Scope_and_Workflows.docx`. | Implemented full full-stack web application with FastAPI backend, SQLite database, dynamic Vanilla JS SPA, and rich modern design. | ✅ Completed |
| **2** | Theme colors: Main theme Blue, sub-theme Orange and White. | Applied CSS custom variables with deep midnight navy surfaces, `#2563eb` primary blue, and `#f97316` vibrant orange accents. | ✅ Completed |
| **3** | Guest visitors cannot view candidates or candidate CVs. | Added role-based restrictions. Unauthenticated visitors are redirected to sign-in before accessing candidate data or applying. | ✅ Completed |
| **4** | Button label: Just write "Join/Sign up" in the signup button. | Updated site header navigation actions and home banner CTAs to display `"Join/Sign up"`. | ✅ Completed |
| **5** | Step-by-step onboarding for both candidate and business; different steps on clean screens. | Refactored auth flow into structured stages with seamless transitions and stage back buttons. | ✅ Completed |
| **6** | Remove unnecessary verbose writing across website; keep UI clean and user-friendly. | Streamlined card copy, eliminated walls of explanatory text, and added clean micro-badges. | ✅ Completed |
| **7** | Fixed `+88` prefix in front of mobile phone numbers across all forms (11-digit `01...`). | Built `.phone-input-wrapper` with immutable `+88` prefix chip and regex filtering restricting input to 11 digits starting with `01`. | ✅ Completed |
| **8** | Candidate Signup: PFP, Name, DOB, NID/Passport (optional), Cell, Email, Bio, CV upload, Education, Skills schema with search & custom chip addition, Languages, Previous Experience multi-entry (+ button), Password, OTP. | Implemented 4-stage candidate onboarding with multi-entry experience and education cards, and searchable skills schema. | ✅ Completed |
| **9** | Business Onboarding: Route Choice (New Business Account vs Add New User). | Created initial routing screen allowing users to pick between establishing a property or joining a team. | ✅ Completed |
| **10** | Route A: Business name, Legal name, Property type schema with search, Location segmentation (Plot, Road, Thana/Upazila, all 64 Bangladesh districts), Website, Official Email, Amenities schema with search, Representative details, Credentials, OTP, Pending verification with WhatsApp link (+880 1819-876543) and Trust desk email (`trust@nicejobs.bd`). | Implemented all 6 stages of New Business onboarding including the complete 64 districts array and direct Trust Desk contacts. | ✅ Completed |
| **11** | Route B: Check official business email against directory; match hotel card; enter personal work email + password; representative profile; OTP; notify Admin to approve. | Built complete team join flow with matched hotel overview card and admin approval queue. | ✅ Completed |
| **12** | Business Login 2-part flow: Part 1 official email check; Part 2 person work email + password. | Implemented 2-step verification in `#login` with automated directory check and unlisted business/user redirect cards. | ✅ Completed |
| **13** | Backend control: Platform Admin console to control posts, candidate users, business users, and moderation. | Implemented `/admin` console with live statistics, candidate table, business table, vacancies moderation, join requests queue, and trade license verification. | ✅ Completed |
| **14** | Fix JavaScript syntax error: `Expression expected. @[static/js/app.js:L3526]`. | Diagnosed duplicate snippet and corrupted closing tags between Route A Part 6 and Route B. Restored clean UTF-8 encoding and 0 balance errors. | ✅ Completed |
| **15** | Remove admin/moderator selecting option in business login. Default admin the person who is signing in on behalf of the business. | Removed all role choice selectors; set `biz_role_choice = 'admin'`; backend automatically designates the representative signing in on behalf of the business as `is_business_admin = true` and `membership_role = 'admin'` in database. | ✅ Completed |
| **16** | "Dont mention the parts in the continue button or any where. It was for your understanding." | Stripped all "Part 1", "Part 2", "Part 3", etc. labels from all continue buttons and subtitles across Candidate, Route A, and Route B forms. | ✅ Completed |
| **17** | Fix error when clicking "Verify and submit property registration". | Resolved backend `users.email` unique collision by re-using/updating existing business accounts, added `try...finally` database connection cleanup to eliminate SQLite locks, corrected OTP dispatch trigger to `targetStep === 5`, and routed final submit to verification screen (Step 6). | ✅ Completed |
| **18** | "Dont use emojis as icon. It will be childish. Keep it modern and clean." | Migrated entire platform away from childish text emojis to a modern vector SVG icon system (`svgIcon` helper) for navigation, search bars, inputs, eye toggles, perk chips, and communication pills. | ✅ Completed |
| **19** | "i thinks there are some bugs in app.js Check it" | Conducted exhaustive automated and static bug audit on `app.js`. Implemented missing `renderJobDetailScreen()` for deep linking (`/#job-details?id=...`); fixed hash routing param extraction for `#hotels?id=...`; eliminated invalid SVG markup inside `<option>` dropdowns; made job publisher modal hotel header dynamic; made `openConversationForJob()` query and bind matching conversation threads dynamically; attached `business_id` to `state.currentUser` upon property signup; added fallback routing in `switchAuthTab()`; removed reliance on deprecated global `event` in avatar selectors; enhanced `showToast()` with warning styling and CSS transitions. Validated via headless Chromium CDP automated test suite: 0 console errors and 0 exceptions. | ✅ Completed |
| **20** | "make the home page of candidate so that candidate are attracted to the jobs. Keep the search bar on the top. Then under the searchbar the posts will start." | Redesigned candidate homepage layout: placed search console directly at the top of the viewport with live trust counters (`500+ Active Roles`, `100% Direct Hotel HR`, `Zero Recruitment Fees`), title/location/department search, quick perks filter toggles, and 1-click popular category pills. Placed job vacancies feed directly underneath the search console with dynamic sorting (`Featured & Urgent`, `Highest Salary (BDT)`, `Newest First`). Redesigned job cards for maximum candidate attraction: prominent BDT salary badges (`৳50,000 – ৳70,000 / mo`), verified property badges, 5-star rating displays, luxury hospitality perks badges (Service Charge pool, accommodation, duty meals, medical), and primary `Apply Now →` CTA. Fixed `seed_data()` in `database.py` with explicit column schemas to seed 6 verified 5-star hotel vacancies. | ✅ Completed |
| **21** | "make the admin button in the bottom. make admin go to a admin login page. Where email of admin and password will be added. Make it as secure as possible" | Removed the Admin button from the top persona bar to prevent candidate/visitor exposure. Added a discreet, luxury "Admin Portal" button in the bottom footer. Created a dedicated Admin Login page (`#admin-login`) with Level 4 Root clearance branding, administrator work email input, root password input with show/hide toggle, and 2FA Master Token input. Built backend `POST /api/admin/login` with multi-layered security: IP/identity brute force rate-limiting (lockout after 5 failed attempts with 60s cooldown), role check (`role == 'admin'`), cryptographic session token generation (`secrets.token_hex(24)`), and automated security audit logging. Protected the `#admin` route with strict client- and server-side authentication guards, plus secure `adminSignOut()` flow. | ✅ Completed |
| **22** | "you dont have to say which type of encryption that you did for admin there will be simple email password master key And a login button Nothing else no writing in the admin login No fancy color or highlight Keep all the security system data and etc in the project workflow" | Redesigned Admin Login screen to absolute minimalist essentials: stripped all disclaimers, encryption technical notices, headers, and badges. Rendered solely Email input, Password input, Master Key input, and "Login" button with clean placeholders and no prefilled credential text. Removed glowing borders, accent strips, and highlights in favor of clean neutral platform styling. Preserved all backend security subsystems under the hood (multi-factor master token validation, 5-attempt brute-force rate limiter with 60-second lockout penalty, 192-bit CSPRNG session token issuance, and permanent immutable audit logging to `moderation_reports`). Documented complete security specifications, endpoints, and credentials directly in project workflow documentation. | ✅ Completed |
| **23** | "bring back the features above the search bar only for guest visitor. Remove quick filters and popular from bottom of the search bar. add designation beside department in the searchbar. Fix the message system, make is scroll able to see previous messages. Remove templates from the candidate messages. Make a system that will send mail to business when a person applies in their job. Also make system that will send notification to the canditate about their application update. Remove the number beside application in candidate view will show unseen notification. also make the number appear beside messages for unseen texts" | 1. **Hero Features Banner for Guests Only**: Rendered luxury features hero banner above search bar exclusively when browsing as guest visitor (`state.currentRole === 'guest' || !state.currentUser`). Logged-in candidates have searchbar positioned directly at the top of the screen.<br>2. **Searchbar Clean-Up**: Removed quick filters row (`#chk-filter-accom`, `#chk-filter-meals`, `#chk-filter-urgent`) and popular department category chips from underneath the search bar.<br>3. **Designation Selector in Searchbar**: Added `#select-search-desig` dropdown directly beside Department in the search bar row; added backend query filter `designation` in `@app.get("/api/jobs")`.<br>4. **Scrollable Chat Stream**: Refactored inbox chat flexbox hierarchy with `overflow-y: auto`, `min-height: 0`, and `max-height: 100%` on `.chat-stream-scroll`, custom scrollbar, and auto-scroll to latest message while enabling users to scroll up smoothly through full conversation history.<br>5. **Candidate Templates Removed**: Restricted `.chat-templates-shelf` strictly to recruiter role; candidates have a clean message thread and composer without recruiter canned responses.<br>6. **Business Email Notification on Application**: Added `dispatch_system_email()` and `email_logs` table to automatically notify business official email when candidates apply.<br>7. **Candidate Notification on Application Update**: Added candidate in-app unread notification and email dispatch when recruiters update application status.<br>8. **Dynamic Navigation Badges**: Removed static applied job count from `Applications`; replaced with real-time unseen notification count badge. Added unseen texts count badge to `Messages`. | ✅ Completed |
| **25** | "Remove candiate profile option in nav bar. Clicking the pfp and name part in the right will take you to profile. in profile add option to turn off and on open to work" | 1. **Removed Profile Link from Candidate Navigation Bar**: In `updateNavigation()` for `role === 'jobseeker'`, removed the text/tab link `<li class="nav-item"><a href="#profile">Profile</a></li>` from `#main-nav-links`. Nav bar strictly shows core candidate sections (`Jobs`, `Hotels`, `Applications`, `Saved`, `Messages`).<br>2. **PFP and Name Profile Navigation**: Enhanced right-hand `.user-profile-badge` with `id="nav-candidate-profile-badge"`, pointer cursor, interactive hover elevation, and direct `onclick="navigateTo('profile')"`. Clicking either candidate avatar or candidate name seamlessly navigates to `#profile`.<br>3. **Interactive Open to Work Toggle in Profile**: Added `toggleOpenToWork()` controller and bound to both the header action pill (`Open to Work: ON / OFF`) and a dedicated status panel card in `renderProfileScreen()`. When toggled, executes `PUT /api/profile` updating `open_to_work` in SQLite database (`employee_profiles.open_to_work`), updates UI status pills (`● Open to Work` vs `○ Not Looking for Work`), and displays instant toast notifications. Also integrated Open to Work checkbox into the full profile edit modal (`openComprehensiveEditProfileModal()`). | ✅ Completed |
| **26** | "Refactor the website's design theme to a modern, clean Dark Glassmorphism aesthetic. Apply strict design constraints: Primary Background #0a1128; Secondary Colors White and Orange; Glassmorphism UI components (translucent white rgba(255,255,255,0.03-0.07), crisp 1px border, backdrop blur 12-24px); Content & Layout Minimalism (drastically reduce copy, eliminate filler text, maximize negative space); match reference image (/home/NiceJobs/image.png)." | 1. **Complete Color Palette Overhaul**: Eliminated all residual blue elements (`#2563eb`, `#1d4ed8`, `#3b82f6`, `#93c5fd`, `#60a5fa`). Replaced with deep midnight blue (`#0a1128`), translucent white glass surfaces (`rgba(255, 255, 255, 0.035)`), crisp white borders (`rgba(255, 255, 255, 0.09)`), and high-contrast vibrant orange (`#ff6b00` / `#ff7a18`) focal points.<br>2. **Floating Pill Frosted-Glass Navigation**: Redesigned header as a floating pill capsule (`position: sticky; top: 16px; border-radius: 9999px; background: rgba(255, 255, 255, 0.04); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1)`). Replaced bulky icon with typographic `Nice<span class="logo-orange">Jobs</span>` logo, active orange underline bar indicator, circular glass search button, glass `Sign In` pill, and glowing orange `Get Started` CTA.<br>3. **Hero Section Aligned with Reference Image (`image.png`)**: Added `● Hospitality Employment Platform` pill chip with glowing orange dot; bold headline `Your Next Opportunity <span class="text-orange">Awaits</span>`; reduced hero copy; unified search capsule with dividers and circular orange `→` button; 3D perspective luxury hotel reception frame with brass bell visual and floating glass badge `Better Jobs / Bigger Dreams`; 4 frosted-glass bottom feature cards (`Find Jobs`, `Hire Talent`, `Grow Together`, `Premium Access`); and animated mouse scroll indicator (`Scroll to explore`).<br>4. **Global Glassmorphism UI Components**: Applied semi-transparent frosted-glass aesthetic (`backdrop-filter: blur(16px-24px)`) across all job vacancy cards, modals (`.modal-backdrop` & `.modal-dialog`), candidate profile console, and recruiter dashboard. Repaired CSS syntax ensuring 0 unclosed braces and 0 JavaScript errors. | ✅ Completed |
| **27** | "make the name NiceJobs to nicejobs.info all small letters; update it just in the navbar" | Updated `.brand-logo` link in the floating navigation header (`.site-header`) to render strictly as `nicejobs<span class="logo-orange">.info</span>` with `text-transform: lowercase;` in `styles.css`. Retained original metadata and platform naming elsewhere untouched per instructions. Verified via automated Chromium CDP screenshots. | ✅ Completed |
| **28** | "the cross icon is not showing properly" | Replaced raw text/unicode cross characters (`✕` and `×`) across all modal dialogs, CV list items, tag remove chips, and dynamic forms with clean, high-contrast vector SVG icons (`svgIcon('x', '', 18)`). Enhanced `.modal-close` in `styles.css` with dark glassmorphic styling (36px circular pill, `rgba(255,255,255,0.08)` surface, `1px solid rgba(255,255,255,0.15)` border, pure white icon stroke, and smooth 90° hover rotation). Verified via automated Chromium CDP screenshots. | ✅ Completed |
| **29** | "remove find jobs, hire talent, grow together, premium access segement from the guest view; in the right panel of the posts only keep sponsors; Bring back the blog system" | 1. **Removed Feature Cards from Guest View**: Completely removed the 4-card frosted glass grid (`.feature-glass-grid`: `Find Jobs`, `Hire Talent`, `Grow Together`, `Premium Access`) from `renderHomeScreen()` in guest view, allowing the 3D perspective concierge frame to flow directly into the scroll indicator and vacancies feed.<br>2. **Posts Right Panel Exclusively Sponsors**: Refactored the right sidebar `<aside class="sidebar-area">` on the posts feed to strictly keep **only sponsors**; removed the "Verified Positions / Direct Hotel HR" card and the "Top Hiring Hotels" mini-list. Implemented two high-contrast Dark Glassmorphic sponsored cards (`Swiss Hospitality Management & AHLEI Certification` and `Marriott South Asia Fast-Track`) with `SPONSORED` badges.<br>3. **Full Hospitality Blog System Restored**: Built end-to-end blog architecture featuring SQLite `blogs` table with 4 rich seed articles, backend endpoints `GET /api/blogs` and `GET /api/blogs/{blog_id}`, Dark Glassmorphic blog hub (`#blog`) with category pills, live keyword search, featured hero insight card, 3-column article grid, and full-screen reading modal with vector SVG close button `${svgIcon('x', '', 18)}`. Added `Blog` tab to navigation for all personas. | ✅ Completed |
| **30** | "replace the picture inithe guest home page with bell_image.png" | Placed `Bell_img.png` into `static/images/bell_image.png` and updated the guest home page hero perspective card in `static/js/app.js` to render `/static/images/bell_image.png` (luxury concierge brass service bell on polished dark marble with ambient warm lighting). Verified via automated Chromium screenshot. | ✅ Completed |
| **31** | "remove the better jobs segment from the guest view homepage" | Removed the floating frosted-glass badge (`.perspective-floating-badge` containing "Better Jobs / Bigger Dreams" with briefcase icon) from the 3D perspective hero visual frame in `static/js/app.js`. The luxury concierge service bell (`bell_image.png`) is now displayed completely unobstructed within the 3D perspective card. Verified via automated Chromium screenshot. | ✅ Completed |
| **32** | "create a repository in github, Upload it to the git hub" | Configured `.gitignore` and `requirements.txt`, crafted a comprehensive professional `README.md` with badges, architecture overview, setup guide, and credentials. Initialized Git repository, committed codebase, created public GitHub repository `Toq33/NiceJobs` via GitHub CLI (`gh repo create NiceJobs --public`), and pushed all code to the `main` branch. Verified remote synchronization. | ✅ Completed |
| **33** | "make the website responsive and update in the github" | Implemented a comprehensive Dark Glassmorphism responsive design system across all breakpoints (1024px, 900px, 768px, 640px, 480px). Added a responsive animated mobile menu toggle button and sliding glass drawer in the header with full persona-aware navigation; stacked guest hero search capsule into a luxury touch-friendly card; added auto-scaling to concierge visual; made top persona switcher wrap seamlessly; added mobile-optimized single-column card grids, bottom-sheet modal views, and overflow-x prevention guards. Verified across mobile (375px), tablet (768px), and desktop (1440px) via automated CDP screenshots. Committed and pushed all updates to GitHub `origin main`. | ✅ Completed |
| **34** | "im gonna deply it using vercel what to add? when i deploy it using github it gives 404 error" | Resolved Vercel deployment 404 error by adding `vercel.json` rewrite configuration (`/(.*)` -> `/api/index.py`) and `api/index.py` serverless entry point exposing FastAPI `app`. Added Vercel environment detection in `database.py` with dynamic `/tmp/nicejobs.db` copying to prevent SQLite read-only filesystem exceptions on serverless lambdas. Updated `README.md` with 1-click Vercel deployment steps. Pushed all fixes to GitHub `origin main`. | ✅ Completed |

---


## 10. Guidelines for Future AI Conversations

When continuing work on the NiceJobs repository in any new conversation:
1. **Do not run `git` commands** in terminal if the user has requested no git commands.
2. **Never use emojis as icons**: Always use the `svgIcon(name, customClass, size)` vector SVG system to maintain an elegant, modern, luxury design aesthetic.
3. **Preserve the Dark Glassmorphism Design Theme**:
   - Primary Background: `#0a1128` (deep midnight blue).
   - Secondary Colors: White (`#ffffff`) for text, borders, and UI surfaces; Orange (`#ff6b00`) sparingly for high-contrast focal points, active states, and primary CTAs.
   - Glassmorphism: Translucent white surfaces (`rgba(255, 255, 255, 0.035)`), crisp 1px borders (`rgba(255, 255, 255, 0.09)`), and backdrop blurs (`backdrop-filter: blur(16px)`).
   - Zero Blue Theme Elements: Do not re-introduce legacy blue colors (`#2563eb`, `#1d4ed8`, `#93c5fd`).
   - Content Minimalism: Keep copy ultra-clean, eliminate filler text, and maximize negative space.
4. **Preserve Floating Pill Header & Nav Bar**:
   - Maintain the floating pill frosted capsule header with pure typographic `NiceJobs` logo, active orange underline, and circular glass buttons.
   - Candidate navigation must not contain a standalone "Profile" text link; profile navigation is exclusively triggered via the clickable user badge (avatar + name) on the right.
5. **Preserve the `+88` phone prefix rule**: Mobile inputs must enforce the fixed `+88` badge with an 11-digit `01...` numerical pattern.
6. **Preserve Business Administrator by Default**: Any person registering a business or signing in on behalf of a business is designated as a **Business Administrator** (`is_business_admin: true`). Do not add back an admin vs moderator selection radio or dropdown.
7. **Preserve Clean Navigation Labels**: Do not re-introduce "Part 1", "Part 2", "Part 3", etc. in buttons or headers; keep them clean (e.g. `Continue →`, `Verify Business Email →`).
8. **Preserve All 64 Districts of Bangladesh**: The location schema in New Business registration must always retain the full 64 districts array in [static/js/app.js](file:///home/dexter/NiceJobs/static/js/app.js).
9. **Maintain Demo OTP Functionality**: Demo code `258330` is configured across backend and frontend for rapid demonstration and testing without external SMS/SMTP gateways.
10. **Preserve Minimalist Admin Login UI**: Keep the `#admin-login` screen ultra-simple with only Email, Password, Master Key, and Login button. Do not add encryption labels, badges, or fancy glowing highlights.
11. **Preserve Structured Job Post Schema & 16 Hotel Departments**: In `#modal-create-job`, always maintain the salary toggle (`Range` vs `Negotiable`), educational multi-select schema with field of study trigger for higher degrees, 80+ hotel skills schema with live search and custom skill appending, experience selector, and the 16 standard hotel departments (`HOTEL_ALL_DEPARTMENTS`). Do not add back freeform requirements textarea or perks checkboxes to the job posting modal.
12. **Preserve Interactive Open to Work Toggle**: Preserve the toggle button and status panel in `#profile` with persistent SQLite database updates via `PUT /api/profile`.




