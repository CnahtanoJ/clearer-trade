'''Pure-Python post-trade execution telemetry and TWR aggregation primitives.'''

from __future__ import annotations

import hashlib
import hmac
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping, Sequence


_CANONICAL_ENCODER = json.JSONEncoder(
    sort_keys=True,
    separators=(',', ':'),
    ensure_ascii=True,
    allow_nan=False,
    default=str,
)


def compute_attestation_sha256(raw_records: Any, salt: str) -> str:
    '''Compute a deterministic SHA-256 pre-commitment hash over canonical JSON + salt.'''
    if not isinstance(salt, str) or not salt.strip():
        raise ValueError('salt must be a non-empty string')
    hasher = hashlib.sha256()
    for chunk in _CANONICAL_ENCODER.iterencode(raw_records):
        hasher.update(chunk.encode('utf-8'))
    hasher.update(salt.encode('utf-8'))
    return hasher.hexdigest()


def verify_attestation(
    raw_records: Any,
    salt: str,
    expected: str | Mapping[str, Any],
) -> bool:
    '''Verify raw_records + salt against a 64-char SHA-256 hex digest or telemetry payload.'''
    if isinstance(expected, Mapping):
        meta = expected.get('meta')
        target_hash = str(meta.get('attestation_sha256') or '') if isinstance(meta, Mapping) else ''
    else:
        target_hash = str(expected or '')
    if not _SHA256_RE.match(target_hash):
        return False
    actual_hash = compute_attestation_sha256(raw_records, salt)
    return hmac.compare_digest(actual_hash, target_hash)


def _extract_bps(record: Mapping[str, Any], bps_key: str, pct_key: str) -> float | None:
    if bps_key in record and record[bps_key] is not None:
        return float(record[bps_key])
    if pct_key in record and record[pct_key] is not None:
        return float(record[pct_key]) * 100.0
    return None


def _is_maker_fill(fill: Mapping[str, Any]) -> bool:
    if 'is_maker' in fill and fill['is_maker'] is not None:
        return bool(fill['is_maker'])
    for key in ('liquidity', 'role', 'order_type', 'maker_taker'):
        val = fill.get(key)
        if isinstance(val, str) and val.strip().lower() in {'maker', 'alo', 'post_only', 'post-only', 'add'}:
            return True
    return False


def _index_to_alpha(index: int) -> str:
    '''Convert 0 -> A, 25 -> Z, 26 -> AA for deterministic anonymized asset aliases.'''
    letters: list[str] = []
    n = index
    while True:
        n, rem = divmod(n, 26)
        letters.append(chr(ord('A') + rem))
        if n == 0:
            break
        n -= 1
    return ''.join(reversed(letters))


def compute_twr_series(
    daily_records: Sequence[Mapping[str, Any]],
    base: float = 100.0,
) -> list[dict[str, Any]]:
    '''Compute a Time-Weighted Return (TWR) equity curve rebased to base (default 100.0).'''
    if not daily_records:
        return []

    sorted_records = sorted(daily_records, key=lambda r: str(r['date']).strip()[:10])
    index = float(base)
    series: list[dict[str, Any]] = []

    for rec in sorted_records:
        if rec.get('daily_return_pct') is not None:
            r_t = float(rec['daily_return_pct']) / 100.0
        elif rec.get('nav_start') is not None and rec.get('nav_end') is not None:
            nav_start = float(rec['nav_start'])
            nav_end = float(rec['nav_end'])
            net_flow = float(rec.get('net_flow') or 0.0)
            r_t = (nav_end - nav_start - net_flow) / nav_start if nav_start > 0 else 0.0
        elif rec.get('pnl') is not None and rec.get('capital_base') is not None:
            cap = float(rec['capital_base'])
            r_t = float(rec['pnl']) / cap if cap > 0 else 0.0
        else:
            r_t = 0.0

        index = max(1e-4, index * (1.0 + r_t))
        series.append(
            {
                'date': str(rec['date']).strip()[:10],
                'twr_index': round(index, 4),
                'daily_return_pct': round(r_t * 100.0, 4),
            }
        )

    return series


