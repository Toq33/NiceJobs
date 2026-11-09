import unittest
from fastapi.testclient import TestClient
from app import app
import database

class TestNiceJobsAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        try:
            from scripts.cleanup_test_data import cleanup_test_data
            cleanup_test_data(dry_run=False)
        except Exception as e:
            print(f"tearDownClass cleanup notice: {e}")

    def test_health_check(self):
        """Verifies health check endpoint returns 200 and ok status."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertIn("timestamp", data)

    def test_readiness_check(self):
        """Verifies readiness probe endpoint."""
        response = self.client.get("/api/ready")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("status"), "ready")

    def test_get_jobs_feed(self):
        """Verifies jobs endpoint returns active job listings."""
        response = self.client.get("/api/jobs")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        if len(data) > 0:
            first_job = data[0]
            self.assertIn("title", first_job)
            self.assertIn("brand_name", first_job)
            self.assertIn("department", first_job)

    def test_get_blogs(self):
        """Verifies blogs endpoint returns published hospitality articles."""
        response = self.client.get("/api/blogs")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        if len(data) > 0:
            first_blog = data[0]
            self.assertIn("title", first_blog)
            self.assertIn("category", first_blog)

    def test_check_candidate_availability(self):
        """Verifies candidate availability checking endpoint."""
        response = self.client.post("/api/auth/check-candidate-availability", json={
            "email": "test_unique_email_12345@example.com",
            "phone": "+8801700000000"
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("available", data)

    def test_check_business_availability(self):
        """Verifies business availability checking endpoint."""
        response = self.client.post("/api/auth/check-business-availability", json={
            "brand_name": "Unique Test Hotel Resort",
            "business_email": "reservations@uniquetesthotel.bd"
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("available", data)

    def test_admin_login_invalid_credentials(self):
        """Verifies admin login rejects invalid credentials with 401."""
        response = self.client.post("/api/admin/login", json={
            "email": "wrong_admin@nicejobs.info",
            "password": "wrong_password",
            "master_key": "wrong_key"
        })
        self.assertEqual(response.status_code, 401)

    def test_cv_storage_and_application_sharing(self):
        """Verifies uploaded CV is saved in DB and shared with business upon job application."""
        import database
        import uuid
        sample_cv_b64 = "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZ...TEST_CV_DATA"
        
        # Ensure a test candidate exists
        unique_suffix = uuid.uuid4().hex[:6]
        test_user_id = f"user_test_cv_{unique_suffix}"
        app_id = None
        try:
            conn = database.get_db()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO users (id, name, email, phone, role, status)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (test_user_id, "Test Candidate CV", f"test_cv_{unique_suffix}@example.com", f"01711{unique_suffix[:6]}", "jobseeker", "active"))
            cursor.execute("""
                INSERT INTO employee_profiles (user_id, headline, cv_list, cv_url)
                VALUES (?, ?, ?, ?)
            """, (test_user_id, "Front Desk Professional", "[]", ""))
            cursor.execute("SELECT id FROM jobs LIMIT 1")
            job_row = cursor.fetchone()
            job_id = job_row["id"] if job_row else "job_fo_sup"
            conn.commit()
            conn.close()

            # 1. Upload/Add a CV to profile
            upload_resp = self.client.post("/api/profile/cvs", json={
                "user_id": test_user_id,
                "title": "Front Office Specialist Executive CV",
                "name": "Candidate_Front_Office_CV.pdf",
                "size": "210 KB",
                "is_default": True,
                "file_data": sample_cv_b64
            })
            self.assertEqual(upload_resp.status_code, 200)
            upload_data = upload_resp.json()
            self.assertTrue(upload_data.get("success"))
            
            # 2. Check profile returns the uploaded CV with file_data
            prof_resp = self.client.get(f"/api/profile?user_id={test_user_id}")
            self.assertEqual(prof_resp.status_code, 200)
            prof_data = prof_resp.json()
            cv_names = [c["name"] for c in prof_data.get("cv_list", [])]
            self.assertIn("Candidate_Front_Office_CV.pdf", cv_names)
            self.assertEqual(prof_data.get("cv_url"), sample_cv_b64)

            # 3. Submit an application with this CV
            app_resp = self.client.post("/api/applications", json={
                "job_id": job_id,
                "user_id": test_user_id,
                "cover_letter": "Application with real uploaded CV document.",
                "selected_cv": "Candidate_Front_Office_CV.pdf",
                "selected_cv_url": sample_cv_b64
            })
            self.assertEqual(app_resp.status_code, 200)
            app_data = app_resp.json()
            app_id = app_data.get("application_id")

            # 4. Check the application CV endpoint as recruiter/admin
            app_cv_resp = self.client.get(f"/api/applications/{app_id}/cv?viewer_role=admin")
            self.assertEqual(app_cv_resp.status_code, 200)
            app_cv_data = app_cv_resp.json()
            self.assertEqual(app_cv_data.get("selected_cv_url"), sample_cv_b64)
            self.assertEqual(app_cv_data.get("cv_url"), sample_cv_b64)
            self.assertEqual(app_cv_data.get("selected_cv"), "Candidate_Front_Office_CV.pdf")
        finally:
            conn = database.get_db()
            cursor = conn.cursor()
            if app_id:
                cursor.execute("DELETE FROM application_events WHERE application_id = ?", (app_id,))
                cursor.execute("DELETE FROM applications WHERE id = ?", (app_id,))
            cursor.execute("DELETE FROM notifications WHERE user_id = ?", (test_user_id,))
            cursor.execute("DELETE FROM employee_profiles WHERE user_id = ?", (test_user_id,))
            cursor.execute("DELETE FROM users WHERE id = ?", (test_user_id,))
            conn.commit()
            conn.close()

    def test_blog_posting_admin_approval_and_db_storage(self):
        """Verifies silent admin approval required to post blogs, blog storage, and inline images."""
        import uuid
        uid = f"user_blog_{uuid.uuid4().hex[:6]}"
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (id, name, email, phone, role, status, can_post_blog)
            VALUES (?, ?, ?, ?, 'jobseeker', 'active', 0)
        """, (uid, "Author Candidate", f"{uid}@example.com", f"017{uuid.uuid4().hex[:8]}"))
        conn.commit()
        conn.close()

        # 1. Unapproved user attempt should be 403 Forbidden
        denied_resp = self.client.post("/api/blogs", json={
            "title": "Unapproved Blog Post Attempt",
            "content": "This post should be rejected without admin permission.",
            "author_id": uid
        })
        self.assertEqual(denied_resp.status_code, 403)

        # 2. Admin approves user for blog posting (silent approval)
        perm_resp = self.client.post(f"/api/admin/users/{uid}/blog-permission", json={
            "can_post_blog": True
        })
        self.assertEqual(perm_resp.status_code, 200)
        self.assertTrue(perm_resp.json().get("can_post_blog"))

        # 3. User can now successfully publish blog containing text and images
        post_resp = self.client.post("/api/blogs", json={
            "title": "5-Star Butler Service Protocols",
            "category": "Hotel Standards",
            "content": "## Core Standards\n\nPrecision service delivery is essential.\n\n![Butler Prep Table](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)\n\nMaintain meticulous guest confidentiality at all times.",
            "cover_image": "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200",
            "tags": ["Butler", "SOP", "Luxury"],
            "author_id": uid
        })
        self.assertEqual(post_resp.status_code, 200)
        post_data = post_resp.json()
        self.assertTrue(post_data.get("success"))
        created_blog = post_data.get("blog")
        blog_id = created_blog.get("id")
        self.assertEqual(created_blog.get("title"), "5-Star Butler Service Protocols")
        self.assertIn("Butler Prep Table", created_blog.get("content"))

        # 4. Check blog is retrieved from DB via GET /api/blogs/{blog_id}
        get_resp = self.client.get(f"/api/blogs/{blog_id}")
        self.assertEqual(get_resp.status_code, 200)
        blog_data = get_resp.json()
        self.assertEqual(blog_data.get("id"), blog_id)
        self.assertEqual(blog_data.get("author_id"), uid)
        self.assertIn("Butler Prep Table", blog_data.get("content"))

        # Cleanup
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM blogs WHERE id = ?", (blog_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (uid,))
        conn.commit()
        conn.close()

    def test_candidate_signup_designation_and_profile(self):
        """Verifies candidate registration saves designation and displays it in profile."""
        import database
        import uuid
        from datetime import datetime

        unique_id = uuid.uuid4().hex[:6]
        test_email = f"test_cand_{unique_id}@example.bd"
        test_phone = f"+88017{unique_id[:8]}"
        otp_code = "258330"

        conn = database.get_db()
        cursor = conn.cursor()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            INSERT INTO otp_verifications (id, identifier, otp_code, purpose, created_at, verified)
            VALUES (?, ?, ?, 'candidate_signup', ?, 0)
        """, (f"otp_{unique_id}", test_email, otp_code, now))
        conn.commit()
        conn.close()

        reg_resp = self.client.post("/api/auth/register-candidate", json={
            "name": "Test Candidate",
            "email": test_email,
            "phone": test_phone,
            "password": "Password123!",
            "otp_code": otp_code,
            "department": "Front Office & Guest Services",
            "designation": "Night Auditor",
            "current_position": "Night Auditor"
        })
        self.assertEqual(reg_resp.status_code, 200, f"Registration failed: {reg_resp.text}")
        cand_id = reg_resp.json().get("user_id")
        self.assertTrue(cand_id)

        # Verify profile has designation
        prof_resp = self.client.get(f"/api/profile?user_id={cand_id}")
        self.assertEqual(prof_resp.status_code, 200)
        prof_data = prof_resp.json()
        self.assertEqual(prof_data.get("designation"), "Night Auditor")
        self.assertEqual(prof_data.get("current_position"), "Night Auditor")

        # Cleanup
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM employee_profiles WHERE user_id = ?", (cand_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (cand_id,))
        cursor.execute("DELETE FROM otp_verifications WHERE id = ?", (f"otp_{unique_id}",))
        conn.commit()
        conn.close()

    def test_admin_delete_user_cascade_and_protection(self):
        """Verifies deleting user via /api/admin/users/{user_id} cascades child records and root admin is protected."""
        # 1. Protect root admin
        del_admin_resp = self.client.delete("/api/admin/users/user_admin")
        self.assertEqual(del_admin_resp.status_code, 400)

        # 2. Create a test candidate with profile and notification
        import time
        unique_id = int(time.time() * 1000)
        test_uid = f"user_del_{unique_id}"
        test_email = f"del_user_{unique_id}@hospitalitytest.bd"

        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (id, name, email, role, phone, status, created_at)
            VALUES (?, ?, ?, 'jobseeker', '01700000000', 'active', '2026-10-31 12:00:00')
        """, (test_uid, "Delete Me Candidate", test_email))
        cursor.execute("""
            INSERT INTO employee_profiles (user_id, headline, location)
            VALUES (?, 'Concierge Associate', 'Dhaka')
        """, (test_uid,))
        cursor.execute("""
            INSERT INTO notifications (id, user_id, title, message, type, timestamp)
            VALUES (?, ?, 'Welcome', 'Welcome to NiceJobs', 'system', '2026-10-31 12:00:00')
        """, (f"notif_{unique_id}", test_uid))
        conn.commit()
        conn.close()

        # 3. Call admin delete endpoint
        del_resp = self.client.delete(f"/api/admin/users/{test_uid}")
        self.assertEqual(del_resp.status_code, 200)
        self.assertTrue(del_resp.json().get("success"))

        # 4. Verify user and child records are deleted
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) as count FROM users WHERE id = ?", (test_uid,))
        self.assertEqual(cursor.fetchone()["count"], 0)
        cursor.execute("SELECT count(*) as count FROM employee_profiles WHERE user_id = ?", (test_uid,))
        self.assertEqual(cursor.fetchone()["count"], 0)
        cursor.execute("SELECT count(*) as count FROM notifications WHERE user_id = ?", (test_uid,))
        self.assertEqual(cursor.fetchone()["count"], 0)
        conn.close()

    def test_get_candidates_open_to_work(self):
        """Verifies businesses can discover candidates who have Open to Work enabled."""
        # 1. Fetch all open to work candidates
        response = self.client.get("/api/candidates?open_to_work=true")
        self.assertEqual(response.status_code, 200)
        candidates = response.json()
        self.assertIsInstance(candidates, list)
        self.assertGreater(len(candidates), 0)

        # Verify attributes on candidates
        first_candidate = candidates[0]
        self.assertIn("name", first_candidate)
        self.assertIn("email", first_candidate)
        self.assertIn("open_to_work", first_candidate)
        self.assertEqual(first_candidate["open_to_work"], 1)
        self.assertIn("salary_preference", first_candidate)
        self.assertIn("experience_years_hotel", first_candidate)
        self.assertIn("experience_years_department", first_candidate)
        self.assertIsNone(first_candidate.get("email"))
        self.assertIsNone(first_candidate.get("phone"))

        # 2. Search by query filter: designation or job title
        q_term = "Manager"
        q_response = self.client.get(f"/api/candidates?open_to_work=true&q={q_term}")
        self.assertEqual(q_response.status_code, 200)
        q_candidates = q_response.json()
        self.assertIsInstance(q_candidates, list)
        self.assertGreater(len(q_candidates), 0)
        for c in q_candidates:
            matches = any(q_term.lower() in str(v).lower() for v in [
                c.get("headline"), c.get("current_position"), 
                c.get("designation"), c.get("preferences")
            ])
            self.assertTrue(matches)

        # 3. Verify hotels CANNOT search candidate by personal name
        name_search_res = self.client.get("/api/candidates?open_to_work=true&q=Rahim")
        self.assertEqual(name_search_res.status_code, 200)
        name_candidates = name_search_res.json()
        self.assertEqual(len(name_candidates), 0)

    def test_candidate_onboarding_lifecycle(self):
        """Verifies candidate onboarding sequence: Register (OTP) -> Terms -> Profile -> Normal Access."""
        import time
        unique_id = int(time.time() * 1000)
        test_email = f"onboard_{unique_id}@hospitalitycandidate.bd"
        test_phone = f"017{str(unique_id)[-8:]}"
        otp_code = "258330" # Demo OTP

        # 1. Register candidate via OTP (Step 1-3)
        reg_resp = self.client.post("/api/auth/register-candidate", json={
            "name": "Mahmudur Rahman",
            "email": test_email,
            "phone": test_phone,
            "password": "Password123!",
            "otp_code": otp_code,
            "dob": "1995-05-12",
            "nid_passport": "19951234567890"
        })
        self.assertEqual(reg_resp.status_code, 200, f"Registration failed: {reg_resp.text}")
        cand_data = reg_resp.json()
        cand_id = cand_data.get("user_id")
        self.assertTrue(cand_id)
        self.assertEqual(cand_data.get("terms_accepted"), 0)
        self.assertEqual(cand_data.get("profile_completed"), 0)
        self.assertEqual(cand_data.get("onboarding_status"), "terms_pending")

        # 2. Applying for a job should be rejected (403 Forbidden) while onboarding is incomplete
        apply_resp = self.client.post("/api/applications", json={
            "job_id": "job_front_desk_radisson",
            "user_id": cand_id,
            "cover_letter": "I would like to apply."
        })
        self.assertEqual(apply_resp.status_code, 403)
        self.assertIn("Terms & Conditions", apply_resp.json().get("detail", ""))

        # 3. Accept Terms & Conditions (Step 4)
        terms_resp = self.client.post("/api/auth/accept-terms", json={
            "user_id": cand_id
        })
        self.assertEqual(terms_resp.status_code, 200)
        terms_data = terms_resp.json()
        self.assertEqual(terms_data.get("terms_accepted"), 1)
        self.assertEqual(terms_data.get("onboarding_status"), "profile_pending")

        # 4. Applying should still be rejected because profile is not yet completed
        apply_resp2 = self.client.post("/api/applications", json={
            "job_id": "job_front_desk_radisson",
            "user_id": cand_id,
            "cover_letter": "I would like to apply."
        })
        self.assertEqual(apply_resp2.status_code, 403)
        self.assertIn("profile", apply_resp2.json().get("detail", ""))

        # 5. Complete Profile (Step 5)
        prof_resp = self.client.post("/api/auth/complete-profile", json={
            "user_id": cand_id,
            "bio": "Experienced guest relations associate with 3 years in 5-star properties.",
            "designation": "Guest Relations Officer",
            "department": "Front Office",
            "location": "Dhaka",
            "expected_salary": "BDT 45,000",
            "skills": ["Opera PMS 5.5", "Guest Relations", "VIP Handling"],
            "education": [{"institution": "Dhaka University", "degree": "BBA in Tourism", "gpa": "3.8"}],
            "experience": [{"company": "Radisson Blu Dhaka", "role": "Front Desk Agent", "worked_years": "2"}]
        })
        self.assertEqual(prof_resp.status_code, 200)
        prof_data = prof_resp.json()
        self.assertEqual(prof_data.get("profile_completed"), 1)
        self.assertEqual(prof_data.get("onboarding_status"), "completed")

        # 6. Verify status via /api/auth/onboarding-status
        status_resp = self.client.get(f"/api/auth/onboarding-status?user_id={cand_id}")
        self.assertEqual(status_resp.status_code, 200)
        status_data = status_resp.json()
        self.assertEqual(status_data.get("terms_accepted"), 1)
        self.assertEqual(status_data.get("profile_completed"), 1)
        self.assertEqual(status_data.get("onboarding_status"), "completed")
        self.assertEqual(status_data.get("bio"), "Experienced guest relations associate with 3 years in 5-star properties.")

        # 7. Verify login returns updated onboarding attributes
        login_resp = self.client.post("/api/auth/login", json={
            "email": test_email,
            "password": "Password123!",
            "role": "jobseeker"
        })
        self.assertEqual(login_resp.status_code, 200)
        login_user = login_resp.json().get("user", {})
        self.assertEqual(login_user.get("terms_accepted"), 1)
        self.assertEqual(login_user.get("profile_completed"), 1)
        self.assertEqual(login_user.get("onboarding_status"), "completed")

        # Cleanup
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM employee_profiles WHERE user_id = ?", (cand_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (cand_id,))
        conn.commit()
        conn.close()

    def test_job_post_benefits_explicit_and_empty_isolation(self):
        """Verifies job post benefits: only user-inputted benefits appear, and empty benefits are NOT auto-injected."""
        import database
        import uuid

        suffix = uuid.uuid4().hex[:6]
        biz_id = f"biz_test_{suffix}"
        user_id = f"user_biz_test_{suffix}"

        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO businesses (id, legal_name, brand_name, property_type, verification_status, city, address)
            VALUES (?, ?, ?, ?, 'verified', 'Dhaka', 'Gulshan 2, Dhaka')
        """, (biz_id, f"Test Hospitality {suffix}", f"Test Resort {suffix}", "Luxury Hotel"))
        cursor.execute("""
            INSERT INTO users (id, name, email, phone, role, status, is_business_admin)
            VALUES (?, ?, ?, ?, 'recruiter', 'active', 1)
        """, (user_id, "Test Recruiter", f"rec_{suffix}@test.com", f"01711{suffix[:6]}"))
        cursor.execute("""
            INSERT INTO business_memberships (id, business_id, user_id, org_role, approval_status)
            VALUES (?, ?, ?, 'HR Director', 'approved')
        """, (f"mem_{suffix}", biz_id, user_id))
        conn.commit()
        conn.close()

        # 1. Create Job with custom benefits
        custom_benefits = ["Festival Bonus (2x Yearly)", "Daily Cash Tips / Gratuity Payout"]
        resp1 = self.client.post("/api/jobs", json={
            "business_id": biz_id,
            "title": "Front Desk Associate",
            "department": "Front Office",
            "property_location": "Gulshan 2, Dhaka",
            "shift": "Morning Shift",
            "employment_type": "Full-time",
            "experience_level": "1-2 Years",
            "description": "Handle VIP guest arrivals and check-ins.",
            "benefits": custom_benefits,
            "deadline": "2026-12-31"
        })
        self.assertEqual(resp1.status_code, 200)
        job1_id = resp1.json()["job_id"]

        # 2. Create Job with NO benefits
        resp2 = self.client.post("/api/jobs", json={
            "business_id": biz_id,
            "title": "Night Auditor",
            "department": "Finance & Accounts",
            "property_location": "Gulshan 2, Dhaka",
            "shift": "Night Shift",
            "employment_type": "Full-time",
            "experience_level": "3-5 Years",
            "description": "Audit daily revenue and register guest accounts.",
            "benefits": [],
            "deadline": "2026-12-31"
        })
        self.assertEqual(resp2.status_code, 200)
        job2_id = resp2.json()["job_id"]

        # 3. Retrieve Job 1 detail: MUST only have the 2 explicit benefits
        detail1 = self.client.get(f"/api/jobs/{job1_id}").json()
        self.assertEqual(detail1["benefits"], custom_benefits)
        self.assertNotIn("Comprehensive Health & Medical Insurance", detail1["benefits"])

        # 4. Retrieve Job 2 detail: MUST be empty list, NO auto-injected benefits
        detail2 = self.client.get(f"/api/jobs/{job2_id}").json()
        self.assertEqual(detail2["benefits"], [])
        self.assertNotIn("Comprehensive Health & Medical Insurance", detail2["benefits"])

        # 5. Retrieve Jobs Feed: Job 2 must remain empty list
        feed_resp = self.client.get("/api/jobs")
        self.assertEqual(feed_resp.status_code, 200)
        feed_jobs = {j["id"]: j for j in feed_resp.json()}
        if job2_id in feed_jobs:
            self.assertEqual(feed_jobs[job2_id]["benefits"], [])
        if job1_id in feed_jobs:
            self.assertEqual(feed_jobs[job1_id]["benefits"], custom_benefits)

        # Cleanup
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM jobs WHERE id IN (?, ?)", (job1_id, job2_id))
        cursor.execute("DELETE FROM business_memberships WHERE business_id = ?", (biz_id,))
        cursor.execute("DELETE FROM businesses WHERE id = ?", (biz_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()

    def test_candidate_profile_unentered_data_not_injected(self):
        """Verifies candidate profile has no dummy/unentered data injected by the system."""
        import database
        import uuid

        suffix = uuid.uuid4().hex[:6]
        user_id = f"user_cand_{suffix}"
        test_email = f"clean_cand_{suffix}@test.com"

        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (id, name, email, phone, role, status, terms_accepted, profile_completed)
            VALUES (?, ?, ?, ?, 'jobseeker', 'active', 1, 1)
        """, (user_id, "Clean Candidate", test_email, f"01712{suffix[:6]}"))
        cursor.execute("""
            INSERT INTO employee_profiles (user_id, headline, summary, location, preferences, skills, education, experience)
            VALUES (?, '', '', '', '{}', '[]', '[]', '[]')
        """, (user_id,))
        conn.commit()
        conn.close()

        # Retrieve profile
        prof_resp = self.client.get(f"/api/profile?user_id={user_id}")
        self.assertEqual(prof_resp.status_code, 200)
        prof = prof_resp.json()

        # Verify no fake dummy fallbacks are present
        self.assertEqual(prof.get("department", ""), "")
        self.assertEqual(prof.get("phone_secondary", ""), "")
        self.assertEqual(prof.get("location", ""), "")
        self.assertNotEqual(prof.get("department"), "Front Office & Guest Services")
        self.assertNotEqual(prof.get("location"), "Dhaka, Bangladesh")

        # Cleanup
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM employee_profiles WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()

    def test_pipeline_status_update_and_interview_response_flow(self):
        """Verifies candidate notification on pipeline change, interview scheduling, and candidate accept/reschedule replies."""
        import database
        import uuid

        suffix = uuid.uuid4().hex[:6]
        recruiter_id = f"user_rec_{suffix}"
        biz_id = f"biz_{suffix}"
        candidate_id = f"user_cand_{suffix}"
        job_id = f"job_{suffix}"
        app_id = f"app_{suffix}"

        conn = database.get_db()
        cursor = conn.cursor()

        # Create recruiter & business
        cursor.execute("""
            INSERT INTO users (id, name, email, phone, role, status, terms_accepted, profile_completed)
            VALUES (?, ?, ?, ?, 'recruiter', 'active', 1, 1)
        """, (recruiter_id, "Hotel Recruiter", f"rec_{suffix}@hotel.com", f"01711{suffix[:6]}"))

        cursor.execute("""
            INSERT INTO businesses (id, brand_name, legal_name, property_type, district, city, address, admin_user_id, verification_status)
            VALUES (?, ?, ?, '5_star_hotel', 'Dhaka', 'Dhaka', 'Gulshan 2', ?, 'verified')
        """, (biz_id, f"Grand Hotel {suffix}", f"Grand Corp {suffix}", recruiter_id))

        cursor.execute("""
            INSERT INTO business_memberships (id, business_id, user_id, org_role, membership_role, approval_status)
            VALUES (?, ?, ?, 'HR Director', 'admin', 'approved')
        """, (f"mem_{suffix}", biz_id, recruiter_id))

        # Create candidate
        cursor.execute("""
            INSERT INTO users (id, name, email, phone, role, status, terms_accepted, profile_completed)
            VALUES (?, ?, ?, ?, 'jobseeker', 'active', 1, 1)
        """, (candidate_id, "Candidate User", f"cand_{suffix}@test.com", f"01811{suffix[:6]}"))

        conn.commit()
        conn.close()

        # Create job via API
        job_resp = self.client.post("/api/jobs", json={
            "business_id": biz_id,
            "title": "Front Desk Executive",
            "department": "Front Office",
            "property_location": "Gulshan 2, Dhaka",
            "shift": "Morning Shift",
            "employment_type": "Full-time",
            "experience_level": "1-3 Years",
            "description": "Handle guest check-ins.",
            "benefits": [],
            "deadline": "2026-12-31"
        })
        self.assertEqual(job_resp.status_code, 200)
        job_id = job_resp.json()["job_id"]

        conn = database.get_db()
        cursor = conn.cursor()

        # Create application
        cursor.execute("""
            INSERT INTO applications (id, job_id, user_id, status, applied_at, updated_at, selected_cv)
            VALUES (?, ?, ?, 'under_review', '2026-11-07 10:15', '2026-11-07 10:15', 'Candidate_Resume.pdf')
        """, (app_id, job_id, candidate_id))

        conn.commit()
        conn.close()

        # 1. Recruiter updates pipeline status to Interview Scheduled
        status_payload = {
            "status": "interview_scheduled",
            "interview_time": "Next Sunday at 02:30 PM",
            "interview_notes": "2nd Floor Executive HR Office",
            "recruiter_notes": "Strong front office background",
            "actor_name": "Hotel Recruiter"
        }
        res = self.client.post(f"/api/applications/{app_id}/status", json=status_payload)
        self.assertEqual(res.status_code, 200)

        # Verify candidate received notification
        notif_res = self.client.get(f"/api/notifications?user_id={candidate_id}")
        self.assertEqual(notif_res.status_code, 200)
        notifs = notif_res.json()
        self.assertTrue(any("Interview Scheduled" in n["title"] or "Next Sunday at 02:30 PM" in n["message"] for n in notifs))

        # 2. Candidate requests reschedule with reason and suggestion
        reschedule_payload = {
            "response": "reschedule",
            "reason": "University final exam conflict on Sunday",
            "suggested_time": "Next Tuesday at 3:00 PM",
            "actor_name": "Candidate User"
        }
        resch_res = self.client.post(f"/api/applications/{app_id}/interview-response", json=reschedule_payload)
        self.assertEqual(resch_res.status_code, 200)
        self.assertEqual(resch_res.json()["interview_status"], "reschedule_requested")

        # Verify recruiter received notification about reschedule
        rec_notif_res = self.client.get(f"/api/notifications?user_id={recruiter_id}")
        self.assertEqual(rec_notif_res.status_code, 200)
        rec_notifs = rec_notif_res.json()
        self.assertTrue(any("Reschedule Request" in n["title"] and "University final exam conflict" in n["message"] for n in rec_notifs))

        # Verify application record contains candidate reply
        app_res = self.client.get(f"/api/applications/{app_id}")
        self.assertEqual(app_res.status_code, 200)
        app_data = app_res.json()
        self.assertEqual(app_data.get("interview_status"), "reschedule_requested")
        self.assertEqual(app_data.get("interview_reschedule_reason"), "University final exam conflict on Sunday")
        self.assertEqual(app_data.get("interview_reschedule_suggestion"), "Next Tuesday at 3:00 PM")

        # 3. Candidate accepts interview
        accept_payload = {
            "response": "accept",
            "actor_name": "Candidate User"
        }
        acc_res = self.client.post(f"/api/applications/{app_id}/interview-response", json=accept_payload)
        self.assertEqual(acc_res.status_code, 200)
        self.assertEqual(acc_res.json()["interview_status"], "accepted")

        # Verify application record reflects acceptance
        app_res2 = self.client.get(f"/api/applications/{app_id}")
        self.assertEqual(app_res2.status_code, 200)
        self.assertEqual(app_res2.json().get("interview_status"), "accepted")

        # Cleanup
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE business_id = ?)", (biz_id,))
        cursor.execute("DELETE FROM conversations WHERE business_id = ?", (biz_id,))
        cursor.execute("DELETE FROM notifications WHERE user_id IN (?, ?)", (candidate_id, recruiter_id))
        cursor.execute("DELETE FROM application_events WHERE application_id = ?", (app_id,))
        cursor.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        cursor.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        cursor.execute("DELETE FROM business_memberships WHERE business_id = ?", (biz_id,))
        cursor.execute("DELETE FROM businesses WHERE id = ?", (biz_id,))
        cursor.execute("DELETE FROM users WHERE id IN (?, ?)", (candidate_id, recruiter_id))
        conn.commit()
        conn.close()

    def test_sponsors_crud_and_management(self):
        """Verifies full sponsor management lifecycle: create, list, edit pictures/texts/links, toggle status, and delete."""
        # 1. Fetch public sponsors
        pub_res = self.client.get("/api/sponsors")
        self.assertEqual(pub_res.status_code, 200)
        public_list = pub_res.json()
        self.assertIsInstance(public_list, list)

        # 2. Fetch admin sponsors
        adm_res = self.client.get("/api/admin/sponsors")
        self.assertEqual(adm_res.status_code, 200)
        admin_list = adm_res.json()
        self.assertIsInstance(admin_list, list)

        # 3. Create a new sponsor with picture, texts, and links
        new_payload = {
            "name": "Luxury Hospitality Institute Test",
            "tag": "EXCLUSIVE PARTNER",
            "badge": "AHLEI Certified Platinum",
            "image_url": "/static/images/resort_beach.jpg",
            "description": "Comprehensive culinary arts and front-office executive diplomas.",
            "button_text": "Enroll Now →",
            "link_url": "https://example.com/hospitality-institute",
            "display_order": 99,
            "is_active": True
        }
        create_res = self.client.post("/api/admin/sponsors", json=new_payload)
        self.assertEqual(create_res.status_code, 200)
        created_data = create_res.json()
        self.assertTrue(created_data.get("success"))
        sp_id = created_data.get("id")
        self.assertIsNotNone(sp_id)

        # 4. Verify new sponsor is present in admin list
        adm_res_after = self.client.get("/api/admin/sponsors")
        self.assertEqual(adm_res_after.status_code, 200)
        found = next((s for s in adm_res_after.json() if s["id"] == sp_id), None)
        self.assertIsNotNone(found)
        self.assertEqual(found["name"], "Luxury Hospitality Institute Test")
        self.assertEqual(found["badge"], "AHLEI Certified Platinum")
        self.assertEqual(found["button_text"], "Enroll Now →")
        self.assertEqual(found["link_url"], "https://example.com/hospitality-institute")

        # 5. Edit sponsor picture, texts, and link
        update_payload = {
            "name": "Luxury Hospitality Institute (Updated)",
            "tag": "PREMIER PARTNER",
            "badge": "5-Star Global Accreditation",
            "image_url": "/static/images/hero_lobby.jpg",
            "description": "Updated masterclass certifications with guaranteed international placement.",
            "button_text": "Apply For Scholarship →",
            "link_url": "https://example.com/scholarship",
            "display_order": 1,
            "is_active": True
        }
        update_res = self.client.put(f"/api/admin/sponsors/{sp_id}", json=update_payload)
        self.assertEqual(update_res.status_code, 200)
        self.assertTrue(update_res.json().get("success"))

        # Verify updated values
        adm_res_updated = self.client.get("/api/admin/sponsors")
        updated_sp = next((s for s in adm_res_updated.json() if s["id"] == sp_id), None)
        self.assertIsNotNone(updated_sp)
        self.assertEqual(updated_sp["name"], "Luxury Hospitality Institute (Updated)")
        self.assertEqual(updated_sp["image_url"], "/static/images/hero_lobby.jpg")
        self.assertEqual(updated_sp["badge"], "5-Star Global Accreditation")
        self.assertEqual(updated_sp["link_url"], "https://example.com/scholarship")
        self.assertEqual(updated_sp["button_text"], "Apply For Scholarship →")

        # 6. Toggle status (pause sponsor)
        toggle_res = self.client.post(f"/api/admin/sponsors/{sp_id}/toggle-status")
        self.assertEqual(toggle_res.status_code, 200)
        self.assertEqual(toggle_res.json().get("is_active"), 0)

        # Verify paused sponsor is excluded from public active feed
        pub_res_paused = self.client.get("/api/sponsors")
        self.assertIsNone(next((s for s in pub_res_paused.json() if s["id"] == sp_id), None))

        # Toggle status back to active
        toggle_res2 = self.client.post(f"/api/admin/sponsors/{sp_id}/toggle-status")
        self.assertEqual(toggle_res2.status_code, 200)
        self.assertEqual(toggle_res2.json().get("is_active"), 1)

        # 7. Delete sponsor
        del_res = self.client.delete(f"/api/admin/sponsors/{sp_id}")
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json().get("success"))

        # Verify sponsor is deleted
        adm_res_final = self.client.get("/api/admin/sponsors")
        self.assertIsNone(next((s for s in adm_res_final.json() if s["id"] == sp_id), None))

    def test_admin_bulk_delete_and_module_endpoints(self):
        """Verifies admin bulk delete across modules and individual moderator/verification deletions."""
        import uuid
        suffix = uuid.uuid4().hex[:8]

        # 1. Invalid module validation
        inv_res = self.client.post("/api/admin/bulk-delete", json={
            "module": "unknown_module",
            "ids": ["item_1"]
        })
        self.assertEqual(inv_res.status_code, 400)

        # 2. Root administrator protection
        prot_res = self.client.post("/api/admin/bulk-delete", json={
            "module": "users",
            "ids": ["user_admin"]
        })
        self.assertEqual(prot_res.status_code, 400)

        # 3. Create test fixtures
        u1_id = f"test_u1_{suffix}"
        u2_id = f"test_u2_{suffix}"
        biz_id = f"test_biz_{suffix}"
        j1_id = f"test_j1_{suffix}"
        j2_id = f"test_j2_{suffix}"
        mem_id = f"test_mem_{suffix}"
        verif_id = f"test_verif_{suffix}"
        blog_id = f"test_blog_{suffix}"
        sp_id = f"test_sp_{suffix}"

        conn = database.get_db()
        cursor = conn.cursor()
        try:
            # Users
            cursor.execute("""
                INSERT INTO users (id, name, email, phone, role, status)
                VALUES (?, 'Bulk User 1', ?, ?, 'jobseeker', 'active')
            """, (u1_id, f"bulk1_{suffix}@test.com", f"01711{suffix[:6]}"))
            cursor.execute("""
                INSERT INTO users (id, name, email, phone, role, status)
                VALUES (?, 'Bulk User 2', ?, ?, 'recruiter', 'active')
            """, (u2_id, f"bulk2_{suffix}@test.com", f"01712{suffix[:6]}"))

            # Business
            cursor.execute("""
                INSERT INTO businesses (id, legal_name, brand_name, property_type, verification_status, city, address)
                VALUES (?, 'Bulk Legal', 'Bulk Brand', 'Boutique Hotel', 'verified', 'Dhaka', 'Gulshan')
            """, (biz_id,))

            # Jobs
            cursor.execute("""
                INSERT INTO jobs (id, business_id, title, department, property_location, employment_type, shift, experience_level, description, requirements, status, posted_at)
                VALUES (?, ?, 'Job Bulk 1', 'Front Office', 'Gulshan, Dhaka', 'Full-time', 'Morning', 'Mid-Level', 'Job description text', '[]', 'active', '2026-11-09 10:00')
            """, (j1_id, biz_id))
            cursor.execute("""
                INSERT INTO jobs (id, business_id, title, department, property_location, employment_type, shift, experience_level, description, requirements, status, posted_at)
                VALUES (?, ?, 'Job Bulk 2', 'Housekeeping', 'Gulshan, Dhaka', 'Full-time', 'Evening', 'Entry-Level', 'Job description text', '[]', 'active', '2026-11-09 10:00')
            """, (j2_id, biz_id))

            # Moderator Membership
            cursor.execute("""
                INSERT INTO business_memberships (id, business_id, user_id, org_role, membership_role, approval_status)
                VALUES (?, ?, ?, 'HR Specialist', 'moderator', 'pending_admin_approval')
            """, (mem_id, biz_id, u2_id))

            # Verification
            cursor.execute("""
                INSERT INTO business_verifications (id, business_id, legal_doc_type, doc_number, submitted_by, submitted_at, status)
                VALUES (?, ?, 'Trade License', ?, 'Test Submitter', '2026-11-09 10:00', 'pending')
            """, (verif_id, biz_id, f"TL-{suffix}"))

            # Blog
            cursor.execute("""
                INSERT INTO blogs (id, slug, title, excerpt, content, category, author_id, author_name, author_title)
                VALUES (?, ?, 'Bulk Blog Test', 'Excerpt', 'Content', 'Hotel Standards', ?, 'Author Name', 'Hospitality Consultant')
            """, (blog_id, f"slug-{suffix}", u1_id))

            # Sponsor
            cursor.execute("""
                INSERT INTO sponsors (id, name, tag, description, image_url, button_text, link_url, is_active)
                VALUES (?, 'Bulk Sponsor Test', 'PARTNER', 'Desc', '/img.jpg', 'Link', 'https://test.com', 1)
            """, (sp_id,))

            conn.commit()

            # 4. Test Single Delete Endpoints for Moderator and Verification
            del_mod_resp = self.client.delete(f"/api/admin/moderators/{mem_id}")
            self.assertEqual(del_mod_resp.status_code, 200)
            self.assertTrue(del_mod_resp.json().get("success"))

            del_verif_resp = self.client.delete(f"/api/admin/verifications/{verif_id}")
            self.assertEqual(del_verif_resp.status_code, 200)
            self.assertTrue(del_verif_resp.json().get("success"))

            # 5. Test Bulk Delete for Jobs
            bulk_jobs_resp = self.client.post("/api/admin/bulk-delete", json={
                "module": "jobs",
                "ids": [j1_id, j2_id]
            })
            self.assertEqual(bulk_jobs_resp.status_code, 200)
            self.assertEqual(bulk_jobs_resp.json().get("deleted_count"), 2)

            # 6. Test Bulk Delete for Blog & Sponsor
            bulk_blog_resp = self.client.post("/api/admin/bulk-delete", json={
                "module": "blogs",
                "ids": [blog_id]
            })
            self.assertEqual(bulk_blog_resp.status_code, 200)
            self.assertEqual(bulk_blog_resp.json().get("deleted_count"), 1)

            bulk_sp_resp = self.client.post("/api/admin/bulk-delete", json={
                "module": "sponsors",
                "ids": [sp_id]
            })
            self.assertEqual(bulk_sp_resp.status_code, 200)
            self.assertEqual(bulk_sp_resp.json().get("deleted_count"), 1)

            # 7. Test Bulk Delete for Users (including user_admin in list, should safely exclude user_admin)
            bulk_users_resp = self.client.post("/api/admin/bulk-delete", json={
                "module": "users",
                "ids": [u1_id, u2_id, "user_admin"]
            })
            self.assertEqual(bulk_users_resp.status_code, 200)
            self.assertEqual(bulk_users_resp.json().get("deleted_count"), 2)

            # 8. Test Bulk Delete for Businesses
            bulk_biz_resp = self.client.post("/api/admin/bulk-delete", json={
                "module": "businesses",
                "ids": [biz_id]
            })
            self.assertEqual(bulk_biz_resp.status_code, 200)
            self.assertEqual(bulk_biz_resp.json().get("deleted_count"), 1)

        finally:
            # Clean up any leftover test fixtures
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                clean_conn = database.get_db()
                clean_cur = clean_conn.cursor()
                clean_cur.execute("DELETE FROM business_memberships WHERE id = ?", (mem_id,))
                clean_cur.execute("DELETE FROM business_verifications WHERE id = ?", (verif_id,))
                clean_cur.execute("DELETE FROM jobs WHERE id IN (?, ?)", (j1_id, j2_id))
                clean_cur.execute("DELETE FROM businesses WHERE id = ?", (biz_id,))
                clean_cur.execute("DELETE FROM blogs WHERE id = ?", (blog_id,))
                clean_cur.execute("DELETE FROM sponsors WHERE id = ?", (sp_id,))
                clean_cur.execute("DELETE FROM users WHERE id IN (?, ?)", (u1_id, u2_id))
                clean_conn.commit()
                clean_conn.close()
            except Exception:
                pass
            conn.close()

if __name__ == "__main__":
    unittest.main()

