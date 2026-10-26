'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Trade } from '@/types';
import {
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Download,
  Filter,
  CheckSquare,
  Square,
  ArrowUpDown,
  Undo2,
  Share2,
} from 'lucide-react';
import TradeShareModal from './TradeShareModal';

interface TradeTableProps {
  trades: Trade[];
  onReanalyze?: (updatedTrades: Trade[], tokenOverride?: string, forceConsolidated?: boolean) => void;
  isPro?: boolean;
  currencySymbol?: string;
  isConsolidated?: boolean;
}

type SortField = 'date' | 'symbol' | 'side' | 'sz' | 'px' | 'pnl' | 'strategy_tag' | 'mae_pct' | 'mfe_pct';
type SortOrder = 'asc' | 'desc';

const isLongTrade = (side?: string) => {
  if (!side) return true;
  const s = side.toUpperCase();
  return s.includes('BUY') || s.includes('LONG') || s === 'B';
};

export default function TradeTable({ trades, onReanalyze, currencySymbol = '$' }: TradeTableProps) {
  const [localTrades, setLocalTrades] = useState<Trade[]>(trades);
  const [historyStack, setHistoryStack] = useState<Trade[][]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [filterSide, setFilterSide] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [filterStrategy, setFilterStrategy] = useState<string>('ALL');
  const [filterBehavior, setFilterBehavior] = useState<string>('ALL');
  
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [batchTagInput, setBatchTagInput] = useState('');
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [shareTrade, setShareTrade] = useState<{ trade: Trade; index: number } | null>(null);

  useEffect(() => {
    setLocalTrades(trades);
    setSelectedRows(new Set());
    setHistoryStack([]);
  }, [trades]);

  const saveHistoryState = (newTrades: Trade[]) => {
    setHistoryStack((prev) => [...prev.slice(-20), localTrades]);
    setLocalTrades(newTrades);
  };

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    setHistoryStack((prev) => prev.slice(0, prev.length - 1));
    setLocalTrades(previous);
  }, [historyStack]);

  const tickSummary = useMemo(() => {
    if (!localTrades || localTrades.length === 0) return null;
    let binanceCount = 0;
    let yahooCount = 0;
    let hyperliquidCount = 0;
    let bybitCount = 0;
    let estimatedCount = 0;
    let totalVerified = 0;
    let closedTradesCount = 0;

    for (const t of localTrades) {
      const isOpen = t.is_open === true || String(t.is_open).toLowerCase() === 'true';
      if (!isOpen) closedTradesCount++;

      const src = (t.data_source || '').toLowerCase();
      const isLive = t.is_live_tick === true || String(t.is_live_tick).toLowerCase() === 'true' || (src !== '' && !src.startsWith('fallback'));
      if (isLive) {
        totalVerified++;
        if (src.includes('binance')) binanceCount++;
        else if (src.includes('yahoo')) yahooCount++;
        else if (src.includes('hyperliquid')) hyperliquidCount++;
        else if (src.includes('bybit')) bybitCount++;
        else binanceCount++;
      } else {
        estimatedCount++;
      }
    }

    if (totalVerified === 0 && estimatedCount === 0) return null;

    return {
      totalVerified,
      totalTrades: closedTradesCount > 0 ? closedTradesCount : localTrades.length,
      binanceCount,
      yahooCount,
      hyperliquidCount,
      bybitCount,
      estimatedCount
    };
  }, [localTrades]);

  const handleTagChange = (index: number, newTag: string) => {
    const updated = [...localTrades];
    updated[index] = { ...updated[index], strategy_tag: newTag };
    saveHistoryState(updated);
  };

  const handleBatchTagApply = () => {
    if (selectedRows.size === 0 || !batchTagInput.trim()) return;
    const updated = [...localTrades];
    Array.from(selectedRows).forEach(idx => {
      updated[idx] = { ...updated[idx], strategy_tag: batchTagInput.trim() };
    });
    saveHistoryState(updated);
    setSelectedRows(new Set());
    setBatchTagInput('');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleReanalyzeClick = async () => {
    if (!onReanalyze) return;
    setIsReanalyzing(true);
    try {
      await onReanalyze(localTrades);
    } finally {
      setIsReanalyzing(false);
    }
  };

  const availableBehaviors = useMemo(() => {
    const found = new Set<string>();
    let hasClean = false;
    localTrades.forEach((t) => {
      let flagged = false;
      if (t.is_revenge_trade) { found.add('Revenge Trade'); flagged = true; }
      if (t.is_revenge_cluster) { found.add('Revenge Cluster'); flagged = true; }
      if (t.is_martingale_trade) { found.add('Martingale Spike'); flagged = true; }
      if (t.is_overtrading_spike) { found.add('Overtrading'); flagged = true; }
      if (t.is_tilt) { found.add('Tilt Session'); flagged = true; }
      if (t.is_early_entry) { 
        found.add(isLongTrade(t.side) ? 'Catching Knives' : 'Fading the Pump'); 
        flagged = true; 
      }
      if (t.is_late_entry) { 
        found.add(isLongTrade(t.side) ? 'Chasing Tops' : 'Selling the Bottom'); 
        flagged = true; 
      }
      if (t.is_early_exit) { found.add('Early Exit'); flagged = true; }
      if (t.is_late_exit) { found.add('Late Exit'); flagged = true; }
      if (!flagged) hasClean = true;
    });
    const list = Array.from(found);
    if (hasClean) list.unshift('Clean');
    return list;
  }, [localTrades]);

  const uniqueStrategies = useMemo(() => {
    return Array.from(new Set(localTrades.map(t => t.strategy_tag || 'UNTAGGED')));
  }, [localTrades]);

  const { filteredTrades, visibleIndices } = useMemo(() => {
    let result = localTrades.map((t, originalIndex) => ({ t, originalIndex }));

    if (searchTerm) {
      result = result.filter(({ t }) => {
        const symbol = (t.symbol || t.asset || '').toLowerCase();
        return symbol.includes(searchTerm.toLowerCase());
      });
    }

    if (filterStatus !== 'ALL') {
      result = result.filter(({ t }) => {
        const isOpen = t.is_open === true || String(t.is_open).toLowerCase() === 'true' || (t.is_open as unknown) === 1 || Number(t.exit_price || 0) === 0;
        if (filterStatus === 'OPEN') return isOpen;
        if (filterStatus === 'CLOSED') return !isOpen;
        return true;
      });
    }

    if (filterSide !== 'ALL') {
      result = result.filter(({ t }) => {
        const side = (t.side || '').toUpperCase();
        if (filterSide === 'LONG') return side.includes('LONG') || side.includes('BUY');
        if (filterSide === 'SHORT') return side.includes('SHORT') || side.includes('SELL');
        return true;
      });
    }

    if (filterStrategy !== 'ALL') {
      result = result.filter(({ t }) => (t.strategy_tag || 'UNTAGGED') === filterStrategy);
    }

    if (filterBehavior !== 'ALL') {
      result = result.filter(({ t }) => {
        if (filterBehavior === 'Clean') {
          return !t.is_revenge_trade && !t.is_revenge_cluster && !t.is_martingale_trade && 
                 !t.is_overtrading_spike && !t.is_tilt && !t.is_early_entry && !t.is_late_entry && 
                 !t.is_early_exit && !t.is_late_exit;
        }
        if (filterBehavior === 'Revenge Trade') return t.is_revenge_trade;
        if (filterBehavior === 'Revenge Cluster') return t.is_revenge_cluster;
        if (filterBehavior === 'Martingale Spike') return t.is_martingale_trade;
        if (filterBehavior === 'Overtrading') return t.is_overtrading_spike;
        if (filterBehavior === 'Tilt Session') return t.is_tilt;
        if (filterBehavior === 'Catching Knives') return t.is_early_entry && isLongTrade(t.side);
        if (filterBehavior === 'Fading the Pump') return t.is_early_entry && !isLongTrade(t.side);
        if (filterBehavior === 'Chasing Tops') return t.is_late_entry && isLongTrade(t.side);
        if (filterBehavior === 'Selling the Bottom') return t.is_late_entry && !isLongTrade(t.side);
        if (filterBehavior === 'Early Exit') return t.is_early_exit;
        if (filterBehavior === 'Late Exit') return t.is_late_exit;
        return true;
      });
    }

    result.sort((a, b) => {
      const ta = a.t;
      const tb = b.t;
      let valA: string | number = (ta as Record<string, unknown>)[sortField] as string | number;
      let valB: string | number = (tb as Record<string, unknown>)[sortField] as string | number;

      if (sortField === 'date') {
        valA = ta.timestamp || new Date(ta.date || 0).getTime();
        valB = tb.timestamp || new Date(tb.date || 0).getTime();
      } else if (sortField === 'symbol') {
        valA = ta.symbol || ta.asset || '';
        valB = tb.symbol || tb.asset || '';
      } else if (sortField === 'sz') {
        valA = ta.sz ?? ta.qty ?? ta.size ?? 1;
        valB = tb.sz ?? tb.qty ?? tb.size ?? 1;
      } else if (sortField === 'px') {
        valA = ta.px ?? ta.price ?? 0;
        valB = tb.px ?? tb.price ?? 0;
      } else if (sortField === 'strategy_tag') {
        valA = ta.strategy_tag || 'UNTAGGED';
        valB = tb.strategy_tag || 'UNTAGGED';
      } else if (sortField === 'pnl') {
        valA = ta.pnl ?? 0;
        valB = tb.pnl ?? 0;
      } else if (sortField === 'mae_pct') {
        valA = ta.mae_pct ?? -1;
        valB = tb.mae_pct ?? -1;
      } else if (sortField === 'mfe_pct') {
        valA = ta.mfe_pct ?? -1;
        valB = tb.mfe_pct ?? -1;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return { 
      filteredTrades: result, 
      visibleIndices: result.map(r => r.originalIndex) 
    };
  }, [localTrades, searchTerm, filterSide, filterStatus, filterStrategy, filterBehavior, sortField, sortOrder]);

  const toggleRowSelect = (originalIndex: number, e?: React.MouseEvent) => {
    const newSet = new Set(selectedRows);

    if (e && e.shiftKey && lastSelectedIndex !== null) {
      const startIdxInVisible = visibleIndices.indexOf(lastSelectedIndex);
      const endIdxInVisible = visibleIndices.indexOf(originalIndex);

      if (startIdxInVisible !== -1 && endIdxInVisible !== -1) {
        const min = Math.min(startIdxInVisible, endIdxInVisible);
        const max = Math.max(startIdxInVisible, endIdxInVisible);
        for (let i = min; i <= max; i++) {
          newSet.add(visibleIndices[i]);
        }
        setSelectedRows(newSet);
        return;
      }
    }

    if (newSet.has(originalIndex)) {
      newSet.delete(originalIndex);
    } else {
      newSet.add(originalIndex);
    }

    setSelectedRows(newSet);
    setLastSelectedIndex(originalIndex);
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === visibleIndices.length && visibleIndices.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(visibleIndices));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT');

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (!isInputFocused) {
          e.preventDefault();
          handleUndo();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (!isInputFocused && visibleIndices.length > 0) {
          e.preventDefault();
          setSelectedRows(new Set(visibleIndices));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleIndices, handleUndo]);

  if (!trades || trades.length === 0) return null;

  const handleExportCsv = () => {
    const sample = localTrades[0] || {};
    const systemFields = new Set([
      'position_id', 'data_source', 'duration_minutes', 
      'market_regime', 'volatility_ratio', 'funding_rate'
    ]);

    const exportKeys = Object.keys(sample).filter((k) => {
      if (k === 'strategy_tag') return true;
      if (
        k.startsWith('is_') || 
        k.startsWith('mae_') || 
        k.startsWith('mfe_') || 
        k.startsWith('t_plus_') || 
        k.startsWith('raw_')
      ) {
        return false;
      }
      return !systemFields.has(k);
    });

    if (!exportKeys.includes('strategy_tag')) {
      exportKeys.push('strategy_tag');
    }

    const csvRows = [exportKeys.join(',')];

    localTrades.forEach((row) => {
      const values = exportKeys.map((k) => {
        const val = row[k as keyof Trade] !== undefined && row[k as keyof Trade] !== null ? String(row[k as keyof Trade]) : '';
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trading_log_with_strategy.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ field, label }: { field: SortField, label: string }) => (
    <th 
      className="py-3 px-3 cursor-pointer hover:text-white transition-colors group select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{label}</span>
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-[#A4D8FF] opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
      </div>
    </th>
  );

  return (
    <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-6 shadow-2xl space-y-4 font-sans [page-break-inside:avoid]">
      
      {/* Header & Subtitle */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-white flex items-center space-x-2">
            <span>Trade Ledger &amp; Strategy Tag Editor ({localTrades.length} entries)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1.5 flex flex-col sm:flex-row sm:items-center gap-1.5 flex-wrap">
            <span>Edit strategy tags for individual or bulk trades, then click &quot;Re-Analyze&quot; to recalculate stats. Use <kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px] font-mono">Shift+Click</kbd> to select ranges, <kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px] font-mono">Ctrl+A</kbd> to select all, and <kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px] font-mono">Ctrl+Z</kbd> to undo edits.</span>
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0" data-html2canvas-ignore="true">
          {historyStack.length > 0 && (
            <button
              onClick={handleUndo}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-[#A4D8FF] border border-[#A4D8FF]/30 rounded text-xs font-bold flex items-center space-x-1.5 transition-colors"
              title="Undo previous tag edit (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo ({historyStack.length})</span>
            </button>
          )}

          {onReanalyze && (
            <button
              type="button"
              onClick={handleReanalyzeClick}
              disabled={isReanalyzing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded text-xs font-bold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReanalyzing ? 'animate-spin' : ''}`} />
              <span>Re-Analyze</span>
            </button>
          )}

          <div className="relative group">
            <button
              onClick={handleExportCsv}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded text-xs font-bold flex items-center space-x-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-1.5 w-64 p-2.5 bg-slate-950 border border-slate-700 text-[11px] text-slate-300 rounded-md shadow-2xl z-50 leading-normal">
              <span><strong>Clean CSV Export:</strong> Exports your original trade log with all updated strategy tags included, preserving your original file structure without calculated noise.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tick Precision Summary Badge */}
      {tickSummary && (
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs bg-slate-900/90 border border-slate-700/60 rounded-lg px-3.5 py-2 text-slate-300 shadow-sm w-full">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">Tick Precision:</span>
            <span className="font-bold text-sky-400 text-xs">
              {tickSummary.totalVerified} / {tickSummary.totalTrades} verified
            </span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            {tickSummary.binanceCount > 0 && <span className="text-slate-300">Binance: {tickSummary.binanceCount}</span>}
            {tickSummary.yahooCount > 0 && <span className="text-slate-300">Yahoo: {tickSummary.yahooCount}</span>}
            {tickSummary.hyperliquidCount > 0 && <span className="text-slate-300">Hyperliquid: {tickSummary.hyperliquidCount}</span>}
            {tickSummary.bybitCount > 0 && <span className="text-slate-300">Bybit: {tickSummary.bybitCount}</span>}
            {tickSummary.estimatedCount > 0 && <span className="text-slate-500">Estimated: {tickSummary.estimatedCount}</span>}
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60 w-full">
        <div className="flex items-center space-x-2 text-slate-400 mr-1">
          <Filter className="w-4 h-4" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Filters:</span>
        </div>
        
        <input
          type="text"
          placeholder="Search Symbol..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 flex-1 sm:flex-initial min-w-[120px]"
        />

        <select
          value={filterSide}
          onChange={(e) => setFilterSide(e.target.value as 'ALL' | 'LONG' | 'SHORT')}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-slate-600 flex-1 sm:flex-initial"
        >
          <option value="ALL">All Sides</option>
          <option value="LONG">LONG</option>
          <option value="SHORT">SHORT</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'ALL' | 'OPEN' | 'CLOSED')}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-slate-600 flex-1 sm:flex-initial font-sans"
        >
          <option value="ALL">All Statuses</option>
          <option value="CLOSED">Closed Positions Only</option>
          <option value="OPEN">Open Positions Only</option>
        </select>

        <select
          value={filterStrategy}
          onChange={(e) => setFilterStrategy(e.target.value)}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-slate-600 flex-1 sm:flex-initial max-w-[140px]"
        >
          <option value="ALL">All Strategies</option>
          {uniqueStrategies.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={filterBehavior}
          onChange={(e) => setFilterBehavior(e.target.value)}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-slate-600 flex-1 sm:flex-initial"
        >
          <option value="ALL">All Behaviors</option>
          {availableBehaviors.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        
        <div className="w-full sm:w-auto sm:ml-auto flex items-center space-x-2 sm:border-l border-slate-800 sm:pl-4 py-1 pt-2 sm:pt-1 border-t sm:border-t-0 border-slate-800/60 mt-1 sm:mt-0 justify-between sm:justify-start">
          <input
            type="text"
            placeholder="Batch tag..."
            value={batchTagInput}
            onChange={(e) => setBatchTagInput(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 w-[120px] sm:w-[140px]"
          />
          <button
            onClick={handleBatchTagApply}
            disabled={selectedRows.size === 0 || !batchTagInput.trim()}
            className="px-3 py-1.5 bg-[#A4D8FF] hover:bg-[#6898bc] text-black font-extrabold text-xs rounded transition-colors disabled:opacity-40 shrink-0"
          >
            Apply to {selectedRows.size}
          </button>
        </div>
      </div>

      {/* Scrollable Table Container */}
      <div className="overflow-x-auto overflow-y-auto max-h-[500px] border border-slate-800/80 rounded-lg bg-slate-950 relative custom-scrollbar select-none">
        <table className="w-full text-left border-collapse text-xs font-sans">
          <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 shadow-md">
            <tr className="text-slate-500 uppercase tracking-wider font-medium">
              <th className="py-3 px-4 w-10">
                <button onClick={toggleSelectAll} className="text-slate-400 hover:text-white transition-colors flex items-center">
                  {selectedRows.size === visibleIndices.length && visibleIndices.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-[#A4D8FF]" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>
              <SortHeader field="date" label="Date / Time" />
              <SortHeader field="symbol" label="Symbol" />
              <SortHeader field="side" label="Side" />
              <SortHeader field="sz" label="Size" />
              <SortHeader field="px" label="Price" />
              <SortHeader field="pnl" label="PnL ($)" />
              <SortHeader field="strategy_tag" label="Strategy Tag" />
              <SortHeader field="mae_pct" label="MAE (%)" />
              <SortHeader field="mfe_pct" label="MFE (%)" />
              <th className="py-3 px-3">Behavioral Flags</th>
              <th className="py-3 px-3 text-center w-12">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {filteredTrades.map(({ t, originalIndex }) => {
              const pnl = t.pnl ?? 0;
              const side = (t.side || 'BUY').toUpperCase();
              const isLong = side.includes('BUY') || side.includes('LONG') || side === 'B';
              const dateStr =
                t.date || (t.timestamp ? new Date(t.timestamp).toLocaleString() : `Trade #${originalIndex + 1}`);

              const isSelected = selectedRows.has(originalIndex);

              return (
                <tr 
                  key={originalIndex} 
                  onClick={(e) => toggleRowSelect(originalIndex, e)}
                  className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${isSelected ? 'bg-sky-950/20' : ''}`}
                >
                  <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                    <button onClick={(e) => toggleRowSelect(originalIndex, e)} className="text-slate-500 hover:text-white transition-colors flex items-center">
                      {isSelected ? <CheckSquare className="w-4 h-4 text-[#A4D8FF]" /> : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap tabular-nums">{dateStr}</td>
                  <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap flex items-center space-x-1.5">
                    <span>{t.symbol || t.asset || 'N/A'}</span>
                    {(t.is_open === true || String(t.is_open).toLowerCase() === 'true' || (t.is_open as unknown) === 1 || Number(t.exit_price || 0) === 0) && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-blue-400 bg-slate-800">
                        OPEN
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center space-x-1 text-[11px] font-bold ${
                        isLong ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      <span>{isLong ? 'LONG' : 'SHORT'}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap tabular-nums">
                    {t.sz ?? t.qty ?? t.size ?? 1}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap tabular-nums">
                    {currencySymbol}{(t.px ?? t.price ?? 0).toLocaleString()}
                  </td>
                  <td
                    className={`py-2.5 px-3 font-bold whitespace-nowrap tabular-nums ${
                      pnl >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {currencySymbol}{pnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3 min-w-[140px]" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={t.strategy_tag || 'UNTAGGED'}
                      onChange={(e) => handleTagChange(originalIndex, e.target.value)}
                      className={`w-full bg-slate-950 border rounded px-2 py-1 text-xs font-sans focus:outline-none transition-colors ${
                        t.strategy_tag ? 'border-slate-700 text-sky-100' : 'border-slate-800 text-slate-500'
                      } focus:border-[#A4D8FF]/50 focus:ring-1 focus:ring-sky-500/50`}
                    />
                  </td>
                  {/* MAE (%) Column */}
                  <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-slate-300">
                    {typeof t.mae_pct === 'number' ? (
                      <div className="flex items-center space-x-1">
                        <span>{t.mae_pct.toFixed(2)}%</span>
                        {t.data_source && t.data_source.toLowerCase().includes('binance') && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 rounded cursor-help font-semibold" title="Source: Binance (Live K-Lines)">Binance</span>
                        )}
                        {t.data_source && t.data_source.toLowerCase().includes('yahoo') && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-cyan-950/60 text-cyan-400 border border-cyan-800/60 rounded cursor-help font-semibold" title={`Source: Yahoo Finance (${t.data_source})`}>Yahoo</span>
                        )}
                        {t.data_source && t.data_source.toLowerCase().includes('hyperliquid') && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-950/60 text-purple-400 border border-purple-800/60 rounded cursor-help font-semibold" title="Source: Hyperliquid (Live 5m Ticks)">Hyperliquid</span>
                        )}
                        {t.data_source && t.data_source.toLowerCase().includes('bybit') && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-950/60 text-amber-400 border border-amber-800/60 rounded cursor-help font-semibold" title="Source: Bybit (Live 5m Ticks)">Bybit</span>
                        )}
                        {t.data_source && t.data_source.toLowerCase().includes('coinbase') && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-950/60 text-blue-400 border border-blue-800/60 rounded cursor-help font-semibold" title="Source: Coinbase (Live 5m Ticks)">Coinbase</span>
                        )}
                        {t.data_source === 'fallback_timeframe' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-950/60 text-amber-400 border border-amber-800/60 rounded cursor-help font-semibold" title="Live 5m data unavailable (trade exceeds historical API limits). MAE/MFE estimated via PnL ratio.">Est. (&gt;60d)</span>
                        )}
                        {t.data_source === 'fallback_symbol' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded cursor-help font-semibold" title="Symbol not recognized by market APIs. MAE/MFE estimated via PnL ratio.">Est. (PnL)</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </td>
                  {/* MFE (%) Column */}
                  <td className="py-2.5 px-3 whitespace-nowrap tabular-nums text-slate-300">
                    {typeof t.mfe_pct === 'number' ? `${t.mfe_pct.toFixed(2)}%` : '-'}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      {Boolean(t.is_revenge_trade) && (
                        <span title="Trade opened within 15 minutes of a loss" className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-red-400 text-[10px] rounded font-semibold tracking-tight cursor-help">
                          Revenge Trade
                        </span>
                      )}
                      {Boolean(t.is_revenge_cluster) && (
                        <span title="Sequence of 3+ trades entered within 5 minutes of a loss" className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-rose-400 text-[10px] rounded font-semibold tracking-tight cursor-help">
                          Revenge Cluster
                        </span>
                      )}
                      {Boolean(t.is_martingale_trade) && (
                        <span title="Position size >= 1.5x larger immediately following a loss" className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-sky-400 text-[10px] rounded font-semibold tracking-tight cursor-help">
                          Martingale Spike
                        </span>
                      )}
                      {Boolean(t.is_overtrading_spike) && (
                        <span title="Day trade count >= 2x historical daily average" className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-orange-400 text-[10px] rounded font-semibold tracking-tight cursor-help">
                          Overtrading Spike
                        </span>
                      )}
                      {Boolean(t.is_tilt) && (
                        <span title="Trade executed during a high-loss emotional tilt session" className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-red-500 text-[10px] rounded font-semibold tracking-tight cursor-help">
                          Tilt Session
                        </span>
                      )}
                      {Boolean(t.is_early_entry) && (
                        <span 
                          title={isLongTrade(t.side) ? "Long entry taken during steep downward price velocity" : "Short entry taken against steep upward price velocity"} 
                          className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-sky-400 text-[10px] rounded font-semibold tracking-tight cursor-help"
                        >
                          {isLongTrade(t.side) ? "Catching Knives" : "Fading the Pump"}
                        </span>
                      )}
                      {Boolean(t.is_late_entry) && (
                        <span 
                          title={isLongTrade(t.side) ? "Long entry taken near local resistance peaks" : "Short entry taken near local support floors"} 
                          className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-sky-400 text-[10px] rounded font-semibold tracking-tight cursor-help"
                        >
                          {isLongTrade(t.side) ? "Chasing Tops" : "Selling the Bottom"}
                        </span>
                      )}
                      {Boolean(t.is_early_exit) && (
                        <span title="Trades exited prematurely before reaching profit target" className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-blue-400 text-[10px] rounded font-semibold tracking-tight cursor-help">
                          Early Exit
                        </span>
                      )}
                      {Boolean(t.is_late_exit) && (
                        <span title="Losing trade held long past invalidation level" className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-red-400 text-[10px] rounded font-semibold tracking-tight cursor-help">
                          Late Exit
                        </span>
                      )}
                      {!Boolean(t.is_revenge_trade) &&
                        !Boolean(t.is_revenge_cluster) &&
                        !Boolean(t.is_martingale_trade) &&
                        !Boolean(t.is_overtrading_spike) &&
                        !Boolean(t.is_early_entry) &&
                        !Boolean(t.is_late_entry) &&
                        !Boolean(t.is_early_exit) &&
                        !Boolean(t.is_late_exit) && (
                          <span className="text-[10px] text-slate-500 font-medium tracking-wide">Clean Execution</span>
                        )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setShareTrade({ trade: t, index: originalIndex })}
                      className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-[#A4D8FF]/15 text-slate-400 hover:text-[#A4D8FF] border border-slate-800 hover:border-[#A4D8FF]/30 transition-colors shadow-sm inline-flex items-center justify-center cursor-pointer"
                      title="Share this trade card"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TradeShareModal
        isOpen={shareTrade !== null}
        onClose={() => setShareTrade(null)}
        trade={shareTrade?.trade || null}
        tradeIndex={shareTrade?.index}
        currencySymbol={currencySymbol}
      />
    </div>
  );
}
