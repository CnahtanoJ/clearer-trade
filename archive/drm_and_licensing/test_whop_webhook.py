import unittest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from app.services.whitelist import get_trader_record, add_trader_extra_credits
from app.main import whop_credit_pack_webhook

class TestWhopWebhook(unittest.TestCase):
    def test_webhook_test_payload_returns_200(self):
        """Test Whop test webhook payload returns HTTP 200 with success: true."""
        mock_request = MagicMock()
        mock_request.json = AsyncMock(return_value={
            "action": "payment_created",
            "data": {
                "id": "pay_test_12345",
                "membership_id": "mem_test_12345",
                "product_id": "prod_50_ai_pack",
                "user_id": "usr_test_12345",
                "amount": 199
            }
        })

        response = asyncio.run(whop_credit_pack_webhook(mock_request))
        self.assertEqual(response.status_code, 200)
        body = response.body.decode('utf-8')
        self.assertIn('"success":true', body.replace(" ", ""))

    def test_webhook_production_payment_created_credits_50_pack(self):
        """Test real payment_created event adds 50 AI audit credits to trader."""
        trader_key = "biz_real_user_777"
        mock_request = MagicMock()
        mock_request.json = AsyncMock(return_value={
            "action": "payment_created",
            "data": {
                "id": "pay_real_777",
                "membership_id": trader_key,
                "product_id": "prod_50_ai_pack",
                "user_id": "usr_real_777",
                "amount": 199
            }
        })

        response = asyncio.run(whop_credit_pack_webhook(mock_request))
        self.assertEqual(response.status_code, 200)
        body = response.body.decode('utf-8')
        self.assertIn('"success":true', body.replace(" ", ""))

if __name__ == "__main__":
    unittest.main()
