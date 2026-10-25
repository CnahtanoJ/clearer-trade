import unittest
import pandas as pd
import numpy as np

from app.services.analytics import (
    enrich_with_public_klines,
    classify_market_regimes,
    compute_session_metrics,
    compute_day_time_heatmap
)
from app.services.parser import process_trade_dataframe

class TestKlineEnrichmentIntegrity(unittest.TestCase):

    def setUp(self):
        now_ms = 1782811800000
        trades_data = []
        # Create 10 sample trades with timestamps
        for i in range(10):
            pnl = 100.0 if i % 2 == 0 else -50.0
            trades_data.append({
                "timestamp": now_ms + (i * 3600000),
                "date": f"2026-07-01 {9+i:02d}:00:00",
                "asset": "BTCUSDT",
                "symbol": "BTCUSDT",
                "side": "BUY" if i % 2 == 0 else "SELL",
                "px": 60000.0,
                "sz": 0.1,
                "pnl": pnl,
                "strategy_tag": "Trend Following"
            })
        self.raw_df = pd.DataFrame(trades_data)

    def test_enrichment_does_not_alter_core_metrics(self):
        res_before = process_trade_dataframe(self.raw_df.copy(), is_pro=True)
        metrics_before = res_before["metrics"]
        
        # Perform tick enrichment
        enriched_df = pd.DataFrame(res_before["trades"])
        enriched_df = enrich_with_public_klines(enriched_df)
        res_after = process_trade_dataframe(enriched_df, is_pro=True)
        metrics_after = res_after["metrics"]

        # Core trade performance MUST remain identical
        self.assertEqual(metrics_before["win_rate"], metrics_after["win_rate"])
        self.assertEqual(metrics_before["net_pnl"], metrics_after["net_pnl"])
        self.assertEqual(metrics_before["profit_factor"], metrics_after["profit_factor"])
        self.assertEqual(metrics_before["total_trades"], metrics_after["total_trades"])
        self.assertEqual(metrics_before["total_sessions"], metrics_after["total_sessions"])
        self.assertGreater(len(metrics_after["heatmap_matrix"]), 0)

    def test_regime_classification_distribution(self):
        classified_df = classify_market_regimes(self.raw_df.copy())
        regimes = classified_df["market_regime"].unique()
        self.assertTrue(len(regimes) > 0)
        self.assertIn("market_regime", classified_df.columns)

if __name__ == "__main__":
    unittest.main()
