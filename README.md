<div align="center">

# 📊 clearer.trade

### Institutional Trading Journal & Behavioral AI Risk Diagnostic Suite

**100% Free • Open Source • Pure BYOK • Zero Server-Side Log Retention**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js 14](https://img.shields.io/badge/Frontend-Next.js%2014-000000.svg?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776AB.svg?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)
[![Privacy: Zero Retention](https://img.shields.io/badge/Privacy-100%25%20Stateless-emerald.svg?style=for-the-badge)](https://clearer.trade)
[![AI Engine: Pure BYOK](https://img.shields.io/badge/AI-Pure%20BYOK%20(OpenRouter)-purple.svg?style=for-the-badge)](https://openrouter.ai/)

---

<p align="center">
  <a href="#-why-clearertrade">Why clearer.trade</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-architecture--privacy">Architecture & Privacy</a> •
  <a href="#-quickstart">Quickstart</a> •
  <a href="#-sample-data">Sample Data</a> •
  <a href="#-byok-ai-configuration">BYOK AI</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-archived-drm-research">Archived DRM</a> •
  <a href="#-license">License</a>
</p>

</div>

---

## ⚡ Why clearer.trade?

Traditional trading journals force you to choose between clunky spreadsheets or expensive SaaS subscriptions ($30–$80/month) that upload your private trade logs, account balances, and execution timestamps to centralized third-party databases.

**clearer.trade** is built differently:
- 🛡️ **100% Stateless & Zero-Retention**: Your trade logs are parsed in volatile RAM during the request lifecycle and discarded immediately. No database, no user accounts, no tracking.
- 🔓 **Complete Institutional Suite**: Institutional-grade analytics—Sharpe & Sortino ratios, counterfactual disciplined equity curves, MAE/MFE excursion, and market regime matrices—are unlocked out of the box. Zero paywalls.
- 🧠 **Pure BYOK (Bring Your Own Key) AI**: Run psychological audits using your own OpenRouter API key. Connect any frontier model—DeepSeek V3, Claude 3.5 Sonnet, GPT-4o, or Gemini 2.5 Flash—with zero markup or subscription fees.
- 📡 **Multi-Exchange Public Tick Enrichment**: Automatically enriches raw trade fills with public historical candlestick data from Binance, Bybit, Hyperliquid, and Yahoo Finance to quantify post-entry drift and exit timing.

---

## ✨ Key Features

### 1. In-Memory FIFO Position Engine
- Parses raw CSV trading logs across **Crypto, Equities, Forex, and Futures**.
- Automatic delimiter and header detection (handles comma, tab, semicolon, pipe).
- Interactive visual **Column Mapper** to normalize logs from any broker or exchange (TradingView, MT4/5, Interactive Brokers, Bybit, Binance, Schwab, Tradovate, etc.).
- Strict First-In-First-Out (FIFO) trade execution matching.

### 2. Institutional Performance & Risk Analytics
- **Core Edge Metrics**: Win Rate, Realized PnL, Profit Factor, Expectancy per trade, Sharpe Ratio, Sortino Ratio, Maximum Drawdown, and Average Win/Loss Ratio.
- **Counterfactual Disciplined Equity Curve**: Simulates your theoretical equity curve if emotional tilt sessions, revenge trading clusters, and Martingale size spikes were eliminated.
- **Hold-Time Asymmetry**: Compares the average holding duration of winning positions vs. losing positions to detect loss-aversion biases.
- **Session Analysis & Bubble Chart**: Groups trades into discrete trading sessions using 4-hour inactivity thresholds to pinpoint when fatigue and overtrading degrade performance.
- **Market Regime Matrix**: Segments performance across low volatility chop, high volatility expansions, and extreme squeezes.

### 3. Public Candlestick Tick Enrichment
Enriches trades with sub-second / 5-minute public market data:
- **30-Minute Post-Entry Drift**: Quantifies whether prices moved in your favor or against you immediately after entry, revealing knife-catching vs. high-momentum confirmations.
- **MAE (Maximum Adverse Excursion)**: Measures the maximum drawdown experienced by open positions before closure (evaluates stop-loss efficiency).
- **MFE (Maximum Favorable Excursion)**: Measures the peak unrealized profit achieved by positions before closure (evaluates take-profit efficiency).
- **Supported Tick Feeds**:
  - **Crypto Spot & Perps**: Binance REST API, Bybit v5 REST API, Hyperliquid Info API.
  - **Equities & Indices**: Yahoo Finance (`yfinance`).

### 4. Pure BYOK AI Behavioral Audit
- **Direct Client-Side Routing**: Store your OpenRouter API key locally in your browser (`localStorage`). It is sent securely per-request and never stored on the server.
- **Model Agnostic**: Compatible with any model hosted on [OpenRouter](https://openrouter.ai/models), including:
  - `deepseek/deepseek-chat`
  - `anthropic/claude-3.5-sonnet`
  - `openai/gpt-4o`
  - `google/gemini-2.5-flash`
- **Actionable Diagnostic**: Analyzes trade clustering, size deviations, and hold-time anomalies to return:
  1. Psychological state diagnosis (`STABLE`, `TILT`, `FATIGUE`, `OVERCONFIDENCE`).
  2. Concrete behavioral failure breakdown (revenge loops, Martingale scaling, premature exits).
  3. **3 Rigid Execution Rules** tailored to your specific log to immediately plug risk leaks.

---

## 🏗️ Architecture & Privacy Design

```
                     ┌───────────────────────────────────────────┐
                     │           Client Browser                  │
                     │  - Next.js 14 / Tailwind CSS              │
                     │  - Client-Side Session Persistence        │
                     │  - Local BYOK API Key Storage             │
                     └─────────────────────┬─────────────────────┘
                                           │
                        Raw CSV Upload /   │   Public Ticks /
                        Audit Request      │   Chart Datasets
                                           ▼
                     ┌───────────────────────────────────────────┐
                     │         FastAPI Backend Engine            │
                     │  - Stateless In-Memory Execution Scope    │
                     │  - FIFO Position Matching Engine          │
                     │  - Quant Metric Computation Engine        │
                     │  - Zero Database & Zero Log Retention     │
                     └─────────────┬───────────────────┬─────────┘
                                   │                   │
             Tick Synchronization  │                   │  LLM Diagnostic
                                   ▼                   ▼
                     ┌──────────────────┐        ┌──────────────────┐
                     │ Public Exchanges │        │    OpenRouter    │
                     │ Binance / Bybit  │        │   (Pure BYOK)    │
                     │ Hyperliquid / YF │        │ DeepSeek/Claude  │
                     └──────────────────┘        └──────────────────┘
```

- **Zero Database**: No PostgreSQL, Supabase, SQLite, or Redis instance required.
- **Zero Log Retention**: IP addresses, trade payloads, and API keys are processed in volatile RAM scopes and destroyed upon response dispatch.
- **Session Continuity**: Synced tick data and parsed trade states are cached in your browser's local `sessionStorage`. Your data survives page refreshes ($F5$) and is automatically wiped when you close the tab.

---

## 🚀 Quickstart

### Prerequisites
- **Python**: 3.11 or higher
- **Node.js**: 18.0 or higher
- **Package Managers**: `pip` and `npm`

### 1. Clone the Repository
```bash
git clone https://github.com/CnahtanoJ/clearer-trade.git
cd clearer-trade
```

### 2. Backend Setup (FastAPI)
```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# (Optional) Copy environment template (pre-configured for localhost)
cp .env.example .env

# Start backend server
uvicorn app.main:app --reload --port 8000
```
*The backend API will start at [http://localhost:8000](http://localhost:8000).*

### 3. Frontend Setup (Next.js)
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
*Open [http://localhost:3000](http://localhost:3000) in your browser.*

---

## 📊 Sample Data

Want to test the platform immediately without exporting your own broker history?

A realistic sample dataset is included in the repository:
📁 [`examples/dummy_trading_log.csv`](./examples/dummy_trading_log.csv)

It contains 100+ multi-asset trade executions (crypto perps and equities) demonstrating:
- FIFO position entry & exit matching
- Realized MAE / MFE price excursion bounds
- Realistic win/loss streaks and emotional tilt clusters for the AI Diagnostic engine

Simply drag and drop `dummy_trading_log.csv` directly into the web interface or use the Column Mapper.

---

## 🔑 BYOK AI Configuration

1. Obtain an API key from [OpenRouter](https://openrouter.ai/keys).
2. In the clearer.trade dashboard, navigate to the **AI Behavioral Audit** panel.
3. Paste your key (`sk-or-v1-...`) into the inline key bar and choose your preferred model (default: `deepseek/deepseek-chat`).
4. Click **Run Diagnostic**. Your key will remain saved in your browser's `localStorage` for future sessions.

*(Optional)* If you are self-hosting for a team and want to provide a server-level fallback key, you can set `OPENROUTER_API_KEY` in your root `.env` file.

---

## 🧪 Running Tests

The test suite covers FIFO trade processing, multi-exchange kline enrichment, MAE/MFE bound calculation, and keepalive endpoints:

```bash
# Run unit tests (standard library, zero additional dependencies required)
python -m unittest discover tests
```

---

## 🌐 Deployment

### 1-Click Monorepo Deployment (Vercel)
The repository is pre-configured with [`vercel.json`](./vercel.json) and [`api/index.py`](./api/index.py) to run both the FastAPI Python backend (Serverless Functions) and the Next.js frontend concurrently on Vercel:

1. Import the repository into your [Vercel Dashboard](https://vercel.com/new).
2. Ensure the Framework Preset is set to **Next.js**.
3. Deploy! Vercel will automatically build the Next.js frontend and mount the Python FastAPI API under `/api/*`.

### Self-Hosted / Docker / Linux VPS
To self-host with systemd, Docker, or reverse proxies (Nginx / Caddy):
1. Run FastAPI via Uvicorn behind a reverse proxy forwarding `/api` to port `8000`.
2. Build the Next.js frontend (`npm run build` and `npm run start` on port `3000`) or deploy static assets.
3. Set `CORS_ORIGINS` in your root `.env` to include your production domain.

---

## 📂 Archived Research: Hardware DRM Subsystem

In previous closed-source iterations, `clearer.trade` utilized a 3-seat device licensing model with client-side Canvas 2D and WebGL hardware fingerprinting to prevent license sharing without collecting IP addresses or personal identifying information.

As part of open-sourcing, all licensing paywalls and DRM enforcement were removed from the active application. However, the fingerprinting and seat verification algorithms have been preserved in:

📁 [`archive/drm_and_licensing/`](./archive/drm_and_licensing/)

Includes:
- **`fingerprint.ts`**: Zero-dependency Canvas 2D + WebGL GPU renderer hardware hashing.
- **`whitelist.py`**: HMAC webhook verification and 3-seat device slot management logic.
- 🔬 [**Technical Deep-Dive: Hardware & Canvas Fingerprinting vs. IP/Cookie Tracking**](./archive/drm_and_licensing/README.md#-technical-deep-dive-hardware--canvas-fingerprinting-vs-ipcookie-tracking): Mathematical breakdown of GPU subpixel antialiasing differences and architectural comparison matrix.

---

## 📄 License & Disclaimer

### License
This project is open-source under the [MIT License](./LICENSE).

### Disclaimer
*clearer.trade is an analytical tool built for educational and statistical purposes only. Nothing produced by this software constitutes financial, investment, legal, or trading advice. Trading cryptocurrencies, equities, forex, and futures involves substantial risk of capital loss.*

