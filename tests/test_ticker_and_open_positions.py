import unittest
import pandas as pd
import time
from app.services.analytics import normalize_and_resolve_ticker, enrich_with_public_klines
from app.services.parser import process_trade_dataframe

class TestTickerAndOpenPositions(unittest.TestCase):

    def test_semi_fuzzy_ticker_resolution(self):
        # Crypto test cases
        res1 = normalize_and_resolve_ticker("BTC/USDT")
        self.assertEqual(res1["base"], "BTC")
        self.assertEqual(res1["coinbase"], "BTC-USD")
        self.assertFalse(res1["is_forex"])

        res2 = normalize_and_resolve_ticker("PERP_SOL_USDT")
        self.assertEqual(res2["base"], "SOL")

        res3 = normalize_and_resolve_ticker("1000PEPE")
        self.assertEqual(res3["base"], "PEPE")

        res4 = normalize_and_resolve_ticker("XBT/USD")
        self.assertEqual(res4["base"], "BTC")

        # Forex test case
        res_fx = normalize_and_resolve_ticker("EUR/USD")
        self.assertTrue(res_fx["is_forex"])
        self.assertEqual(res_fx["yahoo"], "EURUSD=X")

        # Stock test case
        res_stock = normalize_and_resolve_ticker("NASDAQ:AAPL")
        self.assertTrue(res_stock["is_stock"])
        self.assertEqual(res_stock["base"], "AAPL")

        # HIP-3 DEX test cases
        res_hip3_1 = normalize_and_resolve_ticker("NVDA(xyz)")
        self.assertEqual(res_hip3_1["hl_coin"], "xyz:NVDA")
        self.assertEqual(res_hip3_1["base"], "NVDA")
        self.assertEqual(res_hip3_1["yahoo"], "NVDA")

        res_hip3_2 = normalize_and_resolve_ticker("xyz:NVDA")
        self.assertEqual(res_hip3_2["hl_coin"], "xyz:NVDA")
        self.assertEqual(res_hip3_2["base"], "NVDA")

    def test_open_positions_metrics_separation(self):
        # 5 Buy fills without exit fills (all open in FIFO mode)
        now_ms = int(time.time() * 1000)
        trades = []
        for i in range(5):
            trades.append({
                "timestamp": now_ms - (i * 3600000),
                "asset": "BTC/USDT",
                "side": "BUY",
                "px": 60000.0,
                "sz": 0.1,
                "pnl": 0.0
            })
        df = pd.DataFrame(trades)
        result = process_trade_dataframe(df, is_consolidated=False)
        metrics = result["metrics"]

        # In FIFO mode without sell fills, all positions should be OPEN
        self.assertEqual(metrics["total_trades"], 0) # 0 realized closed trades
        self.assertEqual(metrics["open_positions_count"], 1) # 5 fills merged into 1 active open position
        self.assertEqual(metrics["total_records"], 1)

    def test_tick_enrichment_with_fuzzy_tickers(self):
        now_ms = int(time.time() * 1000) - (2 * 3600000)
        df = pd.DataFrame([{
            "timestamp": now_ms,
            "asset": "BTC/USDT",
            "side": "BUY",
            "px": 60000.0,
            "sz": 0.1,
            "pnl": 50.0
        }])
        enriched = enrich_with_public_klines(df)
        self.assertIn("is_live_tick", enriched.columns)
        self.assertIn("data_source", enriched.columns)
        self.assertTrue(enriched["is_live_tick"].iloc[0]) # Should succeed via Coinbase or Hyperliquid

if __name__ == "__main__":
    unittest.main()
