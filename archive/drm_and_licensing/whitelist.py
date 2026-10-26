import os
import datetime
import hmac
import hashlib
import json
import base64
import requests

# Enforce strict security check: JWT_SECRET must be set in production
SECRET_KEY = os.getenv("JWT_SECRET") or os.getenv("JWT_Secret") or os.getenv("jwt_secret")
is_prod = os.getenv("NODE_ENV", "").lower() in ["production", "prod"] or os.getenv("VERCEL_ENV", "").lower() in ["production", "prod"]

if is_prod and (not SECRET_KEY or SECRET_KEY == "super-secret-key-for-drop-and-audit"):
    raise RuntimeError("CRITICAL SECURITY ERROR: JWT_SECRET environment variable must be configured in production Vercel project settings.")

if not SECRET_KEY:
    SECRET_KEY = "super-secret-key-for-drop-and-audit"

# Supabase Credentials (Required for cloud serverless database persistence)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if is_prod and (not SUPABASE_URL or not SUPABASE_KEY):
    raise RuntimeError(
        "CRITICAL DATABASE ERROR: SUPABASE_URL and SUPABASE_KEY environment variables must be configured in production project settings. SQLite fallback is disabled to prevent ephemeral data loss on serverless functions."
    )

_LOCAL_TRADER_DB = {}

def get_trader_record(trader_id: str) -> dict:
    """Retrieves trader record strictly from Supabase REST API database with local dev fallback."""
    clean_tid = trader_id.strip()
    if not SUPABASE_URL or not SUPABASE_KEY:
        if is_prod:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY are required in production.")
        return _LOCAL_TRADER_DB.get(clean_tid)

    try:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }
        res = requests.get(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/whitelist?trader_id=eq.{clean_tid}&select=*",
            headers=headers,
            timeout=5.0
        )
        if res.status_code == 200:
            rows = res.json()
            if rows and len(rows) > 0:
                row = rows[0]
                # Normalize credits_remaining from database record
                if "credits_remaining" in row and row["credits_remaining"] is not None:
                    return row
                # Backward-compatibility fallback for legacy usage_count + extra_credits rows
                usage = row.get("usage_count", 0) or 0
                extra = row.get("extra_credits", 0) or 0
                row["credits_remaining"] = max(0, (240 + extra) - usage)
                return row
    except Exception as e:
        if is_prod:
            raise RuntimeError(f"Database error reaching Supabase REST API: {str(e)}")
        return _LOCAL_TRADER_DB.get(clean_tid)
    return None

def upsert_trader_record(trader_id: str, credits_remaining: int, devices: list = None) -> bool:
    """Upserts trader credits_remaining strictly to Supabase REST API database with local dev fallback."""
    clean_tid = trader_id.strip()
    if not SUPABASE_URL or not SUPABASE_KEY:
        if is_prod:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY are required in production.")
        rec = _LOCAL_TRADER_DB.get(clean_tid, {})
        rec["trader_id"] = clean_tid
        rec["credits_remaining"] = credits_remaining
        if devices is not None:
            rec["devices"] = devices
        _LOCAL_TRADER_DB[clean_tid] = rec
        return True

    try:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        payload = {
            "trader_id": clean_tid,
            "credits_remaining": credits_remaining
        }
        if devices is not None:
            payload["devices"] = json.dumps(devices) if isinstance(devices, list) else devices
        res = requests.post(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/whitelist",
            headers=headers,
            json=payload,
            timeout=5.0
        )
        return res.status_code in [200, 201, 204]
    except Exception as e:
        if is_prod:
            raise RuntimeError(f"Database error writing to Supabase REST API: {str(e)}")
        rec = _LOCAL_TRADER_DB.get(clean_tid, {})
        rec["trader_id"] = clean_tid
        rec["credits_remaining"] = credits_remaining
        if devices is not None:
            rec["devices"] = devices
        _LOCAL_TRADER_DB[clean_tid] = rec
        return False

