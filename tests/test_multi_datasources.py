import requests
import time
from datetime import datetime, timezone

def test_bybit_klines():
    print("\n--- 1. Testing Bybit Public Klines API ---")
    url = "https://api.bybit.com/v5/market/kline"
    params = {
        "category": "linear",
        "symbol": "BTCUSDT",
        "interval": "5",
        "start": int(time.time() - 3600) * 1000,
        "limit": 10
    }
    try:
        resp = requests.get(url, params=params, timeout=5)
        print(f"Status Code: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            list_data = data.get("result", {}).get("list", [])
            print(f"Successfully fetched {len(list_data)} candles from Bybit!")
            if list_data:
                print("Sample candle [startTime, open, high, low, close]:", list_data[0][:5])
            return True
    except Exception as e:
        print(f"Bybit error: {e}")
    return False

def test_hyperliquid_candles():
    print("\n--- 2. Testing Hyperliquid Public API ---")
    url = "https://api.hyperliquid.xyz/info"
    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": "BTC",
            "interval": "5m",
            "startTime": int((time.time() - 3600) * 1000)
        }
    }
    try:
        resp = requests.post(url, json=payload, timeout=5)
        print(f"Status Code: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Successfully fetched {len(data)} candles from Hyperliquid!")
            if data:
                print("Sample candle:", data[0])
            return True
    except Exception as e:
        print(f"Hyperliquid error: {e}")
    return False

def test_yahoo_finance():
    print("\n--- 3. Testing Yahoo Finance (v8 chart API for Forex/Stocks) ---")
    # Tickers to test: EURUSD=X (Forex), AAPL (Stock), GC=F (Gold)
    symbols = ["EURUSD=X", "AAPL", "GC=F"]
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    for symbol in symbols:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=5m&range=1d"
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            print(f"Symbol {symbol} Status: {resp.status_code}")
            if resp.status_code == 200:
                result = resp.json().get("chart", {}).get("result", [])
                if result:
                    quote = result[0].get("indicators", {}).get("quote", [{}])[0]
                    highs = quote.get("high", [])
                    lows = quote.get("low", [])
                    print(f"  [{symbol}] Fetched {len(highs)} high/low ticks successfully!")
        except Exception as e:
            print(f"  [{symbol}] Yahoo error: {e}")

if __name__ == "__main__":
    test_bybit_klines()
    test_hyperliquid_candles()
    test_yahoo_finance()