def compute_twr_summary(
    equity_curve: Sequence[Mapping[str, Any]],
    *,
    periods_per_year: int = 365,
) -> dict[str, float | int]:
    '''Compute return, max drawdown, and annualized Sharpe/Sortino from a TWR curve.'''
    if not equity_curve:
        return {
            'trading_days': 0,
            'total_return_pct': 0.0,
            'max_drawdown_pct': 0.0,
            'annualized_sharpe': 0.0,
            'annualized_sortino': 0.0,
        }

    base_index = float(equity_curve[0]['twr_index']) / (1.0 + float(equity_curve[0]['daily_return_pct']) / 100.0)
    last_index = float(equity_curve[-1]['twr_index'])
    total_return_pct = ((last_index / base_index) - 1.0) * 100.0 if base_index > 0 else 0.0

    peak = base_index
    max_dd = 0.0
    returns: list[float] = []
    for pt in equity_curve:
        idx = float(pt['twr_index'])
        if idx > peak:
            peak = idx
        if peak > 0:
            dd = (peak - idx) / peak
            if dd > max_dd:
                max_dd = dd
        returns.append(float(pt['daily_return_pct']) / 100.0)

    n = len(returns)
    mean_r = sum(returns) / n
    sharpe = 0.0
    sortino = 0.0
    if n > 1:
        var = sum((r - mean_r) ** 2 for r in returns) / (n - 1)
        std = math.sqrt(var)
        if std > 0:
            sharpe = (mean_r / std) * math.sqrt(periods_per_year)
        downside_sq = sum(min(0.0, r) ** 2 for r in returns) / (n - 1)
        downside_std = math.sqrt(downside_sq)
        if downside_std > 0:
            sortino = (mean_r / downside_std) * math.sqrt(periods_per_year)

    return {
        'trading_days': n,
        'total_return_pct': round(total_return_pct, 4),
        'max_drawdown_pct': round(max_dd * 100.0, 4),
        'annualized_sharpe': round(sharpe, 4),
        'annualized_sortino': round(sortino, 4),
    }


def compute_execution_hygiene(
    fills: Iterable[Mapping[str, Any]],
    bucket_size: int = 50,
) -> dict[str, Any]:
    '''Aggregate maker ratio, MAE/MFE, adverse drift (bps), and bucketed fill count in O(1) memory.'''
    total = 0
    maker_count = 0
    mae_sum = 0.0
    mae_count = 0
    mfe_sum = 0.0
    mfe_count = 0
    drift_sum = 0.0
    drift_count = 0

    for fill in fills:
        total += 1
        if _is_maker_fill(fill):
            maker_count += 1
        mae = _extract_bps(fill, 'mae_bps', 'mae_pct')
        if mae is not None:
            mae_sum += abs(mae)
            mae_count += 1
        mfe = _extract_bps(fill, 'mfe_bps', 'mfe_pct')
        if mfe is not None:
            mfe_sum += abs(mfe)
            mfe_count += 1
        drift = _extract_bps(fill, 'adverse_drift_bps', 'drift_pct')
        if drift is None:
            drift = _extract_bps(fill, 'drift_bps', 'drift_pct')
        if drift is not None:
            drift_sum += drift
            drift_count += 1

    if total == 0:
        return {
            'maker_fill_ratio': 0.0,
            'avg_mae_bps': 0.0,
            'avg_mfe_bps': 0.0,
            'adverse_drift_bps': 0.0,
            'total_fills_bucketed': 0,
        }

    if bucket_size > 1:
        bucketed = max(bucket_size, round(total / bucket_size) * bucket_size)
    else:
        bucketed = total

    return {
        'maker_fill_ratio': round(maker_count / total, 4),
        'avg_mae_bps': round(mae_sum / mae_count, 3) if mae_count else 0.0,
        'avg_mfe_bps': round(mfe_sum / mfe_count, 3) if mfe_count else 0.0,
        'adverse_drift_bps': round(drift_sum / drift_count, 3) if drift_count else 0.0,
        'total_fills_bucketed': int(bucketed),
    }


