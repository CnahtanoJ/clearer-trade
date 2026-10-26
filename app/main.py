from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import os
import json
import pandas as pd
import asyncio
import logging

logger = logging.getLogger("clearer.trade")

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.services.parser import parse_trading_log, process_trade_dataframe
from app.services.ai import generate_behavioral_audit

from fastapi.middleware.cors import CORSMiddleware

# Set up slowapi Limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Drop & Audit Trading Journal")
app.state.limiter = limiter

# Enable CORS for Next.js frontend with support for Vercel preview URLs and custom domains
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
allowed_origins = [origin.strip() for origin in allowed_origins_env if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://(clearer-trade|drop-and-audit-trading-suite)(-[a-z0-9]+)?\.vercel\.app|https://([a-z0-9]+\.)?clearer\.trade",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_PAYLOAD_SIZE = 5 * 1024 * 1024  # 5MB max upload limit

@app.middleware("http")
async def security_and_payload_middleware(request: Request, call_next):
    # Check Content-Length for max size limit (5MB)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_PAYLOAD_SIZE:
                return JSONResponse(
                    status_code=413,
                    content={"success": False, "error": "Payload too large. Max file upload size is 5MB."}
                )
        except ValueError:
            pass
        
    response = await call_next(request)
    
    # Add Security Headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://openrouter.ai;"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response

@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": "Rate limit exceeded. Please wait before analyzing again."
        }
    )

# Ensure templates and static directories exist
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

