#!/usr/bin/env python3
"""
Supabase Keep-Alive Poller Script
---------------------------------
Performs a lightweight `select=trader_id&limit=1` against Supabase REST API
to keep the database active and prevent project pausing on the Free tier.

Usage:
  python scripts/supabase_keepalive.py
  python scripts/supabase_keepalive.py --endpoint https://clearer.trade/api/keep-alive
"""

import os
import sys
import argparse
import datetime
import requests

# Automatically load .env if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

def ping_via_rest(supabase_url: str, supabase_key: str) -> dict:
    # 1. Attempt active write/heartbeat upsert to generate Postgres WAL/transaction activity
    url = f"{supabase_url.rstrip('/')}/rest/v1/whitelist"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    payload = {
        "trader_id": "_keepalive_heartbeat_",
        "credits_remaining": 999999
    }
    
    start = datetime.datetime.now(datetime.timezone.utc)
    try:
        res = requests.post(url, headers=headers, json=payload, timeout=10.0)
        elapsed_ms = round((datetime.datetime.now(datetime.timezone.utc) - start).total_seconds() * 1000, 2)
        if res.status_code in [200, 201, 204]:
            return {
                "success": True,
                "status_code": res.status_code,
                "latency_ms": elapsed_ms,
                "mode": "write_heartbeat"
            }
    except Exception as e:
        res = None
        write_err = str(e)
    else:
        write_err = res.text

    # 2. Fallback to lightweight SELECT query if write fails (e.g. read-only anon key)
    read_url = f"{supabase_url.rstrip('/')}/rest/v1/whitelist?select=trader_id&limit=1"
    headers_get = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json"
    }
    try:
        res_get = requests.get(read_url, headers=headers_get, timeout=10.0)
        elapsed_ms = round((datetime.datetime.now(datetime.timezone.utc) - start).total_seconds() * 1000, 2)
        if res_get.status_code in [200, 206]:
            return {
                "success": True,
                "status_code": res_get.status_code,
                "latency_ms": elapsed_ms,
                "mode": "read_fallback",
                "rows": res_get.json() if isinstance(res_get.json(), list) else []
            }
        else:
            return {
                "success": False,
                "status_code": res_get.status_code,
                "latency_ms": elapsed_ms,
                "error": f"POST failed: {write_err}; GET failed: {res_get.text}"
            }
    except Exception as e:
        return {
            "success": False,
            "status_code": 0,
            "latency_ms": 0,
            "error": f"POST failed: {write_err}; GET exception: {str(e)}"
        }

def ping_via_endpoint(endpoint_url: str) -> dict:
    start = datetime.datetime.now(datetime.timezone.utc)
    res = requests.get(endpoint_url, timeout=15.0)
    elapsed_ms = round((datetime.datetime.now(datetime.timezone.utc) - start).total_seconds() * 1000, 2)
    
    if res.status_code == 200:
        return {
            "success": True,
            "status_code": res.status_code,
            "latency_ms": elapsed_ms,
            "body": res.json() if res.headers.get("content-type", "").startswith("application/json") else res.text
        }
    else:
        return {
            "success": False,
            "status_code": res.status_code,
            "latency_ms": elapsed_ms,
            "error": res.text
        }

def main():
    parser = argparse.ArgumentParser(description="Keep Supabase project active via lightweight keep-alive ping.")
    parser.add_argument("--endpoint", "-e", help="Optional remote health URL (e.g. https://clearer.trade/api/keep-alive)")
    parser.add_argument("--url", "-u", default=os.getenv("SUPABASE_URL"), help="Supabase Project URL")
    parser.add_argument("--key", "-k", default=os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY"), help="Supabase anon or service key")
    
    args = parser.parse_args()
    
    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{now_str}] Starting Supabase keep-alive ping...")

    has_db_creds = bool(args.url and args.key)
    has_endpoint = bool(args.endpoint)

    if not has_db_creds and not has_endpoint:
        print("ERROR: Neither Supabase credentials (SUPABASE_URL + SUPABASE_KEY) nor an endpoint (--endpoint) were provided.")
        print("Set them in .env or provide via arguments / GitHub Actions secrets.")
        sys.exit(1)

    overall_success = True

    # 1. Direct Supabase DB ping (primary)
    if has_db_creds:
        print(f"Polling Supabase REST API directly: {args.url}")
        res_db = ping_via_rest(args.url, args.key)
        if res_db.get("success"):
            print(f"SUCCESS [Supabase DB]: Ping completed in {res_db.get('latency_ms')} ms (HTTP {res_db.get('status_code')}).")
            if res_db.get("mode") == "write_heartbeat":
                print("  -> Heartbeat write transaction recorded! WAL activity generated to prevent database auto-pause.")
            elif "rows" in res_db:
                print(f"  -> Queried {len(res_db['rows'])} record(s). Database is active and awake!")
        else:
            print(f"FAILED [Supabase DB]: HTTP {res_db.get('status_code')} error after {res_db.get('latency_ms')} ms.")
            print(f"  Details: {res_db.get('error')}")
            overall_success = False

    # 2. Remote App Endpoint ping (secondary / fallback)
    if has_endpoint:
        print(f"Polling application endpoint: {args.endpoint}")
        res_app = ping_via_endpoint(args.endpoint)
        if res_app.get("success"):
            print(f"SUCCESS [App Endpoint]: Ping completed in {res_app.get('latency_ms')} ms (HTTP {res_app.get('status_code')}).")
            print(f"  Response: {res_app.get('body')}")
        else:
            print(f"FAILED [App Endpoint]: HTTP {res_app.get('status_code')} error after {res_app.get('latency_ms')} ms.")
            print(f"  Details: {res_app.get('error')}")
            if not has_db_creds:
                overall_success = False

    if overall_success:
        print(f"[{now_str}] Supabase keep-alive routine completed successfully.")
        sys.exit(0)
    else:
        print(f"[{now_str}] Supabase keep-alive routine finished with errors.")
        sys.exit(1)

if __name__ == "__main__":
    main()
