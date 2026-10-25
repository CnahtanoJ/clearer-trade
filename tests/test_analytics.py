import unittest
import sys
import os
sys.path.insert(0, os.path.abspath('.'))

import pandas as pd
import numpy as np

from app.services.analytics import (
    is_long_trade,
    compute_drawdown_metrics,
    _calculate_win_rate_and_pf,
    compute_trading_metrics
)

class TestAnalyticsMathAudit(unittest.TestCase):
    """
    Automated audit test suite verifying the mathematical accuracy and soundness 
    of trade analytics, Win Rate, Profit Factor, Expectancy, and Drawdown calculations.
    """

    def test_is_long_trade_classification(self):
        self.assertTrue(is_long_trade("BUY"))
        self.assertTrue(is_long_trade("Long"))
        self.assertTrue(is_long_trade("Open Long"))
        self.assertFalse(is_long_trade("SELL"))
        self.assertFalse(is_long_trade("Short"))
        self.assertFalse(is_long_trade("Close Short"))

    def test_win_rate_and_profit_factor(self):
        # 3 winning trades (+200, +300, +100 = 600 profit)
        # 2 losing trades (-100, -200 = 300 loss)
        df = pd.DataFrame({
            "pnl": [200.0, -100.0, 300.0, -200.0, 100.0]
        })
        
        total_trades, total_wins, total_losses, win_rate, profit_factor, wins, losses = _calculate_win_rate_and_pf(df)
        
        self.assertEqual(total_trades, 5)
        self.assertEqual(total_wins, 3)
        self.assertEqual(total_losses, 2)
        self.assertAlmostEqual(win_rate, 60.0, places=2)  # 3/5 = 60%
        self.assertAlmostEqual(profit_factor, 2.0, places=2) # 600 / 300 = 2.0

    def test_drawdown_metrics(self):
        # Initial equity = 100,000
        # PnLs: +10,000 (eq=110k, peak=110k, dd=0%)
        #       -11,000 (eq=99k, peak=110k, dd=10%)
        #       +5,000  (eq=104k, peak=110k, dd=5.45%)
        #       +10,000 (eq=114k, peak=114k, dd=0%)
        pnl_series = pd.Series([10000.0, -11000.0, 5000.0, 10000.0])
        avg_dd, max_dd, max_dur = compute_drawdown_metrics(pnl_series, start_equity=100000.0)
        
        self.assertAlmostEqual(max_dd, 10.0, places=1) # 11k drop on 110k peak = 10%
        self.assertEqual(max_dur, 2) # 2 trades spent under peak

    def test_compute_trading_metrics_expectancy(self):
        # 2 wins (+100 on 1000 cost = +10%), 2 losses (-50 on 1000 cost = -5%)
        df = pd.DataFrame({
            "pnl": [100.0, -50.0, 100.0, -50.0],
            "px": [100.0, 100.0, 100.0, 100.0],
            "sz": [10.0, 10.0, 10.0, 10.0]
        })
        res = compute_trading_metrics(df, start_equity=10000.0)
        
        # Net profit = 100 - 50 + 100 - 50 = 100
        self.assertEqual(res["total_trades"], 4)
        self.assertEqual(res["win_rate"], 50.0) # 2 wins, 2 losses
        self.assertEqual(res["profit_factor"], 2.0) # 200 win / 100 loss = 2.0
        self.assertEqual(res["net_profit"], 100.0)
        self.assertEqual(res["avg_win_pct"], 10.0)
        self.assertEqual(res["avg_loss_pct"], 5.0)
        # Expectancy % = (0.5 * 10%) - (0.5 * 5%) = 5% - 2.5% = 2.5%
        self.assertAlmostEqual(res["expectancy_pct"], 2.5, places=2)

if __name__ == "__main__":
    unittest.main()