static_dir = os.path.join(BASE_DIR, "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

async def check_is_pro_request(request: Request) -> bool:
    """clearer.trade is 100% open-source and unrestricted by default."""
    return True

@app.post("/api/logout")
async def logout(response: Response):
    resp = JSONResponse(content={"success": True, "message": "Logged out successfully."})
    resp.delete_cookie(key="access_token", path="/", samesite="none", secure=True)
    return resp

@app.get("/api/health")
@app.get("/api/keep-alive")
async def health_check():
    """
    Health check endpoint. 100% stateless with zero database dependencies.
    """
    return {
        "status": "healthy",
        "service": "clearer.trade-backend",
        "architecture": "100% stateless zero-retention",
        "database": {"status": "ok", "provider": "stateless_memory"}
    }

@app.get("/prototype", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

DEMO_CSV_BYTES = (
    b"Date,Asset,Side,Size,Entry Price,Exit Price,PnL,Strategy\n"
    b"2026-02-01,BTCUSDT,Buy,0.5,95000.00,96500.00,750.00,Trend Following\n"
    b"2026-02-01,ETHUSDT,Sell,2.0,2700.00,2750.00,-100.00,Mean Reversion\n"
    b"2026-02-02,SOLUSDT,Buy,10.0,210.00,225.00,150.00,Breakout\n"
    b"2026-02-03,AVAXUSDT,Buy,50.0,35.00,32.00,-150.00,Trend Following\n"
    b"2026-02-04,BNBUSDT,Buy,5.0,650.00,680.00,150.00,Breakout\n"
    b"2026-02-05,BTCUSDT,Sell,0.3,96000.00,94500.00,450.00,Mean Reversion\n"
    b"2026-02-06,ETHUSDT,Buy,4.0,2650.00,2780.00,520.00,Trend Following\n"
    b"2026-02-07,SOLUSDT,Buy,20.0,215.00,222.00,140.00,Breakout\n"
    b"2026-02-08,BTCUSDT,Buy,0.2,95500.00,,0.00,Trend Following\n"
    b"2026-02-09,ETHUSDT,Sell,3.0,2720.00,,0.00,Mean Reversion\n"
)

@app.get("/api/demo")
async def get_demo_data(request: Request):
    """
    Endpoint to load and parse the sample demo trading log for preview purposes.
    """
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        csv_path = os.path.join(base_dir, "examples", "dummy_trading_log.csv")
        if os.path.exists(csv_path):
            with open(csv_path, "rb") as f:
                contents = f.read()
        else:
            contents = DEMO_CSV_BYTES

        result = parse_trading_log(contents, filename="dummy_trading_log.csv", is_pro=True, is_consolidated=True)
        if isinstance(result, dict) and "metrics" in result and isinstance(result["metrics"], dict):
            result["metrics"]["is_demo"] = True
            result["metrics"]["is_pro"] = True
            result["metrics"]["is_consolidated"] = True
        return result
    except Exception as e:
        logger.exception("Error in /api/demo endpoint")
        return {"success": False, "error": "Failed to load demo data. Please try again later."}

@app.get("/api/template")
async def get_csv_template():
    """
    Endpoint to download standard CSV template for trading logs.
    """
    content = (
        "Date,Asset,Side,Size,Entry Price,Exit Price,PnL\n"
        "2026-07-01 09:30:00,AAPL,Buy,100,180.00,182.50,250.00\n"
        "2026-07-01 10:15:00,TSLA,Sell,50,250.00,255.00,-250.00\n"
        "2026-07-02 11:00:00,MSFT,Buy,10,340.00,345.00,50.00\n"
        "2026-07-03 14:20:00,NVDA,Buy,100,420.00,410.00,-1000.00\n"
        "2026-07-04 15:45:00,AMZN,Buy,200,130.00,135.00,1000.00\n"
    )
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="trading_journal_template.csv"'}
    )

@app.post("/api/analyze")
@limiter.limit("5/minute")
async def analyze_trading_log(
    request: Request,
    file: UploadFile = File(...)
):
    """
    Endpoint to receive the CSV file.
    Calculates advanced stats and returns raw trade records for on-demand AI audit.
    """
    contents = await file.read()
    if len(contents) > MAX_PAYLOAD_SIZE:
        return {"success": False, "error": "Payload too large. Max file upload size is 5MB."}
    is_pro = await check_is_pro_request(request)
    
    try:
        result = parse_trading_log(contents, filename=file.filename, is_pro=is_pro)
        return result
    except Exception as e:
        logger.exception("Error in /api/analyze endpoint")
        return {"success": False, "error": "Failed to parse file. Please ensure it's a valid CSV."}

@app.post("/api/reanalyze")
@limiter.limit("10/minute")
async def reanalyze_trading_log(
    request: Request,
    trades: str = Form(...),
    is_consolidated: str = Form("false")
):
    """
    Endpoint to reanalyze an edited list of trades.
    """
    try:
        is_pro = await check_is_pro_request(request)
        try:
            trades_list = json.loads(trades)
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON payload for trades."}
        df = pd.DataFrame(trades_list)
        
        header_key = (request.headers.get("X-Access-Key") or request.headers.get("x-access-key") or "").strip().upper()
        is_demo_header = "DEMO" in header_key
        is_demo_payload = False
        if isinstance(trades_list, list) and len(trades_list) > 0:
            first_t = trades_list[0]
            strat = str(first_t.get("strategy_tag") or first_t.get("Strategy") or first_t.get("strategy") or "")
            asset = str(first_t.get("asset") or first_t.get("symbol") or first_t.get("Asset") or "")
            if strat in ["Trend Following", "Mean Reversion", "Breakout"] or asset == "BTCUSDT":
                is_demo_payload = True

        is_demo = is_demo_header or is_demo_payload
        if is_demo:
            is_pro = True

        # Normalize mapped column aliases
        col_map = {
            'symbol': 'asset',
            'ticker': 'asset',
            'qty': 'sz',
            'quantity': 'sz',
            'price': 'px'
        }
        df = df.rename(columns=col_map)

        # Ensure timestamp is int64
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_numeric(df['timestamp'], errors='coerce').fillna(0).astype('int64')
            if 'date' not in df.columns:
                df['date'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True).dt.strftime('%Y-%m-%d %H:%M:%S')
            
        consolidated_bool = is_consolidated.lower() == "true"
        result = process_trade_dataframe(df, is_pro=is_pro, is_consolidated=consolidated_bool)
        if is_demo and isinstance(result, dict) and "metrics" in result and isinstance(result["metrics"], dict):
            result["metrics"]["is_demo"] = True
            result["metrics"]["is_pro"] = True
        return result
    except Exception as e:
        logger.exception("Error in /api/reanalyze endpoint")
        return {"success": False, "error": "Failed to reanalyze. Please try again."}

@app.post("/api/enrich-ticks")
@limiter.limit("5/minute")
async def enrich_ticks_endpoint(
    request: Request,
    trades: str = Form(...),
    is_consolidated: str = Form("false")
):
    """
    Endpoint to enrich basic CSV trade records with public Binance/Bybit K-Line market ticks.
    Unlocks MAE/MFE, 30m Drift, and timing flaw analytics.
    """
    try:
        is_pro = await check_is_pro_request(request)
        try:
            trades_list = json.loads(trades)
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON payload for trades."}
        df = pd.DataFrame(trades_list)

        header_key = (request.headers.get("X-Access-Key") or request.headers.get("x-access-key") or "").strip().upper()
        is_demo_header = "DEMO" in header_key
        is_demo_payload = False
        if isinstance(trades_list, list) and len(trades_list) > 0:
            first_t = trades_list[0]
            strat = str(first_t.get("strategy_tag") or first_t.get("Strategy") or first_t.get("strategy") or "")
            asset = str(first_t.get("asset") or first_t.get("symbol") or first_t.get("Asset") or "")
            if strat in ["Trend Following", "Mean Reversion", "Breakout"] or asset == "BTCUSDT":
                is_demo_payload = True

        is_demo = is_demo_header or is_demo_payload
        if is_demo:
            is_pro = True
        
        from app.services.analytics import enrich_with_public_klines
        df = enrich_with_public_klines(df, is_demo=is_demo)
        
        consolidated_bool = is_consolidated.lower() == "true"
        result = process_trade_dataframe(df, is_pro=is_pro, is_consolidated=consolidated_bool)
        if isinstance(result, dict) and "metrics" in result and isinstance(result["metrics"], dict):
            result["metrics"]["has_tick_data"] = True
            if is_pro:
                result["metrics"]["is_pro"] = True
            if is_demo:
                result["metrics"]["is_demo"] = True
        return result
    except Exception as e:
        logger.exception("Error in /api/enrich-ticks endpoint")
        return {"success": False, "error": "Tick enrichment failed. Please try again later."}



@app.post("/api/login")
@limiter.limit("30/minute")
async def login(
    request: Request,
    access_token: str = Form(None),
    instance_name: Optional[str] = Form(None),
    device_name: Optional[str] = Form(None)
):
    """
    Open-source access endpoint. Grants unrestricted access unconditionally.
    """
    token = (access_token or "Trader").strip()
    response = JSONResponse(content={
        "success": True,
        "message": "Access granted.",
        "trader_id": token,
        "remaining": 999999,
        "usage_count": 0,
        "limit": 999999,
        "is_pro": True,
        "devices": [],
        "default_model": "OpenRouter BYOK"
    })
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=31536000
    )
    return response