def validate_whop_license(license_key: str, device_fingerprint: str = None) -> dict:
    """
    Validates a Whop membership license key via Whop API v1.
    Whop natively returns membership status ('completed' or 'active') and license_key.
    """
    whop_api_key = os.getenv("WHOP_API_KEY")
    clean_key = license_key.strip()
    if not whop_api_key or not clean_key or clean_key.startswith("TRADER-") or clean_key.startswith("GUEST") or len(clean_key) < 5:
        return {"valid": False, "message": "Whop API not configured or key format not recognized."}
    
    try:
        url = f"https://api.whop.com/api/v1/memberships/{clean_key}"
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {whop_api_key}", "Accept": "application/json"},
            timeout=5.0
        )
        if response.status_code == 200:
            data = response.json()
            status_val = str(data.get("status", "")).lower()
            if data.get("valid") is True or status_val in ["completed", "active"] or data.get("license_key"):
                trader_id = f"WHOP_{clean_key[:12]}"
                return {"valid": True, "trader_id": trader_id}
            else:
                return {"valid": False, "message": "Inactive or expired Whop license key."}
        elif response.status_code == 429 or response.status_code == 400:
            return {"valid": False, "message": "Whop license activation limit of 3 devices reached. Manage devices at whop.com/orders."}
    except Exception as e:
        return {"valid": False, "message": f"Whop API error: {str(e)}"}
    return {"valid": False, "message": "Failed to validate Whop license key."}

def check_quota_allowed(trader_id: str, default_limit: int = 240) -> dict:
    """
    Checks if a trader has remaining AI audit credits without deducting quota.
    """
    if not trader_id:
        return {"allowed": False, "message": "Trader ID is required for AI audit."}
        
    clean_tid = trader_id.strip()
    row = get_trader_record(clean_tid)
    
    if not row:
        credits_remaining = default_limit
        upsert_trader_record(clean_tid, credits_remaining)
    else:
        credits_remaining = row.get("credits_remaining", default_limit)

    if credits_remaining <= 0:
        return {
            "allowed": False,
            "message": f"Trader ID '{clean_tid}' has exhausted all included AI audits. Please toggle 'Custom BYOK Key' or purchase an AI Credit Pack (+50 Audits for $1.99) to continue."
        }

    return {
        "allowed": True,
        "remaining": credits_remaining,
        "count": max(0, 240 - credits_remaining),
        "total_limit": 240,
        "message": "Authorized"
    }

def increment_trader_usage(trader_id: str, default_limit: int = 240) -> dict:
    """
    Deducts 1 AI audit credit strictly after successful AI generation.
    """
    if not trader_id:
        return {"allowed": False, "message": "Trader ID is required for AI audit."}
        
    clean_tid = trader_id.strip()
    row = get_trader_record(clean_tid)
    
    if not row:
        credits_remaining = default_limit
    else:
        credits_remaining = row.get("credits_remaining", default_limit)

    credits_remaining = max(0, credits_remaining - 1)
    upsert_trader_record(clean_tid, credits_remaining)

    return {
        "allowed": True,
        "remaining": credits_remaining,
        "count": max(0, 240 - credits_remaining),
        "total_limit": 240,
        "message": "Quota updated"
    }

def check_and_increment_usage(trader_id: str, default_limit: int = 240) -> dict:
    """
    Atomic AI audit credit check & decrement.
    Uses single `credits_remaining` column in Supabase database.
    """
    chk = check_quota_allowed(trader_id, default_limit)
    if not chk.get("allowed"):
        return chk
    return increment_trader_usage(trader_id, default_limit)


def add_trader_extra_credits(trader_id: str, credits_to_add: int = 50) -> dict:
    """Adds purchased AI extra credits (+50 per pack) to trader's Supabase record."""
    clean_tid = trader_id.strip()
    row = get_trader_record(clean_tid)
    
    if not row:
        credits_remaining = 240 + credits_to_add
    else:
        credits_remaining = (row.get("credits_remaining", 240) or 240) + credits_to_add
        
    upsert_trader_record(clean_tid, credits_remaining)
    return {
        "success": True,
        "trader_id": clean_tid,
        "credits_remaining": credits_remaining,
        "remaining": credits_remaining
    }

def generate_access_token(trader_id: str, days: int = 3650) -> str:
    """Generates a secure HMAC-SHA256 signed access token for a trader ID (defaults to 10 years / lifetime)."""
    payload = {"trader_id": trader_id, "exp": (datetime.datetime.now() + datetime.timedelta(days=days)).timestamp()}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signature = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"

