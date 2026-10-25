import unittest
from fastapi.testclient import TestClient
from app.main import app

class TestStatelessHealthAndDemo(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_check_stateless(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("status"), "healthy")
        self.assertEqual(data.get("service"), "clearer.trade-backend")
        self.assertIn("stateless", data.get("architecture", ""))

    def test_keep_alive_stateless(self):
        response = self.client.get("/api/keep-alive")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("status"), "healthy")

    def test_demo_endpoint_loads(self):
        response = self.client.get("/api/demo")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success", False))
        self.assertTrue(data.get("metrics", {}).get("is_demo", False))
        self.assertTrue(data.get("metrics", {}).get("is_pro", False))
        self.assertGreater(len(data.get("trades", [])), 0)

if __name__ == "__main__":
    unittest.main()