@app.get("/api/quota")
async def get_trader_quota(request: Request):
    """
    Returns unlimited quota for open-source pro access.
    """
    return {
        "success": True,
        "trader_id": "Trader",
        "usage_count": 0,
        "limit": 999999,
        "remaining": 999999,
        "is_pro": True,
        "devices": []
    }

@app.post("/api/reset-device-slot")
async def reset_device_slot_endpoint(request: Request):
    """
    Device slot management is disabled in open-source mode.
    """
    return {"success": True, "message": "Device slots are unlimited in open-source mode."}

@app.post("/api/audit")
@limiter.limit("20/minute")
async def run_ai_audit(
    request: Request,
    access_token: str = Form(None),
    use_custom_key: bool = Form(True),
    api_key: str = Form(None),
    custom_model: str = Form(None),
    metrics: str = Form(...),
    trades: str = Form(...)
):
    """
    On-demand endpoint to run the AI behavioral audit using pure BYOK (Bring Your Own Key).
    Uses the trader's OpenRouter API key (or optional server-configured OPENROUTER_API_KEY).
    """
    try:
        try:
            metrics_dict = json.loads(metrics)
            trades_list = json.loads(trades)
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON payload."}

        df = pd.DataFrame(trades_list)
        df.columns = [str(c) for c in df.columns]
        df = df.reset_index(drop=True)
        
        # Ensure timestamp is numeric ms if present
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_numeric(df['timestamp'], errors='coerce').fillna(0).astype('int64')

        effective_key = (api_key or "").strip() or os.getenv("OPENROUTER_API_KEY", "").strip()

        if not effective_key:
            return {
                "success": False,
                "error": "OpenRouter API Key required. Enter your API key (sk-or-v1-...) in the AI Audit bar or settings to run the diagnostic."
            }

        audit_res = await generate_behavioral_audit(
            df,
            metrics_dict,
            user_api_key=effective_key,
            custom_model=custom_model,
            is_pro=True
        )

        if "AI Audit Engine Unavailable" in audit_res.get("audit", ""):
            return {
                "success": False,
                "error": audit_res.get("audit"),
                "status": audit_res.get("status", "STABLE"),
                "model_name": audit_res.get("model_name", custom_model or "OpenRouter")
            }

        return {
            "success": True,
            "status": audit_res.get("status", "STABLE"),
            "audit": audit_res.get("audit", ""),
            "model_name": audit_res.get("model_name", custom_model or "OpenRouter BYOK"),
            "message": "AI Behavioral Audit completed successfully via BYOK."
        }
    except Exception as e:
        logger.exception("Error in /api/audit endpoint")
        return {"success": False, "error": f"Failed to run audit: {str(e)}"}

@app.post("/api/whop-webhook")
@app.post("/api/py/credit-pack-webhook")
@app.post("/api/credit-pack-webhook")
async def whop_credit_pack_webhook(request: Request):
    """Legacy Whop webhook endpoint retired for open-source release."""
    return JSONResponse(status_code=200, content={"success": True, "message": "Whop webhooks retired in open source mode."})