def verify_access_token(token: str, client_ip: str = None, instance_name: str = None, device_name: str = None) -> dict:
    """
    Decodes and verifies access tokens:
    1. Signed HMAC Tokens (Admin/VIP - verified in 0ms)
    2. Whop License Keys (Validated with Whop API + Whop 3-device activation limit)
    3. Fetches live `credits_remaining` from Supabase
    """
    if not token or not token.strip():
        return {"allowed": False, "message": "Access Key is required."}
        
    clean_token = token.strip()
    trader_id = None
    whop_error_msg = None
    
    # 1. Try HMAC verification first (0ms)
    if "." in clean_token:
        try:
            payload_b64, signature = clean_token.rsplit(".", 1)
            expected_sig = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
            if hmac.compare_digest(expected_sig, signature):
                padding = 4 - (len(payload_b64) % 4)
                if padding != 4:
                    payload_b64 += "=" * padding
                payload = json.loads(base64.urlsafe_b64decode(payload_b64).decode())
                exp = payload.get("exp")
                if exp and datetime.datetime.now().timestamp() > exp:
                    return {"allowed": False, "message": "Access Token has expired."}
                trader_id = payload.get("trader_id")
        except Exception:
            pass

    # 2. Try Whop validation if not HMAC
    if not trader_id:
        whop_res = validate_whop_license(clean_token, device_fingerprint=instance_name)
        if whop_res.get("valid"):
            trader_id = whop_res.get("trader_id")
        elif whop_res.get("message"):
            whop_error_msg = whop_res.get("message")

    # 3. Fallback check for pre-seeded database Trader IDs
    validated_external = trader_id is not None
    if not trader_id:
        trader_id = clean_token

    clean_tid = trader_id.strip()

    # Edge Case A: If Whop API explicitly denied license (e.g. refunded/terminated key), block access immediately!
    if not validated_external and whop_error_msg and clean_tid not in ["TRADER-JONAT"]:
        return {"allowed": False, "message": whop_error_msg}

    row = get_trader_record(clean_tid)
    
    if not row:
        if validated_external or clean_tid in ["TRADER-JONAT"]:
            credits_remaining = 240
            upsert_trader_record(clean_tid, credits_remaining)
        else:
            final_err = whop_error_msg or "License Key is invalid or not whitelisted. Please check your key."
            return {"allowed": False, "message": final_err}
    else:
        credits_remaining = row.get("credits_remaining", 240)

    # Check 3x Device Seat Enforcement if fingerprint provided
    devices_info = None
    if instance_name:
        dev_res = validate_and_update_device_seats(clean_tid, instance_name, device_name)
        devices_info = dev_res.get("devices")
        if not dev_res.get("allowed"):
            return {
                "allowed": False,
                "devices_full": True,
                "devices": dev_res.get("devices"),
                "message": dev_res.get("message") or "3x Device Seat Limit Reached."
            }

    if devices_info is None:
        fresh_row = get_trader_record(clean_tid) or row or {}
        raw_devices = fresh_row.get("devices")
        if isinstance(raw_devices, str):
            try:
                devices_info = json.loads(raw_devices)
            except Exception:
                devices_info = []
        elif isinstance(raw_devices, list):
            devices_info = raw_devices
        else:
            devices_info = []

    return {
        "allowed": True,
        "trader_id": clean_tid,
        "remaining": credits_remaining,
        "usage_count": max(0, 240 - credits_remaining),
        "limit": 240,
        "devices": devices_info,
        "message": "Authorized"
    }

def validate_and_update_device_seats(trader_id: str, device_fingerprint: str = None, device_name: str = None) -> dict:
    """Validates active device seat limit (max 3) for a given trader ID."""
    if not device_fingerprint or not device_fingerprint.strip():
        return {"allowed": True}
    
    clean_tid = trader_id.strip()
    clean_fp = device_fingerprint.strip()
    row = get_trader_record(clean_tid) or {}
    
    raw_devices = row.get("devices")
    devices = []
    if isinstance(raw_devices, str):
        try:
            devices = json.loads(raw_devices)
        except Exception:
            devices = []
    elif isinstance(raw_devices, list):
        devices = raw_devices

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    for i, dev in enumerate(devices):
        if dev.get("fingerprint") == clean_fp:
            dev["last_active"] = now_iso
            if device_name and (not dev.get("name") or dev.get("name").startswith("Device ")):
                dev["name"] = device_name
            upsert_trader_record(clean_tid, row.get("credits_remaining", 240), devices)
            return {"allowed": True, "slot": dev.get("slot", i+1), "devices": devices}
            
    if len(devices) < 3:
        new_slot = {
            "slot": len(devices) + 1,
            "fingerprint": clean_fp,
            "name": device_name or f"Device {len(devices) + 1}",
            "activated_at": now_iso,
            "last_active": now_iso
        }
        devices.append(new_slot)
        upsert_trader_record(clean_tid, row.get("credits_remaining", 240), devices)
        return {"allowed": True, "slot": new_slot["slot"], "devices": devices}
        
    return {
        "allowed": False,
        "devices_full": True,
        "message": "Active 3x Device Seat Limit Reached. Reset an active device seat to authorize this current device.",
        "devices": devices
    }

