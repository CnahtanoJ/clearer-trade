import unittest
import sys
import os

sys.path.insert(0, os.path.abspath('.'))

from app.services.whitelist import reset_trader_device_slot, get_trader_record, upsert_trader_record
from fastapi.testclient import TestClient
from app.main import app

class TestDeviceReset(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.trader_id = "TRADER-TEST-RESET"
        upsert_trader_record(self.trader_id, 240, [
            {"slot": 1, "fingerprint": "fp1", "name": "Device 1", "activated_at": "2026-08-25T10:00:00"},
            {"slot": 2, "fingerprint": "fp2", "name": "Device 2", "activated_at": "2026-08-25T10:00:00"},
            {"slot": 3, "fingerprint": "fp3", "name": "Device 3", "activated_at": "2026-08-25T10:00:00"}
        ])

    def test_device_reset_slot_success(self):
        res = reset_trader_device_slot(self.trader_id, 1, "fp_new_1", "New Device 1")
        self.assertTrue(res.get("success"))
        devices = res.get("devices", [])
        self.assertEqual(len(devices), 3)
        self.assertEqual(devices[0].get("slot"), 1)
        self.assertEqual(devices[0].get("fingerprint"), "fp_new_1")
        self.assertEqual(devices[0].get("name"), "New Device 1")

    def test_device_reset_cooldown(self):
        # Reset once
        res1 = reset_trader_device_slot(self.trader_id, 2, "fp_new_2", "New Device 2")
        self.assertTrue(res1.get("success"))
        # Reset immediately again -> should trigger cooldown
        res2 = reset_trader_device_slot(self.trader_id, 2, "fp_new_2_again", "New Device 2 Again")
        self.assertFalse(res2.get("success"))
        self.assertTrue(res2.get("cooldown_active"))

    def test_device_reset_duplicate_fingerprint(self):
        # fp3 is in slot 3, trying to reset slot 1 to fp3 should fail
        res = reset_trader_device_slot(self.trader_id, 1, "fp3", "Device 3 Duplicate")
        self.assertFalse(res.get("success"))
        self.assertIn("already registered", res.get("message", ""))

    def test_device_reset_invalid_slot(self):
        res = reset_trader_device_slot(self.trader_id, 99, "fp_invalid", "Invalid Slot")
        self.assertFalse(res.get("success"))

if __name__ == "__main__":
    unittest.main()

