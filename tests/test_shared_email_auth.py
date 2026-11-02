import unittest
import json
import uuid
from fastapi.testclient import TestClient
import app
import database

class TestSharedEmailAuth(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app.app)
        database.init_db()

    def test_shared_email_candidate_and_business_rep(self):
        uid = uuid.uuid4().hex[:6]
        shared_email = f"tanvir.{uid}@luxurybd.test"
        shared_phone_cand = f"0171{uid[:7]}"
        if len(shared_phone_cand) < 11:
            shared_phone_cand = shared_phone_cand.ljust(11, '0')
        shared_phone_rep = f"0181{uid[:7]}"
        if len(shared_phone_rep) < 11:
            shared_phone_rep = shared_phone_rep.ljust(11, '0')

        # 1. Register Candidate with shared_email
        cand_payload = {
            "first_name": "Tanvir",
            "last_name": "Rahman",
            "email": shared_email,
            "phone": shared_phone_cand,
            "password": "PasswordCand123!",
            "otp_code": "258330",
            "current_position": "Front Desk Officer",
            "department": "Front Office",
            "total_experience_years": 3,
            "skills": ["Opera PMS", "Guest Relations"]
        }
        cand_res = self.client.post("/api/auth/register-candidate", json=cand_payload)
        self.assertEqual(cand_res.status_code, 200, f"Candidate registration failed: {cand_res.text}")
        cand_data = cand_res.json()
        cand_user_id = cand_data.get("user_id") or cand_data.get("user", {}).get("id")
        self.assertEqual(cand_data.get("role") or cand_data.get("user", {}).get("role"), "jobseeker")

        # 2. Check Candidate Availability for same email -> should be unavailable for another candidate
        chk_cand = self.client.post("/api/auth/check-candidate-availability", json={"email": shared_email})
        self.assertEqual(chk_cand.status_code, 200)
        self.assertFalse(chk_cand.json()["available"], "Should not allow duplicate candidate account with same email")

        # 3. Check Business Availability for representative email with shared_email -> SHOULD BE AVAILABLE!
        chk_biz_rep = self.client.post("/api/auth/check-business-availability", json={"representative_email": shared_email})
        self.assertEqual(chk_biz_rep.status_code, 200)
        self.assertTrue(chk_biz_rep.json()["available"], "Candidate email should be available for business representative signup")

        # 4. Verify OTP can be sent to representative email for business signup
        otp_res = self.client.post("/api/auth/send-otp", json={
            "email": shared_email,
            "phone": shared_phone_rep,
            "purpose": "business_signup"
        })
        self.assertEqual(otp_res.status_code, 200)

        # 5. Register Business with representative using the same shared_email
        official_email = f"desk.{uid}@bayviewgrand.test"
        biz_payload = {
            "brand_name": f"Bay View Grand Resort {uid}",
            "legal_name": f"Bay View Grand Resort Ltd {uid}",
            "property_type": "Resort",
            "business_category": "5-Star Luxury",
            "district": "Cox's Bazar",
            "official_email": official_email,
            "official_telephone": f"+880 341 {uid[:5]}",
            "representative_name": "Tanvir Rahman",
            "phone": shared_phone_rep,
            "representative_email": shared_email,
            "designation": "Director of Operations",
            "password": "PasswordBiz456!",
            "otp_code": "258330"
        }
        biz_res = self.client.post("/api/auth/register-business", json=biz_payload)
        self.assertEqual(biz_res.status_code, 200, f"Business registration failed: {biz_res.text}")
        biz_data = biz_res.json()
        self.assertTrue(biz_data.get("success"))
        rep_user_id = biz_data["user_id"]
        business_id = biz_data["business_id"]

        # 6. Verify distinct user records & no data sharing
        self.assertNotEqual(cand_user_id, rep_user_id, "Candidate and Recruiter must have distinct user IDs")
        
        conn = database.get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, role, password FROM users WHERE LOWER(email) = ?", (shared_email,))
        records = cursor.fetchall()
        self.assertEqual(len(records), 2, "There must be exactly 2 distinct user rows for the shared email")
        roles = {r["role"]: r for r in records}
        self.assertIn("jobseeker", roles)
        self.assertIn("recruiter", roles)

        # Verify candidate profile only exists for candidate user
        cursor.execute("SELECT * FROM employee_profiles WHERE user_id = ?", (cand_user_id,))
        self.assertIsNotNone(cursor.fetchone(), "Candidate profile must exist for candidate user")
        cursor.execute("SELECT * FROM employee_profiles WHERE user_id = ?", (rep_user_id,))
        self.assertIsNone(cursor.fetchone(), "No candidate profile should be shared with recruiter user")

        # Verify business membership only exists for recruiter user
        cursor.execute("SELECT * FROM business_memberships WHERE user_id = ?", (rep_user_id,))
        self.assertIsNotNone(cursor.fetchone(), "Business membership must exist for recruiter user")
        cursor.execute("SELECT * FROM business_memberships WHERE user_id = ?", (cand_user_id,))
        self.assertIsNone(cursor.fetchone(), "No business membership should be shared with candidate user")

        # Verify business is verified for login testing
        cursor.execute("UPDATE businesses SET verification_status = 'verified' WHERE id = ?", (business_id,))
        conn.commit()
        conn.close()

        # 7. Check Business Availability for representative email -> now unavailable for another business rep
        chk_biz_rep2 = self.client.post("/api/auth/check-business-availability", json={"representative_email": shared_email})
        self.assertEqual(chk_biz_rep2.status_code, 200)
        self.assertFalse(chk_biz_rep2.json()["available"], "Representative email already used by a business rep should be unavailable")

        # 8. Test Login Separation
        # 8a. Log in as Candidate using candidate option
        login_cand_res = self.client.post("/api/auth/login", json={
            "email": shared_email,
            "password": "PasswordCand123!",
            "role": "jobseeker"
        })
        self.assertEqual(login_cand_res.status_code, 200)
        login_cand_data = login_cand_res.json()
        self.assertEqual(login_cand_data["user"]["id"], cand_user_id)
        self.assertEqual(login_cand_data["user"]["role"], "jobseeker")
        self.assertIsNone(login_cand_data.get("business"))

        # 8b. Log in as Business Representative using business option
        login_biz_res = self.client.post("/api/auth/login", json={
            "business_email": official_email,
            "user_email": shared_email,
            "password": "PasswordBiz456!",
            "role": "recruiter"
        })
        self.assertEqual(login_biz_res.status_code, 200)
        login_biz_data = login_biz_res.json()
        self.assertEqual(login_biz_data["user"]["id"], rep_user_id)
        self.assertEqual(login_biz_data["user"]["role"], "recruiter")
        self.assertIsNotNone(login_biz_data.get("business"))
        self.assertEqual(login_biz_data["business"]["id"], business_id)

        # 8c. Logging in with incorrect password for candidate role fails
        fail_cand = self.client.post("/api/auth/login", json={
            "email": shared_email,
            "password": "PasswordBiz456!",  # Recruiter password used on candidate login
            "role": "jobseeker"
        })
        self.assertEqual(fail_cand.status_code, 401, "Candidate login with wrong password must fail")

        # 8d. Logging in with incorrect password for recruiter role fails
        fail_rep = self.client.post("/api/auth/login", json={
            "business_email": official_email,
            "user_email": shared_email,
            "password": "PasswordCand123!",  # Candidate password used on recruiter login
            "role": "recruiter"
        })
        self.assertEqual(fail_rep.status_code, 401, "Recruiter login with wrong password must fail")

if __name__ == "__main__":
    unittest.main()
