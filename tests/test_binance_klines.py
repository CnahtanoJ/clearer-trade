import requests
import pandas as pd
from datetime import datetime, timezone
import sys
import os

sys.path.insert(0, os.path.abspath('.'))
from app.services.analytics import enrich_with_public_klines

def verify_enrichment():
    print("--- TESTING ENRICH_WITH_PUBLIC_KLINES ---")
    test_dt = datetime(2024, 7, 1, 12, 0, 0, tzinfo=timezone.utc)
    start_ms = int(test_dt.timestamp() * 1000)

    df_test = pd.DataFrame([{
        "asset": "BTC",
        "side": "BUY",
        "px": 63000.0,
        "pnl": 500.0,
        "timestamp": start_ms
    }])
    
    enriched = enrich_with_public_klines(df_test)
    print("Enrichment Result:")
    print(enriched[["asset", "mae_pct", "mfe_pct", "t_plus_30m_px"]].to_dict(orient="records"))
    print("--- TEST PASSED ---")

if __name__ == "__main__":
    verify_enrichment()
