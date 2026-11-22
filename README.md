# clearer-trade

**Open-source post-trade execution auditing and zero-leakage telemetry primitives for [clearer.trade](https://clearer.trade).**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776AB.svg)](https://www.python.org/)

`clearer-trade` is a lightweight, zero-dependency Python library for transforming raw trading ledgers and execution fills into **zero-leakage, SHA-256 attested post-trade telemetry payloads** (`v1.0.0` contract).

Designed for systematic trading engines and execution routers that need to publish verifiable execution quality and Time-Weighted Return (TWR) benchmarks without exposing alpha signals, wallet addresses, raw tickers, or capital sizing.

---

## Key Features

- **Zero External Dependencies**: Pure Python 3.11+ standard library implementation.
- **Cashflow-Adjusted TWR Rebase (`compute_twr_series`)**: Strips deposits/withdrawals and rebases daily returns to a normalized index (`100.0` base).
- **Execution Hygiene Aggregation (`compute_execution_hygiene`)**: Computes maker fill ratio, average MAE/MFE (in basis points), post-entry adverse drift, and bucketed fill counts (to prevent exact tape-matching against public DEX/CEX feeds).
- **Deterministic Ticker Anonymization (`anonymize_baskets`)**: Maps raw symbols (`BTC-PERP`, `ETH-PERP`, ...) to Excel-style anonymized asset aliases (`Asset_A` .. `Asset_Z`, `Asset_AA`, ...) while preserving persistent cross-day symbol mappings.
- **Pre-Commitment SHA-256 Attestation (`compute_attestation_sha256`)**: Produces a canonical, deterministic SHA-256 digest over raw ledger records + secret `LEDGER_SALT`.
- **End-to-End Contract Builder & Validator (`build_telemetry_payload`, `validate_telemetry_payload`)**: Builds and validates payloads against the `clearer.trade` `v1.0.0` schema, enforcing `T+24h` publication delay invariants, finite numeric bounds, and zero `0x...` wallet address leakage.

---

## Installation

```bash
pip install clearer-trade
```

Or install directly from source:

```bash
pip install git+https://github.com/CnahtanoJ/clearer-trade.git
```

---

## Quickstart

```python
import os
from clearer_trade import build_telemetry_payload

daily_records = [
    {"date": "2026-11-15", "nav_start": 100_000.0, "nav_end": 100_500.0, "net_flow": 0.0},
    {"date": "2026-11-16", "nav_start": 100_500.0, "nav_end": 151_505.0, "net_flow": 50_000.0},
]

fills = [
    {"symbol": "BTC-PERP", "order_type": "ALO", "mae_bps": 3.8, "mfe_bps": 18.2, "adverse_drift_bps": 1.1},
    {"symbol": "ETH-PERP", "is_maker": True, "mae_bps": 4.6, "mfe_bps": 15.4, "adverse_drift_bps": 1.5},
]

payload = build_telemetry_payload(
    node_id="clear-alpha-ref-01",
    daily_records=daily_records,
    fills=fills,
    salt=os.environ["LEDGER_SALT"],
    region="ap-northeast-1",
    publication_delay_hours=24,
    tick_stagger_bucket_ms=150,
    decorrelation_cohort="tokyo-systematic-v1",
)
```

---

## API Reference

- **`build_telemetry_payload(*, node_id, daily_records, fills, salt, anonymize_symbols=True, ...)`**: Assembles and validates a complete `v1.0.0` telemetry dictionary (`meta`, `equity_curve`, `execution_hygiene`, `anonymized_baskets`). Set `anonymize_symbols=False` to preserve raw ticker names for internal or client-specific reports.
- **`validate_telemetry_payload(payload, *, strict_anonymization=True)`**: Validates an existing dictionary against all `v1.0.0` contract rules (raises `ValueError` on schema violations, `NaN`/`Infinity`, `< 24h` publication delay, or `0x...` address leaks).
- **`compute_twr_series(daily_records, base=100.0)`**: Accepts records with `daily_return_pct`, `nav_start`/`nav_end`/`net_flow`, or `pnl`/`capital_base` and returns a chronologically sorted TWR curve.
- **`compute_twr_summary(equity_curve, *, periods_per_year=365)`**: Computes `trading_days`, `total_return_pct`, `max_drawdown_pct`, `annualized_sharpe`, and `annualized_sortino` from a TWR curve.
- **`compute_execution_hygiene(fills, bucket_size=50)`**: Aggregates `maker_fill_ratio`, `avg_mae_bps`, `avg_mfe_bps`, `adverse_drift_bps`, and `total_fills_bucketed` in single-pass $O(1)$ memory (accepts generators and both `*_bps` / `*_pct` keys).
- **`anonymize_baskets(fills, symbol_map=None, *, anonymize=True)`**: Returns `(baskets, resolved_symbol_map)` with `asset_alias` (`Asset_A`, `Asset_B`, ... by default, or raw symbols when `anonymize=False`), `fill_share_pct`, and `avg_mae_bps`.
- **`compute_attestation_sha256(raw_records, salt)`**: Computes a streaming canonical SHA-256 hex digest over `raw_records` (supports `Decimal`, `datetime`, `date`, and standard JSON types) + `salt`.
- **`verify_attestation(raw_records, salt, expected)`**: Constant-time verification (`hmac.compare_digest`) of `raw_records` + `salt` against a 64-char SHA-256 digest or full `telemetry.json` payload.

---

## Links

- **Web Platform & Live Reference Telemetry**: [https://clearer.trade](https://clearer.trade)
- **GitHub Repository & Schema (`telemetry.schema.json`)**: [https://github.com/CnahtanoJ/clearer-trade](https://github.com/CnahtanoJ/clearer-trade)

---

## License & Disclaimer

Released under the [MIT License](https://github.com/CnahtanoJ/clearer-trade/blob/main/LICENSE).

*THE SOFTWARE IS PROVIDED AS-IS, WITHOUT WARRANTY OF ANY KIND (MIT NO_WARRANTY). clearer.trade is an open-source educational and post-trade analytical tool only. Nothing produced by this software or its reference telemetry constitutes investment advice, portfolio management, fund management, or a solicitation to buy or sell any financial instrument. Trading cryptocurrencies, equities, forex, and futures involves substantial risk of capital loss.*