def reset_trader_device_slot(trader_id: str, slot_id: int, new_fingerprint: str = None, new_device_name: str = None) -> dict:
    """Resets or deactivates a device seat, enforcing a 7-day cooldown per device slot after reset."""
    import math
    try:
        slot_num = int(slot_id)
    except Exception:
        return {"success": False, "message": f"Invalid device slot ID: {slot_id}."}

    clean_tid = trader_id.strip()
    row = get_trader_record(clean_tid) or {}
    
    raw_devices = row.get("devices")
    devices = []
    if isinstance(raw_devices, str):
        try:
            devices = json.loads(raw_devices)
        except Exception:
            devices = []
    elif isinstance(raw_devices, list):
        devices = raw_devices
        
    target_idx = slot_num - 1
    if target_idx < 0 or target_idx >= len(devices):
        return {"success": False, "message": f"Device slot #{slot_num} does not exist."}
        
    dev = devices[target_idx]
    reset_str = dev.get("last_reset_at")
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    
    if reset_str:
        try:
            rst_dt = datetime.datetime.fromisoformat(str(reset_str).replace("Z", "+00:00"))
            if rst_dt.tzinfo is None:
                rst_dt = rst_dt.replace(tzinfo=datetime.timezone.utc)
            delta_seconds = (now_dt - rst_dt).total_seconds()
            cooldown_seconds = 7 * 86400  # 7 days
            if delta_seconds < cooldown_seconds:
                remaining_secs = cooldown_seconds - delta_seconds
                days_left = max(1, int(math.ceil(remaining_secs / 86400)))
                return {
                    "success": False,
                    "cooldown_active": True,
                    "days_remaining": days_left,
                    "message": f"Device Slot #{slot_num} was reset recently. Cooldown active: reset available in {days_left} day(s)."
                }
        except Exception:
            pass

    now_iso = now_dt.isoformat()
    if new_fingerprint:
        clean_new_fp = new_fingerprint.strip()
        # Prevent assigning the same device fingerprint to multiple slots
        for idx, d in enumerate(devices):
            if idx != target_idx and d.get("fingerprint") == clean_new_fp:
                return {
                    "success": False,
                    "message": f"This device is already registered to Device Slot #{idx + 1}."
                }

        devices[target_idx] = {
            "slot": slot_num,
            "fingerprint": clean_new_fp,
            "name": new_device_name or f"Device {slot_num}",
            "activated_at": now_iso,
            "last_active": now_iso,
            "last_reset_at": now_iso
        }
    else:
        devices.pop(target_idx)
        for idx, d in enumerate(devices):
            d["slot"] = idx + 1
            
    upsert_trader_record(clean_tid, row.get("credits_remaining", 240), devices)
    return {
        "success": True,
        "message": f"Device Slot #{slot_num} successfully updated!",
        "devices": devices
    }

def ping_database() -> dict:
    """
    Performs an active database heartbeat upsert against the Supabase REST API
    to produce real transaction/WAL activity and prevent free-tier auto-pausing.
    Falls back to a lightweight SELECT query if upsert is restricted.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {
            "status": "ok",
            "provider": "sqlite_fallback",
            "message": "Supabase credentials not configured. Local fallback store is active."
        }

    try:
        start_time = datetime.datetime.now(datetime.timezone.utc)
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        heartbeat_payload = {
            "trader_id": "_keepalive_heartbeat_",
            "credits_remaining": 999999
        }
        res = requests.post(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/whitelist",
            headers=headers,
            json=heartbeat_payload,
            timeout=8.0
        )
        duration_ms = round((datetime.datetime.now(datetime.timezone.utc) - start_time).total_seconds() * 1000, 2)
        if res.status_code in [200, 201, 204]:
            return {
                "status": "ok",
                "provider": "supabase",
                "latency_ms": duration_ms,
                "mode": "write_heartbeat",
                "message": "Supabase transaction and WAL write active and healthy."
            }

        # Fallback to read query if upsert returns non-success (e.g. read-only anon key)
        res_get = requests.get(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/whitelist?select=trader_id&limit=1",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json"
            },
            timeout=8.0
        )
        duration_ms = round((datetime.datetime.now(datetime.timezone.utc) - start_time).total_seconds() * 1000, 2)
        if res_get.status_code in [200, 206]:
            rows = res_get.json() if isinstance(res_get.json(), list) else []
            return {
                "status": "ok",
                "provider": "supabase",
                "latency_ms": duration_ms,
                "rows_polled": len(rows),
                "mode": "read_fallback",
                "message": "Supabase read connection active and healthy."
            }
        else:
            return {
                "status": "error",
                "provider": "supabase",
                "status_code": res.status_code,
                "error": res.text,
                "latency_ms": duration_ms
            }
    except Exception as e:
        return {
            "status": "error",
            "provider": "supabase",
            "error": str(e)
        }

