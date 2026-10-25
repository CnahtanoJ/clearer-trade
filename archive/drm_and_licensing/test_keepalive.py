import unittest
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath('.'))

from app.services.whitelist import ping_database
from fastapi.testclient import TestClient
from app.main import app

class TestSupabaseKeepAlive(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_ping_database_local_fallback(self):
        # When Supabase credentials are empty or none, returns local fallback status
        with patch("app.services.whitelist.SUPABASE_URL", None), \
             patch("app.services.whitelist.SUPABASE_KEY", None):
            res = ping_database()
            self.assertEqual(res["status"], "ok")
            self.assertEqual(res["provider"], "sqlite_fallback")

    def test_ping_database_supabase_write_heartbeat_success(self):
        mock_post = MagicMock()
        mock_post.status_code = 201

        with patch("app.services.whitelist.SUPABASE_URL", "https://mockproject.supabase.co"), \
             patch("app.services.whitelist.SUPABASE_KEY", "mockkey123"), \
             patch("requests.post", return_value=mock_post):
            res = ping_database()
            self.assertEqual(res["status"], "ok")
            self.assertEqual(res["provider"], "supabase")
            self.assertEqual(res["mode"], "write_heartbeat")
            self.assertIn("latency_ms", res)

    def test_ping_database_supabase_read_fallback(self):
        mock_post = MagicMock()
        mock_post.status_code = 403
        mock_get = MagicMock()
        mock_get.status_code = 200
        mock_get.json.return_value = [{"trader_id": "TRADER-TEST-123"}]

        with patch("app.services.whitelist.SUPABASE_URL", "https://mockproject.supabase.co"), \
             patch("app.services.whitelist.SUPABASE_KEY", "mockkey123"), \
             patch("requests.post", return_value=mock_post), \
             patch("requests.get", return_value=mock_get):
            res = ping_database()
            self.assertEqual(res["status"], "ok")
            self.assertEqual(res["provider"], "supabase")
            self.assertEqual(res["mode"], "read_fallback")
            self.assertEqual(res["rows_polled"], 1)

    def test_ping_database_supabase_error(self):
        mock_post = MagicMock()
        mock_post.status_code = 500
        mock_get = MagicMock()
        mock_get.status_code = 500
        mock_get.text = "Internal Server Error"

        with patch("app.services.whitelist.SUPABASE_URL", "https://mockproject.supabase.co"), \
             patch("app.services.whitelist.SUPABASE_KEY", "mockkey123"), \
             patch("requests.post", return_value=mock_post), \
             patch("requests.get", return_value=mock_get):
            res = ping_database()
            self.assertEqual(res["status"], "error")
            self.assertEqual(res["provider"], "supabase")
            self.assertEqual(res["status_code"], 500)

    def test_api_health_endpoint(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("status", data)
        self.assertIn("database", data)
        self.assertEqual(data["service"], "clearer.trade-backend")

    def test_api_keep_alive_endpoint(self):
        response = self.client.get("/api/keep-alive")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("status", data)
        self.assertIn("database", data)

if __name__ == "__main__":
    unittest.main()
