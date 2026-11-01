"""
Unit and integration tests for Bangladesh District Location Library,
Haversine Proximity Sorting, and Job Location Search.
"""
import unittest
from fastapi.testclient import TestClient
import locations
from app import app


class TestBangladeshLocationLibrary(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_64_districts_dataset_completeness(self):
        """Verify all 64 districts are present with valid attributes and coordinates."""
        all_districts = locations.get_all_districts()
        self.assertEqual(len(all_districts), 64, "Must contain exactly 64 districts of Bangladesh")
        
        unique_ids = set()
        unique_names = set()
        
        for d in all_districts:
            self.assertIn("id", d)
            self.assertIn("name", d)
            self.assertIn("division", d)
            self.assertIn("lat", d)
            self.assertIn("lng", d)
            
            # Geographic coordinate sanity checks for Bangladesh
            # Latitude: ~20.5° N to 26.7° N
            # Longitude: ~88.0° E to 92.7° E
            self.assertGreaterEqual(d["lat"], 20.0, f"Latitude too low for {d['name']}")
            self.assertLessEqual(d["lat"], 27.0, f"Latitude too high for {d['name']}")
            self.assertGreaterEqual(d["lng"], 88.0, f"Longitude too low for {d['name']}")
            self.assertLessEqual(d["lng"], 93.0, f"Longitude too high for {d['name']}")
            
            unique_ids.add(d["id"])
            unique_names.add(d["name"].lower())

        self.assertEqual(len(unique_ids), 64, "All 64 district IDs must be unique")
        self.assertEqual(len(unique_names), 64, "All 64 district names must be unique")

    def test_division_coverage(self):
        """Verify all 8 administrative divisions of Bangladesh are covered."""
        all_districts = locations.get_all_districts()
        divisions = {d["division"] for d in all_districts}
        expected_divisions = {
            "Dhaka", "Chattogram", "Sylhet", "Rajshahi",
            "Khulna", "Barishal", "Rangpur", "Mymensingh"
        }
        self.assertEqual(divisions, expected_divisions)

    def test_district_lookup_and_aliases(self):
        """Verify lookup by ID, exact name, case-insensitive, and historic aliases."""
        dhaka = locations.find_district("Dhaka")
        self.assertIsNotNone(dhaka)
        self.assertEqual(dhaka["id"], "dhaka")
        
        # Lowercase / ID lookup
        self.assertEqual(locations.find_district("dhaka")["name"], "Dhaka")
        
        # Alias lookup (Chittagong -> Chattogram)
        chattogram = locations.find_district("Chittagong")
        self.assertIsNotNone(chattogram)
        self.assertEqual(chattogram["name"], "Chattogram")
        
        # Alias lookup (Sreemangal -> Moulvibazar)
        sreemangal = locations.find_district("Sreemangal")
        self.assertIsNotNone(sreemangal)
        self.assertEqual(sreemangal["name"], "Moulvibazar")
        
        # Alias lookup (Cox's Bazar without apostrophe / normalized)
        cox = locations.find_district("Coxs Bazar")
        self.assertIsNotNone(cox)
        self.assertEqual(cox["name"], "Cox's Bazar")

    def test_resolve_district_from_compound_text(self):
        """Verify district resolution from complex strings like addresses or city tags."""
        self.assertEqual(locations.resolve_district_from_text("Gulshan-2, Dhaka 1212")["name"], "Dhaka")
        self.assertEqual(locations.resolve_district_from_text("Sreemangal, Sylhet")["name"], "Moulvibazar")
        self.assertEqual(locations.resolve_district_from_text("Inani Beach, Cox's Bazar")["name"], "Cox's Bazar")
        self.assertEqual(locations.resolve_district_from_text("Marine Drive, Coxs Bazar")["name"], "Cox's Bazar")

    def test_haversine_distance_calculation(self):
        """Verify Haversine formula distance calculations."""
        # Distance to self must be 0
        self.assertEqual(locations.haversine_distance(23.8103, 90.4125, 23.8103, 90.4125), 0.0)
        
        # Dhaka (23.8103, 90.4125) to Gazipur (24.0023, 90.4264) is ~21.4 km
        dist_gazipur = locations.haversine_distance(23.8103, 90.4125, 24.0023, 90.4264)
        self.assertAlmostEqual(dist_gazipur, 21.4, delta=2.0)
        
        # Dhaka to Cox's Bazar is ~311 km
        dist_cox = locations.haversine_distance(23.8103, 90.4125, 21.4272, 92.0058)
        self.assertAlmostEqual(dist_cox, 311.4, delta=5.0)

    def test_single_preferred_district_proximity_ranking(self):
        """Verify selecting Dhaka orders all 64 districts in ascending distance."""
        ranked = locations.get_districts_by_proximity(["Dhaka"])
        self.assertEqual(len(ranked), 64, "All 64 districts must be returned")
        
        # First item must be Dhaka
        self.assertEqual(ranked[0]["name"], "Dhaka")
        self.assertEqual(ranked[0]["distance_km"], 0.0)
        self.assertTrue(ranked[0]["is_selected"])
        
        # Check ascending order of remaining districts
        for i in range(1, len(ranked) - 1):
            self.assertFalse(ranked[i]["is_selected"])
            self.assertLessEqual(ranked[i]["distance_km"], ranked[i + 1]["distance_km"])
            
        # Top 3 nearest to Dhaka should be adjacent districts (Gazipur, Narayanganj, Munshiganj, etc.)
        top_3_names = [d["name"] for d in ranked[1:4]]
        self.assertTrue(any(n in top_3_names for n in ["Gazipur", "Narayanganj", "Munshiganj", "Narsingdi"]))

    def test_multiple_preferred_districts_proximity_ranking(self):
        """Verify selecting multiple districts computes minimum distance to either."""
        ranked = locations.get_districts_by_proximity(["Dhaka", "Sylhet"])
        self.assertEqual(len(ranked), 64)
        
        # Both Dhaka and Sylhet must be at the top with distance 0.0 and is_selected=True
        selected = [d for d in ranked if d["is_selected"]]
        self.assertEqual(len(selected), 2)
        selected_names = {d["name"] for d in selected}
        self.assertEqual(selected_names, {"Dhaka", "Sylhet"})
        for s in selected:
            self.assertEqual(s["distance_km"], 0.0)
            
        # Moulvibazar (near Sylhet) should have distance relative to Sylhet (~65 km), not Dhaka (~157 km)
        moulvibazar = next(d for d in ranked if d["name"] == "Moulvibazar")
        self.assertLess(moulvibazar["distance_km"], 75.0)

    def test_locations_api_districts_endpoint(self):
        """Test GET /api/locations/districts."""
        res = self.client.get("/api/locations/districts")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 64)
        
        # Filter by division
        res_sylhet = self.client.get("/api/locations/districts?division=Sylhet")
        self.assertEqual(res_sylhet.status_code, 200)
        sylhet_data = res_sylhet.json()
        self.assertEqual(len(sylhet_data), 4)

    def test_locations_api_proximity_endpoint(self):
        """Test GET /api/locations/proximity."""
        res = self.client.get("/api/locations/proximity?preferred=Dhaka")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 64)
        self.assertEqual(data[0]["name"], "Dhaka")
        self.assertEqual(data[0]["distance_km"], 0.0)
        self.assertTrue(data[0]["is_selected"])
        
        # Anywhere in Bangladesh
        res_any = self.client.get("/api/locations/proximity?preferred=Anywhere%20in%20Bangladesh")
        self.assertEqual(res_any.status_code, 200)
        self.assertEqual(len(res_any.json()), 64)

    def test_job_search_proximity_integration(self):
        """Test GET /api/jobs with location proximity sorting and strict filtering."""
        # 1. Proximity search for Dhaka
        res = self.client.get("/api/jobs?location=Dhaka")
        self.assertEqual(res.status_code, 200)
        jobs = res.json()
        self.assertGreater(len(jobs), 0)
        
        # All Dhaka jobs should appear first with distance_km == 0.0 and is_exact_location == True
        dhaka_jobs = [j for j in jobs if j.get("is_exact_location")]
        non_dhaka_jobs = [j for j in jobs if not j.get("is_exact_location")]
        self.assertGreater(len(dhaka_jobs), 0)
        for dj in dhaka_jobs:
            self.assertEqual(dj.get("distance_km"), 0.0)
            self.assertEqual(dj.get("district_name"), "Dhaka")
            
        # Non-dhaka jobs follow sorted by distance
        if len(non_dhaka_jobs) > 1:
            for i in range(len(non_dhaka_jobs) - 1):
                self.assertLessEqual(non_dhaka_jobs[i]["distance_km"], non_dhaka_jobs[i + 1]["distance_km"])

        # 2. Strict location search: only exact matches
        res_strict = self.client.get("/api/jobs?location=Dhaka&strict_location=true")
        self.assertEqual(res_strict.status_code, 200)
        strict_jobs = res_strict.json()
        self.assertTrue(all(j.get("district_name") == "Dhaka" for j in strict_jobs))
        self.assertTrue(all(j.get("is_exact_location") is True for j in strict_jobs))

        # 3. Anywhere in Bangladesh search: returns all active jobs
        res_all = self.client.get("/api/jobs?location=Anywhere%20in%20Bangladesh")
        self.assertEqual(res_all.status_code, 200)
        all_jobs = res_all.json()
        res_plain = self.client.get("/api/jobs")
        self.assertEqual(len(all_jobs), len(res_plain.json()))


if __name__ == "__main__":
    unittest.main()
