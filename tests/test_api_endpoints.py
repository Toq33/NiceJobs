import unittest
from fastapi.testclient import TestClient
from app import app
import database

class TestNiceJobsAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

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

if __name__ == "__main__":
    unittest.main()

