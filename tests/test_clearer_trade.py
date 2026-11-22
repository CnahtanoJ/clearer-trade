import json
import re
import unittest
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import clearer_trade
from clearer_trade import (
    anonymize_baskets,
    build_telemetry_payload,
    compute_attestation_sha256,
    compute_execution_hygiene,
    compute_twr_series,
    compute_twr_summary,
    validate_telemetry_payload,
    verify_attestation,
)


class TestClearerTradeTelemetry(unittest.TestCase):
    def test_twr_rebase_strips_cashflows(self) -> None:
        curve = compute_twr_series(
            [
                {'date': '2026-11-15', 'nav_start': 100000.0, 'nav_end': 100500.0, 'net_flow': 0.0},
                {'date': '2026-11-16', 'nav_start': 100500.0, 'nav_end': 151505.0, 'net_flow': 50000.0},
            ],
            base=100.0,
        )
        self.assertEqual(len(curve), 2)
        self.assertAlmostEqual(curve[0]['twr_index'], 100.5, places=3)
        self.assertAlmostEqual(curve[1]['twr_index'], 101.505, places=3)

    def test_execution_hygiene_and_anonymize_baskets(self) -> None:
        fills = [
            {'symbol': 'WLD-PERP', 'is_maker': True, 'mae_bps': 4.0, 'mfe_bps': 18.0, 'adverse_drift_bps': 1.2},
            {'symbol': 'ETH-PERP', 'is_maker': False, 'mae_bps': 6.0, 'mfe_bps': 14.0, 'adverse_drift_bps': 2.0},
        ]
        hygiene = compute_execution_hygiene(fills, bucket_size=50)
        self.assertEqual(hygiene['maker_fill_ratio'], 0.5)
        self.assertEqual(hygiene['avg_mae_bps'], 5.0)
        self.assertEqual(hygiene['avg_mfe_bps'], 16.0)
        self.assertEqual(hygiene['adverse_drift_bps'], 1.6)
        self.assertEqual(hygiene['total_fills_bucketed'], 50)

        baskets, symbol_map = anonymize_baskets(fills)
        self.assertEqual({b['asset_alias'] for b in baskets}, {'Asset_A', 'Asset_B'})
        self.assertEqual(set(symbol_map.values()), {'Asset_A', 'Asset_B'})

    def test_attestation_sha256_deterministic(self) -> None:
        h1 = compute_attestation_sha256([{'a': 1, 'b': 2}], 'salt-1')
        h2 = compute_attestation_sha256([{'b': 2, 'a': 1}], 'salt-1')
        h3 = compute_attestation_sha256([{'a': 1, 'b': 2}], 'salt-2')
        self.assertEqual(h1, h2)
        self.assertNotEqual(h1, h3)
        self.assertEqual(len(h1), 64)

    def test_sample_telemetry_matches_schema_contract(self) -> None:
        schema = json.loads(Path('telemetry.schema.json').read_text(encoding='utf-8'))
        sample = json.loads(Path('examples/sample-telemetry.json').read_text(encoding='utf-8'))
        self.assertEqual(set(sample.keys()), set(schema['required']))
        self.assertEqual(sample['meta']['schema_version'], '1.0.0')
        self.assertRegex(sample['meta']['attestation_sha256'], r'^[a-f0-9]{64}$')
        self.assertIsNone(re.search(r'0x[a-fA-F0-9]{10,}', json.dumps(sample)))

    def test_empty_inputs(self) -> None:
        self.assertEqual(compute_twr_series([]), [])
        self.assertEqual(
            compute_execution_hygiene([]),
            {
                'maker_fill_ratio': 0.0,
                'avg_mae_bps': 0.0,
                'avg_mfe_bps': 0.0,
                'adverse_drift_bps': 0.0,
                'total_fills_bucketed': 0,
            },
        )
        baskets, symbol_map = anonymize_baskets([])
        self.assertEqual(baskets, [])
        self.assertEqual(symbol_map, {})

    def test_zero_or_negative_nav_and_capital_base(self) -> None:
        curve = compute_twr_series(
            [
                {'date': '2026-11-01', 'nav_start': 0.0, 'nav_end': 100.0, 'net_flow': 0.0},
                {'date': '2026-11-02', 'nav_start': -500.0, 'nav_end': 100.0, 'net_flow': 0.0},
                {'date': '2026-11-03', 'pnl': 250.0, 'capital_base': 0.0},
                {'date': '2026-11-04', 'pnl': 250.0, 'capital_base': -1000.0},
            ],
            base=100.0,
        )
        self.assertEqual([pt['daily_return_pct'] for pt in curve], [0.0, 0.0, 0.0, 0.0])
        self.assertEqual([pt['twr_index'] for pt in curve], [100.0, 100.0, 100.0, 100.0])

    def test_negative_returns_and_multiday_compounding(self) -> None:
        curve = compute_twr_series(
            [
                {'date': '2026-11-03', 'nav_start': 1000.0, 'nav_end': 950.0, 'net_flow': 0.0},
                {'date': '2026-11-01', 'daily_return_pct': 10.0},
                {'date': '2026-11-02', 'daily_return_pct': -10.0},
            ],
            base=100.0,
        )
        self.assertEqual([pt['date'] for pt in curve], ['2026-11-01', '2026-11-02', '2026-11-03'])
        self.assertAlmostEqual(curve[0]['twr_index'], 110.0, places=4)
        self.assertAlmostEqual(curve[1]['twr_index'], 99.0, places=4)
        self.assertAlmostEqual(curve[2]['twr_index'], 94.05, places=4)

    def test_more_than_26_unique_symbols(self) -> None:
        fills = [{'symbol': f'SYM_{i:02d}', 'mae_bps': 1.0} for i in range(28)]
        baskets, symbol_map = anonymize_baskets(fills)
        self.assertEqual(len(baskets), 28)
        self.assertEqual(symbol_map['SYM_00'], 'Asset_A')
        self.assertEqual(symbol_map['SYM_25'], 'Asset_Z')
        self.assertEqual(symbol_map['SYM_26'], 'Asset_AA')
        self.assertEqual(symbol_map['SYM_27'], 'Asset_AB')

    def test_pct_and_bps_input_formats(self) -> None:
        fills = [
            {'symbol': 'BTC-PERP', 'liquidity': 'maker', 'mae_pct': 0.05, 'mfe_pct': 0.20, 'drift_pct': 0.02},
            {'symbol': 'ETH-PERP', 'liquidity': 'taker', 'mae_bps': 15.0, 'mfe_bps': 30.0, 'adverse_drift_bps': 4.0},
        ]
        hygiene = compute_execution_hygiene(fills, bucket_size=50)
        self.assertEqual(hygiene['maker_fill_ratio'], 0.5)
        self.assertEqual(hygiene['avg_mae_bps'], 10.0)
        self.assertEqual(hygiene['avg_mfe_bps'], 25.0)
        self.assertEqual(hygiene['adverse_drift_bps'], 3.0)
        self.assertEqual(hygiene['total_fills_bucketed'], 50)

        baskets, _ = anonymize_baskets(fills)
        mae_by_alias = {b['asset_alias']: b['avg_mae_bps'] for b in baskets}
        self.assertEqual(mae_by_alias, {'Asset_A': 5.0, 'Asset_B': 15.0})

    def test_persistent_symbol_map_and_asset_fallback(self) -> None:
        existing_map = {'SOL-PERP': 'Asset_B'}
        fills = [
            {'symbol': 'SOL-PERP', 'mae_bps': 2.0},
            {'asset': 'ARB-PERP', 'mae_bps': 4.0},
            {'mae_bps': 6.0},
        ]
        baskets, updated_map = anonymize_baskets(fills, symbol_map=existing_map)
        self.assertEqual(updated_map['SOL-PERP'], 'Asset_B')
        self.assertEqual(updated_map['ARB-PERP'], 'Asset_C')
        self.assertEqual(updated_map['UNKNOWN'], 'Asset_D')
        self.assertEqual(len(baskets), 3)

    def test_maker_fill_tag_variants_and_override(self) -> None:
        fills = [
            {'symbol': 'A', 'order_type': 'ALO'},
            {'symbol': 'B', 'liquidity': 'post-only'},
            {'symbol': 'C', 'role': 'add'},
            {'symbol': 'D', 'maker_taker': 'post_only'},
            {'symbol': 'E', 'is_maker': False, 'order_type': 'ALO'},
        ]
        hygiene = compute_execution_hygiene(fills)
        self.assertEqual(hygiene['maker_fill_ratio'], 0.8)
        self.assertEqual(hygiene['avg_mae_bps'], 0.0)
        self.assertEqual(hygiene['avg_mfe_bps'], 0.0)
        self.assertEqual(hygiene['adverse_drift_bps'], 0.0)

    def test_bucketing_boundaries_and_drift_bps_fallback(self) -> None:
        fills_74 = [{'symbol': 'A', 'drift_bps': 1.5} for _ in range(74)]
        fills_76 = [{'symbol': 'A', 'drift_bps': 1.5} for _ in range(76)]
        self.assertEqual(compute_execution_hygiene(fills_74, bucket_size=50)['total_fills_bucketed'], 50)
        self.assertEqual(compute_execution_hygiene(fills_76, bucket_size=50)['total_fills_bucketed'], 100)
        self.assertEqual(compute_execution_hygiene(fills_74, bucket_size=1)['total_fills_bucketed'], 74)
        self.assertEqual(compute_execution_hygiene(fills_74, bucket_size=50)['adverse_drift_bps'], 1.5)

    def test_pnl_capital_base_and_signed_mae_normalization(self) -> None:
        curve = compute_twr_series(
            [
                {'date': '2026-11-01', 'pnl': 500.0, 'capital_base': 10000.0},
                {'date': '2026-11-02', 'daily_return_pct': -150.0},
            ],
            base=100.0,
        )
        self.assertEqual(curve[0]['daily_return_pct'], 5.0)
        self.assertEqual(curve[0]['twr_index'], 105.0)
        self.assertGreater(curve[1]['twr_index'], 0.0)

        fills = [
            {'symbol': 'BTC-PERP', 'mae_bps': -8.0, 'mfe_bps': -12.0, 'adverse_drift_bps': -1.5},
            {'symbol': 'BTC-PERP', 'mae_pct': -0.04, 'mfe_pct': -0.08, 'drift_pct': 0.015},
        ]
        hygiene = compute_execution_hygiene(fills)
        self.assertEqual(hygiene['avg_mae_bps'], 6.0)
        self.assertEqual(hygiene['avg_mfe_bps'], 10.0)
        self.assertEqual(hygiene['adverse_drift_bps'], 0.0)
        baskets, _ = anonymize_baskets(fills)
        self.assertEqual(baskets[0]['avg_mae_bps'], 6.0)

    def test_attestation_handles_decimal_and_datetime_and_iso_dates(self) -> None:
        raw = [{'ts': datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc), 'px': Decimal('105.42')}]
        digest = compute_attestation_sha256(raw, 'salt-dec')
        self.assertRegex(digest, r'^[a-f0-9]{64}$')

        curve = compute_twr_series(
            [
                {'date': '2026-11-16T23:59:59Z', 'daily_return_pct': 1.0},
                {'date': date(2026, 11, 15), 'daily_return_pct': 2.0},
            ]
        )
        self.assertEqual([pt['date'] for pt in curve], ['2026-11-15', '2026-11-16'])

    def test_build_and_validate_telemetry_payload(self) -> None:
        self.assertEqual(clearer_trade.__version__, '0.1.0')
        payload = build_telemetry_payload(
            node_id='clear-alpha-ref-01',
            daily_records=[{'date': '2026-11-15T00:00:00Z', 'daily_return_pct': 0.5}],
            fills=[{'symbol': 'BTC-PERP', 'is_maker': True, 'mae_bps': 3.2, 'mfe_bps': 12.4, 'adverse_drift_bps': 0.8}],
            salt='daily-ledger-salt',
            region='ap-northeast-1',
            publication_delay_hours=24,
            tick_stagger_bucket_ms=150,
            decorrelation_cohort='tokyo-systematic-v1',
        )
        validate_telemetry_payload(payload)
        self.assertEqual(payload['meta']['schema_version'], '1.0.0')
        self.assertEqual(payload['equity_curve'][0]['date'], '2026-11-15')

        # Reject < 24h publication delay
        with self.assertRaises(ValueError):
            build_telemetry_payload(
                node_id='clear-alpha-ref-01',
                daily_records=[{'date': '2026-11-15', 'daily_return_pct': 0.5}],
                fills=[],
                salt='salt',
                publication_delay_hours=12,
            )

        # Reject leaked 0x wallet address
        leaked = json.loads(json.dumps(payload))
        leaked['meta']['decorrelation_cohort'] = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
        with self.assertRaises(ValueError):
            validate_telemetry_payload(leaked)

        # Reject empty or whitespace-only salt
        for bad_salt in ('', '   '):
            with self.assertRaises(ValueError):
                compute_attestation_sha256([{'a': 1}], bad_salt)

        # Reject NaN / Infinity float poisoning
        with self.assertRaises(ValueError):
            compute_attestation_sha256([{'a': float('nan')}], 'valid-salt')
        poisoned = json.loads(json.dumps(payload))
        poisoned['execution_hygiene']['avg_mae_bps'] = float('nan')
        with self.assertRaises(ValueError):
            validate_telemetry_payload(poisoned)

    def test_opt_out_symbol_anonymization(self) -> None:
        fills = [
            {'symbol': 'BTC-PERP', 'mae_bps': 3.0},
            {'symbol': 'NVDA', 'mae_bps': 5.0},
        ]
        baskets, symbol_map = anonymize_baskets(fills, anonymize=False)
        self.assertEqual(symbol_map, {'BTC-PERP': 'BTC-PERP', 'NVDA': 'NVDA'})
        self.assertEqual({b['asset_alias'] for b in baskets}, {'BTC-PERP', 'NVDA'})

        raw_payload = build_telemetry_payload(
            node_id='internal-report-01',
            daily_records=[{'date': '2026-11-15', 'daily_return_pct': 0.5}],
            fills=fills,
            salt='internal-salt',
            anonymize_symbols=False,
        )
        self.assertEqual({b['asset_alias'] for b in raw_payload['anonymized_baskets']}, {'BTC-PERP', 'NVDA'})
        with self.assertRaises(ValueError):
            validate_telemetry_payload(raw_payload, strict_anonymization=True)
        validate_telemetry_payload(raw_payload, strict_anonymization=False)

    def test_streaming_generators_verify_attestation_and_twr_summary(self) -> None:
        gen_fills = (
            {'symbol': 'BTC-PERP' if i % 2 == 0 else 'ETH-PERP', 'is_maker': i % 2 == 0, 'mae_bps': 4.0}
            for i in range(100)
        )
        hygiene = compute_execution_hygiene(gen_fills, bucket_size=50)
        self.assertEqual(hygiene['maker_fill_ratio'], 0.5)
        self.assertEqual(hygiene['avg_mae_bps'], 4.0)
        self.assertEqual(hygiene['total_fills_bucketed'], 100)

        gen_baskets = ({'symbol': 'BTC-PERP', 'mae_bps': 2.0} for _ in range(10))
        baskets, _ = anonymize_baskets(gen_baskets)
        self.assertEqual(baskets, [{'asset_alias': 'Asset_A', 'fill_share_pct': 100.0, 'avg_mae_bps': 2.0}])

        daily = [
            {'date': '2026-11-01', 'daily_return_pct': 2.0},
            {'date': '2026-11-02', 'daily_return_pct': -1.0},
            {'date': '2026-11-03', 'daily_return_pct': 3.0},
        ]
        fills = [{'symbol': 'BTC-PERP', 'is_maker': True, 'mae_bps': 2.0}]
        payload = build_telemetry_payload(
            node_id='clear-alpha-ref-01',
            daily_records=daily,
            fills=fills,
            salt='audit-salt',
        )
        raw_input = {'daily_records': daily, 'fills': fills}
        self.assertTrue(verify_attestation(raw_input, 'audit-salt', payload))
        self.assertTrue(verify_attestation(raw_input, 'audit-salt', payload['meta']['attestation_sha256']))
        self.assertFalse(verify_attestation(raw_input, 'wrong-salt', payload))
        self.assertFalse(verify_attestation(raw_input, 'audit-salt', 'not-a-hash'))

        summary = compute_twr_summary(payload['equity_curve'])
        self.assertEqual(summary['trading_days'], 3)
        self.assertGreater(summary['total_return_pct'], 3.9)
        self.assertAlmostEqual(summary['max_drawdown_pct'], 1.0, places=3)
        self.assertGreater(summary['annualized_sharpe'], 0.0)
        self.assertGreater(summary['annualized_sortino'], 0.0)
        self.assertEqual(compute_twr_summary([])['trading_days'], 0)


if __name__ == '__main__':
    unittest.main()
