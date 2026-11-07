import unittest
import json
import uuid
from fastapi.testclient import TestClient
from app import app
import database

class TestCandidateProfileDataDisplay(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.unique_id = uuid.uuid4().hex[:8]
        self.phone = f"0171{self.unique_id[:7]}"
        self.email = f"cand_{self.unique_id}@test.com"

    def test_candidate_signup_and_profile_completion_and_edit_flow(self):
        # 1. Dispatch OTP
        send_res = self.client.post("/api/auth/send-otp", json={
            "phone": self.phone,
            "email": self.email,
            "purpose": "candidate_signup"
        })
        self.assertEqual(send_res.status_code, 200)

        # 2. Register Candidate (Sign Up Stages 1-3)
        reg_payload = {
            "name": "Kazi Tanvir Ahmed",
            "first_name": "Kazi",
            "middle_name": "Tanvir",
            "last_name": "Ahmed",
            "name_bangla": "কাজী তানভীর আহমেদ",
            "email": self.email,
            "phone": self.phone,
            "phone_secondary": "01812345678",
            "password": "Password123!",
            "otp_code": "258330",
            "dob": "1994-08-15",
            "nid_passport": "B123456789",
            "terms_accepted": False,
            "profile_completed": False
        }
        reg_res = self.client.post("/api/auth/register-candidate", json=reg_payload)
        self.assertEqual(reg_res.status_code, 200, f"Registration failed: {reg_res.text}")
        reg_data = reg_res.json()
        user_id = reg_data["user_id"]
        self.assertTrue(user_id)

        # 3. Accept Terms
        terms_res = self.client.post("/api/auth/accept-terms", json={
            "user_id": user_id,
            "accepted": True
        })
        self.assertEqual(terms_res.status_code, 200)

        # 4. Complete Candidate Profile (Stage 5)
        edu_entries = [
            {
                "institution": "Dhaka University",
                "degree": "Bachelor of Hotel Management (BHM)",
                "degree_select": "Bachelor of Hotel Management (BHM)",
                "country": "Bangladesh",
                "gpa_obtained": "3.85",
                "gpa_scale": "4.00",
                "gpa": "3.85 / 4.00"
            },
            {
                "institution": "Glion Institute of Higher Education",
                "degree": "Advanced Swiss Hospitality Diploma",
                "degree_select": "Other Degree / Certificate",
                "other_degree": "Advanced Swiss Hospitality Diploma",
                "country": "Switzerland",
                "gpa_obtained": "3.95",
                "gpa_scale": "4.00",
                "gpa": "3.95 / 4.00"
            }
        ]

        cert_entries = [
            {
                "title": "Certified Food & Beverage Executive (CFBE)",
                "name": "Certified Food & Beverage Executive (CFBE)",
                "issuer": "AHLEI",
                "issued_by": "AHLEI",
                "year": "2023",
                "year_obtained": "2023"
            },
            {
                "title": "WSET Level 2 Award in Wines",
                "name": "WSET Level 2 Award in Wines",
                "issuer": "Wine & Spirit Education Trust",
                "issued_by": "Wine & Spirit Education Trust",
                "year": "2022",
                "year_obtained": "2022"
            }
        ]

        exp_entries = [
            {
                "company": "The Westin Dhaka",
                "hotel": "The Westin Dhaka",
                "role": "F&B Captain",
                "is_hospitality": True,
                "department": "Food & Beverage Service",
                "date_from": "2022-01-01",
                "date_to": "2024-01-01",
                "is_current": False,
                "worked_years": "2",
                "period": "2022-01-01 – 2024-01-01 (2 yrs)",
                "skills_acquired": "Fine dining guest service, wine pairing, banquet management"
            },
            {
                "company": "Radisson Blu Water Garden",
                "hotel": "Radisson Blu Water Garden",
                "role": "Senior Food Server",
                "is_hospitality": True,
                "department": "Food & Beverage Service",
                "date_from": "2020-01-01",
                "date_to": "2021-12-31",
                "is_current": False,
                "worked_years": "2",
                "period": "2020-01-01 – 2021-12-31 (2 yrs)",
                "skills_acquired": "POS billing, table turnaround, guest relations"
            }
        ]

        skills_list = ["Fine Dining", "Wine Pairing", "Opera PMS", "Micros POS", "Banquet Operations"]
        langs_list = [
            {"name": "English", "level": "Fluent"},
            {"name": "Bengali", "level": "Native"}
        ]

        comp_payload = {
            "user_id": user_id,
            "avatar_url": "/static/images/hero-bg.webp",
            "bio": "Experienced 5-star hotel F&B Captain with 4 years of luxury hospitality service excellence.",
            "cv_name": "Tanvir_Ahmed_F&B_Resume.pdf",
            "cv_data": "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...",
            "cv_url": "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...",
            "department": "Food & Beverage Service",
            "designation": "F&B Captain",
            "location": "Cox's Bazar, Chattogram (Chittagong)",
            "expected_salary": "৳45,000",
            "job_preferences": {
                "department": "Food & Beverage Service",
                "desired_role": "F&B Captain",
                "designation": "F&B Captain",
                "shift": "Rotational",
                "expected_salary": "৳45,000",
                "preferred_location": "Cox's Bazar, Chattogram (Chittagong)",
                "preferred_locations": ["Cox's Bazar", "Chattogram (Chittagong)"],
                "notice_period": "Immediate"
            },
            "education": edu_entries,
            "certifications": cert_entries,
            "skills": skills_list,
            "languages": langs_list,
            "experience": exp_entries,
            "experience_years": 4
        }

        comp_res = self.client.post("/api/auth/complete-profile", json=comp_payload)
        self.assertEqual(comp_res.status_code, 200, f"Profile completion failed: {comp_res.text}")

        # 5. Retrieve Profile & Assert All Data Is Present and Accurate
        prof_res = self.client.get(f"/api/profile?user_id={user_id}")
        self.assertEqual(prof_res.status_code, 200)
        profile = prof_res.json()

        self.assertEqual(profile["name"], "Kazi Tanvir Ahmed")
        self.assertEqual(profile["first_name"], "Kazi")
        self.assertEqual(profile["middle_name"], "Tanvir")
        self.assertEqual(profile["last_name"], "Ahmed")
        self.assertEqual(profile["name_bangla"], "কাজী তানভীর আহমেদ")
        self.assertEqual(profile["email"], self.email)
        self.assertEqual(profile["phone"], self.phone)
        self.assertEqual(profile["phone_secondary"], "01812345678")
        self.assertEqual(profile["dob"], "1994-08-15")
        self.assertEqual(profile["nid_passport"], "B123456789")
        self.assertEqual(profile["department"], "Food & Beverage Service")
        self.assertEqual(profile["designation"], "F&B Captain")
        self.assertEqual(profile["summary"], "Experienced 5-star hotel F&B Captain with 4 years of luxury hospitality service excellence.")
        self.assertEqual(profile["experience_years"], 4)
        self.assertEqual(len(profile["education"]), 2)
        self.assertEqual(profile["education"][1]["country"], "Switzerland")
        self.assertEqual(profile["education"][1]["other_degree"], "Advanced Swiss Hospitality Diploma")
        self.assertEqual(len(profile["certifications"]), 2)
        self.assertEqual(profile["certifications"][0]["issuer"], "AHLEI")
        self.assertEqual(len(profile["experience"]), 2)
        self.assertEqual(profile["experience"][0]["company"], "The Westin Dhaka")
        self.assertEqual(len(profile["cv_list"]), 1)
        self.assertEqual(profile["cv_list"][0]["name"], "Tanvir_Ahmed_F&B_Resume.pdf")
        self.assertEqual(profile["cv_list"][0]["file_data"], "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...")

        # 6. Test Comprehensive Profile Edit (Updating fields, including NID/Passport & Bangla Name)
        edit_payload = {
            "user_id": user_id,
            "name": "Kazi Tanvir Ahmed Chowdhury",
            "first_name": "Kazi",
            "middle_name": "Tanvir",
            "last_name": "Chowdhury",
            "name_bangla": "কাজী তানভীর চৌধুরী",
            "dob": "1994-08-15",
            "nid_passport": "PASSPORT-XY-9988",
            "phone": self.phone,
            "phone_secondary": "01999999999",
            "email": self.email,
            "department": "Food & Beverage Service",
            "designation": "Assistant F&B Manager",
            "current_position": "Assistant F&B Manager",
            "headline": "Assistant F&B Manager • 5-Star Hotel Dining Operations",
            "summary": "Promoted hospitality professional with advanced wine knowledge and team leadership.",
            "location": "Dhaka, Bangladesh",
            "visibility": "eligible_employers",
            "open_to_work": True,
            "skills": ["Wine Pairing", "Opera PMS", "Micros POS", "Staff Leadership"],
            "preferences": {
                "department": "Food & Beverage Service",
                "desired_role": "Assistant F&B Manager",
                "designation": "Assistant F&B Manager",
                "shift": "Rotational",
                "expected_salary": "৳65,000",
                "phone_secondary": "01999999999",
                "preferred_location": "Dhaka, Bangladesh"
            }
        }
        edit_res = self.client.put("/api/profile", json=edit_payload)
        self.assertEqual(edit_res.status_code, 200, f"Profile edit failed: {edit_res.text}")

        # 7. Verify updated profile reflection
        prof_res2 = self.client.get(f"/api/profile?user_id={user_id}")
        self.assertEqual(prof_res2.status_code, 200)
        profile2 = prof_res2.json()

        self.assertEqual(profile2["name"], "Kazi Tanvir Chowdhury")
        self.assertEqual(profile2["name_bangla"], "কাজী তানভীর চৌধুরী")
        self.assertEqual(profile2["nid_passport"], "PASSPORT-XY-9988")
        self.assertEqual(profile2["phone_secondary"], "01999999999")
        self.assertEqual(profile2["designation"], "Assistant F&B Manager")
        self.assertEqual(profile2["summary"], "Promoted hospitality professional with advanced wine knowledge and team leadership.")
        self.assertEqual(profile2["location"], "Dhaka, Bangladesh")

if __name__ == "__main__":
    unittest.main()
