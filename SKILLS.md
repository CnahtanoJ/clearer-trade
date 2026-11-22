# clearer.trade Agent & Telemetry Specification (`SKILLS.md`)

This document specifies the zero-leakage post-trade telemetry contract (`telemetry.schema.json`), the `clearer-trade` Python primitives, and multi-node decorrelation metadata fields used by `clearer.trade`.

## 1. Zero-Leakage Constraints
All published telemetry payloads MUST satisfy:
- **No `0x...` identifiers**: Zero wallet addresses, sub-account IDs, or transaction hashes (`0x[a-fA-F0-9]{10,}` is rejected by `assert_zero_leakage`).
- **No raw tickers**: Trading pairs (e.g., `WLD-PERP`, `BTC-PERP`) are deterministically mapped to `Asset_A`, `Asset_B`, etc.
- **No exact millisecond timestamps or raw USD balances**: Fill counts are bucketed (`total_fills_bucketed`), and returns are rebased to a `Base 100.0` Time-Weighted Return (TWR) index.
- **T+24h Publication Delay**: Only fills and daily NAV snapshots at or before `now_utc - 24h` are included.

## 2. `telemetry.schema.json` Contract (`schema_version: 1.0.0`)

### `meta`
- `schema_version` (`string`, const `'1.0.0'`): Contract version.
- `node_id` (`string`): Public non-identifying node label (e.g., `clear-alpha-ref-01`).
- `last_updated_utc` (`string`, ISO-8601 UTC): Timestamp of the T+24h cutoff.
- `attestation_sha256` (`string`, 64-hex): `SHA-256(canonical_json(delayed_raw_fills) + LEDGER_SALT)`.

#### Multi-Node Decorrelation Metadata (Optional)
- `region` (`string`): Execution cloud region (e.g., `ap-northeast-1`).
- `publication_delay_hours` (`integer`, `>= 24`): Enforced publication lag in hours.
- `tick_stagger_bucket_ms` (`integer`, `>= 0`): Anti-cannibalization tick-staggering bucket (ms) used to decorrelate order placement across co-located nodes.
- `decorrelation_cohort` (`string`): Cohort identifier for multi-node decorrelation verification (e.g., `tokyo-systematic-v1`).

### `equity_curve`
Array of `{ date: 'YYYY-MM-DD', twr_index: number, daily_return_pct: number }`:
- `Index_t = Index_{t-1} * (1 + R_t)` rebased to `Base 100.0`, with deposits and withdrawals stripped from `R_t`.

### `execution_hygiene`
- `maker_fill_ratio` (`number`, `0..1`): Share of post-only / ALO / maker fills.
- `avg_mae_bps` (`number`, `>= 0`): Average Maximum Adverse Excursion in basis points.
- `avg_mfe_bps` (`number`, `>= 0`): Average Maximum Favorable Excursion in basis points.
- `adverse_drift_bps` (`number`): Average post-fill adverse price drift in basis points.
- `total_fills_bucketed` (`integer`, `>= 0`): Total fills rounded to a bucket size (default `50`).

### `anonymized_baskets`
Array of `{ asset_alias: 'Asset_A' | 'Asset_B' | ..., fill_share_pct: number, avg_mae_bps: number }`.

## 3. Python Package (`clearer_trade`)
Installable via `pyproject.toml` (`clearer-trade`):
- `compute_attestation_sha256(raw_records, salt)`
- `compute_twr_series(daily_records, base=100.0)`
- `compute_execution_hygiene(fills, bucket_size=50)`
- `anonymize_baskets(fills, symbol_map=None)`

## 4. Frontend Client Routes
- `/` — Local CSV Audit Dashboard with side-by-side `Execution Benchmark Comparison` against `NEXT_PUBLIC_TELEMETRY_URL` (fallback `/sample-telemetry.json`) and `Automated Gateway / B2B Spec` modal.
- `/telemetry` — Standalone client-side reference telemetry view.
- `/r/[slug]` — Unlisted client-side report route fetching `${NEXT_PUBLIC_REPORT_BASE_URL}/${slug}.json` without static path enumeration.