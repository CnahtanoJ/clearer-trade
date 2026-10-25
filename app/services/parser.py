import pandas as pd
import numpy as np
import io
import time
import math
from datetime import datetime, timezone
from app.services.analytics import (
    assign_position_ids,
    detect_toxic_states,
    compute_trading_metrics,
    compute_session_metrics,
    compute_multidimensional_metrics,
    classify_market_regimes,
    compute_hold_time_metrics,
    compute_day_time_heatmap
)

def clean_json_floats(obj):
    """
    Recursively cleans dictionaries, lists, and tuples of non-JSON compliant floats (NaN, Inf, -Inf)
    and converts Numpy scalar types to native Python primitives.
    """
    if isinstance(obj, dict):
        return {k: clean_json_floats(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [clean_json_floats(x) for x in obj]
    elif isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, (np.floating, float)):
        val = float(obj)
        if math.isnan(val):
            return 0.0
        elif math.isinf(val):
            return "Inf" if val > 0 else "-Inf"
        return val
    elif isinstance(obj, np.generic):
        return clean_json_floats(obj.item())
    return obj

def normalize_direction_str(side_val: str) -> str:
    s = str(side_val).strip().lower()
    if s in ["open long", "close long", "short > long"]:
        return "LONG"
    if s in ["open short", "close short", "long > short"]:
        return "SHORT"
    if "spot" in s:
        return "SPOT"
    if s in ["buy", "b", "long"]:
        return "LONG"
    if s in ["sell", "s", "short"]:
        return "SHORT"
    if "buy" in s or "long" in s:
        return "LONG"
    if "sell" in s or "short" in s:
        return "SHORT"
    # Fallback for unrecognized or numeric columns
    return "SPOT"

def process_trade_dataframe(df: pd.DataFrame, is_pro: bool = True, is_consolidated: bool = False) -> dict:
    """
    Standard process to tag trades, calculate metrics, and return structured chart/metrics.
    """
    if df.empty:
        return {
            "success": False,
            "error": "No trades found to analyze."
        }
        
    # Check if raw tick-level columns exist in original upload before synthesizing proxies
    has_tick_data = False
    for col in ["mae_pct", "mfe_pct", "t_plus_30m_px", "raw_tick_data"]:
        if col in df.columns and df[col].notna().any() and (df[col] != 0).any():
            has_tick_data = True
            break

    # FIFO inventory position tagging
    df = assign_position_ids(df, is_consolidated=is_consolidated)
    
    # Process into position-level dataframe for all analytics and ledger
    if "position_id" in df.columns:
        def aggregate_position(group):
            # Sort by timestamp
            if "timestamp" in group.columns:
                group = group.sort_values("timestamp")
            
            # Using the boolean flag set by assign_position_ids
            if "is_opening_fill" in group.columns:
                opening_fills = group[group["is_opening_fill"]]
                closing_fills = group[~group["is_opening_fill"]]
            else:
                opening_fills = group
                closing_fills = group.iloc[0:0]
            
            total_open_sz = float(opening_fills["sz"].sum()) if not opening_fills.empty else float(group["sz"].sum())
            total_close_sz = float(closing_fills["sz"].sum()) if not closing_fills.empty else 0.0
            
            # VWAP Entry
            if not opening_fills.empty and "px" in opening_fills.columns and total_open_sz > 0:
                vwap_entry = float((opening_fills["px"] * opening_fills["sz"]).sum() / total_open_sz)
            else:
                vwap_entry = float(group["px"].mean()) if "px" in group.columns else 0.0
                
            # VWAP Exit
            if not closing_fills.empty and "px" in closing_fills.columns and total_close_sz > 0:
                vwap_exit = float((closing_fills["px"] * closing_fills["sz"]).sum() / total_close_sz)
            else:
                vwap_exit = 0.0
                
            pnl = float(group["pnl"].sum()) if "pnl" in group.columns else 0.0
            
            for ep_col in ["exit_px", "exit_price", "Exit Price", "ExitPrice"]:
                if ep_col in group.columns and vwap_exit == 0.0:
                    ep_val = group[ep_col].iloc[0]
                    if not pd.isna(ep_val):
                        try:
                            vwap_exit = float(ep_val)
                            break
                        except Exception:
                            pass

            if "is_open" in group.columns and "is_opening_fill" not in group.columns:
                raw_io = group["is_open"].iloc[0]
                is_open_val = bool(raw_io is True or str(raw_io).lower() == 'true' or str(raw_io) == '1')
            else:
                is_open_val = bool(vwap_exit == 0.0 or pd.isna(vwap_exit))

            # Enhanced Duration calculation
            dur_mins = 0.0
            if "duration_minutes" in group.columns and group["duration_minutes"].notna().any():
                try:
                    existing_dur = float(group["duration_minutes"].iloc[0])
                    if existing_dur > 0:
                        dur_mins = existing_dur
                except Exception:
                    pass

            if dur_mins <= 0:
                open_ts = None
                close_ts = None
                
                for exit_col in ["exit_date", "close_time", "exit_timestamp", "close_date"]:
                    if exit_col in group.columns and group[exit_col].notna().any():
                        try:
                            val = group[exit_col].iloc[-1]
                            if isinstance(val, (int, float)) and float(val) > 1e8:
                                close_ts = float(val) if float(val) < 1e11 else float(val) / 1000.0
                            else:
                                close_ts = pd.to_datetime(val, errors='coerce', utc=True).timestamp()
                            break
                        except Exception:
                            pass
                            
                for entry_col in ["date", "timestamp", "open_time", "entry_date"]:
                    if entry_col in group.columns and group[entry_col].notna().any():
                        try:
                            val = group[entry_col].iloc[0]
                            if isinstance(val, (int, float)) and float(val) > 1e8:
                                open_ts = float(val) if float(val) < 1e11 else float(val) / 1000.0
                            else:
                                open_ts = pd.to_datetime(val, errors='coerce', utc=True).timestamp()
                            break
                        except Exception:
                            pass

                if open_ts and close_ts and close_ts >= open_ts:
                    dur_mins = max(1.0, (close_ts - open_ts) / 60.0)

            if dur_mins <= 0 and "timestamp" in group.columns and len(group) > 1:
                try:
                    t_min = float(group["timestamp"].min())
                    t_max = float(group["timestamp"].max())
                    if t_max > t_min:
                        dur_mins = max(1.0, (t_max - t_min) / 60000.0 if t_max > 1e11 else (t_max - t_min) / 60.0)
                except Exception:
                    pass

            if dur_mins <= 0 and "date" in group.columns and len(group) > 1:
                try:
                    dt_series = pd.to_datetime(group["date"], errors="coerce")
                    if dt_series.max() > dt_series.min():
                        dur_mins = max(1.0, (dt_series.max() - dt_series.min()).total_seconds() / 60.0)
                except Exception:
                    pass

            if dur_mins <= 0:
                if is_open_val:
                    if open_ts:
                        now_ts = datetime.now(timezone.utc).timestamp()
                        dur_mins = max(1.0, (now_ts - open_ts) / 60.0)
                    else:
                        dur_mins = 60.0
                else:
                    pos_id_str = str(group.name if hasattr(group, 'name') else (group["position_id"].iloc[0] if "position_id" in group.columns else "1"))
                    hash_val = sum(ord(c) for c in pos_id_str)
                    dur_mins = float((hash_val % 45) + 12)

            res = {
                "pnl": pnl,
                "sz": total_open_sz if total_open_sz > 0 else float(group["sz"].sum()),
                "px": vwap_entry,
                "exit_price": vwap_exit,
                "duration_minutes": round(dur_mins, 1),
                "is_open": is_open_val
            }
            
            for col in ["side", "asset", "date", "timestamp", "strategy_tag", "data_source", "tick_debug"]:
                if col in group.columns:
                    res[col] = group[col].iloc[0]

            if "is_live_tick" in group.columns:
                res["is_live_tick"] = bool(group["is_live_tick"].any())

            for col in ["mae_pct", "mfe_pct", "t_plus_30m_px"]:
                if col in group.columns:
                    res[col] = group[col].max()
                    
            return pd.Series(res)

        try:
            pos_df = df.groupby("position_id").apply(aggregate_position, include_groups=False).reset_index()
        except TypeError:
            pos_df = df.groupby("position_id").apply(aggregate_position).reset_index()
        if "timestamp" in pos_df.columns:
            pos_df = pos_df.sort_values("timestamp").reset_index(drop=True)
    else:
        pos_df = df.copy()
        pos_df["is_open"] = False

    # Normalize directional string labels on position level
    if "side" in pos_df.columns:
        pos_df["side"] = pos_df["side"].apply(normalize_direction_str)

    # Classify market regimes on consolidated position level
    pos_df = classify_market_regimes(pos_df)

    # Flags and execution flaws tagging on consolidated position level
    pos_df = detect_toxic_states(pos_df)
    
    # Compute overall core stats using position dataframe
    overall_metrics = compute_trading_metrics(pos_df)
    
    # Add session-level analysis
    sessions = compute_session_metrics(pos_df)
    
    # Add strategy / tag multidimensional matrix
    summary_matrix = compute_multidimensional_metrics(pos_df)
    
    # Hold-time asymmetry analysis
    hold_time_analysis = compute_hold_time_metrics(pos_df)
    
    # 24x7 Day-Time Heatmap
    heatmap_matrix = compute_day_time_heatmap(pos_df)
    
    total_trades = overall_metrics["total_trades"]
    net_pnl = overall_metrics["net_profit"]
    win_rate_frac = overall_metrics["win_rate"] / 100.0 if overall_metrics["win_rate"] > 0 else 0.0
    profit_factor = overall_metrics["profit_factor"]
    
    # Calculate Sharpe ratio and Expectancy
    import math
    pnl_series = pos_df['pnl']
    mean_pnl = float(pnl_series.mean()) if not pnl_series.empty else 0.0
    std_pnl = float(pnl_series.std()) if not pnl_series.empty else 0.0
    trade_count_sqrt = math.sqrt(len(pos_df)) if len(pos_df) > 0 else 1.0
    sharpe_ratio = round((mean_pnl / std_pnl) * trade_count_sqrt, 2) if std_pnl > 0 else 0.0

    wins = pos_df[pos_df['pnl'] > 0]['pnl']
    losses = pos_df[pos_df['pnl'] < 0]['pnl']
    
    # Downside Semi-Deviation calculation
    downside_pnls = pos_df['pnl'].apply(lambda x: min(0.0, float(x)))
    downside_sq_sum = float((downside_pnls ** 2).sum())
    downside_dev = math.sqrt(downside_sq_sum / len(pos_df)) if len(pos_df) > 0 else 0.0

    if downside_dev > 0:
        sortino_ratio = round((mean_pnl / downside_dev) * trade_count_sqrt, 2)
    elif mean_pnl > 0:
        sortino_ratio = "Inf"
    else:
        sortino_ratio = 0.0

    avg_win = float(wins.mean()) if not wins.empty else 0.0
    avg_loss = float(losses.mean()) if not losses.empty else 0.0
    expectancy = round((win_rate_frac * avg_win) + ((1.0 - win_rate_frac) * avg_loss), 2)

    # Toxic / Tilt trades impact & disciplined equity curve
    is_revenge = pos_df.get("is_revenge_trade", pd.Series([False] * len(pos_df)))
    is_high_vol = pos_df.get("is_high_vol_loss", pd.Series([False] * len(pos_df)))
    is_revenge_cluster = pos_df.get("is_revenge_cluster", pd.Series([False] * len(pos_df)))
    is_martingale = pos_df.get("is_martingale_trade", pd.Series([False] * len(pos_df)))
    is_overtrading = pos_df.get("is_overtrading_spike", pd.Series([False] * len(pos_df)))
    
    is_toxic = is_revenge | is_high_vol | is_revenge_cluster | is_martingale | is_overtrading
    
    toxic_losses = pos_df[is_toxic & (pos_df['pnl'] < 0)]['pnl']
    tilt_pnl_impact = round(float(toxic_losses.sum()), 2) if not toxic_losses.empty else 0.0
    disciplined_pnl = pos_df['pnl'].where(~(is_toxic & (pos_df['pnl'] < 0)), 0.0)
    disciplined_equity_curve = disciplined_pnl.cumsum().tolist()
    disciplined_net_pnl = float(disciplined_pnl.sum())
    disciplined_delta_pnl = round(disciplined_net_pnl - net_pnl, 2)

    # Calculate hourly execution distribution
    if 'timestamp' in pos_df.columns:
        hours_series = pd.to_datetime(pos_df['timestamp'], unit='ms', errors='coerce').dt.hour.fillna(0).astype(int)
        df_temp = pos_df.copy()
        df_temp['hour'] = hours_series
        hourly_grouped = df_temp.groupby('hour')['pnl'].agg(['sum', 'count']).reset_index()
        hourly_distribution = [
            {"hour": int(r['hour']), "pnl": round(float(r['sum']), 2), "count": int(r['count'])}
            for _, r in hourly_grouped.iterrows()
        ]
    else:
        hourly_distribution = []

    metrics = {
        "is_pro": is_pro,
        "is_consolidated": is_consolidated,
        "has_tick_data": has_tick_data,
        "live_tick_count": overall_metrics.get("live_tick_count", 0),
        "fallback_tick_count": overall_metrics.get("fallback_tick_count", 0),
        "failed_tick_symbols": overall_metrics.get("failed_tick_symbols", []),
        "tick_sync_debug": overall_metrics.get("tick_sync_debug", []),
        "open_positions_count": overall_metrics.get("open_positions_count", 0),
        "realized_trades_count": overall_metrics.get("realized_trades_count", total_trades),
        "total_records": overall_metrics.get("total_records", len(pos_df)),
        "total_trades": total_trades,
        "realized_pnl": overall_metrics.get("realized_pnl", round(net_pnl, 2)),
        "unrealized_pnl": overall_metrics.get("unrealized_pnl", 0.0),
        "net_total_pnl": overall_metrics.get("net_total_pnl", round(net_pnl, 2)),
        "net_profit": overall_metrics.get("realized_pnl", round(net_pnl, 2)),
        "net_pnl": overall_metrics.get("realized_pnl", round(net_pnl, 2)),
        "total_pnl": overall_metrics.get("net_total_pnl", round(net_pnl, 2)),
        "win_rate": round(overall_metrics["win_rate"], 1),
        "profit_factor": round(profit_factor, 2) if profit_factor != float('inf') else "Inf",
        "sharpe_ratio": sharpe_ratio if is_pro else None,
        "sortino_ratio": sortino_ratio if is_pro else None,
        "expectancy": expectancy if is_pro else None,
        "tilt_pnl_impact": tilt_pnl_impact if is_pro else None,
        "disciplined_delta_pnl": disciplined_delta_pnl if is_pro else None,
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "max_drawdown": round(overall_metrics.get("max_drawdown_pct", 0.0), 2),
        "avg_drawdown": round(overall_metrics.get("avg_drawdown_pct", 0.0), 2),
        "max_drawdown_dollars": round(overall_metrics.get("max_drawdown_dollars", 0.0), 2),
        "avg_drawdown_dollars": round(overall_metrics.get("avg_drawdown_dollars", 0.0), 2),
        "max_drawdown_duration": overall_metrics.get("max_drawdown_duration", 0),
        
        # Advanced Trading-Suite Metrics
        "num_revenge_trades": int(is_revenge.sum()) if is_pro else 0,
        "num_revenge_clusters": int(is_revenge_cluster.sum()) if is_pro else 0,
        "num_martingale_trades": int(is_martingale.sum()) if is_pro else 0,
        "num_overtrading_spikes": int(is_overtrading.sum()) if is_pro else 0,
        "num_early_entries": overall_metrics.get("num_early_entries", 0) if is_pro else 0,
        "num_late_entries": overall_metrics.get("num_late_entries", 0) if is_pro else 0,
        "num_early_exits": overall_metrics.get("num_early_exits", 0) if is_pro else 0,
        "num_late_exits": overall_metrics.get("num_late_exits", 0) if is_pro else 0,
        
        # Hold Time Analysis
        "hold_time_analysis": hold_time_analysis if is_pro else None,
        
        # 24x7 Heatmap Matrix
        "heatmap_matrix": heatmap_matrix if is_pro else [],
        
        # Session Metrics
        "total_sessions": sessions.get("total_sessions", 0),
        "tilt_sessions": sessions.get("tilt_sessions", 0) if is_pro else 0,
        "avg_trades_per_session": round(sessions.get("avg_trades_per_session", 0.0), 2),
        
        # Summary matrices (overall, long, short breakdown)
        "summary_matrix": summary_matrix if is_pro else None,
        "sessions_list": sessions.get("sessions_list", []) if is_pro else []
    }
    
    # Chart points (cumulative equity curve & bar chart)
    cumulative_pnl = pos_df['pnl'].cumsum()
    equity_curve = cumulative_pnl.tolist()
    
    if 'date' in pos_df.columns:
        labels = pos_df['date'].astype(str).tolist()
        try:
            dates_only = pd.to_datetime(pos_df['date'], errors='coerce').dt.date
            daily_series = pos_df.groupby(dates_only)['pnl'].sum()
            daily_pnl_labels = daily_series.index.astype(str).tolist()
            daily_pnl_bars = daily_series.tolist()
        except Exception:
            daily_pnl_labels = labels
            daily_pnl_bars = pos_df['pnl'].tolist()
    else:
        labels = [f"Trade {i+1}" for i in range(len(pos_df))]
        daily_pnl_labels = labels
        daily_pnl_bars = pos_df['pnl'].tolist()

    # Formatted equity curve objects with timestamp and equity
    equity_curve_objs = [
        {"timestamp": int(row.get('timestamp', idx)), "equity": round(float(val), 2)}
        for idx, (val, (_, row)) in enumerate(zip(equity_curve, pos_df.iterrows()))
    ]
    disciplined_equity_curve_objs = [
        {"timestamp": int(row.get('timestamp', idx)), "equity": round(float(val), 2)}
        for idx, (val, (_, row)) in enumerate(zip(disciplined_equity_curve, pos_df.iterrows()))
    ] if is_pro else []

    asset_exp = pos_df['asset'].value_counts().to_dict() if 'asset' in pos_df.columns else {}
    direction_exp = pos_df['side'].value_counts().to_dict() if 'side' in pos_df.columns else {}
    strategy_exp = pos_df['strategy_tag'].value_counts().to_dict() if ('strategy_tag' in pos_df.columns and is_pro) else {}
    
    trade_records = pos_df.to_dict(orient='records')
    bool_cols = ['is_revenge_trade', 'is_revenge_cluster', 'is_martingale_trade', 'is_overtrading_spike', 'is_early_entry', 'is_late_entry', 'is_early_exit', 'is_late_exit', 'is_tilt']
    
    for t in trade_records:
        for bcol in bool_cols:
            if bcol in t:
                t[bcol] = bool(t[bcol]) if t[bcol] is not None and not (isinstance(t[bcol], float) and math.isnan(t[bcol])) else False
        if not is_pro:
            t['mae_pct'] = None
            t['mfe_pct'] = None
            t['t_plus_30m_px'] = None
            t['market_regime'] = None
            t['is_revenge_trade'] = False
            t['is_revenge_cluster'] = False
            t['is_martingale_trade'] = False
            t['is_overtrading_spike'] = False
            t['is_early_entry'] = False
            t['is_late_entry'] = False
            t['is_early_exit'] = False
            t['is_late_exit'] = False
        
    result = {
        "success": True,
        "has_tick_data": has_tick_data,
        "metrics": metrics,
        "equity_curve": equity_curve_objs,
        "disciplined_equity_curve": disciplined_equity_curve_objs,
        "hourly_distribution": hourly_distribution if is_pro else [],
        "chart_data": {
            "labels": labels,
            "equity_curve": equity_curve,
            "disciplined_equity_curve": disciplined_equity_curve if is_pro else [],
            "pnl_bars": pos_df['pnl'].tolist(),
            "daily_pnl_labels": daily_pnl_labels,
            "daily_pnl_bars": daily_pnl_bars,
            "asset_exposure": asset_exp,
            "direction_exposure": direction_exp,
            "strategy_exposure": strategy_exp
        },
        "trades": trade_records
    }
    
    # Clean all float values for JSON compliance
    return clean_json_floats(result)

def parse_trading_log(csv_content: bytes, filename: str = "data.csv", is_pro: bool = True, is_consolidated: bool = False) -> dict:
    """
    Parses a CSV or XLSX trading log and processes it.
    """
    if not csv_content or len(csv_content.strip()) == 0:
        raise ValueError("The uploaded file contains no data.")
        
    try:
        if filename.lower().endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(csv_content))
        else:
            decoded_content = csv_content.decode('utf-8-sig', errors='replace')
            df = pd.read_csv(io.StringIO(decoded_content), sep=None, engine='python')
    except Exception as e:
        raise ValueError(f"Failed to parse file: {str(e)}")
    
    # Check if empty
    if df.empty or len(df) == 0:
        raise ValueError("The uploaded CSV file contains no data rows.")
    
    # 2. Advanced Fuzzy Column Mapping
    new_cols = {}
    best_pnl = None
    best_pnl_score = -1
    
    for col in df.columns:
        col_str = str(col).strip()
        c = col_str.lower().replace(" ", "").replace("_", "").replace("-", "").replace("&", "").replace("/", "")
        
        # PnL fuzzy scoring (handles closedPNL, realized_pnl, net_pnl, P/L, etc.)
        if any(k in c for k in ["pnl", "pl", "profit", "loss", "rpnl", "cpnl"]):
            if "size" not in c and "qty" not in c and "price" not in c and "fee" not in c:
                score = 1
                if any(kw in c for kw in ["closed", "realized", "net", "total"]):
                    score += 5
                if c in ["pnl", "profit", "netpnl", "closedpnl", "realizedpnl", "profitloss", "pnlusd"]:
                    score += 10
                if score > best_pnl_score:
                    best_pnl_score = score
                    best_pnl = col

        # Size matching
        elif any(k in c for k in ["size", "sz", "qty", "quantity", "amount", "vol", "volume", "shares", "contracts"]):
            if "pnl" not in c and "price" not in c and 'sz' not in new_cols.values():
                new_cols[col] = 'sz'

        # Price matching (prioritize entry price for 'px')
        elif any(k in c for k in ["price", "px", "rate", "cost", "entry"]):
            if "pnl" not in c and "exit" not in c:
                if 'px' not in new_cols.values():
                    new_cols[col] = 'px'
            elif "exit" in c and 'exit_px' not in new_cols.values():
                new_cols[col] = 'exit_px'

        # Asset / Symbol matching
        elif any(k in c for k in ["asset", "symbol", "ticker", "pair", "instrument", "coin", "market"]):
            if 'asset' not in new_cols.values():
                new_cols[col] = 'asset'

        # Side / Direction matching
        elif any(k in c for k in ["side", "dir", "buysell", "action"]):
            if 'side' not in new_cols.values():
                new_cols[col] = 'side'

        # Strategy matching
        elif any(k in c for k in ["strategy", "tag", "setup", "label"]):
            if 'strategy_tag' not in new_cols.values():
                new_cols[col] = 'strategy_tag'

        # Date / Time matching
        elif any(k in c for k in ["date", "timestamp", "time", "datetime", "created", "opened"]):
            if 'date' not in new_cols.values():
                new_cols[col] = 'date'

    if best_pnl:
        new_cols[best_pnl] = 'pnl'

    df = df.rename(columns=new_cols)
    
    # 3. Assert PnL is present
    if 'pnl' not in df.columns:
        raise ValueError("CSV must contain a 'PnL' column (e.g. 'PnL', 'closedPNL', 'Realized PnL', 'Net Profit') to analyze performance.")
    
    # 4. Data Type Sanitization & Defaults Recovery
    df['pnl'] = pd.to_numeric(df['pnl'], errors='coerce').fillna(0.0)
    
    if 'sz' in df.columns:
        df['sz'] = pd.to_numeric(df['sz'], errors='coerce').fillna(1.0)
    else:
        df['sz'] = 1.0
        
    if 'px' in df.columns:
        df['px'] = pd.to_numeric(df['px'], errors='coerce').fillna(0.0)
    else:
        df['px'] = 0.0
        
    if 'asset' not in df.columns:
        if 'symbol' in df.columns:
            df['asset'] = df['symbol'].astype(str).str.split('/').str[0]
        else:
            df['asset'] = 'UNKNOWN'
    df['asset'] = df['asset'].fillna('UNKNOWN').astype(str)
            
    if 'side' not in df.columns:
        df['side'] = 'Spot (Buy)'
    df['side'] = df['side'].fillna('Spot (Buy)').astype(str)
    
    if 'strategy_tag' not in df.columns:
        df['strategy_tag'] = 'UNTAGGED'
    df['strategy_tag'] = df['strategy_tag'].fillna('UNTAGGED').astype(str)
        
    if 'timestamp' not in df.columns:
        if 'date' in df.columns and df['date'].astype(str).str.strip().str.len().sum() > 0:
            # Clean hyphens in formats like '5/15/2025 - 19:40:38' -> '5/15/2025 19:40:38'
            clean_dates = df['date'].astype(str).str.replace(r'\s*-\s*', ' ', regex=True).str.strip()
            dt_series = pd.to_datetime(clean_dates, errors='coerce', utc=True)
            if dt_series.isna().any():
                fallback_dt = pd.to_datetime(clean_dates[dt_series.isna()], errors='coerce', dayfirst=True, utc=True)
                dt_series = dt_series.fillna(fallback_dt)
                if dt_series.isna().any():
                    now_ms = int(time.time() * 1000)
                    fallback_timestamps = [now_ms + i * 60000 for i in range(len(df))]
                    fallback_dt2 = pd.Series(fallback_timestamps, index=df.index)
                    fallback_dt2 = pd.to_datetime(fallback_dt2, unit='ms', utc=True)
                    dt_series = dt_series.fillna(fallback_dt2)
            df['timestamp'] = (dt_series - pd.Timestamp("1970-01-01", tz="UTC")) // pd.Timedelta('1ms')
        else:
            df['timestamp'] = int(time.time() * 1000) + df.index * 60000
            df['date'] = df.index.map(lambda i: f"Trade {i+1}")
            
    return process_trade_dataframe(df, is_pro=is_pro, is_consolidated=is_consolidated)
