import unittest
from fastapi.testclient import TestClient
from app import app
import database

client = TestClient(app)

class TestAdminDatabaseControl(unittest.TestCase):
    def setUp(self):
        self.conn = database.get_db()
        self.cursor = self.conn.cursor()

    def tearDown(self):
        self.conn.close()

    def test_database_overview_endpoint(self):
        res = client.get("/api/admin/database/overview")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("engine", data)
        self.assertIn("table_count", data)
        self.assertIn("total_records", data)
        self.assertIsInstance(data.get("tables"), list)
        
        table_names = [t["name"] for t in data["tables"]]
        self.assertIn("users", table_names)
        self.assertIn("businesses", table_names)
        self.assertIn("jobs", table_names)

    def test_database_vacuum_endpoint(self):
        res = client.post("/api/admin/database/vacuum")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("elapsed_ms", data)
        self.assertIn("message", data)

    def test_database_clean_orphans_endpoint(self):
        res = client.post("/api/admin/database/clean-orphans")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("total_purged", data)

    def test_database_clear_cache_endpoint(self):
        res = client.post("/api/admin/database/clear-cache")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))

    def test_database_read_only_query_runner(self):
        # 1. Valid read-only query
        res = client.post("/api/admin/database/query", json={"query": "SELECT id, name, role FROM users LIMIT 5;"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("columns", data)
        self.assertIn("rows", data)
        self.assertIn("execution_time_ms", data)
        self.assertIn("id", data["columns"])
        self.assertIn("name", data["columns"])
        self.assertIn("role", data["columns"])

        # 2. Block destructive commands
        destructive_queries = [
            "DROP TABLE users;",
            "DELETE FROM users WHERE id = 'test';",
            "UPDATE users SET name = 'hacked';",
            "INSERT INTO users (id) VALUES ('evil');",
            "TRUNCATE TABLE users;",
            "ALTER TABLE users ADD COLUMN evil TEXT;"
        ]
        for dq in destructive_queries:
            bad_res = client.post("/api/admin/database/query", json={"query": dq})
            self.assertEqual(bad_res.status_code, 403, f"Query '{dq}' should have been rejected with 403")

        # 3. Invalid syntax should return 400
        syntax_res = client.post("/api/admin/database/query", json={"query": "SELECT FROM;"})
        self.assertEqual(syntax_res.status_code, 400)

    def test_database_export_table(self):
        res = client.get("/api/admin/database/export-table/users")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("table"), "users")
        self.assertIsInstance(data.get("data"), list)

        # Invalid table export should reject with 400
        invalid_res = client.get("/api/admin/database/export-table/non_existent_table")
        self.assertEqual(invalid_res.status_code, 400)

if __name__ == "__main__":
    unittest.main()
