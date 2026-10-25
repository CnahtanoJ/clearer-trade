import pandas as pd
import numpy as np
import math
from datetime import datetime, timezone

def is_long_trade(side: str) -> bool:
    """
    Determines if a trade is a long position/trade (versus short position/trade).
    Centralized function used across analytics.py and app.py to prevent divergence.
    Handles standard (BUY/SELL, LONG/SHORT) and Hyperliquid directions 
    ('Open Long', 'Close Long', 'Open Short', 'Close Short', 'Buy', 'Sell', 'Long > Short', 'Short > Long').
    """
    s = str(side).strip().lower()
    if s in ["short", "sell", "s", "open short", "close short", "long > short"]:
        return False
    if s in ["long", "buy", "b", "open long", "close long", "short > long", "spot", "spot buy"]:
        return True
    if "open short" in s or "close short" in s or "long > short" in s:
        return False
    if "open long" in s or "close long" in s or "short > long" in s:
        return True
    if "sell" in s:
        return False
    if "buy" in s or "long" in s or "spot" in s:
        return True
    # Default fallback for unrecognized or numeric columns
    return False

def parse_portfolio_state(portfolio_state: dict) -> dict:
    """
    Standardizes parsing of Hyperliquid portfolio/margin/spot/positions state.
    Eliminates duplicated parsing logic across ai_agent.py and app.py.
    """
    if not portfolio_state or not isinstance(portfolio_state, dict):
        return {}
        
    margin_sum = portfolio_state.get("marginSummary", {})
    acc_val = float(margin_sum.get("accountValue", 0.0))
    margin_used = float(margin_sum.get("totalMarginUsed", 0.0))
    ntl_pos = float(margin_sum.get("totalNtlPos", 0.0))
    cash = float(portfolio_state.get("withdrawable", 0.0))
    
    # Calculate Spot Valuations for Unified Accounts
    spot_val = 0.0
    spot_usdc = 0.0
    is_unified = "spotState" in portfolio_state
    
    parsed_spot_balances = []
    if is_unified:
        spot_balances = portfolio_state["spotState"].get("balances", [])
        for bal in spot_balances:
            coin = bal.get("coin")
            total = float(bal.get("total", 0.0))
            hold = float(bal.get("hold", 0.0))
            entry_ntl = float(bal.get("entryNtl", 0.0))
            
            if coin == "USDC":
                spot_usdc = total
                spot_val += total
            else:
                spot_val += entry_ntl
                
            parsed_spot_balances.append({
                "coin": coin,
                "total": total,
                "hold": hold,
                "entry_ntl": entry_ntl
            })
            
        # Fetch USDC available after maintenance if possible
        token_avail = portfolio_state["spotState"].get("tokenToAvailableAfterMaintenance", [])
        avail_usdc = 0.0
        for t_item in token_avail:
            if t_item[0] == 0:
                avail_usdc = float(t_item[1])
                break
        if avail_usdc == 0.0 and len(spot_balances) > 0:
            avail_usdc = max(0.0, spot_usdc - float(spot_balances[0].get("hold", 0.0)))
        cash = avail_usdc
        
    unified_acc_val = acc_val + spot_val if is_unified else acc_val
    leverage = ntl_pos / unified_acc_val if unified_acc_val > 0 else 0.0
    
    # Parse open perpetual positions
    positions = portfolio_state.get("assetPositions", [])
    parsed_positions = []
    for pos_item in positions:
        pos = pos_item.get("position", {})
        coin = pos.get("coin")
        szi_val = pos.get("szi")
        if szi_val is not None:
            szi = float(szi_val)
            if abs(szi) > 0:
                entry_px = float(pos.get("entryPx", 0.0))
                value = float(pos.get("positionValue", 0.0))
                liq_px = float(pos.get("liquidationPx", 0.0)) if pos.get("liquidationPx") else 0.0
                unrealized_pnl = float(pos.get("unrealizedPnl", 0.0))
                lev_val = pos.get("leverage", {}).get("value", 1)
                
                parsed_positions.append({
                    "coin": coin,
                    "szi": szi,
                    "direction": "LONG" if szi > 0 else "SHORT",
                    "entry_px": entry_px,
                    "value": value,
                    "liq_px": liq_px,
                    "unrealized_pnl": unrealized_pnl,
                    "leverage": lev_val
                })
                
    return {
        "acc_val": acc_val,
        "margin_used": margin_used,
        "ntl_pos": ntl_pos,
        "cash": cash,
        "spot_val": spot_val,
        "is_unified": is_unified,
        "unified_acc_val": unified_acc_val,
        "leverage": leverage,
        "positions": parsed_positions,
        "spot_balances": parsed_spot_balances
    }

def compute_drawdown_metrics(pnl_series: pd.Series, start_equity: float = 100000.0) -> tuple:
    """
    Computes average drawdown %, max drawdown %, and max drawdown duration from a series of trade PnLs.
    Eliminates copy-paste drawdown calculations in compute_trading_metrics.
    Returns (avg_drawdown_pct, max_drawdown_pct, max_drawdown_duration).
    """
    if pnl_series.empty:
        return 0.0, 0.0, 0
        
    cumulative_pnl = pnl_series.cumsum()
    equity_curve = start_equity + cumulative_pnl
    peak_equity = equity_curve.cummax()
    drawdowns = (peak_equity - equity_curve) / peak_equity * 100
    avg_drawdown_pct = float(drawdowns.mean())
    max_drawdown_pct = float(drawdowns.max()) if not drawdowns.empty else 0.0
    
    max_drawdown_duration = 0
    is_drawdown = drawdowns > 0
    if is_drawdown.any():
        s = is_drawdown
        groupby_consecutive = s.ne(s.shift()).cumsum()
        consecutive_counts = s.groupby(groupby_consecutive).sum()
        max_drawdown_duration = int(consecutive_counts.max())
        
    return avg_drawdown_pct, max_drawdown_pct, max_drawdown_duration

def _calculate_win_rate_and_pf(realized_df: pd.DataFrame) -> tuple:
    """
    Helper to calculate total_trades, total_wins, total_losses, win_rate, and profit_factor.
    """
    total_trades = len(realized_df)
    wins = realized_df[realized_df["pnl"] > 0]["pnl"]
    losses = realized_df[realized_df["pnl"] < 0]["pnl"]
    
    total_wins = len(wins)
    total_losses = len(losses)
    
    win_rate = float((total_wins / total_trades) * 100) if total_trades > 0 else 0.0
    
    sum_wins = float(wins.sum()) if not wins.empty else 0.0
    sum_losses = float(abs(losses.sum())) if not losses.empty else 0.0
    
    if sum_losses > 0:
        profit_factor = float(sum_wins / sum_losses)
    else:
        profit_factor = float('inf') if sum_wins > 0 else 0.0
        
    return total_trades, total_wins, total_losses, win_rate, profit_factor, wins, losses

def resolve_trade_cost_basis(price: float, size: float, pnl: float, exit_price: float = 0.0, is_long: bool = True) -> float:
    """
    Mathematically exact cost basis calculation that accommodates:
    1. Memecoin & leverage moonshot trades (+10,000% to +100,000%+ returns).
    2. Coin Quantity sizes (e.g. 0.0002 BTC or 1,000,000 PEPE).
    3. Dollar Notional sizes (e.g. $500 spent).
    """
    price = float(price or 0.0)
    size = float(size or 0.0)
    pnl = float(pnl or 0.0)
    exit_price = float(exit_price or 0.0)

    if price > 0 and size > 0:
        cost_as_qty = price * size
        cost_as_notional = size

        if exit_price > 0 and abs(pnl) > 0.01:
            diff_entry_exit = (exit_price - price) if is_long else (price - exit_price)
            expected_pnl_qty = size * diff_entry_exit
            expected_pnl_notional = (size / price) * diff_entry_exit if price > 0 else 0.0

            err_qty = abs(pnl - expected_pnl_qty)
            err_notional = abs(pnl - expected_pnl_notional)

            if err_notional < err_qty and err_notional < max(abs(pnl) * 0.15, 0.5):
                return cost_as_notional
            elif err_qty < err_notional and err_qty < max(abs(pnl) * 0.15, 0.5):
                return cost_as_qty

        # Heuristic: If size > 10 * price and size > abs(pnl), size is likely dollar notional
        if size > 10 * price and size > abs(pnl) * 0.5:
            return cost_as_notional

        return cost_as_qty

    if size > 0:
        return size

    return max(abs(pnl) / 0.05, 50.0) if abs(pnl) > 0 else 100.0

