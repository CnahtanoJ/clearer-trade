import unittest
import pandas as pd
from app.services.analytics import enrich_with_public_klines

class TestMaeMfePhysicalBounds(unittest.TestCase):
    """
    Tests ensuring that:
    1. Losing trade: MAE can NEVER be less than the realized loss %
    2. Winning trade: MFE can NEVER be less than the realized profit %
    """

    def test_short_loss_mae_bounded(self):
        # The user's exact case: ZRO SHORT entered at 1.8903, exited at 2.0787 (-9.97% loss)
        df = pd.DataFrame([{
            "asset": "ZRO",
            "symbol": "ZRO",
            "side": "SHORT",
            "px": 1.8903,
            "exit_price": 2.0787,
            "sz": 15.0,
            "pnl": -2.826,
            "duration_minutes": 180.0
        }])
        enriched = enrich_with_public_klines(df)
        mae = enriched["mae_pct"].iloc[0]
        # Loss is 9.97%. MAE must be >= 9.97%
        self.assertGreaterEqual(mae, 9.96)

    def test_long_profit_mfe_bounded(self):
        # Winning LONG trade: entered at 100, exited at 115 (+15% profit)
        df = pd.DataFrame([{
            "asset": "BTC",
            "symbol": "BTC",
            "side": "LONG",
            "px": 100.0,
            "exit_price": 115.0,
            "sz": 1.0,
            "pnl": 15.0,
            "duration_minutes": 120.0
        }])
        enriched = enrich_with_public_klines(df)
        mfe = enriched["mfe_pct"].iloc[0]
        # Profit is 15%. MFE must be >= 15%
        self.assertGreaterEqual(mfe, 15.0)

    def test_demo_mode_bounds(self):
        # Test demo mode bounding
        df = pd.DataFrame([
            {
                "asset": "SOL",
                "side": "LONG",
                "px": 100.0,
                "exit_price": 120.0, # +20%
                "sz": 2.0,
                "pnl": 40.0
            },
            {
                "asset": "ETH",
                "side": "SHORT",
                "px": 3000.0,
                "exit_price": 3300.0, # -10% loss
                "sz": 1.0,
                "pnl": -300.0
            }
        ])
        enriched = enrich_with_public_klines(df, is_demo=True)
        # SOL long win: MFE must be at least 20%
        self.assertGreaterEqual(enriched["mfe_pct"].iloc[0], 20.0)
        # ETH short loss: MAE must be at least 10%
        self.assertGreaterEqual(enriched["mae_pct"].iloc[1], 10.0)

if __name__ == "__main__":
    unittest.main()
