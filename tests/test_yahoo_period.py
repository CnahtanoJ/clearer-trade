import requests
import time
from datetime import datetime, timezone, timedelta

def test_yahoo_timestamps():
    # Test 2 days ago timestamp
    t_dt = datetime.now(timezone.utc) - timedelta(days=2)
    start_sec = int(t_dt.timestamp())
    end_sec = start_sec + (45 * 60) # 45 minutes window
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    symbol = "EURUSD=X"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={start_sec}&period2={end_sec}&interval=5m"
    
    resp = requests.get(url, headers=headers, timeout=5)
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        result = data.get("chart", {}).get("result", [])
        if result:
            quote = result[0].get("indicators", {}).get("quote", [{}])[0]
            highs = [h for h in quote.get("high", []) if h is not None]
            lows = [l for l in quote.get("low", []) if l is not None]
            closes = [c for c in quote.get("close", []) if c is not None]
            print(f"Fetched Highs ({len(highs)}):", highs)
            print(f"Fetched Lows ({len(lows)}):", lows)
            print(f"Fetched Closes ({len(closes)}):", closes)

if __name__ == "__main__":
    test_yahoo_timestamps()
