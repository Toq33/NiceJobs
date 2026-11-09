import unittest
from fastapi.testclient import TestClient
from app import app
import database

client = TestClient(app)

class TestAdminDeleteBusiness(unittest.TestCase):
    def setUp(self):
        self.conn = database.get_db()
        self.cursor = self.conn.cursor()

    def tearDown(self):
        self.conn.close()

    def test_delete_business_cascades_all_data(self):
        biz_id = "test_biz_delete_123"
        recruiter_id = "test_recruiter_del_123"
        candidate_id = "test_candidate_del_123"
        shared_email = "representative_del_test@luxuryhotel.com"
        job_id = "test_job_del_123"
        app_id = "test_app_del_123"
        conv_id = "test_conv_del_123"
        msg_id = "test_msg_del_123"

        # 1. Clean up any previous test remnants
        self.cursor.execute("DELETE FROM businesses WHERE id = ?", (biz_id,))
        self.cursor.execute("DELETE FROM users WHERE id IN (?, ?)", (recruiter_id, candidate_id))
        self.cursor.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        self.cursor.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        self.cursor.execute("DELETE FROM application_events WHERE application_id = ?", (app_id,))
        self.cursor.execute("DELETE FROM saved_jobs WHERE job_id = ?", (job_id,))
        self.cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        self.cursor.execute("DELETE FROM messages WHERE id = ?", (msg_id,))
        self.cursor.execute("DELETE FROM business_memberships WHERE business_id = ?", (biz_id,))
        self.cursor.execute("DELETE FROM followed_businesses WHERE business_id = ?", (biz_id,))
        self.cursor.execute("DELETE FROM business_verifications WHERE business_id = ?", (biz_id,))
        self.conn.commit()

        # 2. Insert Recruiter User and Candidate User sharing the same email
        self.cursor.execute("""
            INSERT INTO users (id, name, email, phone, role, status)
            VALUES (?, ?, ?, ?, ?, 'active')
        """, (recruiter_id, "Hotel Manager", shared_email, "01700000001", "recruiter"))

        self.cursor.execute("""
            INSERT INTO users (id, name, email, phone, role, status)
            VALUES (?, ?, ?, ?, ?, 'active')
        """, (candidate_id, "Candidate Self", shared_email, "01700000002", "jobseeker"))

        # 3. Insert Business & Membership
        self.cursor.execute("""
            INSERT INTO businesses (id, legal_name, brand_name, admin_user_id, property_type, business_category, city, address, verification_status)
            VALUES (?, ?, ?, ?, 'Luxury Hotel', '5-Star Luxury Resort', 'Dhaka', 'Gulshan 2', 'verified')
        """, (biz_id, "Luxury Palace Ltd", "Luxury Palace Resort", recruiter_id))

        self.cursor.execute("""
            INSERT INTO business_memberships (id, business_id, user_id, org_role)
            VALUES ('mem_del_123', ?, ?, 'Owner')
        """, (biz_id, recruiter_id))

        # 4. Insert Job
        self.cursor.execute("""
            INSERT INTO jobs (id, business_id, title, department, property_location, employment_type, shift, experience_level, description, requirements)
            VALUES (?, ?, 'Head Chef', 'Culinary / Kitchen', 'Gulshan, Dhaka', 'Full-time', 'Morning', '5+ Years', 'Lead culinary operations', '[]')
        """, (job_id, biz_id))

        # 5. Insert Application & Event
        self.cursor.execute("""
            INSERT INTO applications (id, job_id, user_id, status)
            VALUES (?, ?, ?, 'submitted')
        """, (app_id, job_id, candidate_id))

        self.cursor.execute("""
            INSERT INTO application_events (application_id, status, actor_name, note)
            VALUES (?, 'submitted', 'Candidate Self', 'Applied online')
        """, (app_id,))

        # 6. Insert Saved Job, Followed Business, Verification
        self.cursor.execute("""
            INSERT INTO saved_jobs (user_id, job_id, saved_at)
            VALUES (?, ?, '2026-11-02 12:00:00')
        """, (candidate_id, job_id))

        self.cursor.execute("""
            INSERT INTO followed_businesses (user_id, business_id, followed_at)
            VALUES (?, ?, '2026-11-02 12:00:00')
        """, (candidate_id, biz_id))

        self.cursor.execute("""
            INSERT INTO business_verifications (id, business_id, legal_doc_type, doc_number, submitted_by, status)
            VALUES ('ver_del_123', ?, 'Trade License', 'TL-99999', ?, 'approved')
        """, (biz_id, recruiter_id))

        # 7. Insert Conversation & Message
        self.cursor.execute("""
            INSERT INTO conversations (id, user_id, business_id, job_id, last_message)
            VALUES (?, ?, ?, ?, 'Hello regarding the chef role')
        """, (conv_id, candidate_id, biz_id, job_id))

        self.cursor.execute("""
            INSERT INTO messages (id, conversation_id, sender_id, sender_role, sender_name, content)
            VALUES (?, ?, ?, 'user', 'Candidate Self', 'Hello regarding the chef role')
        """, (msg_id, conv_id, candidate_id))

        self.conn.commit()

        # Execute DELETE request to admin endpoint
        res = client.delete(f"/api/admin/businesses/{biz_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))

        # Verify all business-related records are gone
        self.cursor.execute("SELECT COUNT(*) FROM businesses WHERE id = ?", (biz_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        self.cursor.execute("SELECT COUNT(*) FROM jobs WHERE business_id = ?", (biz_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        self.cursor.execute("SELECT COUNT(*) FROM applications WHERE id = ?", (app_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        self.cursor.execute("SELECT COUNT(*) FROM application_events WHERE application_id = ?", (app_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        self.cursor.execute("SELECT COUNT(*) FROM saved_jobs WHERE job_id = ?", (job_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        self.cursor.execute("SELECT COUNT(*) FROM conversations WHERE id = ?", (conv_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        self.cursor.execute("SELECT COUNT(*) FROM messages WHERE conversation_id = ?", (conv_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        self.cursor.execute("SELECT COUNT(*) FROM followed_businesses WHERE business_id = ?", (biz_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        self.cursor.execute("SELECT COUNT(*) FROM business_verifications WHERE business_id = ?", (biz_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        self.cursor.execute("SELECT COUNT(*) FROM business_memberships WHERE business_id = ?", (biz_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        # Recruiter user should be cleaned up
        self.cursor.execute("SELECT COUNT(*) FROM users WHERE id = ?", (recruiter_id,))
        self.assertEqual(self.cursor.fetchone()[0], 0)

        # Candidate user account with the same email MUST STILL EXIST intact!
        self.cursor.execute("SELECT COUNT(*) FROM users WHERE id = ?", (candidate_id,))
        self.assertEqual(self.cursor.fetchone()[0], 1)

        # Cleanup candidate user account to avoid leftover test data
        self.cursor.execute("DELETE FROM users WHERE id = ?", (candidate_id,))
        self.conn.commit()

    @classmethod
    def tearDownClass(cls):
        try:
            from scripts.cleanup_test_data import cleanup_test_data
            cleanup_test_data(dry_run=False)
        except Exception:
            pass

if __name__ == "__main__":
    unittest.main()