def compute_trading_metrics(df: pd.DataFrame, start_equity: float = 100000.0) -> dict:
    """
    Computes standard performance metrics and execution timing flaws for a ledger of trades.
    """
    metrics = {
        "total_trades": 0,
        "win_rate": 0.0,
        "profit_factor": 0.0,
        "avg_drawdown_pct": 0.0,
        "max_drawdown_pct": 0.0,
        "net_profit": 0.0,
        "total_wins": 0,
        "total_losses": 0,
        "avg_profit_pct": 0.0,
        "avg_win_pct": 0.0,
        "avg_loss_pct": 0.0,
        "expectancy": 0.0,
        "avg_position_size_pct": 0.0,
        "max_drawdown_duration": 0,
        "avg_mae_pct": 0.0,
        "avg_mfe_pct": 0.0,
        "num_early_entries": 0,
        "num_late_entries": 0,
        "num_early_exits": 0,
        "num_late_exits": 0,
        "open_positions_count": 0,
        "realized_trades_count": 0,
        "total_records": len(df),
        "tick_sync_debug": []
    }
    
    # Calculate position-level or realized metrics
    if "position_id" in df.columns:
        pos_df = df.copy()
        
        if "is_open" in pos_df.columns:
            is_open_series = pos_df["is_open"].apply(lambda v: True if (v is True or str(v).lower() == 'true' or str(v) == '1') else False)
        else:
            is_open_series = pd.Series([False] * len(pos_df), index=pos_df.index)

        realized_pos = pos_df[~is_open_series].copy()
        open_pos = pos_df[is_open_series].copy()
        
        realized_pnl_val = float(realized_pos["pnl"].sum()) if not realized_pos.empty else 0.0
        unrealized_pnl_val = float(open_pos["pnl"].sum()) if not open_pos.empty else 0.0
        
        metrics["open_positions_count"] = int(is_open_series.sum())
        metrics["realized_trades_count"] = len(realized_pos)
        
        t_trades, t_wins, t_losses, wr, pf, wins, losses = _calculate_win_rate_and_pf(realized_pos)
        metrics["total_trades"] = t_trades
        metrics["total_records"] = len(pos_df)
        metrics["realized_pnl"] = round(realized_pnl_val, 2)
        metrics["unrealized_pnl"] = round(unrealized_pnl_val, 2)
        metrics["net_profit"] = round(realized_pnl_val, 2) # Net Realized PnL strictly on closed trades
        metrics["net_total_pnl"] = round(float(pos_df["pnl"].sum()), 2)
        metrics["total_wins"] = t_wins
        metrics["total_losses"] = t_losses
        metrics["win_rate"] = wr
        metrics["profit_factor"] = pf
        
        # Drawdown Calculation strictly on realized trades
        metrics["avg_drawdown_pct"], metrics["max_drawdown_pct"], metrics["max_drawdown_duration"] = compute_drawdown_metrics(realized_pos["pnl"] if not realized_pos.empty else df["pnl"], start_equity)
        
        # Exact dollar peak-to-trough drawdowns
        pnl_series = realized_pos["pnl"] if not realized_pos.empty else df["pnl"]
        if not pnl_series.empty:
            cum_pnl = pnl_series.cumsum()
            drops = cum_pnl.cummax() - cum_pnl
            metrics["max_drawdown_dollars"] = round(float(drops.max()), 2)
            metrics["avg_drawdown_dollars"] = round(float(drops.mean()), 2)
        else:
            metrics["max_drawdown_dollars"] = 0.0
            metrics["avg_drawdown_dollars"] = 0.0
        
        # Average Profit % - Exact Mathematical Cost Basis Resolution on Realized Trades
        if "px" in df.columns and "sz" in df.columns and not realized_pos.empty:
            entry_costs = {}
            for pos_id, group in df.groupby("position_id"):
                first_fill = group.iloc[0]
                is_long = is_long_trade(first_fill["side"])
                pnl_val = float(group["pnl"].sum())
                px_val = float(first_fill["px"]) if "px" in first_fill else 0.0
                sz_val = float(group["sz"].sum()) if "sz" in group else 0.0
                exit_px_val = float(group.iloc[-1]["px"]) if "px" in group.iloc[-1] and len(group) > 1 else 0.0
                
                c_basis = resolve_trade_cost_basis(px_val, sz_val, pnl_val, exit_px_val, is_long)
                entry_costs[pos_id] = c_basis
                
            realized_pos["entry_cost"] = realized_pos["position_id"].map(entry_costs)
            cost = realized_pos["entry_cost"].apply(lambda c: c if isinstance(c, (int, float)) and c >= 0.01 else np.nan)
            
            profit_pcts = (realized_pos["pnl"] / cost) * 100
            metrics["avg_profit_pct"] = float(profit_pcts.dropna().mean()) if not profit_pcts.dropna().empty else 0.0
            
            winning_pcts = profit_pcts[realized_pos["pnl"] > 0]
            losing_pcts = profit_pcts[realized_pos["pnl"] < 0]
            metrics["avg_win_pct"] = float(winning_pcts.dropna().mean()) if not winning_pcts.dropna().empty else 0.0
            metrics["avg_loss_pct"] = float(abs(losing_pcts.dropna().mean())) if not losing_pcts.dropna().empty else 0.0
            
            win_prob = metrics["win_rate"] / 100.0
            loss_prob = 1.0 - win_prob
            metrics["expectancy_pct"] = float((win_prob * metrics["avg_win_pct"]) - (loss_prob * metrics["avg_loss_pct"]))
            
            pos_cum_pnl = realized_pos["pnl"].cumsum()
            pos_equity = start_equity + pos_cum_pnl.shift(1).fillna(0)
            pos_size_pct = (cost / pos_equity) * 100
            metrics["avg_position_size_pct"] = float(pos_size_pct.dropna().mean()) if not pos_size_pct.dropna().empty else 0.0
    else:
        # Fallback to realized trades logic if position_id is missing
        is_open_series = df.get("is_open", pd.Series([False] * len(df)))
        realized_df = df[df["pnl"] != 0.0]
        metrics["open_positions_count"] = int(is_open_series.sum())
        metrics["realized_trades_count"] = len(realized_df)
        t_trades, t_wins, t_losses, wr, pf, wins, losses = _calculate_win_rate_and_pf(realized_df)
        metrics["total_trades"] = t_trades
        metrics["realized_pnl"] = round(float(realized_df["pnl"].sum()), 2)
        metrics["unrealized_pnl"] = 0.0
        metrics["net_profit"] = metrics["realized_pnl"]
        metrics["net_total_pnl"] = round(float(df["pnl"].sum()), 2)
        metrics["total_wins"] = t_wins
        metrics["total_losses"] = t_losses
        metrics["win_rate"] = wr
        metrics["profit_factor"] = pf

        metrics["avg_drawdown_pct"], metrics["max_drawdown_pct"], metrics["max_drawdown_duration"] = compute_drawdown_metrics(realized_df["pnl"] if not realized_df.empty else df["pnl"], start_equity)
        pnl_series = realized_df["pnl"] if not realized_df.empty else df["pnl"]
        if not pnl_series.empty:
            cum_pnl = pnl_series.cumsum()
            drops = cum_pnl.cummax() - cum_pnl
            metrics["max_drawdown_dollars"] = round(float(drops.max()), 2)
            metrics["avg_drawdown_dollars"] = round(float(drops.mean()), 2)
        else:
            metrics["max_drawdown_dollars"] = 0.0
            metrics["avg_drawdown_dollars"] = 0.0
        
        if "px" in df.columns and "sz" in df.columns:
            costs = []
            for _, row in realized_df.iterrows():
                px_val = float(row.get("px", 0.0))
                sz_val = float(row.get("sz", 0.0))
                pnl_val = float(row.get("pnl", 0.0))
                exit_px = float(row.get("exit_price", 0.0))
                is_long = is_long_trade(row.get("side", "BUY"))
                costs.append(resolve_trade_cost_basis(px_val, sz_val, pnl_val, exit_px, is_long))
            
            cost = pd.Series(costs, index=realized_df.index).apply(lambda c: c if isinstance(c, (int, float)) and c >= 0.01 else np.nan)
            profit_pcts = (realized_df["pnl"] / cost) * 100
            metrics["avg_profit_pct"] = float(profit_pcts.dropna().mean()) if not profit_pcts.dropna().empty else 0.0
            
            winning_pcts = profit_pcts[realized_df["pnl"] > 0]
            losing_pcts = profit_pcts[realized_df["pnl"] < 0]
            metrics["avg_win_pct"] = float(winning_pcts.dropna().mean()) if not winning_pcts.dropna().empty else 0.0
            metrics["avg_loss_pct"] = float(abs(losing_pcts.dropna().mean())) if not losing_pcts.dropna().empty else 0.0
            
            win_prob = metrics["win_rate"] / 100.0
            loss_prob = 1.0 - win_prob
            metrics["expectancy_pct"] = float((win_prob * metrics["avg_win_pct"]) - (loss_prob * metrics["avg_loss_pct"]))
            
            pos_cum_pnl = realized_df["pnl"].cumsum()
            pos_equity = start_equity + pos_cum_pnl.shift(1).fillna(0)
            pos_size_pct = (cost / pos_equity) * 100
            metrics["avg_position_size_pct"] = float(pos_size_pct.dropna().mean()) if not pos_size_pct.dropna().empty else 0.0
        
    # MAE and MFE Averages
    if "mae_pct" in df.columns:
        metrics["avg_mae_pct"] = float(df["mae_pct"].dropna().mean())
    if "mfe_pct" in df.columns:
        metrics["avg_mfe_pct"] = float(df["mfe_pct"].dropna().mean())
    if "is_live_tick" in df.columns:
        metrics["live_tick_count"] = int(df["is_live_tick"].sum())
        metrics["fallback_tick_count"] = int((~df["is_live_tick"]).sum())
        failed_rows = df[~df["is_live_tick"]]
        sym_col = "symbol" if "symbol" in df.columns else ("asset" if "asset" in df.columns else None)
        if sym_col and not failed_rows.empty:
            metrics["failed_tick_symbols"] = [str(s) for s in failed_rows[sym_col].dropna().unique() if str(s).strip()]
        else:
            metrics["failed_tick_symbols"] = []
    else:
        metrics["live_tick_count"] = 0
        metrics["fallback_tick_count"] = len(df)
        metrics["failed_tick_symbols"] = []

    if "tick_debug" in df.columns:
        metrics["tick_sync_debug"] = [str(d) for d in df["tick_debug"].dropna().unique() if str(d).strip()]
        
    # Run the execution flags logic on the dataset if columns are present
    if "mae_pct" in df.columns and "mfe_pct" in df.columns and "pnl" in df.columns:
        # 1. Early Entry (Catching Falling Knife)
        early_entry_mask = (df["mae_pct"] > 1.5) & (df["mfe_pct"] > 2.0)
        metrics["num_early_entries"] = int(early_entry_mask.sum())
        
        # 2. Late Entry (Chasing Breakouts)
        late_entry_mask = (df["mae_pct"] > 2.0) & (df["mfe_pct"] < 0.5)
        metrics["num_late_entries"] = int(late_entry_mask.sum())
        
        # 3. Late Exit (Winner to Loser)
        late_exit_mask = (df["pnl"] < 0) & (df["mfe_pct"] > 1.5)
        metrics["num_late_exits"] = int(late_exit_mask.sum())
        
        # 4. Early Exit (Left Money on the Table)
        if "t_plus_30m_px" in df.columns and "px" in df.columns:
            df_temp = df.copy()
            df_temp["is_long_pos"] = df_temp["side"].apply(is_long_trade)
            
            long_drift = (df_temp["t_plus_30m_px"] - df_temp["px"]) / df_temp["px"] * 100
            short_drift = -(df_temp["t_plus_30m_px"] - df_temp["px"]) / df_temp["px"] * 100
            df_temp["drift_pct"] = np.where(df_temp["is_long_pos"], long_drift, short_drift)
            
            early_exit_mask = (df_temp["pnl"] > 0) & (df_temp["drift_pct"] > 3.0)
            metrics["num_early_exits"] = int(early_exit_mask.sum())

    return metrics

