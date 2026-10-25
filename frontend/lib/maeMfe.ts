export type MaeMfeResult = {
  mae_pct: number;
  mfe_pct: number;
  t_plus_30m_px: number;
  is_live_tick: boolean;
  data_source: string;
};

export function calculate3TierMaeMfe(
  entryPrice: number,
  exitPrice: number,
  pnl: number,
  costBasis: number,
  isLong: boolean,
  highs: number[],
  lows: number[],
  closes: number[],
  dataSource: string
): MaeMfeResult {
  const pnlPct = costBasis >= 0.01 ? (pnl / costBasis) * 100.0 : (pnl >= 0 ? 1.0 : -1.0);

  // Exact price return at exit if entry and exit prices are available
  let tradeReturnPct: number | null = null;
  if (entryPrice > 0 && exitPrice > 0) {
    tradeReturnPct = isLong
      ? ((exitPrice - entryPrice) / entryPrice) * 100.0
      : ((entryPrice - exitPrice) / entryPrice) * 100.0;
  } else if (costBasis >= 0.01) {
    tradeReturnPct = pnlPct;
  } else if (pnl !== 0) {
    tradeReturnPct = pnl > 0 ? 1.0 : -1.0;
  }

  // Include known trade execution boundaries in candidate pool
  const allHighs = [...highs];
  const allLows = [...lows];
  if (entryPrice > 0) {
    allHighs.push(entryPrice);
    allLows.push(entryPrice);
  }
  if (exitPrice > 0) {
    allHighs.push(exitPrice);
    allLows.push(exitPrice);
  }

  // -------------------------------------------------------------------
  // TIER 1: EXACT GRANULAR CANDLES (5m / 15m)
  // -------------------------------------------------------------------
  const isGranular = dataSource.includes('5m') || dataSource.includes('15m');
  
  if (isGranular && highs.length > 0 && lows.length > 0 && closes.length > 0) {
    const maxHigh = Math.max(...allHighs);
    const minLow = Math.min(...allLows);
    const t30Px = closes[Math.min(5, closes.length - 1)]; // Approx 30m later if 5m candles
    
    let mfe = 0.5;
    let mae = 0.5;
    
    if (entryPrice > 0) {
      if (isLong) {
        mfe = ((maxHigh - entryPrice) / entryPrice) * 100.0;
        mae = ((entryPrice - minLow) / entryPrice) * 100.0;
      } else {
        mfe = ((entryPrice - minLow) / entryPrice) * 100.0;
        mae = ((maxHigh - entryPrice) / entryPrice) * 100.0;
      }
    }

    // Invariable physical bounds:
    // 1. Winning trade: MFE can NEVER be less than the realized profit %
    // 2. Losing trade: MAE can NEVER be less than the realized loss %
    if (tradeReturnPct !== null) {
      if (tradeReturnPct > 0) {
        mfe = Math.max(mfe, tradeReturnPct);
      } else if (tradeReturnPct < 0) {
        mae = Math.max(mae, Math.abs(tradeReturnPct));
      }
    }
    
    return {
      mae_pct: Math.round(Math.max(0.15, mae) * 100) / 100,
      mfe_pct: Math.round(Math.max(0.15, mfe) * 100) / 100,
      t_plus_30m_px: t30Px,
      is_live_tick: true,
      data_source: dataSource
    };
  }

  // -------------------------------------------------------------------
  // TIER 2: HYBRID HTF BOUNDED CALCULATION (1h / 4h / 1d)
  // -------------------------------------------------------------------
  if (highs.length > 0 && lows.length > 0 && closes.length > 0) {
    const maxPeriodHigh = Math.max(...allHighs);
    const minPeriodLow = Math.min(...allLows);
    const t30Px = closes[closes.length - 1]; // Fallback to last close
    
    let maxPossibleMfe = 0;
    let maxPossibleMae = 0;
    
    if (entryPrice > 0) {
      if (isLong) {
        maxPossibleMfe = ((maxPeriodHigh - entryPrice) / entryPrice) * 100.0;
        maxPossibleMae = ((entryPrice - minPeriodLow) / entryPrice) * 100.0;
      } else {
        maxPossibleMfe = ((entryPrice - minPeriodLow) / entryPrice) * 100.0;
        maxPossibleMae = ((maxPeriodHigh - entryPrice) / entryPrice) * 100.0;
      }
    }

    const effectiveWinPct = tradeReturnPct !== null && tradeReturnPct > 0 ? tradeReturnPct : (pnl > 0 ? pnlPct : 0.35);
    const effectiveLossPct = tradeReturnPct !== null && tradeReturnPct < 0 ? Math.abs(tradeReturnPct) : (pnl < 0 ? Math.abs(pnlPct) : 0.25);

    const mfeBounded = Math.max(effectiveWinPct, maxPossibleMfe);
    const maeBounded = Math.max(effectiveLossPct, maxPossibleMae);

    return {
      mae_pct: Math.round(Math.max(0.15, maeBounded) * 100) / 100,
      mfe_pct: Math.round(Math.max(0.15, mfeBounded) * 100) / 100,
      t_plus_30m_px: t30Px,
      is_live_tick: false,
      data_source: `hybrid_bounded_${dataSource}`
    };
  }

  // -------------------------------------------------------------------
  // TIER 3: PURE EMPIRICAL PNL FALLBACK
  // -------------------------------------------------------------------
  const isWinner = (tradeReturnPct !== null && tradeReturnPct > 0) || pnl > 0;
  const isLoser = (tradeReturnPct !== null && tradeReturnPct < 0) || pnl < 0;

  const winBase = tradeReturnPct !== null && tradeReturnPct > 0 ? tradeReturnPct : (pnl > 0 ? pnlPct : 0.35);
  const lossBase = tradeReturnPct !== null && tradeReturnPct < 0 ? Math.abs(tradeReturnPct) : (pnl < 0 ? Math.abs(pnlPct) : 0.25);

  let maeFallback = Math.round(Math.max(0.15, isLoser ? lossBase * 1.1 : 0.25) * 100) / 100;
  let mfeFallback = Math.round(Math.max(0.20, isWinner ? winBase * 1.25 : 0.35) * 100) / 100;

  if (isWinner) {
    mfeFallback = Math.max(mfeFallback, Math.round(winBase * 100) / 100);
  }
  if (isLoser) {
    maeFallback = Math.max(maeFallback, Math.round(lossBase * 100) / 100);
  }

  const t30Fallback = entryPrice * (isWinner ? 1.02 : 0.98);

  return {
    mae_pct: maeFallback,
    mfe_pct: mfeFallback,
    t_plus_30m_px: t30Fallback,
    is_live_tick: false,
    data_source: 'fallback_pure_pnl_formula'
  };
}
