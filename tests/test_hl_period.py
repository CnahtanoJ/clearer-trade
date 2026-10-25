import requests
import time
from datetime import datetime, timezone, timedelta

def test_hl_timestamps():
    t_dt = datetime.now(timezone.utc) - timedelta(days=2)
    start_ms = int(t_dt.timestamp() * 1000)
    end_ms = start_ms + (45 * 60 * 1000)
    
    url = "https://api.hyperliquid.xyz/info"
    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": "ETH",
            "interval": "5m",
            "startTime": start_ms,
            "endTime": end_ms
        }
    }
    
    resp = requests.post(url, json=payload, timeout=5)
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Fetched {len(data)} candles from Hyperliquid:")
        for c in data:
            print("  Candle:", c)

if __name__ == "__main__":
    test_hl_timestamps()