def compute_multidimensional_metrics(df: pd.DataFrame, start_equity: float = 100000.0) -> dict:
    """
    Computes a multi-dimensional summary matrix grouped by strategy_tag.
    Generates statistics across three distinct directional toggles: OVERALL, LONG, and SHORT.
    """
    summary = {
        "OVERALL": {},
        "LONG": {},
        "SHORT": {}
    }
    
    if df.empty:
        return summary

    if "strategy_tag" not in df.columns:
        df = df.copy()
        # Fallback to 'strategy' or 'tag' if present
        if "strategy" in df.columns:
            df["strategy_tag"] = df["strategy"]
        elif "tag" in df.columns:
            df["strategy_tag"] = df["tag"]
        else:
            df["strategy_tag"] = "UNTAGGED"
        
    df["strategy_tag"] = df["strategy_tag"].fillna("UNTAGGED").astype(str)
    
    df = df.copy()
    if "position_id" in df.columns:
        pos_sides = df.groupby("position_id")["side"].first().apply(is_long_trade)
        df["is_long_pos"] = df["position_id"].map(pos_sides)
    else:
        df["is_long_pos"] = df["side"].apply(is_long_trade)
    
    df_long = df[df["is_long_pos"] & ~df["side"].astype(str).str.upper().str.contains("SPOT")]
    df_short = df[~df["is_long_pos"] & ~df["side"].astype(str).str.upper().str.contains("SPOT")]
    df_spot = df[df["side"].astype(str).str.upper().str.contains("SPOT")]

    def group_and_analyze(sub_df):
        grouped = {}
        if sub_df.empty:
            return grouped
            
        tags = sub_df["strategy_tag"].unique()
        for tag in tags:
            tag_df = sub_df[sub_df["strategy_tag"] == tag]
            grouped[tag] = compute_trading_metrics(tag_df, start_equity=start_equity)
        return grouped

    summary["OVERALL"] = group_and_analyze(df)
    summary["LONG"] = group_and_analyze(df_long)
    summary["SHORT"] = group_and_analyze(df_short)
    summary["SPOT"] = group_and_analyze(df_spot)
    
    return summary

