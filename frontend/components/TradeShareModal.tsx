'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Share2,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Loader2,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Tag,
  Clock,
  Crosshair,
  Eye,
  EyeOff,
} from 'lucide-react';
import { toPng, toBlob } from 'html-to-image';
import { Trade } from '@/types';

interface TradeShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  trade: Trade | null;
  currencySymbol?: string;
  tradeIndex?: number;
}

export default function TradeShareModal({
  isOpen,
  onClose,
  trade,
  currencySymbol = '$',
  tradeIndex,
}: TradeShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isStealthMode, setIsStealthMode] = useState(false);

  // Compute responsive scale for 1200x675 card
  useEffect(() => {
    if (!isOpen) return;

    const updateScale = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const targetScale = Math.min(1, Math.max(0.35, (containerWidth - 24) / 1200));
      setScale(targetScale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [isOpen]);

  // Derived Trade Details
  const pnl = trade?.pnl ?? 0;
  const isWin = pnl >= 0;
  const side = (trade?.side || 'BUY').toUpperCase();
  const isLong = side.includes('BUY') || side.includes('LONG') || side === 'B';
  const symbol = trade?.symbol || trade?.asset || 'UNKNOWN';
  const entryPrice = trade?.px ?? trade?.price ?? 0;
  const size = trade?.sz ?? trade?.qty ?? trade?.size ?? 1;

  // Open Trade check - matches table logic
  const isOpenTrade = useMemo(() => {
    if (!trade) return false;
    if (trade.is_open === true || String(trade.is_open).toLowerCase() === 'true' || (trade.is_open as unknown) === 1) return true;
    if (trade.status && (String(trade.status).toUpperCase() === 'OPEN' || String(trade.status).toUpperCase() === 'ACTIVE')) return true;
    if (trade.exit_price === undefined || trade.exit_price === null || Number(trade.exit_price || 0) === 0) {
      return true;
    }
    return false;
  }, [trade]);

  // Exit Price: use provided exit_price, or calculate from entry price, side, size and pnl ONLY if trade is actually closed
  const exitPrice = useMemo(() => {
    if (isOpenTrade) return null;
    if (typeof trade?.exit_price === 'number' && trade.exit_price > 0) {
      return trade.exit_price;
    }
    if (entryPrice > 0 && size > 0 && typeof trade?.pnl === 'number' && trade.pnl !== 0) {
      const delta = isLong ? pnl / size : -pnl / size;
      const calculated = entryPrice + delta;
      return calculated > 0 ? calculated : null;
    }
    return null;
  }, [trade, entryPrice, size, pnl, isLong, isOpenTrade]);

  // Return % calculation
  const returnPct = useMemo(() => {
    if (typeof trade?.return_pct === 'number') return trade.return_pct;
    if (entryPrice > 0 && size > 0 && typeof pnl === 'number') {
      const notional = entryPrice * size;
      if (notional > 0) {
        return (pnl / notional) * 100;
      }
    }
    return null;
  }, [trade, entryPrice, size, pnl]);

  // Date Formatting
  const dateStr = useMemo(() => {
    if (trade?.date) return trade.date;
    if (trade?.timestamp) {
      const ts = trade.timestamp < 1e11 ? trade.timestamp * 1000 : trade.timestamp;
      return new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return 'Execution Record';
  }, [trade]);

  // Clean data source tag (simplifies debug strings like "fallback_symbol (XPL no live response)" into "Fallback")
  const cleanDataSource = useMemo(() => {
    if (!trade?.data_source) return null;
    const src = String(trade.data_source).trim();
    if (src.toLowerCase().includes('fallback')) {
      return 'Fallback';
    }
    return src;
  }, [trade?.data_source]);

  // Behavioral Flags on this trade
  const tradeFlags = useMemo(() => {
    if (!trade) return [];
    const flags: { label: string; desc: string; color: string }[] = [];

    if (trade.is_revenge_trade) {
      flags.push({
        label: 'Revenge Trade',
        desc: 'Entered < 15m after a loss',
        color: 'text-rose-400 bg-slate-800 border-slate-700/60',
      });
    }
    if (trade.is_revenge_cluster) {
      flags.push({
        label: 'Revenge Cluster',
        desc: 'Sequence of 3+ quick entries',
        color: 'text-red-400 bg-slate-800 border-slate-700/60',
      });
    }
    if (trade.is_martingale_trade) {
      flags.push({
        label: 'Martingale Spike',
        desc: 'Size >= 1.5x after loss',
        color: 'text-amber-400 bg-slate-800 border-slate-700/60',
      });
    }
    if (trade.is_overtrading_spike) {
      flags.push({
        label: 'Overtrading Spike',
        desc: 'High velocity session count',
        color: 'text-orange-400 bg-slate-800 border-slate-700/60',
      });
    }
    if (trade.is_tilt) {
      flags.push({
        label: 'Tilt Execution',
        desc: 'Executed during emotional tilt',
        color: 'text-rose-400 bg-slate-800 border-slate-700/60',
      });
    }
    if (trade.is_early_entry) {
      flags.push({
        label: isLong ? 'Catching Knives' : 'Fading the Pump',
        desc: isLong ? 'Long entry in steep downtrend' : 'Short entry into steep upward rally',
        color: 'text-sky-400 bg-slate-800 border-slate-700/60',
      });
    }
    if (trade.is_late_entry) {
      flags.push({
        label: isLong ? 'Chasing Tops' : 'Selling the Bottom',
        desc: isLong ? 'Long entry near resistance peak' : 'Short entry near support floor',
        color: 'text-sky-400 bg-slate-800 border-slate-700/60',
      });
    }
    if (trade.is_early_exit) {
      flags.push({
        label: 'Early Exit',
        desc: 'Closed before profit target',
        color: 'text-blue-400 bg-slate-800 border-slate-700/60',
      });
    }
    if (trade.is_late_exit) {
      flags.push({
        label: 'Late Exit',
        desc: 'Loss held past invalidation',
        color: 'text-red-400 bg-slate-800 border-slate-700/60',
      });
    }

    return flags;
  }, [trade, isLong]);

  // Export handlers
  const handleDownloadPng = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#070a0f',
      });

      const link = document.createElement('a');
      const safeSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '_');
      const timestamp = new Date().toISOString().slice(0, 10);
      link.download = `clearer-trade-${safeSymbol}-${timestamp}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export trade card PNG:', err);
      setExportError('Failed to generate PNG image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#070a0f',
      });

      if (!blob) throw new Error('Blob generation failed');

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 3000);
      } else {
        handleDownloadPng();
      }
    } catch (err) {
      console.error('Failed to copy trade image:', err);
      handleDownloadPng();
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen || !trade) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-share-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1240px] bg-slate-950/95 border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar: Matching ShareCardModal */}
        <div className="relative flex items-center justify-between px-6 py-3.5 border-b border-slate-800/80 bg-slate-900/60 shrink-0 min-h-[52px]">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-[#A4D8FF]/10 border border-[#A4D8FF]/30 rounded-lg text-[#A4D8FF]">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="trade-share-modal-title" className="text-sm font-bold text-white leading-tight">
                Trade Execution Share Card
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {symbol} • {isLong ? 'LONG' : 'SHORT'} {tradeIndex !== undefined ? `• Trade #${tradeIndex + 1}` : ''}
              </p>
            </div>
          </div>

          {/* Close Modal Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-[34px] h-[34px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer shrink-0"
            aria-label="Close trade share modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scaled Preview Frame */}
        <div
          ref={containerRef}
          className="p-4 sm:p-6 bg-[#04070c] flex flex-col items-center justify-center min-h-[420px] overflow-hidden"
        >
          {exportError && (
            <div className="w-full mb-4 p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{exportError}</span>
            </div>
          )}

          {/* Scaled Wrapper: fits 1200x675 card */}
          <div
            style={{
              width: 1200 * scale,
              height: 675 * scale,
              transition: 'width 0.15s ease, height 0.15s ease',
            }}
            className="relative flex items-center justify-center select-none shadow-2xl rounded-2xl overflow-hidden border border-slate-800/60"
          >
            {/* The Actual 1200x675 DOM Card */}
            <div
              ref={cardRef}
              style={{
                width: 1200,
                height: 675,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              className="absolute top-0 left-0 bg-[#0B0F19] text-white p-8 flex flex-col justify-between overflow-hidden relative font-sans"
            >
              {/* Radial Ambient Grid */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.035]"
                style={{
                  backgroundImage: `radial-gradient(#A4D8FF 1.5px, transparent 1.5px)`,
                  backgroundSize: '24px 24px',
                }}
              />
              {/* Dynamic Glow: emerald if win, red if loss */}
              <div
                className={`absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
                  isWin ? 'bg-emerald-500/15' : 'bg-rose-500/15'
                }`}
              />
              <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#A4D8FF]/10 rounded-full blur-3xl pointer-events-none" />

              {/* 1. Card Header */}
              <div className="relative z-10 flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div>
                  <div className="text-2xl font-black tracking-tight text-white italic lowercase">
                    clearer.trade
                  </div>
                  <p className="text-[11px] font-semibold text-[#A4D8FF] tracking-wider uppercase mt-0.5">
                    Trade Execution Receipt
                  </p>
                </div>

                <div className="text-right flex items-center space-x-2.5">
                  <div className="text-sm font-bold text-slate-200">
                    {dateStr}
                  </div>
                  {isOpenTrade ? (
                    <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 bg-slate-800/80 border border-slate-700/60 text-sky-400 font-semibold rounded text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                      <span>Active {tradeIndex !== undefined ? `• #${tradeIndex + 1}` : ''}</span>
                    </span>
                  ) : (
                    <span className="bg-slate-800/80 px-2 py-0.5 rounded text-[10px] font-semibold text-slate-300 border border-slate-700/60">
                      Closed {tradeIndex !== undefined ? `• #${tradeIndex + 1}` : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* 2. Middle Body */}
              <div className="relative z-10 flex-1 flex flex-col justify-center space-y-4 py-2">
                {/* Hero Section: Symbol + Side + PnL */}
                <div className="bg-slate-900/90 border border-slate-800/90 p-6 rounded-2xl shadow-xl flex items-center justify-between">
                  <div className="flex items-center space-x-5">
                    {/* Direction Icon Badge */}
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-inner ${
                        isLong
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-[#00E599]'
                          : 'bg-rose-500/10 border-rose-500/30 text-[#FF4D4D]'
                      }`}
                    >
                      {isLong ? (
                        <ArrowUpRight className="w-8 h-8 stroke-[2.5]" />
                      ) : (
                        <ArrowDownRight className="w-8 h-8 stroke-[2.5]" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center space-x-3">
                        <span className="text-3xl font-black tracking-tight text-white">
                          {symbol}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider border ${
                            isLong
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-[#00E599]'
                              : 'bg-rose-500/10 border-rose-500/30 text-[#FF4D4D]'
                          }`}
                        >
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                        {trade.strategy_tag && (
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-800/80 text-sky-200 border border-slate-700 flex items-center space-x-1">
                            <Tag className="w-3 h-3 text-[#A4D8FF]" />
                            <span>{trade.strategy_tag}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Big Outcome / PnL */}
                  <div className="text-right">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      {isOpenTrade
                        ? 'Position Status'
                        : isStealthMode
                        ? 'Return on Capital'
                        : 'Realized Outcome'}
                    </div>

                    {isOpenTrade ? (
                      <div>
                        <div className="text-3xl font-black tracking-tight text-sky-400">
                          Active Position
                        </div>
                      </div>
                    ) : isStealthMode ? (
                      <div>
                        {/* Stealth / % Return Hero */}
                        <div
                          className={`text-4xl font-black tracking-tight tabular-nums ${
                            (returnPct ?? (pnl >= 0 ? 0 : -1)) >= 0 ? 'text-[#00E599]' : 'text-[#FF4D4D]'
                          }`}
                        >
                          {(returnPct ?? 0) >= 0 ? '+' : ''}
                          {returnPct !== null ? returnPct.toFixed(2) : (pnl >= 0 ? '+0.00' : '-0.00')}%
                        </div>
                      </div>
                    ) : (
                      <div>
                        {/* Realized Dollar Outcome */}
                        <div
                          className={`text-4xl font-black tracking-tight tabular-nums ${
                            isWin ? 'text-[#00E599]' : 'text-[#FF4D4D]'
                          }`}
                        >
                          {isWin ? '+' : '-'}
                          {currencySymbol}
                          {Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {returnPct !== null && (
                          <div className="text-xs font-bold mt-1">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                returnPct >= 0
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}% Return
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 4 Execution Metrics: Entry Px, Exit Px, Size, Notional */}
                <div className="grid grid-cols-4 gap-4">
                  {/* Entry Price */}
                  <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-md">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                      <Crosshair className="w-3.5 h-3.5 text-[#A4D8FF]" />
                      <span>Entry Price</span>
                    </div>
                    <div className="text-xl font-black tracking-tight text-slate-100 tabular-nums mt-1.5">
                      {currencySymbol}{entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </div>
                  </div>

                  {/* Exit Price */}
                  <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-md">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Exit Price</span>
                    </div>
                    <div className="text-xl font-black tracking-tight text-slate-100 tabular-nums mt-1.5">
                      {isOpenTrade || exitPrice === null ? (
                        <span className="text-slate-400 font-bold">--</span>
                      ) : (
                        `${currencySymbol}${exitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                      )}
                    </div>
                  </div>

                  {/* Position Size */}
                  <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-md">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Position Size
                    </div>
                    <div className="text-xl font-black tracking-tight text-white tabular-nums mt-1.5">
                      {size.toLocaleString()} <span className="text-xs font-semibold text-slate-400">Units</span>
                    </div>
                  </div>

                  {/* Metric 4: Volume in USD mode vs Execution Metric in Stealth mode */}
                  <div className="bg-slate-900/80 border border-slate-800/80 p-4 rounded-xl shadow-md">
                    {!isStealthMode ? (
                      <>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Total Volume / Notional
                        </div>
                        <div className="text-xl font-black tracking-tight text-[#A4D8FF] tabular-nums mt-1.5">
                          {currencySymbol}{(entryPrice * size).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Peak Potential (MFE)</span>
                        </div>
                        <div className="text-xl font-black tracking-tight text-[#A4D8FF] tabular-nums mt-1.5">
                          {typeof trade.mfe_pct === 'number' ? `+${trade.mfe_pct.toFixed(2)}%` : 'Clean Setup'}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Bottom Row: MAE / MFE Execution Quality & Behavioral Audit */}
                <div className="grid grid-cols-12 gap-4">
                  {/* MAE / MFE Excursion Box (6 cols) */}
                  <div className="col-span-6 bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between shadow-xl min-h-[155px]">
                    <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                        <Activity className="w-3.5 h-3.5 text-[#A4D8FF]" />
                        <span>Execution Precision (MAE • MFE)</span>
                      </span>
                      {cleanDataSource && (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded">
                          {cleanDataSource}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 my-2">
                      {/* MAE */}
                      <div className="bg-slate-950/80 border border-slate-800/60 p-3 rounded-xl">
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Max Drawdown (MAE)</span>
                          <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                        </div>
                        <div className="text-lg font-black tabular-nums mt-1 text-rose-400">
                          {typeof trade.mae_pct === 'number' ? `${trade.mae_pct.toFixed(2)}%` : 'N/A'}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">Adverse price excursion</p>
                      </div>

                      {/* MFE */}
                      <div className="bg-slate-950/80 border border-slate-800/60 p-3 rounded-xl">
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Max Potential (MFE)</span>
                          <TrendingUp className="w-3.5 h-3.5 text-[#00E599]" />
                        </div>
                        <div className="text-lg font-black tabular-nums mt-1 text-[#00E599]">
                          {typeof trade.mfe_pct === 'number' ? `${trade.mfe_pct.toFixed(2)}%` : 'N/A'}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">Peak favorable capture</p>
                      </div>
                    </div>
                  </div>

                  {/* Behavioral Audit Box (6 cols) */}
                  <div className="col-span-6 bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between shadow-xl min-h-[155px]">
                    <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Psychological &amp; Behavioral Audit</span>
                      </span>
                      <span className="text-[11px] font-bold">
                        {tradeFlags.length === 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-emerald-400 text-[10px] rounded font-semibold border border-slate-700/50">
                            100% Clean
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-800 text-rose-400 text-[10px] rounded font-semibold border border-slate-700/50">
                            {tradeFlags.length} Flag(s)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="my-2">
                      {tradeFlags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {tradeFlags.map((flag, idx) => (
                            <div
                              key={idx}
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded border flex items-center space-x-1.5 ${flag.color}`}
                            >
                              <span className="font-semibold tracking-tight">{flag.label}</span>
                              <span className="text-[9px] text-slate-400">&bull; {flag.desc}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center space-x-3 text-slate-300">
                          <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
                          <div className="text-xs">
                            <div className="font-bold text-slate-200">Flawless Rule Execution</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              No emotional leaks, revenge sizing, or premature exit detected.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Card Footer Watermark */}
              <div className="relative z-10 flex items-center justify-between border-t border-slate-800/80 pt-3.5 text-xs text-slate-400">
                <div className="flex items-center space-x-2 font-medium">
                  <span>Stateless institutional trading journal &amp; analytics</span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium">
                  {new Date().toISOString().slice(0, 10)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Toolbar & Export Actions: Exact matching ShareCardModal design language */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-3 border-t border-slate-800/80 bg-slate-900/60 gap-3 shrink-0">
          {/* Left: Card Display Settings */}
          <div className="flex items-center space-x-2.5">
            {/* Stealth Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsStealthMode(!isStealthMode)}
              className={`h-[34px] px-3 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border whitespace-nowrap shrink-0 cursor-pointer ${
                isStealthMode
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isStealthMode ? 'Stealth Mode Active' : 'Hide dollar amounts and display exact % returns'}
            >
              {isStealthMode ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Stealth Active</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span>Hide $</span>
                </>
              )}
            </button>
          </div>

          {/* Right: Primary Export Actions */}
          <div className="flex items-center space-x-2.5">
            {/* Download PNG Button */}
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExporting || !trade}
              className="h-[34px] px-4 bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-700/80 rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A4D8FF]" />
              ) : (
                <Download className="w-3.5 h-3.5 text-[#A4D8FF]" />
              )}
              <span>Download PNG</span>
            </button>

            {/* Copy Image Button */}
            <button
              type="button"
              onClick={handleCopyToClipboard}
              disabled={isExporting || !trade}
              className={`h-[34px] px-4 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center space-x-2 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer ${
                isCopied
                  ? 'bg-emerald-500 text-black shadow-emerald-500/20'
                  : 'bg-[#A4D8FF] hover:bg-[#85c6f5] text-slate-950 shadow-[#A4D8FF]/10'
              }`}
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-950" />
                  <span>Copy Image</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