def anonymize_baskets(
    fills: Iterable[Mapping[str, Any]],
    symbol_map: Mapping[str, str] | None = None,
    *,
    anonymize: bool = True,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    '''Map raw tickers to Asset_A, Asset_B, ... (or keep raw symbols when anonymize=False) in O(symbols) memory.'''
    resolved_map: dict[str, str] = dict(symbol_map or {})
    sym_counts: dict[str, int] = defaultdict(int)
    sym_mae_sum: dict[str, float] = defaultdict(float)
    sym_mae_count: dict[str, int] = defaultdict(int)
    total = 0

    for fill in fills:
        total += 1
        sym = str(fill.get('symbol') or fill.get('asset') or 'UNKNOWN')
        sym_counts[sym] += 1
        mae = _extract_bps(fill, 'mae_bps', 'mae_pct')
        if mae is not None:
            sym_mae_sum[sym] += abs(mae)
            sym_mae_count[sym] += 1

    if total == 0:
        return [], resolved_map

    next_idx = len(resolved_map)
    used_aliases = set(resolved_map.values())
    for sym in sorted(sym_counts):
        if sym not in resolved_map:
            if not anonymize:
                resolved_map[sym] = sym
            else:
                while f'Asset_{_index_to_alpha(next_idx)}' in used_aliases:
                    next_idx += 1
                alias = f'Asset_{_index_to_alpha(next_idx)}'
                resolved_map[sym] = alias
                used_aliases.add(alias)
                next_idx += 1

    alias_counts: dict[str, int] = defaultdict(int)
    alias_mae_sum: dict[str, float] = defaultdict(float)
    alias_mae_count: dict[str, int] = defaultdict(int)
    for sym, count in sym_counts.items():
        alias = resolved_map[sym]
        alias_counts[alias] += count
        alias_mae_sum[alias] += sym_mae_sum[sym]
        alias_mae_count[alias] += sym_mae_count[sym]

    baskets: list[dict[str, Any]] = []
    for alias, count in alias_counts.items():
        m_count = alias_mae_count[alias]
        baskets.append(
            {
                'asset_alias': alias,
                'fill_share_pct': round((count / total) * 100.0, 2),
                'avg_mae_bps': round(alias_mae_sum[alias] / m_count, 3) if m_count else 0.0,
            }
        )

    baskets.sort(key=lambda item: (-item['fill_share_pct'], item['asset_alias']))
    return baskets, resolved_map


_NODE_ID_RE = re.compile(r'^[a-zA-Z0-9._-]{3,64}$')
_SHA256_RE = re.compile(r'^[a-f0-9]{64}$')
_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_ASSET_ALIAS_RE = re.compile(r'^Asset_[A-Z]+$')
_HEX_ADDRESS_RE = re.compile(r'0x[a-fA-F0-9]{10,}')


def validate_telemetry_payload(
    payload: Mapping[str, Any],
    *,
    strict_anonymization: bool = True,
) -> None:
    '''Validate a telemetry payload against the clearer.trade v1.0.0 zero-leakage schema contract.'''
    required_top = {'meta', 'equity_curve', 'execution_hygiene', 'anonymized_baskets'}
    if set(payload.keys()) != required_top:
        raise ValueError(f'Payload keys must be exactly {sorted(required_top)}')

    if _HEX_ADDRESS_RE.search(json.dumps(payload, allow_nan=False, default=str)):
        raise ValueError('Potential wallet/address leak (0x...) detected in telemetry payload')

    meta = payload['meta']
    if not isinstance(meta, Mapping):
        raise ValueError('meta must be a mapping')
    if meta.get('schema_version') != '1.0.0':
        raise ValueError('meta.schema_version must be "1.0.0"')
    node_id = str(meta.get('node_id') or '')
    if not _NODE_ID_RE.match(node_id):
        raise ValueError('meta.node_id must match ^[a-zA-Z0-9._-]{3,64}$')
    if not isinstance(meta.get('last_updated_utc'), str) or not meta['last_updated_utc'].strip():
        raise ValueError('meta.last_updated_utc must be a non-empty ISO-8601 string')
    if not _SHA256_RE.match(str(meta.get('attestation_sha256') or '')):
        raise ValueError('meta.attestation_sha256 must be a 64-char lowercase hex SHA-256 digest')
    if 'publication_delay_hours' in meta and int(meta['publication_delay_hours']) < 24:
        raise ValueError('meta.publication_delay_hours must be >= 24')
    if 'tick_stagger_bucket_ms' in meta and int(meta['tick_stagger_bucket_ms']) < 0:
        raise ValueError('meta.tick_stagger_bucket_ms must be >= 0')

    curve = payload['equity_curve']
    if not isinstance(curve, Sequence) or len(curve) < 1:
        raise ValueError('equity_curve must be a non-empty sequence')
    for pt in curve:
        if not _DATE_RE.match(str(pt.get('date') or '')):
            raise ValueError(f"Invalid equity_curve date format: {pt.get('date')}")
        if float(pt['twr_index']) <= 0:
            raise ValueError('equity_curve.twr_index must be > 0')

    hygiene = payload['execution_hygiene']
    if not (0.0 <= float(hygiene['maker_fill_ratio']) <= 1.0):
        raise ValueError('execution_hygiene.maker_fill_ratio must be in [0, 1]')
    if float(hygiene['avg_mae_bps']) < 0 or float(hygiene['avg_mfe_bps']) < 0:
        raise ValueError('execution_hygiene avg_mae_bps and avg_mfe_bps must be >= 0')
    if int(hygiene['total_fills_bucketed']) < 0:
        raise ValueError('execution_hygiene.total_fills_bucketed must be >= 0')

    for basket in payload['anonymized_baskets']:
        alias = str(basket.get('asset_alias') or '')
        if strict_anonymization:
            if not _ASSET_ALIAS_RE.match(alias):
                raise ValueError(f"Invalid asset_alias: {basket.get('asset_alias')}")
        elif not alias.strip():
            raise ValueError('anonymized_baskets.asset_alias must be a non-empty string')
        if not (0.0 <= float(basket['fill_share_pct']) <= 100.0):
            raise ValueError('anonymized_baskets.fill_share_pct must be in [0, 100]')
        if float(basket['avg_mae_bps']) < 0:
            raise ValueError('anonymized_baskets.avg_mae_bps must be >= 0')


def build_telemetry_payload(
    *,
    node_id: str,
    daily_records: Sequence[Mapping[str, Any]],
    fills: Sequence[Mapping[str, Any]],
    salt: str,
    raw_records: Any | None = None,
    last_updated_utc: str | None = None,
    base: float = 100.0,
    bucket_size: int = 50,
    symbol_map: Mapping[str, str] | None = None,
    anonymize_symbols: bool = True,
    region: str | None = None,
    publication_delay_hours: int | None = 24,
    tick_stagger_bucket_ms: int | None = None,
    decorrelation_cohort: str | None = None,
) -> dict[str, Any]:
    '''Assemble and validate a complete clearer.trade v1.0.0 telemetry payload.'''
    attestation_input = (
        raw_records
        if raw_records is not None
        else {'daily_records': list(daily_records), 'fills': list(fills)}
    )
    timestamp_utc = last_updated_utc or datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    meta: dict[str, Any] = {
        'schema_version': '1.0.0',
        'node_id': node_id,
        'last_updated_utc': timestamp_utc,
        'attestation_sha256': compute_attestation_sha256(attestation_input, salt),
    }
    if region is not None:
        meta['region'] = region
    if publication_delay_hours is not None:
        meta['publication_delay_hours'] = int(publication_delay_hours)
    if tick_stagger_bucket_ms is not None:
        meta['tick_stagger_bucket_ms'] = int(tick_stagger_bucket_ms)
    if decorrelation_cohort is not None:
        meta['decorrelation_cohort'] = decorrelation_cohort

    baskets, _ = anonymize_baskets(fills, symbol_map=symbol_map, anonymize=anonymize_symbols)
    payload: dict[str, Any] = {
        'meta': meta,
        'equity_curve': compute_twr_series(daily_records, base=base),
        'execution_hygiene': compute_execution_hygiene(fills, bucket_size=bucket_size),
        'anonymized_baskets': baskets,
    }
    validate_telemetry_payload(payload, strict_anonymization=anonymize_symbols)
    return payload