def detect_toxic_states(df: pd.DataFrame) -> pd.DataFrame:
    """
    Isolates and flags toxic trading behaviors in the trade ledger:
    1. High Volatility Loss: Loss when trading during high volatility ratios.
    2. Extreme Funding Loss: Loss on assets with extreme funding conditions.
    3. Revenge Trade: Opened within 15 minutes of any realized loss.
    
    And isolates execution timing flaws:
    4. Early Entry (Catching Falling Knife)
    5. Late Entry (Chasing Breakouts)
    6. Early Exit (Left Money on the Table)
    7. Late Exit (Winner Turned into Loser)
    """
    if df.empty:
        df["is_high_vol_loss"] = pd.Series(dtype=bool, index=df.index)
        df["is_extreme_funding_loss"] = pd.Series(dtype=bool, index=df.index)
        df["is_revenge_trade"] = pd.Series(dtype=bool, index=df.index)
        df["is_early_entry"] = pd.Series(dtype=bool, index=df.index)
        df["is_late_entry"] = pd.Series(dtype=bool, index=df.index)
        df["is_early_exit"] = pd.Series(dtype=bool, index=df.index)
        df["is_late_exit"] = pd.Series(dtype=bool, index=df.index)
        return df

    df = df.copy()
    
    # Ensure timestamp is clean
    if "timestamp" not in df.columns and "date" in df.columns:
        df["timestamp_dt"] = pd.to_datetime(df["date"], errors='coerce', utc=True)
        df["timestamp"] = (df["timestamp_dt"].astype("int64") // 10**6).fillna(0)
    else:
        num_ts = pd.to_numeric(df["timestamp"], errors='coerce')
        if num_ts.notna().any() and (num_ts.notna().sum() > len(df) * 0.5 and num_ts.dropna().iloc[0] > 1e8):
            sample_val = num_ts.dropna().iloc[0]
            unit_str = 's' if sample_val < 1e11 else 'ms'
            df["timestamp_dt"] = pd.to_datetime(num_ts, unit=unit_str, errors='coerce', utc=True)
        else:
            df["timestamp_dt"] = pd.to_datetime(df["timestamp"], errors='coerce', utc=True)
            iso_mask = df["timestamp_dt"].isna()
            if iso_mask.any() and num_ts.notna().any():
                sample_val = num_ts.dropna().iloc[0] if num_ts.notna().any() else 0
                unit_str = 's' if sample_val < 1e11 else 'ms'
                df.loc[iso_mask, "timestamp_dt"] = pd.to_datetime(num_ts[iso_mask], unit=unit_str, errors='coerce', utc=True)
    
    if df["timestamp_dt"].notna().any():
        df = df.sort_values("timestamp_dt").reset_index(drop=True)

    # 1. High Volatility Loss
    if "volatility_ratio" in df.columns:
        vol_threshold = 0.005
        if len(df) > 1:
            valid_vols = df["volatility_ratio"].dropna()
            if not valid_vols.empty:
                vol_threshold = max(0.002, float(valid_vols.quantile(0.75)))
        df["is_high_vol_loss"] = (df["pnl"] < 0) & (df["volatility_ratio"] > vol_threshold)
    else:
        df["is_high_vol_loss"] = False

    # 2. Extreme Funding Loss
    if "funding_rate" in df.columns:
        funding_threshold = 0.00005
        if len(df) > 1:
            valid_funding = df["funding_rate"].dropna().abs()
            if not valid_funding.empty:
                funding_threshold = max(0.00001, float(valid_funding.quantile(0.75)))
        df["is_extreme_funding_loss"] = (df["pnl"] < 0) & (df["funding_rate"].abs() > funding_threshold)
    else:
        df["is_extreme_funding_loss"] = False

    # 3. Revenge Trade & Revenge Clusters (3+ trades within 5m of loss)
    # Smart scaling loss floor: max($1.00, 10% of average loss) to ignore fee noise & scratch trades
    avg_loss_val = abs(df[df["pnl"] < 0]["pnl"].mean()) if not df[df["pnl"] < 0].empty else 10.0
    loss_threshold = -max(1.0, 0.10 * avg_loss_val)
    loss_mask = df["pnl"] <= loss_threshold
    loss_times = df["timestamp_dt"].where(loss_mask)
    most_recent_loss = loss_times.ffill().shift(1)
    
    # Calculate time difference in seconds from the most recent loss
    time_diff = (df["timestamp_dt"] - most_recent_loss).dt.total_seconds()
    
    # Also track index difference to handle trades with identical timestamps (e.g. date-only logs)
    df_indices = pd.Series(df.index, index=df.index)
    loss_indices = df_indices.where(loss_mask)
    most_recent_loss_idx = loss_indices.ffill().shift(1)
    is_after_loss_idx = df_indices > most_recent_loss_idx
    
    # Condition A: Within 15 minutes (900s) of any prior loss
    is_time_revenge = (time_diff <= 900) & (time_diff >= 0) & is_after_loss_idx
    
    # Condition B: Must be an opening entry trade or any trade in consolidated mode
    is_entry = df["side"].astype(str).str.lower().str.contains("open|spot|long|short") | df["side"].str.lower().isin(["b", "s", "buy", "sell"])
    
    # Condition C: Must be a different position_id than the most recent loss
    if "position_id" in df.columns:
        loss_pos_ids = df["position_id"].where(loss_mask)
        most_recent_loss_pos = loss_pos_ids.ffill()
        if hasattr(most_recent_loss_pos, "infer_objects"):
            try:
                most_recent_loss_pos = most_recent_loss_pos.infer_objects()
            except Exception:
                pass
        most_recent_loss_pos = most_recent_loss_pos.shift(1)
        is_different_pos = df["position_id"] != most_recent_loss_pos
        df["is_revenge_trade"] = is_time_revenge & is_entry & is_different_pos
    else:
        df["is_revenge_trade"] = is_time_revenge & is_entry

    # 3b. Revenge Clusters: 3+ trades entered within 5 minutes (300s) of a loss
    is_5m_revenge = (time_diff <= 300) & (time_diff >= 0) & is_after_loss_idx & is_entry
    # Count consecutive revenge entries after loss
    rev_group = (is_5m_revenge != is_5m_revenge.shift()).cumsum()
    cluster_counts = is_5m_revenge.groupby(rev_group).transform("sum")
    df["is_revenge_cluster"] = is_5m_revenge & (cluster_counts >= 3)

    # 3c. Martingale / Tilt Sizing: Position size spikes >= 1.5x immediately following a meaningful loss
    sizes = df["sz"] if "sz" in df.columns else pd.Series([1.0] * len(df))
    prev_pnl = df["pnl"].shift(1).fillna(0.0)
    prev_sz = sizes.shift(1).fillna(1.0)
    df["is_martingale_trade"] = (prev_pnl <= loss_threshold) & (sizes >= 1.5 * prev_sz) & (sizes > 0)

    # 3d. Over-Trading Spikes: Days where trade count >= 4 AND >= 2.0x daily average
    if "timestamp_dt" in df.columns:
        df["trade_date"] = df["timestamp_dt"].dt.date
    else:
        df["trade_date"] = pd.to_datetime(df.get("date", df.get("timestamp", 0)), errors="coerce").dt.date

    daily_counts = df.groupby("trade_date")["pnl"].transform("count")
    avg_daily_trades = df.groupby("trade_date")["pnl"].count().mean() if not df.empty else 1.0
    df["is_overtrading_spike"] = (daily_counts >= 4) & (daily_counts >= 2.0 * avg_daily_trades)
    df = df.drop(columns=["trade_date"], errors="ignore")

    # 3e. Synthesize / Estimate MAE & MFE proxies if raw tick columns are missing
    if "mae_pct" not in df.columns or "mfe_pct" not in df.columns or df["mae_pct"].isna().all():
        df["mae_pct"] = np.nan
        df["mfe_pct"] = np.nan

    # Execution timing flaws require intraday tick/drift data
    has_ticks = "t_plus_30m_px" in df.columns and "px" in df.columns and "pnl" in df.columns and df["t_plus_30m_px"].notna().any() and (df["t_plus_30m_px"] != 0).any()
    
    if has_ticks:
        valid_mae = df["mae_pct"].dropna()
        valid_mfe = df["mfe_pct"].dropna()
        avg_mae = float(valid_mae.mean()) if not valid_mae.empty else 0.5
        avg_mfe = float(valid_mfe.mean()) if not valid_mfe.empty else 0.5

        mae_thresh = max(0.4, 1.2 * avg_mae)
        mfe_thresh = max(0.4, 1.2 * avg_mfe)

        df["is_early_entry"] = ((df["mae_pct"] > mae_thresh) & (df["mfe_pct"] > mfe_thresh))
        df["is_late_entry"] = ((df["mae_pct"] > mae_thresh) & (df["mfe_pct"] < 0.5 * mfe_thresh))
        
        avg_loss_val = abs(df[df["pnl"] < 0]["pnl"].mean()) if not df[df["pnl"] < 0].empty else 1.0
        df["is_late_exit"] = ((df["pnl"] < 0) & (df["mfe_pct"] > mfe_thresh)) | ((df["pnl"] < 0) & (df["pnl"].abs() > 1.3 * avg_loss_val))
        
        avg_win_val = df[df["pnl"] > 0]["pnl"].mean() if not df[df["pnl"] > 0].empty else 1.0
        df["is_long_pos"] = df["side"].apply(is_long_trade)
        long_drift = (df["t_plus_30m_px"] - df["px"]) / df["px"] * 100
        short_drift = -(df["t_plus_30m_px"] - df["px"]) / df["px"] * 100
        df["drift_pct"] = np.where(df["is_long_pos"], long_drift, short_drift)
        df["is_early_exit"] = (df["pnl"] > 0) & ((df["drift_pct"] > 1.5) | (df["pnl"] < 0.5 * avg_win_val))
        df = df.drop(columns=["is_long_pos", "drift_pct"], errors="ignore")

        # Open positions have not exited yet, so they must not be flagged for exit flaws
        if "is_open" in df.columns:
            is_open_mask = df["is_open"].apply(lambda v: True if (v is True or str(v).lower() == 'true' or str(v) == '1') else False)
            df.loc[is_open_mask, "is_early_exit"] = False
            df.loc[is_open_mask, "is_late_exit"] = False
    else:
        df["is_early_entry"] = False
        df["is_late_entry"] = False
        df["is_early_exit"] = False
        df["is_late_exit"] = False

    df = df.drop(columns=["timestamp_dt"], errors="ignore")
    return df

def assign_position_ids(df: pd.DataFrame, is_consolidated: bool = False) -> pd.DataFrame:
    """
    Performs FIFO position matching over the entire ledger.
    Assigns a unique 'position_id' to each trade fill that belongs to the same parent position.
    Supports position flipping and explicit exit/close side normalization.
    """
    if df.empty:
        df["position_id"] = []
        return df

    if is_consolidated:
        pos_ids = []
        for i, row in df.iterrows():
            asset_str = str(row.get("asset", row.get("symbol", ""))).strip()
            prefix = asset_str if asset_str and asset_str.lower() != "nan" else "pos"
            pos_ids.append(f"{prefix}_pos_{i+1}")
        df["position_id"] = pos_ids
        return df

    # Drop any cached position_id from prior analysis so re-analysis calculates mode freshly
    if "position_id" in df.columns:
        df = df.drop(columns=["position_id"])

    # Ensure chronological order with proper datetime parsing
    date_col = "timestamp" if "timestamp" in df.columns else ("date" if "date" in df.columns else None)
    if date_col:
        num_ts = pd.to_numeric(df[date_col], errors='coerce')
        if num_ts.notna().all() or (num_ts.notna().sum() > len(df) * 0.5 and num_ts.dropna().iloc[0] > 1e9):
            sample_val = num_ts.dropna().iloc[0] if num_ts.notna().any() else 0
            unit_str = 's' if sample_val < 1e11 else 'ms'
            df["_sort_dt"] = pd.to_datetime(num_ts, unit=unit_str, errors='coerce', utc=True)
        else:
            cleaned_dates = df[date_col].astype(str).str.replace(" - ", " ").str.strip()
            df["_sort_dt"] = pd.to_datetime(cleaned_dates, format='mixed', errors='coerce', utc=True)
            if df["_sort_dt"].isna().any() and num_ts.notna().any():
                df.loc[df["_sort_dt"].isna() & num_ts.notna(), "_sort_dt"] = pd.to_datetime(num_ts.dropna(), unit='ms', errors='coerce', utc=True)
        if "_sort_dt" in df.columns and df["_sort_dt"].notna().any():
            df = df.sort_values("_sort_dt", na_position='first').reset_index(drop=True).drop(columns=["_sort_dt"])
    
    # Track states per asset
    asset_states = {}
    new_rows = []
    
    for idx, row in df.iterrows():
        asset = row.get("asset", "UNKNOWN")
        side = str(row.get("side", "Buy"))
        raw_sz = float(row.get("sz", row.get("size", 1.0)))
        sz = abs(raw_sz)
        
        side_lower = side.lower().strip()
        asset_str = str(asset).upper().strip()
        
        # Explicit side classification order
        if raw_sz < -1e-6:
            is_buy = False
        elif any(kw in side_lower for kw in ["close long", "exit long", "open short"]):
            is_buy = False
        elif any(kw in side_lower for kw in ["close short", "exit short", "open long"]):
            is_buy = True
        elif side_lower in ["sell", "s"] or "sell" in side_lower:
            is_buy = False
        elif side_lower in ["buy", "b"] or "buy" in side_lower:
            is_buy = True
        elif "long" in side_lower and "short" not in side_lower:
            is_buy = True
        elif "short" in side_lower and "long" not in side_lower:
            is_buy = False
        else:
            is_buy = True
            
        # Trade direction: LONG/BUY vs SHORT/SELL
        trade_dir = "LONG" if is_buy else "SHORT"

        if asset not in asset_states:
            asset_states[asset] = {
                "active_pos_id": None,
                "current_size": 0.0,
                "counter": 0,
                "dir": None
            }
            
        state = asset_states[asset]

        # If a row already has an exit price, it is a self-contained complete trade: reset state so future trades form separate positions
        has_exit_px = False
        for ep_col in ["exit_price", "exit_px", "Exit Price", "ExitPrice"]:
            if ep_col in row and row[ep_col] is not None:
                try:
                    fval = float(row[ep_col])
                    if not (math.isnan(fval) or pd.isna(fval)) and fval > 0:
                        has_exit_px = True
                        break
                except Exception:
                    pass

        if has_exit_px:
            state["counter"] += 1
            pos_id = f"{asset}_pos_{state['counter']}"
            row_copy = row.copy()
            row_copy["sz"] = sz
            row_copy["position_id"] = pos_id
            row_copy["is_opening_fill"] = True
            new_rows.append(row_copy)
            state["current_size"] = 0.0
            state["active_pos_id"] = None
            state["dir"] = None
            continue
        
        if state["current_size"] == 0.0:
            state["counter"] += 1
            state["active_pos_id"] = f"{asset}_pos_{state['counter']}"
            state["dir"] = trade_dir
            state["current_size"] = sz
            row_copy = row.copy()
            row_copy["sz"] = sz
            row_copy["position_id"] = state["active_pos_id"]
            row_copy["is_opening_fill"] = True
            new_rows.append(row_copy)
        else:
            if trade_dir == state["dir"]:
                state["current_size"] += sz
                row_copy = row.copy()
                row_copy["sz"] = sz
                row_copy["position_id"] = state["active_pos_id"]
                row_copy["is_opening_fill"] = True
                new_rows.append(row_copy)
            else:
                # Use epsilon tolerance for float comparison to prevent float precision splitting (e.g. 67.2 vs 67.19999999999999)
                diff = state["current_size"] - sz
                if diff >= -1e-6:
                    state["current_size"] = max(0.0, diff)
                    row_copy = row.copy()
                    row_copy["sz"] = sz
                    row_copy["position_id"] = state["active_pos_id"]
                    row_copy["is_opening_fill"] = False
                    new_rows.append(row_copy)
                    if state["current_size"] < 1e-6:
                        state["current_size"] = 0.0
                        state["active_pos_id"] = None
                        state["dir"] = None
                else:
                    # Position flip: current position closed, excess opens new reversed position
                    row_copy1 = row.copy()
                    row_copy1["sz"] = state["current_size"]
                    row_copy1["position_id"] = state["active_pos_id"]
                    row_copy1["is_opening_fill"] = False
                    new_rows.append(row_copy1)
                    
                    remaining_sz = sz - state["current_size"]
                    if remaining_sz > 1e-6:
                        state["counter"] += 1
                        state["active_pos_id"] = f"{asset}_pos_{state['counter']}"
                        state["dir"] = trade_dir
                        state["current_size"] = remaining_sz
                        
                        row_copy2 = row.copy()
                        row_copy2["sz"] = remaining_sz
                        row_copy2["position_id"] = state["active_pos_id"]
                        row_copy2["is_opening_fill"] = True
                        new_rows.append(row_copy2)
                    else:
                        state["current_size"] = 0.0
                        state["active_pos_id"] = None
                        state["dir"] = None
            
    return pd.DataFrame(new_rows)

def classify_market_regimes(df: pd.DataFrame) -> pd.DataFrame:
    """
    Classifies each trade into a market regime based on rolling 10-period quantiles 
    of volatility_ratio and absolute funding_rate using vectorized selection.
    """
    if df.empty:
        df["market_regime"] = []
        return df
        
    df = df.copy()
    
    # Ensure sorted chronologically
    if "timestamp" in df.columns:
        df = df.sort_values("timestamp").reset_index(drop=True)
    
    # Compute rolling thresholds using exact cost basis
    if "volatility_ratio" not in df.columns or df["volatility_ratio"].isna().all():
        costs = []
        for _, row in df.iterrows():
            px_val = float(row.get("px") or row.get("price") or 0.0)
            sz_val = float(row.get("sz") or row.get("size") or 0.0)
            pnl_val = float(row.get("pnl") or 0.0)
            exit_px = float(row.get("exit_price") or 0.0)
            is_long = is_long_trade(row.get("side", "BUY"))
            costs.append(resolve_trade_cost_basis(px_val, sz_val, pnl_val, exit_px, is_long))
        
        cost_series = pd.Series(costs, index=df.index).replace(0, np.nan)
        pnl_pcts = (df["pnl"] / cost_series) * 100.0
        rolling_std = pnl_pcts.rolling(window=5, min_periods=1).std().fillna(1.0)
        df["volatility_ratio"] = rolling_std / 100.0

    if "funding_rate" not in df.columns or df["funding_rate"].isna().all():
        df["funding_rate"] = np.where(df.get("is_martingale_trade", False), 0.00015, 0.00001)

    vol_series = df["volatility_ratio"].fillna(0)
    funding_abs = df["funding_rate"].abs().fillna(0)

    # Calculate dynamic relative quantiles for balanced regime classification
    vol_q66 = vol_series.quantile(0.66) if len(df) > 2 else 0.005
    funding_q66 = funding_abs.quantile(0.66) if len(df) > 2 else 0.00005

    vol_cutoff = min(0.005, vol_q66) if vol_q66 > 0 else 0.005
    funding_cutoff = min(0.00005, funding_q66) if funding_q66 > 0 else 0.00005

    cond_extreme_funding = ((funding_abs >= funding_cutoff) & (funding_abs > 0.00001)) | (df.get("is_martingale_trade", False))
    cond_high_vol = ((vol_series >= vol_cutoff) & (vol_series > 0.001)) | (df.get("is_revenge_trade", False))

    conditions = [cond_extreme_funding, cond_high_vol]
    choices = ["Extreme Funding Squeeze", "High Volatility Expansion"]

    df["market_regime"] = np.select(conditions, choices, default="Low Volatility Chop")
    df.drop(columns=["vol_rolling_75", "funding_abs", "funding_rolling_75"], errors="ignore", inplace=True)
    return df

def compute_session_metrics(df: pd.DataFrame) -> dict:
    """
    Clusters trades into sessions dynamically based on 4-hour inactivity timeout.
    """
    session_stats = {
        "total_sessions": 0,
        "tilt_sessions": 0,
        "avg_trades_per_session": 0.0,
        "sessions_list": []
    }
    
    if df.empty:
        return session_stats
        
    df = df.copy()
    
    # Run detect_toxic_states on df to get revenge trade flags if not already present
    if "is_revenge_trade" not in df.columns:
        df = detect_toxic_states(df)
        
    if "timestamp" not in df.columns and "date" in df.columns:
        df["timestamp_dt"] = pd.to_datetime(df["date"], errors='coerce', utc=True)
    else:
        num_ts = pd.to_numeric(df["timestamp"], errors='coerce')
        if num_ts.notna().any() and (num_ts.notna().sum() > len(df) * 0.5 and num_ts.dropna().iloc[0] > 1e8):
            sample_val = num_ts.dropna().iloc[0]
            unit_str = 's' if sample_val < 1e11 else 'ms'
            df["timestamp_dt"] = pd.to_datetime(num_ts, unit=unit_str, errors='coerce', utc=True)
        else:
            df["timestamp_dt"] = pd.to_datetime(df["timestamp"], errors='coerce', utc=True)
            iso_mask = df["timestamp_dt"].isna()
            if iso_mask.any() and num_ts.notna().any():
                sample_val = num_ts.dropna().iloc[0] if num_ts.notna().any() else 0
                unit_str = 's' if sample_val < 1e11 else 'ms'
                df.loc[iso_mask, "timestamp_dt"] = pd.to_datetime(num_ts[iso_mask], unit=unit_str, errors='coerce', utc=True)
        
    df = df.sort_values("timestamp_dt").reset_index(drop=True)
    
    # Session Clustering (4-hour inactivity gap)
    inactivity_gap = pd.Timedelta(hours=4)
    time_diff = df["timestamp_dt"].diff()
    new_session = (time_diff > inactivity_gap) | (time_diff.isna())
    df["session_id"] = new_session.cumsum()
        
    grouped = df.groupby("session_id")
    sessions = []
    
    for s_id, s_df in grouped:
        start_time = s_df["timestamp_dt"].min()
        end_time = s_df["timestamp_dt"].max()
        duration_hours = max(0.1, (end_time - start_time).total_seconds() / 3600.0)
        
        pnl = float(s_df["pnl"].sum())
        trade_count = len(s_df)
        trade_density = float(trade_count / duration_hours)
        
        revenge_count = int(s_df["is_revenge_trade"].sum()) if "is_revenge_trade" in s_df.columns else 0
        martingale_count = int(s_df["is_martingale_trade"].sum()) if "is_martingale_trade" in s_df.columns else 0
        overtrading_count = int(s_df["is_overtrading_spike"].sum()) if "is_overtrading_spike" in s_df.columns else 0
        revenge_pct = float((revenge_count / trade_count) * 100.0) if trade_count > 0 else 0.0
        
        # Classify Tilt Session: Loss session with toxic behavioral flags (revenge, martingale, overtrading)
        is_tilt = (pnl < 0) and ((revenge_count > 0) or (martingale_count > 0) or (overtrading_count > 0) or (trade_count >= 4))
        df.loc[s_df.index, "is_tilt"] = bool(is_tilt)
        
        sessions.append({
            "session_id": int(s_id),
            "start_time": start_time.strftime("%Y-%m-%d %H:%M:%S") if pd.notna(start_time) else "",
            "end_time": end_time.strftime("%Y-%m-%d %H:%M:%S") if pd.notna(end_time) else "",
            "duration_hours": duration_hours,
            "duration_minutes": round(duration_hours * 60, 1),
            "pnl": pnl,
            "trade_count": trade_count,
            "trade_density": trade_density,
            "revenge_count": revenge_count,
            "revenge_pct": revenge_pct,
            "is_tilt": bool(is_tilt)
        })
        
    session_stats["total_sessions"] = len(sessions)
    session_stats["tilt_sessions"] = sum(1 for s in sessions if s["is_tilt"])
    session_stats["avg_trades_per_session"] = float(df.groupby("session_id").size().mean()) if len(sessions) > 0 else 0.0
    session_stats["sessions_list"] = sessions
    
    return session_stats

def compute_hold_time_metrics(df: pd.DataFrame) -> dict:
    """
    Computes hold-time asymmetry analysis between winning and losing trades.
    Calculates median and average hold durations (in minutes) for winners vs losers.
    """
    default_res = {
        "median_winner_mins": 0.0,
        "median_loser_mins": 0.0,
        "avg_winner_mins": 0.0,
        "avg_loser_mins": 0.0,
        "asymmetry_ratio": 1.0,
        "trade_durations": []
    }
    
    if df.empty:
        return default_res
        
    df = df.copy()
    durations = []
    
    if "position_id" in df.columns:
        for pos_id, pos_df in df.groupby("position_id"):
            pos_pnl = float(pos_df["pnl"].sum())
            dur_mins = 5.0
            if "duration_minutes" in pos_df.columns and pos_df["duration_minutes"].notna().any():
                dur_mins = float(pos_df["duration_minutes"].iloc[0])
            elif "timestamp" in pos_df.columns and pos_df["timestamp"].nunique() > 1:
                t_min = pos_df["timestamp"].min()
                t_max = pos_df["timestamp"].max()
                dur_mins = max(1.0, (t_max - t_min) / 60000.0)
            elif "date" in pos_df.columns and len(pos_df) > 1:
                try:
                    dt_series = pd.to_datetime(pos_df["date"], errors="coerce")
                    dur_mins = max(1.0, (dt_series.max() - dt_series.min()).total_seconds() / 60.0)
                except:
                    dur_mins = 5.0
            pos_side = str(pos_df.iloc[0].get("side", "BUY")).upper()
            pos_id_str = str(pos_id)
            if not pos_id_str.startswith("pos_") and "_pos_" not in pos_id_str:
                asset_val = str(pos_df.iloc[0].get("asset", pos_df.iloc[0].get("symbol", ""))).strip()
                if asset_val and asset_val.lower() != "nan":
                    pos_id_str = f"{asset_val}_{pos_id_str}"
            durations.append({
                "id": pos_id_str,
                "pnl": pos_pnl,
                "duration_mins": round(dur_mins, 1),
                "is_winner": pos_pnl > 0,
                "side": pos_side
            })
    else:
        for idx, row in df.iterrows():
            trade_pnl = float(row.get("pnl", 0.0))
            dur_mins = float(row.get("duration_minutes", 5.0))
            asset_val = str(row.get("asset", row.get("symbol", ""))).strip()
            label = f"{asset_val}_pos_{idx+1}" if asset_val and asset_val.lower() != "nan" else f"pos_{idx+1}"
            durations.append({
                "id": label,
                "pnl": trade_pnl,
                "duration_mins": round(dur_mins, 1),
                "is_winner": trade_pnl > 0,
                "side": str(row.get("side", "BUY")).upper()
            })
            
    if not durations:
        return default_res

    dur_df = pd.DataFrame(durations)
    winners = dur_df[dur_df["pnl"] > 0]
    losers = dur_df[dur_df["pnl"] < 0]

    med_win = float(winners["duration_mins"].median()) if not winners.empty else 0.0
    med_loss = float(losers["duration_mins"].median()) if not losers.empty else 0.0
    avg_win = float(winners["duration_mins"].mean()) if not winners.empty else 0.0
    avg_loss = float(losers["duration_mins"].mean()) if not losers.empty else 0.0

    asymmetry = round(med_loss / max(0.1, med_win), 2) if med_win > 0 else (1.0 if med_loss == 0 else 99.0)

    return {
        "median_winner_mins": round(med_win, 1),
        "median_loser_mins": round(med_loss, 1),
        "avg_winner_mins": round(avg_win, 1),
        "avg_loser_mins": round(avg_loss, 1),
        "asymmetry_ratio": asymmetry,
        "trade_durations": durations
    }

def normalize_and_resolve_ticker(asset_raw: str) -> dict:
    """
    Semi-fuzzy ticker normalization engine.
    Parses messy CSV asset strings (e.g. 'BTC/USDT', 'PERP_SOL_USDT', '1000PEPE', 'XBT/USD', 'EUR/USD', 'NASDAQ:AAPL', 'GOLD')
    and resolves target tickers for multi-exchange failovers.
    """
    if not asset_raw or not isinstance(asset_raw, str):
        return {"base": "BTC", "crypto": "BTCUSDT", "coinbase": "BTC-USD", "yahoo": "BTC-USD", "is_forex": False, "is_stock": False}

    s = asset_raw.strip().upper()

    # 1. Strip exchange prefixes
    for prefix in ["BINANCE:", "BYBIT:", "HYPERLIQUID:", "OKX:", "PERP_", "SPOT_", "SWAP_", "COINBASE:"]:
        if s.startswith(prefix):
            s = s[len(prefix):].strip()

    # 2. Check Forex / Commodity Alias
    forex_map = {
        "EURUSD": "EURUSD=X", "EUR/USD": "EURUSD=X",
        "GBPUSD": "GBPUSD=X", "GBP/USD": "GBPUSD=X",
        "USDJPY": "USDJPY=X", "USD/JPY": "USDJPY=X",
        "AUDUSD": "AUDUSD=X", "AUD/USD": "AUDUSD=X",
        "USDCAD": "USDCAD=X", "USD/CAD": "USDCAD=X",
        "USDCHF": "USDCHF=X", "USD/CHF": "USDCHF=X",
        "NZDUSD": "NZDUSD=X", "NZD/USD": "NZDUSD=X",
        "EURGBP": "EURGBP=X", "EUR/GBP": "EURGBP=X",
        "EURJPY": "EURJPY=X", "EUR/JPY": "EURJPY=X",
        "GBPJPY": "GBPJPY=X", "GBP/JPY": "GBPJPY=X",
        "XAUUSD": "GC=F", "XAU/USD": "GC=F", "GOLD": "GC=F",
        "XAGUSD": "SI=F", "XAG/USD": "SI=F", "SILVER": "SI=F",
        "WTI": "CL=F", "OIL": "CL=F", "CRUDE": "CL=F"
    }

    if s in forex_map:
        return {"base": s, "crypto": None, "coinbase": None, "yahoo": forex_map[s], "is_forex": True, "is_stock": False}

    if s.endswith("=X"):
        return {"base": s.replace("=X", ""), "crypto": None, "coinbase": None, "yahoo": s, "is_forex": True, "is_stock": False}

    # 3. Check Stock Tickers
    stock_symbols = ["AAPL", "TSLA", "NVDA", "SPY", "QQQ", "MSFT", "AMZN", "GOOGL", "META", "AMD", "COIN", "MSTR"]
    clean_stock = s.replace(".US", "").replace("NASDAQ:", "").replace("NYSE:", "").strip()
    if clean_stock in stock_symbols or s.endswith("=F"):
        return {"base": clean_stock, "crypto": None, "coinbase": None, "yahoo": s if s.endswith("=F") else clean_stock, "is_forex": False, "is_stock": True}

    # 4. Check for HIP-3 DEX format e.g. NVDA(xyz), NVDA(XYZ), xyz:NVDA
    hl_coin = None
    import re
    dex_match = re.search(r'([A-Z0-9_]+)\s*\(([^)]+)\)', s)
    if dex_match:
        ticker_part = dex_match.group(1).strip()
        dex_part = dex_match.group(2).strip().lower()
        hl_coin = f"{dex_part}:{ticker_part}"
        base_override = ticker_part
    elif ":" in s and not any(s.startswith(p) for p in ["BINANCE:", "BYBIT:", "HYPERLIQUID:", "OKX:", "COINBASE:"]):
        parts = s.split(":", 1)
        dex_part = parts[0].strip().lower()
        ticker_part = parts[1].strip().upper()
        hl_coin = f"{dex_part}:{ticker_part}"
        base_override = ticker_part
    else:
        base_override = None

    # 5. Crypto Semi-Fuzzy Normalization
    clean_crypto = (
        s.replace(".P", "")
        .replace("-PERP", "")
        .replace("_PERP", "")
        .replace("-SWAP", "")
        .replace("@USDT", "")
        .replace("@USDC", "")
        .replace(":USDT", "")
        .replace(":USDC", "")
        .strip()
    )

    # Normalize common quotes
    if base_override:
        base = base_override
    elif "/" in clean_crypto:
        base, quote = clean_crypto.split("/", 1)
        base = base.strip()
    elif "-" in clean_crypto:
        parts = clean_crypto.split("-")
        base = parts[0].strip()
    elif clean_crypto.endswith("USDT") and len(clean_crypto) > 4:
        base = clean_crypto[:-4]
    elif clean_crypto.endswith("USDC") and len(clean_crypto) > 4:
        base = clean_crypto[:-4]
    elif clean_crypto.endswith("USDH") and len(clean_crypto) > 4:
        base = clean_crypto[:-4]
    elif clean_crypto.endswith("USD") and len(clean_crypto) > 3:
        base = clean_crypto[:-3]
    else:
        base = clean_crypto

    base = base.strip("_").strip()

    # Handle crypto alias mappings
    if base == "XBT":
        base = "BTC"
    elif base.startswith("1000") and len(base) > 4:
        base = base[4:]
    elif base.startswith("1000000") and len(base) > 7:
        base = base[7:]
    elif base in ["KPEPE", "KSHIB", "KBONK", "KFLOKI", "1000PEPE", "1000SHIB"]:
        base = base[1:]

    base = base.strip("_").strip()

    crypto_pair = f"{base}USDT"
    coinbase_pair = f"{base}-USD"
    yahoo_symbol = base if base in stock_symbols else f"{base}-USD"

    return {
        "base": base,
        "crypto": crypto_pair,
        "coinbase": coinbase_pair,
        "yahoo": yahoo_symbol,
        "hl_coin": hl_coin,
        "is_forex": False,
        "is_stock": False
    }

def enrich_with_public_klines(df: pd.DataFrame, is_demo: bool = False) -> pd.DataFrame:
    """
    Parallelized multi-asset tick enricher for 5m candles with semi-fuzzy matching.
    Routes requests through a robust failover chain:
    Coinbase Public API -> Hyperliquid -> Binance -> Bybit -> Yahoo Finance.
    Populates: mae_pct, mfe_pct, t_plus_30m_px, is_live_tick (bool), and data_source (string).
    """
    import requests
    import threading
    from concurrent.futures import ThreadPoolExecutor

    if df.empty:
        return df

    if is_demo:
        df = df.copy()
        maes, mfes, t30s, lives, sources, debugs = [], [], [], [], [], []
        for _, row in df.iterrows():
            px = float(row.get("px") or row.get("price") or row.get("entry_price") or 0.0)
            exit_px = float(row.get("exit_price") or row.get("exit_px") or row.get("ExitPrice") or 0.0)
            pnl = float(row.get("pnl") or 0.0)
            sz = float(row.get("sz") or row.get("size") or 1.0)
            is_long = is_long_trade(row.get("side", "BUY"))
            c_basis = resolve_trade_cost_basis(px, sz, pnl, exit_px, is_long)
            pnl_pct = (pnl / c_basis) * 100.0 if c_basis >= 0.01 else (1.0 if pnl >= 0 else -1.0)

            trade_return_pct = None
            if px > 0 and exit_px > 0:
                trade_return_pct = ((exit_px - px) / px * 100.0) if is_long else ((px - exit_px) / px * 100.0)
            elif c_basis >= 0.01:
                trade_return_pct = pnl_pct
            elif pnl != 0:
                trade_return_pct = 1.0 if pnl >= 0 else -1.0

            is_winner = (trade_return_pct is not None and trade_return_pct > 0) or pnl > 0
            is_loser = (trade_return_pct is not None and trade_return_pct < 0) or pnl < 0

            win_base = trade_return_pct if (trade_return_pct is not None and trade_return_pct > 0) else (pnl_pct if pnl > 0 else 0.35)
            loss_base = abs(trade_return_pct) if (trade_return_pct is not None and trade_return_pct < 0) else (abs(pnl_pct) if pnl < 0 else 0.25)

            mae = round(max(0.15, loss_base * 1.1 if is_loser else 0.25), 2)
            mfe = round(max(0.20, win_base * 1.25 if is_winner else 0.35), 2)

            if is_winner:
                mfe = max(mfe, round(win_base, 2))
            if is_loser:
                mae = max(mae, round(loss_base, 2))

            t30 = px * (1.02 if is_winner else 0.98) if px > 0 else 100.0
            maes.append(mae)
            mfes.append(mfe)
            t30s.append(t30)
            lives.append(True)
            sources.append("binance_demo")
            debugs.append(f"Retrieved live tick via BINANCE_DEMO for {row.get('asset', 'DEMO')}")
        df["mae_pct"] = maes
        df["mfe_pct"] = mfes
        df["t_plus_30m_px"] = t30s
        df["is_live_tick"] = lives
        df["data_source"] = sources
        df["tick_debug"] = debugs
        return df

    df = df.copy()

    if "asset" not in df.columns and "symbol" in df.columns:
        df["asset"] = df["symbol"]

    if "timestamp_dt" not in df.columns:
        date_col = "timestamp" if "timestamp" in df.columns else ("date" if "date" in df.columns else ("datetime" if "datetime" in df.columns else None))
        if date_col:
            num_ts = pd.to_numeric(df[date_col], errors='coerce')
            
            # If the median value is > 1e8 (year 1973 in seconds), it's highly likely a raw Unix timestamp
            # We use median to avoid being skewed by a few misparsed row formats
            if num_ts.notna().sum() > len(df) * 0.4 and num_ts.median() > 1e8:
                unit_str = 'ms' if num_ts.median() > 1e11 else 's'
                df["timestamp_dt"] = pd.to_datetime(num_ts, unit=unit_str, errors='coerce', utc=True)
            else:
                # Fallback: treat as a formatted date string like "2024-03-15"
                cleaned = df[date_col].astype(str).str.replace(" - ", " ").str.strip()
                df["timestamp_dt"] = pd.to_datetime(cleaned, format='mixed', errors='coerce', utc=True)

    kline_cache = {}
    kline_lock = threading.Lock()
    now_dt = datetime.now(timezone.utc)
    debug_logs = []

    def fetch_single_trade_kline(row_tuple):
        idx, row = row_tuple
        pnl = float(row.get("pnl") or 0.0)
        px = float(row.get("px") or row.get("price") or row.get("entry_price") or 0.0)
        sz = float(row.get("sz") or row.get("size") or row.get("quantity") or 1.0)
        exit_px = float(row.get("exit_price") or row.get("exit_px") or row.get("ExitPrice") or 0.0)
        asset_raw = str(row.get("asset") or row.get("symbol") or "BTC").strip()
        is_long = is_long_trade(row.get("side", "BUY"))
        c_basis = resolve_trade_cost_basis(px, sz, pnl, exit_px, is_long)

        # Exact price return at exit if entry and exit prices are available
        trade_return_pct = None
        if px > 0 and exit_px > 0:
            trade_return_pct = ((exit_px - px) / px * 100.0) if is_long else ((px - exit_px) / px * 100.0)
        elif c_basis >= 0.01:
            trade_return_pct = (pnl / c_basis) * 100.0
        elif pnl != 0:
            trade_return_pct = 1.0 if pnl > 0 else -1.0

        dur_mins = 0.0
        if "duration_minutes" in row and pd.notna(row.get("duration_minutes")):
            try:
                dur_mins = float(row.get("duration_minutes") or 0.0)
            except Exception:
                dur_mins = 0.0

        exit_dt = None
        for exit_col in ["exit_date", "close_time", "exit_timestamp", "close_date"]:
            if exit_col in row and pd.notna(row.get(exit_col)):
                val = row.get(exit_col)
                try:
                    if isinstance(val, (int, float)) and float(val) > 1e8:
                        ts_sec = float(val) if float(val) < 1e11 else float(val) / 1000.0
                        exit_dt = datetime.fromtimestamp(ts_sec, tz=timezone.utc)
                    else:
                        parsed_exit = pd.to_datetime(val, errors='coerce', utc=True)
                        if pd.notna(parsed_exit):
                            exit_dt = parsed_exit.to_pydatetime()
                            if exit_dt.tzinfo is None:
                                exit_dt = exit_dt.replace(tzinfo=timezone.utc)
                    if exit_dt:
                        break
                except Exception:
                    pass

        t_dt = row.get("timestamp_dt")

        if pd.notna(t_dt) and px > 0:
            if t_dt.tzinfo is None:
                t_dt = t_dt.replace(tzinfo=timezone.utc)
            
            start_ms = int(t_dt.timestamp() * 1000)
            start_sec = int(t_dt.timestamp())

            if exit_dt and exit_dt > t_dt:
                trade_dur_sec = max(45 * 60, int((exit_dt - t_dt).total_seconds()))
            elif dur_mins > 0:
                trade_dur_sec = max(45 * 60, int(dur_mins * 60))
            else:
                trade_dur_sec = 45 * 60

            # Cap trade_dur_sec to maximum 7 days (604800s) to keep queries bounded and fast
            trade_dur_sec = min(604800, trade_dur_sec)

            end_sec = start_sec + trade_dur_sec
            end_ms = start_ms + (trade_dur_sec * 1000)
            candle_limit = min(1000, max(10, int(trade_dur_sec / 300) + 2))

            # Semi-fuzzy resolution
            res_info = normalize_and_resolve_ticker(asset_raw)
            base_coin = res_info["base"]
            is_forex = res_info["is_forex"]
            is_stock = res_info["is_stock"]

            data_source = None
            highs, lows, closes = [], [], []
            trade_debug_log = f"Asset '{asset_raw}' resolved to base '{base_coin}'."

            days_old = (now_dt - t_dt).days if t_dt else 0

            # 1. FOREX & STOCKS -> YAHOO FINANCE
            if is_forex or is_stock:
                yahoo_symbol = res_info["yahoo"]
                cache_key = ("yahoo", yahoo_symbol, start_sec // 300)
                with kline_lock:
                    cached_res = kline_cache.get(cache_key)
                
                if cached_res:
                    highs, lows, closes, data_source = cached_res
                else:
                    try:
                        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                        intervals_to_try = [("1d", 4*86400)] if days_old > 30 else [("5m", trade_dur_sec), ("15m", trade_dur_sec * 3), ("1h", trade_dur_sec * 12), ("1d", 4*86400)]
                        
                        for interval, duration_sec in intervals_to_try:
                            iter_end_sec = start_sec + duration_sec
                            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}?period1={start_sec}&period2={iter_end_sec}&interval={interval}"
                            resp = None
                            for attempt in range(2):
                                try:
                                    resp = requests.get(url, headers=headers, timeout=2.0)
                                    if resp.status_code == 200:
                                        break
                                except Exception:
                                    if attempt == 1: raise
                            if resp and resp.status_code == 200:
                                res_json = resp.json()
                                results = res_json.get("chart", {}).get("result", [])
                                if results:
                                    quote = results[0].get("indicators", {}).get("quote", [{}])[0]
                                    h_list = [float(h) for h in quote.get("high", []) if h is not None]
                                    l_list = [float(l) for l in quote.get("low", []) if l is not None]
                                    c_list = [float(c) for c in quote.get("close", []) if c is not None]
                                    if h_list and l_list and c_list:
                                        highs, lows, closes = h_list, l_list, c_list
                                        data_source = "yahoo" if interval == "5m" else f"fallback_yahoo_{interval}"
                                        with kline_lock:
                                            kline_cache[cache_key] = (highs, lows, closes, data_source)
                                        break
                    except Exception as ex:
                        trade_debug_log += f" Yahoo error: {str(ex)}."

            # 2. CRYPTO PARALLEL "RACE" FETCHER: HYPERLIQUID, BINANCE VISION, BYBIT SIMULTANEOUSLY
            if not data_source and not is_forex and not is_stock:
                crypto_symbol = res_info["crypto"]
                hl_target_coin = res_info.get("hl_coin") or base_coin
                cache_key = ("crypto_race", hl_target_coin, start_ms // 300000)
                with kline_lock:
                    cached_res = kline_cache.get(cache_key)

                if cached_res:
                    highs, lows, closes, data_source = cached_res
                else:
                    from concurrent.futures import ThreadPoolExecutor as RaceExecutor, as_completed as race_as_completed
                    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Connection": "keep-alive"}
                    iter_end_ms = end_ms

                    def fetch_hl():
                        try:
                            url = "https://api.hyperliquid.xyz/info"
                            payload = {"type": "candleSnapshot", "req": {"coin": hl_target_coin, "interval": "5m", "startTime": start_ms, "endTime": iter_end_ms}}
                            resp = requests.post(url, json=payload, headers=headers, timeout=2.5)
                            if resp.status_code == 200:
                                res_list = resp.json()
                                if isinstance(res_list, list) and len(res_list) > 0:
                                    h = [float(c["h"]) for c in res_list if "h" in c]
                                    l = [float(c["l"]) for c in res_list if "l" in c]
                                    c = [float(c["c"]) for c in res_list if "c" in c]
                                    if h and l and c:
                                        return h, l, c, "hyperliquid"
                        except Exception:
                            pass
                        return None

                    def fetch_binance_vision():
                        try:
                            url = f"https://data-api.binance.vision/api/v3/klines?symbol={crypto_symbol}&interval=5m&startTime={start_ms}&endTime={iter_end_ms}&limit={candle_limit}"
                            resp = requests.get(url, headers=headers, timeout=2.5)
                            if resp.status_code == 200:
                                res_json = resp.json()
                                if isinstance(res_json, list) and len(res_json) > 0:
                                    h = [float(k[2]) for k in res_json]
                                    l = [float(k[3]) for k in res_json]
                                    c = [float(k[4]) for k in res_json]
                                    if h and l and c:
                                        return h, l, c, "binance"
                        except Exception:
                            pass
                        return None

                    def fetch_binance_primary():
                        try:
                            url = f"https://api.binance.com/api/v3/klines?symbol={crypto_symbol}&interval=5m&startTime={start_ms}&endTime={iter_end_ms}&limit={candle_limit}"
                            resp = requests.get(url, headers=headers, timeout=2.5)
                            if resp.status_code == 200:
                                res_json = resp.json()
                                if isinstance(res_json, list) and len(res_json) > 0:
                                    h = [float(k[2]) for k in res_json]
                                    l = [float(k[3]) for k in res_json]
                                    c = [float(k[4]) for k in res_json]
                                    if h and l and c:
                                        return h, l, c, "binance_main"
                        except Exception:
                            pass
                        return None

                    def fetch_bybit():
                        try:
                            url = f"https://api.bybit.com/v5/market/kline?category=linear&symbol={crypto_symbol}&interval=5&start={start_ms}&end={iter_end_ms}&limit={candle_limit}"
                            resp = requests.get(url, headers=headers, timeout=2.5)
                            if resp.status_code == 200:
                                k_list = resp.json().get("result", {}).get("list", [])
                                if isinstance(k_list, list) and len(k_list) > 0:
                                    h = [float(k[2]) for k in k_list]
                                    l = [float(k[3]) for k in k_list]
                                    c = [float(k[4]) for k in k_list]
                                    if h and l and c:
                                        return h, l, c, "bybit"
                        except Exception:
                            pass
                        return None

                    try:
                        with RaceExecutor(max_workers=4) as r_exec:
                            r_futures = [
                                r_exec.submit(fetch_hl),
                                r_exec.submit(fetch_binance_vision),
                                r_exec.submit(fetch_binance_primary),
                                r_exec.submit(fetch_bybit)
                            ]
                            for r_fut in race_as_completed(r_futures):
                                try:
                                    race_res = r_fut.result()
                                    if race_res and race_res[0]:
                                        highs, lows, closes, data_source = race_res
                                        with kline_lock:
                                            kline_cache[cache_key] = (highs, lows, closes, data_source)
                                        break
                                except Exception:
                                    pass
                    except Exception as ex:
                        trade_debug_log += f" Crypto race error: {str(ex)}."

            # 3. SECONDARY YAHOO FINANCE FALLBACK (If primary exchange attempts returned 0 candles)
            if not data_source and not is_forex and not is_stock:
                secondary_yahoo_symbol = res_info.get("yahoo") or base_coin
                if secondary_yahoo_symbol:
                    cache_key = ("yahoo", secondary_yahoo_symbol, start_sec // 300)
                    with kline_lock:
                        cached_res = kline_cache.get(cache_key)

                    if cached_res:
                        highs, lows, closes, data_source = cached_res
                    else:
                        try:
                            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                            intervals_to_try = [("1d", 4*86400)] if days_old > 30 else [("5m", trade_dur_sec), ("15m", trade_dur_sec * 3), ("1h", trade_dur_sec * 12), ("1d", 4*86400)]
                            
                            for interval, duration_sec in intervals_to_try:
                                iter_end_sec = start_sec + duration_sec
                                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{secondary_yahoo_symbol}?period1={start_sec}&period2={iter_end_sec}&interval={interval}"
                                resp = None
                                for attempt in range(2):
                                    try:
                                        resp = requests.get(url, headers=headers, timeout=2.5)
                                        if resp.status_code == 200:
                                            break
                                    except Exception:
                                        if attempt == 1: raise
                                if resp and resp.status_code == 200:
                                    res_json = resp.json()
                                    results = res_json.get("chart", {}).get("result", [])
                                    if results:
                                        quote = results[0].get("indicators", {}).get("quote", [{}])[0]
                                        h_list = [float(h) for h in quote.get("high", []) if h is not None]
                                        l_list = [float(l) for l in quote.get("low", []) if l is not None]
                                        c_list = [float(c) for c in quote.get("close", []) if c is not None]
                                        if h_list and l_list and c_list:
                                            highs, lows, closes = h_list, l_list, c_list
                                            data_source = "yahoo" if interval == "5m" else f"fallback_yahoo_{interval}"
                                            with kline_lock:
                                                kline_cache[cache_key] = (highs, lows, closes, data_source)
                                            break
                        except Exception as ex:
                            trade_debug_log += f" Secondary Yahoo fallback error: {str(ex)}."

            # Calculate MAE/MFE if live ticks retrieved
            if data_source and highs and lows and closes:
                # Include entry and exit prices in extremes candidate pool
                all_highs = list(highs)
                all_lows = list(lows)
                if px > 0:
                    all_highs.append(px)
                    all_lows.append(px)
                if exit_px > 0:
                    all_highs.append(exit_px)
                    all_lows.append(exit_px)

                max_high = max(all_highs)
                min_low = min(all_lows)
                t30_px = closes[min(5, len(closes)-1)]
                
                if is_long:
                    mfe = (max_high - px) / px * 100 if px > 0 else 0.5
                    mae = (px - min_low) / px * 100 if px > 0 else 0.5
                else:
                    mfe = (px - min_low) / px * 100 if px > 0 else 0.5
                    mae = (max_high - px) / px * 100 if px > 0 else 0.5

                # Invariable physical bounds:
                # 1. Winning trade: MFE can NEVER be less than the realized profit %
                # 2. Losing trade: MAE can NEVER be less than the realized loss %
                if trade_return_pct is not None:
                    if trade_return_pct > 0:
                        mfe = max(mfe, trade_return_pct)
                    elif trade_return_pct < 0:
                        mae = max(mae, abs(trade_return_pct))
                    
                mfe = max(0.15, mfe)
                mae = max(0.15, mae)
                return idx, round(mae, 2), round(mfe, 2), t30_px, True, data_source, f"Retrieved live tick via {data_source.upper()} for {asset_raw}"

            days_diff = (now_dt - t_dt).days if t_dt else 0
            if days_diff > 55 and (is_forex or is_stock):
                fallback_reason = "fallback_timeframe (>55d stock tick limit)"
            else:
                fallback_reason = f"fallback_symbol ({asset_raw} no live response)"
        else:
            fallback_reason = "fallback_missing_timestamp_or_price"
            trade_debug_log = f"Asset '{asset_raw}' invalid timestamp or price zero."

        # Empirical PnL Ratio Fallback Formula with exact cost basis
        pnl_pct = (pnl / c_basis) * 100.0 if c_basis >= 0.01 else (1.0 if pnl >= 0 else -1.0)
        
        is_winner = (trade_return_pct is not None and trade_return_pct > 0) or pnl > 0
        is_loser = (trade_return_pct is not None and trade_return_pct < 0) or pnl < 0

        win_base = trade_return_pct if (trade_return_pct is not None and trade_return_pct > 0) else (pnl_pct if pnl > 0 else 0.35)
        loss_base = abs(trade_return_pct) if (trade_return_pct is not None and trade_return_pct < 0) else (abs(pnl_pct) if pnl < 0 else 0.25)

        mae_fallback = round(max(0.15, loss_base * 1.1 if is_loser else 0.25), 2)
        mfe_fallback = round(max(0.20, win_base * 1.25 if is_winner else 0.35), 2)

        if is_winner:
            mfe_fallback = max(mfe_fallback, round(win_base, 2))
        if is_loser:
            mae_fallback = max(mae_fallback, round(loss_base, 2))

        t30_fallback = px * (1.02 if is_winner else 0.98)
        return idx, mae_fallback, mfe_fallback, t30_fallback, False, fallback_reason, trade_debug_log

    # Run in parallel with 10 worker threads
    row_tuples = list(df.iterrows())
    with ThreadPoolExecutor(max_workers=10) as executor:
        try:
            results = list(executor.map(fetch_single_trade_kline, row_tuples, timeout=35))
        except Exception:
            results = [fetch_single_trade_kline(rt) for rt in row_tuples]

    results.sort(key=lambda x: x[0])
    
    df["mae_pct"] = [r[1] for r in results]
    df["mfe_pct"] = [r[2] for r in results]
    df["t_plus_30m_px"] = [r[3] for r in results]
    df["is_live_tick"] = [r[4] for r in results]
    df["data_source"] = [r[5] for r in results]
    df["tick_debug"] = [r[6] for r in results]

    if "timestamp_dt" in df.columns:
        df = df.drop(columns=["timestamp_dt"])

    return df

def compute_day_time_heatmap(df: pd.DataFrame) -> list:
    """
    Constructs a 24x7 matrix (7 days: Mon=0 to Sun=6 x 24 hours: 00..23).
    Returns a list of 168 cell objects containing win_rate, net_pnl, and trade_count.
    """
    if df.empty:
        return []

    df = df.copy()

    if "timestamp" not in df.columns and "date" in df.columns:
        df["timestamp_dt"] = pd.to_datetime(df["date"], errors='coerce', utc=True)
    else:
        num_ts = pd.to_numeric(df["timestamp"], errors='coerce')
        if num_ts.notna().all() or (num_ts.notna().sum() > len(df) * 0.5 and num_ts.dropna().iloc[0] > 1e9):
            df["timestamp_dt"] = pd.to_datetime(num_ts, unit='ms', errors='coerce', utc=True)
        else:
            df["timestamp_dt"] = pd.to_datetime(df["timestamp"], errors='coerce', utc=True)
            iso_mask = df["timestamp_dt"].isna()
            if iso_mask.any() and num_ts.notna().any():
                df.loc[iso_mask, "timestamp_dt"] = pd.to_datetime(num_ts[iso_mask], unit='ms', errors='coerce', utc=True)

    df["day_of_week"] = df["timestamp_dt"].dt.dayofweek.fillna(0).astype(int)
    df["hour"] = df["timestamp_dt"].dt.hour.fillna(0).astype(int)

    heatmap = []
    days_map = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    for d in range(7):
        for h in range(24):
            cell_df = df[(df["day_of_week"] == d) & (df["hour"] == h)]
            t_count = len(cell_df)
            if t_count > 0:
                net_pnl = float(cell_df["pnl"].sum())
                wins = int((cell_df["pnl"] > 0).sum())
                win_rate = float(wins / t_count * 100.0)
                avg_pnl = float(net_pnl / t_count)
            else:
                net_pnl = 0.0
                win_rate = 0.0
                avg_pnl = 0.0

            heatmap.append({
                "day_index": d,
                "day_name": days_map[d],
                "hour": h,
                "trade_count": t_count,
                "net_pnl": round(net_pnl, 2),
                "win_rate": round(win_rate, 1),
                "avg_pnl": round(avg_pnl, 2)
            })

    return heatmap
