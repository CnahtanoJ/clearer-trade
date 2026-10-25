export interface Trade {
  timestamp: number;
  symbol?: string;
  asset?: string;
  side: string;
  price?: number;
  px?: number;
  qty?: number;
  sz?: number;
  size?: number;
  pnl?: number;
  commission?: number;
  is_open?: boolean;
  is_tilt?: boolean;
  is_revenge_trade?: boolean;
  is_revenge_cluster?: boolean;
  is_martingale_trade?: boolean;
  is_overtrading_spike?: boolean;
  is_early_entry?: boolean;
  is_late_entry?: boolean;
  is_early_exit?: boolean;
  is_late_exit?: boolean;
  date?: string;
  tags?: string[];
  notes?: string;
  strategy_tag?: string;
  mae_pct?: number;
  mfe_pct?: number;
  t_plus_30m_px?: number;
  is_live_tick?: boolean;
  data_source?: string;
  market_regime?: string;
  [key: string]: any;
}

export interface StrategyStat {
  total_trades: number;
  net_profit: number;
  win_rate: number;
  profit_factor: number | string;
  avg_profit_pct: number;
}

export interface HeatmapCell {
  day_index: number;
  day_name: string;
  hour: number;
  trade_count: number;
  net_pnl: number;
  win_rate: number;
  avg_pnl: number;
}

export interface HoldTimeAnalysis {
  median_winner_mins: number;
  median_loser_mins: number;
  avg_winner_mins: number;
  avg_loser_mins: number;
  asymmetry_ratio: number;
  trade_durations: Array<{
    id: string;
    pnl: number;
    duration_mins: number;
    is_winner: boolean;
  }>;
}

export interface MetricSummary {
  is_pro?: boolean;
  is_demo?: boolean;
  is_consolidated?: boolean;
  has_tick_data?: boolean;
  live_tick_count?: number;
  fallback_tick_count?: number;
  failed_tick_symbols?: string[];
  tick_sync_debug?: string[];
  open_positions_count?: number;
  realized_trades_count?: number;
  total_records?: number;
  total_pnl?: number;
  net_profit?: number;
  realized_pnl?: number;
  unrealized_pnl?: number;
  net_total_pnl?: number;
  total_trades: number;
  winning_trades?: number;
  losing_trades?: number;
  net_pnl?: number;
  win_rate: number;
  profit_factor: number | string;
  avg_win?: number;
  avg_loss?: number;
  expectancy?: number;
  sharpe_ratio?: number;
  sortino_ratio?: number;
  max_drawdown?: number;
  avg_drawdown?: number;
  max_drawdown_dollars?: number;
  avg_drawdown_dollars?: number;
  max_drawdown_duration?: number;
  tilt_trades_count?: number;
  revenge_trades_count?: number;
  tilt_pnl_impact?: number;
  disciplined_delta_pnl?: number;
  tilt_sessions?: number;
  total_sessions?: number;
  avg_trades_per_session?: number;
  num_revenge_trades?: number;
  num_revenge_clusters?: number;
  num_martingale_trades?: number;
  num_overtrading_spikes?: number;
  num_early_entries?: number;
  num_late_entries?: number;
  num_early_exits?: number;
  num_late_exits?: number;
  hold_time_analysis?: HoldTimeAnalysis;
  heatmap_matrix?: HeatmapCell[];
  summary_matrix?: {
    OVERALL?: Record<string, StrategyStat>;
    LONG?: Record<string, StrategyStat>;
    SHORT?: Record<string, StrategyStat>;
    SPOT?: Record<string, StrategyStat>;
  };
  sessions_list?: Array<{
    start_time?: string | number;
    duration_minutes?: number;
    pnl?: number;
    trade_count?: number;
    [key: string]: any;
  }>;
}

export interface ProcessedData {
  success: boolean;
  filename?: string;
  metrics: MetricSummary;
  trades: Trade[];
  equity_curve: { timestamp: number; equity: number }[];
  disciplined_equity_curve?: { timestamp: number; equity: number }[];
  hourly_distribution?: { hour: number; pnl: number; count: number }[];
  chart_data?: {
    labels?: string[];
    equity_curve?: number[];
    disciplined_equity_curve?: number[];
    pnl_bars?: number[];
    daily_pnl_labels?: string[];
    daily_pnl_bars?: number[];
    asset_exposure?: Record<string, number>;
    direction_exposure?: Record<string, number>;
    strategy_exposure?: Record<string, number>;
  };
  error?: string;
  currencySymbol?: string;
}

export interface AuditResponse {
  success: boolean;
  status: 'STABLE' | 'PROBATION' | 'SUSPENDED' | 'UNKNOWN';
  audit: string;
  remaining?: number;
  usage_count?: number;
  limit?: number;
  model_name?: string;
  message?: string;
  error?: string;
}

export interface AutoConfig {
  timestampCol: string;
  symbolCol: string;
  sideCol: string;
  priceCol: string;
  exitPriceCol?: string;
  qtyCol: string;
  pnlCol: string;
  currency?: string;
  currencySymbol?: string;
  isConsolidated?: boolean;
  dataFormat?: 'FIFO' | 'CONSOLIDATED';
  confidence: number;
}

