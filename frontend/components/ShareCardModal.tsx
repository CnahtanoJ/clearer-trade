'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Zap,
  Loader2,
  Eye,
  EyeOff,
  LineChart as LineChartIcon,
  ShieldAlert,
  Brain,
  ChevronUp,
  ChevronDown,
  LayoutDashboard,
} from 'lucide-react';
import { toPng, toBlob } from 'html-to-image';
import { ProcessedData, Trade, AuditResponse } from '@/types';

export type ShareCardVariant = 'overview' | 'equity' | 'execution' | 'audit';

interface ShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ProcessedData | null;
  auditResult?: AuditResponse | null;
  initialTab?: ShareCardVariant;
}

export default function ShareCardModal({
  isOpen,
  onClose,
  data,
  auditResult,
  initialTab = 'overview',
}: ShareCardModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [activeTab, setActiveTab] = useState<ShareCardVariant>(initialTab);
  const [isStealthMode, setIsStealthMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // User-configured Starting Capital with localStorage caching
  const [startingBalance, setStartingBalance] = useState<number>(10000);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('cs_starting_balance');
      if (cached) {
        const val = parseFloat(cached);
        if (!isNaN(val) && val > 0) {
          setStartingBalance(val);
        }
      }
    } catch {
      // Ignore if localStorage unavailable
    }
  }, []);

  const handleStartingBalanceChange = (val: number) => {
    const clean = Math.max(0, val);
    setStartingBalance(clean);
    try {
      if (clean > 0) {
        localStorage.setItem('cs_starting_balance', String(clean));
      }
    } catch {
      // Ignore
    }
  };

  const incrementStartingBalance = (delta: number) => {
    const current = Number(startingBalance) || 0;
    const next = Math.max(100, Math.round((current + delta) / 100) * 100);
    handleStartingBalanceChange(next);
  };

  // Synchronize initialTab whenever modal opens
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Compute responsive scale for the 1200x675 card preview inside modal container
  useEffect(() => {
    if (!isOpen) return;

    const updateScale = () => {
      if (typeof window === 'undefined') return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Realistic vertical overhead consumed by modal chrome:
      // Backdrop outer padding (16-32px), top bar (~54px), container padding (20-36px), footer toolbar (~54px)
      const verticalOverhead = vh < 720 ? 150 : vh < 900 ? 180 : 210;
      // Horizontal overhead: outer padding + modal borders + internal padding
      const horizontalOverhead = vw < 640 ? 32 : 56;

      const availableW = Math.max(280, vw - horizontalOverhead);
      const availableH = Math.max(200, vh - verticalOverhead);

      const scaleW = availableW / 1200;
      const scaleH = availableH / 675;

      const targetScale = Math.min(1, Math.max(0.3, Math.min(scaleW, scaleH)));
      setScale(Number(targetScale.toFixed(3)));
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [isOpen]);

  // Extract / Calculate Key Metrics
  const metrics = data?.metrics;
  const currencySymbol = data?.currencySymbol || '$';

  const pnlVal = useMemo(() => {
    const val = metrics?.net_pnl ?? metrics?.net_profit ?? metrics?.realized_pnl ?? metrics?.total_pnl ?? 0;
    return typeof val === 'number' ? val : Number(val) || 0;
  }, [metrics]);

  const winRate = useMemo(() => {
    const wr = metrics?.win_rate ?? 0;
    return typeof wr === 'number' ? wr : Number(wr) || 0;
  }, [metrics]);

  const totalTrades = useMemo(() => {
    return metrics?.total_trades ?? (data?.trades?.length || 0);
  }, [metrics, data]);

  const winningTrades = useMemo(() => {
    if (typeof metrics?.winning_trades === 'number') return metrics.winning_trades;
    return (data?.trades || []).filter((t: Trade) => (t.pnl ?? 0) > 0).length;
  }, [metrics, data]);

  const losingTrades = useMemo(() => {
    if (typeof metrics?.losing_trades === 'number') return metrics.losing_trades;
    return (data?.trades || []).filter((t: Trade) => (t.pnl ?? 0) < 0).length;
  }, [metrics, data]);

  const profitFactor = useMemo(() => {
    if (metrics?.profit_factor === undefined || metrics?.profit_factor === null) return '0.00';
    if (typeof metrics.profit_factor === 'number') return metrics.profit_factor.toFixed(2);
    return String(metrics.profit_factor);
  }, [metrics]);

  const avgReturn = useMemo(() => {
    if (totalTrades > 0) return pnlVal / totalTrades;
    return typeof metrics?.avg_win === 'number' ? metrics.avg_win : 0;
  }, [pnlVal, totalTrades, metrics]);

  const sortinoRatio = useMemo(() => {
    return typeof metrics?.sortino_ratio === 'number' ? metrics.sortino_ratio.toFixed(2) : null;
  }, [metrics]);

  const sharpeRatio = useMemo(() => {
    return typeof metrics?.sharpe_ratio === 'number' ? metrics.sharpe_ratio.toFixed(2) : null;
  }, [metrics]);

  const tiltImpact = useMemo(() => {
    return typeof metrics?.tilt_pnl_impact === 'number' ? metrics.tilt_pnl_impact : 0;
  }, [metrics]);

  // Exact percentage returns computed against user's cached starting capital
  const effectiveStartingCap = startingBalance > 0 ? startingBalance : 10000;

  // Dynamic Peak-to-Trough Drawdown calculation against effectiveStartingCap
  const { maxDrawdownDollar, avgDrawdownDollar, maxDrawdownPct, avgDrawdownPct } = useMemo(() => {
    const points = data?.equity_curve || [];
    if (points.length === 0) {
      const fallbackDol = typeof metrics?.max_drawdown_dollars === 'number' ? metrics.max_drawdown_dollars : 0;
      const fallbackPct = typeof metrics?.max_drawdown === 'number' ? metrics.max_drawdown : 0;
      return {
        maxDrawdownDollar: fallbackDol,
        avgDrawdownDollar: typeof metrics?.avg_drawdown_dollars === 'number' ? metrics.avg_drawdown_dollars : 0,
        maxDrawdownPct: fallbackPct,
        avgDrawdownPct: typeof metrics?.avg_drawdown === 'number' ? metrics.avg_drawdown : 0,
      };
    }

    let runningEquityPeak = effectiveStartingCap;
    let runningDollarPeak = 0;
    let maxDropDollars = 0;
    let maxDropPct = 0;
    let sumDropDollars = 0;
    let sumDropPct = 0;

    for (let i = 0; i < points.length; i++) {
      const cumPnl = points[i].equity;
      const currentEq = effectiveStartingCap + cumPnl;
      if (currentEq > runningEquityPeak) runningEquityPeak = currentEq;
      if (cumPnl > runningDollarPeak) runningDollarPeak = cumPnl;

      const dropDollars = runningDollarPeak - cumPnl;
      const dropPct = runningEquityPeak > 0 ? ((runningEquityPeak - currentEq) / runningEquityPeak) * 100 : 0;

      if (dropDollars > maxDropDollars) maxDropDollars = dropDollars;
      if (dropPct > maxDropPct) maxDropPct = dropPct;

      sumDropDollars += dropDollars;
      sumDropPct += dropPct;
    }

    return {
      maxDrawdownDollar: maxDropDollars,
      avgDrawdownDollar: points.length > 0 ? sumDropDollars / points.length : 0,
      maxDrawdownPct: maxDropPct,
      avgDrawdownPct: points.length > 0 ? sumDropPct / points.length : 0,
    };
  }, [data?.equity_curve, effectiveStartingCap, metrics]);

  const maxDrawdownDuration = useMemo(() => {
    return metrics?.max_drawdown_duration ?? 0;
  }, [metrics]);

  const pnlPercent = useMemo(() => {
    return ((pnlVal / effectiveStartingCap) * 100).toFixed(1);
  }, [pnlVal, effectiveStartingCap]);

  const avgReturnPercent = useMemo(() => {
    return ((avgReturn / effectiveStartingCap) * 100).toFixed(2);
  }, [avgReturn, effectiveStartingCap]);

  const tiltPercent = useMemo(() => {
    return ((Math.abs(tiltImpact) / effectiveStartingCap) * 100).toFixed(1);
  }, [tiltImpact, effectiveStartingCap]);

  // Formatted strings respecting Stealth Mode (% Return)
  const displayPnl = useMemo(() => {
    if (isStealthMode) {
      return `${pnlVal >= 0 ? '+' : ''}${pnlPercent}%`;
    }
    return `${pnlVal >= 0 ? '+' : ''}${currencySymbol}${pnlVal.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [isStealthMode, pnlVal, pnlPercent, currencySymbol]);

  const displayAvgReturn = useMemo(() => {
    if (isStealthMode) {
      return `${avgReturn >= 0 ? '+' : ''}${avgReturnPercent}%`;
    }
    return `${avgReturn >= 0 ? '+' : ''}${currencySymbol}${avgReturn.toFixed(2)}`;
  }, [isStealthMode, avgReturn, avgReturnPercent, currencySymbol]);

  const displayTiltImpact = useMemo(() => {
    if (tiltImpact === 0) return '0.0% Clean';
    if (isStealthMode) {
      return `-${tiltPercent}% Loss`;
    }
    return `-$${Math.abs(tiltImpact).toFixed(2)}`;
  }, [isStealthMode, tiltImpact, tiltPercent]);

  const displayDisciplinedDelta = useMemo(() => {
    const delta = Math.abs(tiltImpact);
    if (isStealthMode) {
      return `+${tiltPercent}% Alpha`;
    }
    return `+${currencySymbol}${delta.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [isStealthMode, tiltImpact, tiltPercent, currencySymbol]);

  const displayMaxDrawdown = useMemo(() => {
    if (isStealthMode) {
      return `${maxDrawdownPct.toFixed(2)}%`;
    }
    return maxDrawdownDollar > 0
      ? `-${currencySymbol}${maxDrawdownDollar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${currencySymbol}0.00`;
  }, [isStealthMode, maxDrawdownPct, maxDrawdownDollar, currencySymbol]);

  const displayAvgDrawdown = useMemo(() => {
    if (isStealthMode) {
      return `${avgDrawdownPct.toFixed(2)}%`;
    }
    return avgDrawdownDollar > 0
      ? `-${currencySymbol}${avgDrawdownDollar.toFixed(2)}`
      : `${currencySymbol}0.00`;
  }, [isStealthMode, avgDrawdownPct, avgDrawdownDollar, currencySymbol]);

  // Starting and Current Equity display reflecting user-configured Starting Capital
  const displayStartingEquity = useMemo(() => {
    if (isStealthMode) {
      return '100.0%';
    }
    const cap = startingBalance > 0 ? startingBalance : 0;
    return `${currencySymbol}${cap.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [isStealthMode, startingBalance, currencySymbol]);

  const displayCurrentEquity = useMemo(() => {
    if (isStealthMode) {
      const returnPct = effectiveStartingCap > 0 ? (pnlVal / effectiveStartingCap) * 100 : 0;
      const totalPct = 100 + returnPct;
      return `${totalPct.toFixed(1)}%`;
    }
    const currentVal = (startingBalance > 0 ? startingBalance : 0) + pnlVal;
    return `${currentVal >= 0 ? '' : '-'}${currencySymbol}${Math.abs(currentVal).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [isStealthMode, startingBalance, pnlVal, effectiveStartingCap, currencySymbol]);

  // Date Range string
  const dateRangeStr = useMemo(() => {
    if (!data?.trades || data.trades.length === 0) return 'Recent Trading Session';
    const validTimestamps = data.trades
      .map((t: Trade) => (t.timestamp < 1e11 ? t.timestamp * 1000 : t.timestamp))
      .filter((ts: number) => !isNaN(ts) && ts > 0)
      .sort((a: number, b: number) => a - b);

    if (validTimestamps.length === 0) return 'Recent Trading Session';
    const first = new Date(validTimestamps[0]);
    const last = new Date(validTimestamps[validTimestamps.length - 1]);

    const formatOpt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    if (first.toDateString() === last.toDateString()) {
      return first.toLocaleDateString('en-US', formatOpt);
    }
    return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', formatOpt)}`;
  }, [data]);

  // Behavioral Flags
  const behavioralFlags = useMemo(() => {
    const flags: { label: string; count: number; color: string }[] = [];
    const numRevenge = metrics?.num_revenge_trades ?? 0;
    const numClusters = metrics?.num_revenge_clusters ?? 0;
    const numMartingale = metrics?.num_martingale_trades ?? 0;
    const numOvertrading = metrics?.num_overtrading_spikes ?? 0;
    const numFomo = metrics?.num_late_entries ?? 0;
    const numEarlyExits = metrics?.num_early_exits ?? 0;

    if (numRevenge > 0) flags.push({ label: 'Revenge Trade', count: numRevenge, color: 'text-rose-400 bg-slate-800 border-slate-700/60' });
    if (numClusters > 0) flags.push({ label: 'Revenge Cluster', count: numClusters, color: 'text-red-400 bg-slate-800 border-slate-700/60' });
    if (numMartingale > 0) flags.push({ label: 'Martingale Spike', count: numMartingale, color: 'text-amber-400 bg-slate-800 border-slate-700/60' });
    if (numFomo > 0) flags.push({ label: 'FOMO Entry', count: numFomo, color: 'text-sky-400 bg-slate-800 border-slate-700/60' });
    if (numOvertrading > 0) flags.push({ label: 'Overtrading Day', count: numOvertrading, color: 'text-sky-400 bg-slate-800 border-slate-700/60' });
    if (numEarlyExits > 0) flags.push({ label: 'Early Exit', count: numEarlyExits, color: 'text-blue-400 bg-slate-800 border-slate-700/60' });

    return flags;
  }, [metrics]);

  // Discipline Grade Evaluation for Execution Card
  const disciplineScore = useMemo(() => {
    const revengeCount = metrics?.num_revenge_trades ?? 0;
    const clusterCount = metrics?.num_revenge_clusters ?? 0;
    const martingaleCount = metrics?.num_martingale_trades ?? 0;
    const overtradingCount = metrics?.num_overtrading_spikes ?? 0;
    const fomoCount = metrics?.num_late_entries ?? 0;
    const earlyEntryCount = metrics?.num_early_entries ?? 0;
    const earlyExitCount = metrics?.num_early_exits ?? 0;
    const lateExitCount = metrics?.num_late_exits ?? 0;

    const penaltyScore =
      revengeCount * 3 +
      clusterCount * 4 +
      martingaleCount * 3 +
      overtradingCount * 2 +
      fomoCount +
      earlyEntryCount +
      earlyExitCount +
      lateExitCount;

    let grade = 'A+';
    let title = 'Flawless Execution Discipline';
    let letterColor = 'text-emerald-400';
    let verdict = 'Zero emotional revenge clusters or martingale spikes detected. High trade execution restraint.';

    if (penaltyScore === 0) {
      grade = 'A+';
      title = 'Institutional Execution';
      letterColor = 'text-emerald-400';
      verdict = 'Flawless rule adherence. Zero emotional revenge entries, no martingale sizing, and verified trade patience.';
    } else if (penaltyScore <= 3) {
      grade = 'A';
      title = 'High Trading Discipline';
      letterColor = 'text-emerald-400';
      verdict = 'Solid execution discipline with isolated minor leaks. Emotional impulses are well-contained.';
    } else if (penaltyScore <= 8) {
      grade = 'B';
      title = 'Moderate Execution Drift';
      letterColor = 'text-sky-400';
      verdict = 'Minor behavioral leaks detected during drawdowns. Eliminating tilt entries will restore peak expectancy.';
    } else if (penaltyScore <= 15) {
      grade = 'C';
      title = 'Tilt Vulnerability Detected';
      letterColor = 'text-amber-400';
      verdict = 'Revenge trades and sizing adjustments after losses eroded profits. Cooldown rules advised.';
    } else {
      grade = 'F';
      title = 'Severe Tilt & Rule Breakdown';
      letterColor = 'text-rose-400';
      verdict = 'Aggressive martingale sizing and revenge clusters severely impacted equity. Immediate risk containment required.';
    }

    return {
      grade,
      title,
      letterColor,
      verdict,
      penaltyScore,
      revengeCount,
      clusterCount,
      martingaleCount,
      overtradingCount,
      fomoCount,
      earlyEntryCount,
      earlyExitCount,
      lateExitCount,
    };
  }, [metrics]);

  // Key takeaways extracted from AI Audit markdown
  const parsedAuditPoints = useMemo(() => {
    if (!auditResult?.audit) {
      return [
        { text: 'Systematic discipline adherence verified across trade execution sample.', category: 'Execution Control' },
        { text: 'Risk-adjusted expectancy remains stable with minimal emotional interference.', category: 'Risk Protocol' },
        { text: 'Recommend maintaining position size caps following drawdown sequences.', category: 'Prescription' },
      ];
    }

    const lines = auditResult.audit.split('\n');
    const points: { num?: string; text: string; category?: string }[] = [];
    let currentCategory = 'Key Finding';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
        currentCategory = trimmed.replace(/^#+\s+/, '').replace(/\*\*/g, '');
        continue;
      }
      const numberedMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)/);
      if (numberedMatch) {
        points.push({
          num: numberedMatch[1],
          text: numberedMatch[2].replace(/\*\*/g, ''),
          category: currentCategory,
        });
      } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        points.push({
          text: trimmed.replace(/^[\*\-]\s+/, '').replace(/\*\*/g, ''),
          category: currentCategory,
        });
      } else if (trimmed.length > 35 && points.length < 4 && !trimmed.startsWith('---')) {
        points.push({
          text: trimmed.replace(/\*\*/g, ''),
          category: currentCategory,
        });
      }
      if (points.length >= 4) break;
    }

    return points.length > 0
      ? points
      : [
          { text: 'Systematic discipline adherence verified across trade execution sample.', category: 'Execution Control' },
          { text: 'Risk-adjusted expectancy remains stable with minimal emotional interference.', category: 'Risk Protocol' },
          { text: 'Recommend maintaining position size caps following drawdown sequences.', category: 'Prescription' },
        ];
  }, [auditResult]);

  // Dynamic Executive Verdict quote under Execution Restraint (adapts to AI audit or rule adherence)
  const aiExecutiveVerdict = useMemo(() => {
    const prescriptionPoint = parsedAuditPoints.find(
      (p) =>
        p.category?.toLowerCase().includes('prescription') ||
        p.category?.toLowerCase().includes('directive') ||
        p.category?.toLowerCase().includes('recommendation')
    );
    if (prescriptionPoint?.text) {
      return prescriptionPoint.text;
    }
    if (parsedAuditPoints.length > 0 && parsedAuditPoints[parsedAuditPoints.length - 1]?.text) {
      return parsedAuditPoints[parsedAuditPoints.length - 1].text;
    }
    return disciplineScore.verdict;
  }, [parsedAuditPoints, disciplineScore.verdict]);

  // Mini Equity Sparkline SVG generation (Overview Card)
  const sparklineData = useMemo(() => {
    const points = data?.equity_curve || [];
    const disciplined = data?.disciplined_equity_curve || [];
    if (points.length < 2) return null;

    const values = points.map((p) => p.equity);
    const discValues = disciplined.map((p) => p.equity);
    const allValues = [...values, ...discValues];

    const minVal = Math.min(...allValues, 0);
    const maxVal = Math.max(...allValues, 0.01);
    const range = maxVal - minVal || 1;

    const width = 480;
    const height = 120;
    const padding = 10;

    const getX = (idx: number, total: number) => padding + (idx / Math.max(1, total - 1)) * (width - 2 * padding);
    const getY = (val: number) => height - padding - ((val - minVal) / range) * (height - 2 * padding);

    // Build actual path
    const pathD = points.reduce((acc, pt, idx) => {
      const x = getX(idx, points.length);
      const y = getY(pt.equity);
      return idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, '');

    // Build area path
    const firstX = getX(0, points.length);
    const lastX = getX(points.length - 1, points.length);
    const zeroY = getY(0);
    const areaD = `${pathD} L ${lastX.toFixed(1)} ${zeroY.toFixed(1)} L ${firstX.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    // Disciplined path if exists
    let discPathD = '';
    if (disciplined.length >= 2) {
      discPathD = disciplined.reduce((acc, pt, idx) => {
        const x = getX(idx, disciplined.length);
        const y = getY(pt.equity);
        return idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }, '');
    }

    const lastPoint = {
      x: getX(points.length - 1, points.length),
      y: getY(points[points.length - 1].equity),
      val: points[points.length - 1].equity,
    };

    return { pathD, areaD, discPathD, lastPoint, zeroY, width, height };
  }, [data]);

  // Large High-Res Sparkline SVG generation (Dedicated Equity Card)
  const largeEquityData = useMemo(() => {
    const points = data?.equity_curve || [];
    const disciplined = data?.disciplined_equity_curve || [];
    if (points.length < 2) return null;

    const values = points.map((p) => p.equity);
    const discValues = disciplined.map((p) => p.equity);
    const allValues = [...values, ...discValues];

    const minVal = Math.min(...allValues, 0);
    const maxVal = Math.max(...allValues, 0.01);
    const range = maxVal - minVal || 1;

    const width = 1136;
    const height = 270;
    const padding = 16;

    const getX = (idx: number, total: number) => padding + (idx / Math.max(1, total - 1)) * (width - 2 * padding);
    const getY = (val: number) => height - padding - ((val - minVal) / range) * (height - 2 * padding);

    const pathD = points.reduce((acc, pt, idx) => {
      const x = getX(idx, points.length);
      const y = getY(pt.equity);
      return idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }, '');

    const firstX = getX(0, points.length);
    const lastX = getX(points.length - 1, points.length);
    const zeroY = getY(0);
    const areaD = `${pathD} L ${lastX.toFixed(1)} ${zeroY.toFixed(1)} L ${firstX.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    let discPathD = '';
    if (disciplined.length >= 2) {
      discPathD = disciplined.reduce((acc, pt, idx) => {
        const x = getX(idx, disciplined.length);
        const y = getY(pt.equity);
        return idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }, '');
    }

    const lastPoint = {
      x: getX(points.length - 1, points.length),
      y: getY(points[points.length - 1].equity),
      val: points[points.length - 1].equity,
    };

    return { pathD, areaD, discPathD, lastPoint, zeroY, width, height };
  }, [data]);

  // Handler: Download High-Res PNG
  const handleDownloadPng = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#070a0f',
        width: 1200,
        height: 675,
        style: {
          transform: 'none',
          transformOrigin: '0 0',
          position: 'static',
          width: '1200px',
          height: '675px',
        },
      });

      const link = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 10);
      link.download = `clearer-trade-${activeTab}-${timestamp}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err: unknown) {
      console.error('Failed to export share card PNG:', err);
      setExportError('Failed to generate PNG image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Handler: Copy to Clipboard
  const handleCopyToClipboard = async () => {
    if (!cardRef.current || isExporting) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#070a0f',
        width: 1200,
        height: 675,
        style: {
          transform: 'none',
          transformOrigin: '0 0',
          position: 'static',
          width: '1200px',
          height: '675px',
        },
      });

      if (!blob) {
        throw new Error('Blob generation returned null');
      }

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 3000);
      } else {
        throw new Error('ClipboardItem API not supported in this browser environment');
      }
    } catch (err: unknown) {
      console.error('Failed to copy image to clipboard:', err);
      handleDownloadPng();
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-card-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1360px] bg-slate-950/95 border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[96vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar: Perfectly Centered Nav & Close */}
        <div className="relative flex items-center justify-center px-4 sm:px-6 py-2.5 sm:py-3 border-b border-slate-800/80 bg-slate-900/60 shrink-0 min-h-[52px]">
          {/* Center: Variant Segmented Tabs */}
          <div className="flex items-center h-[34px] bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full max-w-[460px] overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex-1 h-full px-2.5 rounded-lg font-bold transition-all flex items-center justify-center space-x-1.5 whitespace-nowrap text-xs cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-[#00E599]" />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('equity')}
              className={`flex-1 h-full px-2.5 rounded-lg font-bold transition-all flex items-center justify-center space-x-1.5 whitespace-nowrap text-xs cursor-pointer ${
                activeTab === 'equity'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LineChartIcon className="w-3.5 h-3.5 text-[#A4D8FF]" />
              <span>Equity Curve</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('execution')}
              className={`flex-1 h-full px-2.5 rounded-lg font-bold transition-all flex items-center justify-center space-x-1.5 whitespace-nowrap text-xs cursor-pointer ${
                activeTab === 'execution'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-[#00E599]" />
              <span>Execution</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`flex-1 h-full px-2.5 rounded-lg font-bold transition-all flex items-center justify-center space-x-1.5 whitespace-nowrap text-xs cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-[#A4D8FF]" />
              <span>AI Audit</span>
            </button>
          </div>

          {/* Right: Close Modal Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3.5 sm:right-6 w-[34px] h-[34px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer shrink-0"
            aria-label="Close share modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body / Scaled Preview Frame */}
        <div
          ref={containerRef}
          className="p-2 sm:p-4 md:p-6 bg-[#04070c] flex flex-col items-center justify-center overflow-hidden flex-1"
        >
          {exportError && (
            <div className="w-full mb-4 p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{exportError}</span>
            </div>
          )}

          {/* Scaled Wrapper: fits the 1200x675 card cleanly on smaller viewports */}
          <div
            style={{
              width: Math.round(1200 * scale),
              height: Math.round(675 * scale),
              transition: 'width 0.15s ease, height 0.15s ease',
            }}
            className="relative select-none shadow-2xl rounded-2xl overflow-hidden border border-slate-800/80 shrink-0"
          >
            {/* The Actual 1200x675 DOM Card Captured by html-to-image */}
            <div
              ref={cardRef}
              style={{
                width: 1200,
                height: 675,
                transform: `scale(${scale})`,
                transformOrigin: '0 0',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
              className="bg-[#0B0F19] text-white p-8 flex flex-col justify-between overflow-hidden font-sans"
            >
              {/* Subtle High-Tech Background Pattern & Glow Gradients */}
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.035]"
                style={{
                  backgroundImage: `radial-gradient(#A4D8FF 1.5px, transparent 1.5px)`,
                  backgroundSize: '24px 24px',
                }}
              />
              <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#A4D8FF]/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* ────────────────────────────────────────────────────────── */}
              {/* VARIANT 1: EXECUTIVE SUMMARY OVERVIEW (DEFAULT)             */}
              {/* ────────────────────────────────────────────────────────── */}
              {activeTab === 'overview' && (
                <>
                  {/* Header */}
                  <div className="relative z-10 flex items-center justify-between border-b border-slate-800/80 pb-4">
                    <div>
                      <div className="text-2xl font-black tracking-tight text-white italic lowercase">
                        clearer.trade
                      </div>
                      <p className="text-[11px] font-semibold text-[#A4D8FF] tracking-wider uppercase mt-0.5">
                        Executive Trading Audit &amp; Performance
                      </p>
                    </div>

                    <div className="text-right flex items-center space-x-2">
                      <div className="text-sm font-bold text-slate-200">
                        {totalTrades} Trades &bull; {dateRangeStr}
                      </div>
                    </div>
                  </div>

                  {/* Middle Content */}
                  <div className="relative z-10 flex-1 flex flex-col justify-between py-2 space-y-4">
                    {/* Hero KPI Row */}
                    <div className="grid grid-cols-4 gap-4 h-[120px]">
                      {/* Net Realized PnL */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-3.5 rounded-xl flex flex-col justify-between shadow-xl relative overflow-hidden">
                        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                          <span>{isStealthMode ? 'Net Return' : 'Net Realized PnL'}</span>
                          {pnlVal >= 0 ? (
                            <TrendingUp className="w-3.5 h-3.5 text-[#00E599]" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5 text-[#FF4D4D]" />
                          )}
                        </div>
                        <div className="my-0.5">
                          <div
                            className={`text-2xl font-black tracking-tight tabular-nums ${
                              pnlVal >= 0 ? 'text-[#00E599]' : 'text-[#FF4D4D]'
                            }`}
                          >
                            {displayPnl}
                          </div>
                        </div>
                        <div className="text-[11px] font-medium text-slate-400 tabular-nums">
                          Avg Return:{' '}
                          <span className={avgReturn >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {displayAvgReturn}
                          </span>
                        </div>
                      </div>

                      {/* Win Rate */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-3.5 rounded-xl flex flex-col justify-between shadow-xl">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                          <span>Win Rate</span>
                          <span className="text-[10px] text-[#A4D8FF] font-bold tabular-nums">
                            [{winningTrades}W / {losingTrades}L]
                          </span>
                        </div>
                        <div className="my-0.5 text-2xl font-black tracking-tight text-white tabular-nums">
                          {winRate.toFixed(1)}%
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-[#00E599] h-full rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, winRate))}%` }}
                          />
                        </div>
                      </div>

                      {/* Profit Factor */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-3.5 rounded-xl flex flex-col justify-between shadow-xl">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Profit Factor
                        </div>
                        <div className="my-0.5 text-2xl font-black tracking-tight text-[#A4D8FF] tabular-nums">
                          {profitFactor}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          {Number(profitFactor) >= 1.5 ? (
                            <span className="text-emerald-400 font-bold">Robust Edge (PF &gt; 1.5)</span>
                          ) : (
                            <span className="text-slate-400">Target Benchmark: &gt; 1.50</span>
                          )}
                        </div>
                      </div>

                      {/* Sortino & Sharpe Ratios */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-3.5 rounded-xl flex flex-col justify-between shadow-xl">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Risk-Adjusted Return
                        </div>
                        <div className="my-0.5">
                          <div className="text-xl font-black tracking-tight text-white tabular-nums">
                            {sortinoRatio || 'N/A'}{' '}
                            <span className="text-xs font-semibold text-[#A4D8FF]">Sortino</span>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          Sharpe Ratio:{' '}
                          <span className="text-slate-200 font-bold">{sharpeRatio || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Behavioral & Mini Sparkline Row */}
                    <div className="grid grid-cols-12 gap-4 flex-1 min-h-[290px]">
                      {/* Left: Behavioral Flags */}
                      <div className="col-span-7 bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between shadow-xl space-y-3 min-h-[280px]">
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                            <Activity className="w-3.5 h-3.5 text-[#A4D8FF]" />
                            <span>Behavioral &amp; Execution Leaks</span>
                          </span>
                          <span className="text-[11px] font-bold text-slate-400">
                            Audit Status:{' '}
                            {behavioralFlags.length === 0 ? (
                              <span className="text-emerald-400 font-bold">100% Clean</span>
                            ) : (
                              <span className="text-rose-400 font-bold">{behavioralFlags.length} Flag(s)</span>
                            )}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-950/80 border border-slate-800/60 p-3 rounded-xl">
                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                              Tilt &amp; Revenge Loss
                            </div>
                            <div className="text-xl font-black tabular-nums mt-1 text-[#FF4D4D]">
                              {displayTiltImpact}
                            </div>
                          </div>

                          <div className="bg-slate-950/80 border border-slate-800/60 p-3 rounded-xl">
                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                              <span>Max Drawdown</span>
                              <TrendingDown className="w-3 h-3 text-slate-500" />
                            </div>
                            <div className="text-xl font-black tabular-nums mt-1 text-slate-200">
                              {displayMaxDrawdown}
                              <span className="text-xs font-normal text-slate-400 ml-2">
                                (Avg: {displayAvgDrawdown})
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-0.5">
                          {behavioralFlags.length > 0 ? (
                            behavioralFlags.slice(0, 4).map((flag, idx) => (
                              <div
                                key={idx}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded border flex items-center space-x-1.5 tracking-tight ${flag.color}`}
                              >
                                <span className="font-bold tabular-nums">{flag.count}</span>
                                <span>{flag.label}{flag.count > 1 ? 's' : ''}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-[11px] font-semibold px-2.5 py-1 rounded bg-slate-800 border border-slate-700/60 text-slate-300 flex items-center space-x-1.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Zero Emotional Leaks Detected &bull; High Execution Discipline</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Sparkline */}
                      <div className="col-span-5 bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between shadow-xl min-h-[280px]">
                        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/60 pb-2">
                          <span className="flex items-center space-x-1.5">
                            <Zap className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Equity Trajectory</span>
                          </span>
                          <div className="flex items-center space-x-3 text-[10px] normal-case tracking-normal font-semibold">
                            <div className="flex items-center space-x-1.5 text-slate-300">
                              <span className={`w-3 h-0.5 rounded-full ${pnlVal >= 0 ? 'bg-[#00E599]' : 'bg-[#FF4D4D]'}`} />
                              <span>Actual</span>
                            </div>
                            {sparklineData?.discPathD ? (
                              <div className="flex items-center space-x-1.5 text-sky-400">
                                <span className="w-3.5 h-0 border-b-2 border-dashed border-[#38bdf8]" />
                                <span>Disciplined</span>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {sparklineData ? (
                          <div className="relative flex-1 flex items-center justify-center py-1">
                            <svg
                              viewBox={`0 0 ${sparklineData.width} ${sparklineData.height}`}
                              className="w-full h-[175px] overflow-visible"
                            >
                              <defs>
                                <linearGradient id="shareCardEquityGradOverview" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#00E599" stopOpacity="0.35" />
                                  <stop offset="100%" stopColor="#00E599" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>

                              <line
                                x1="10"
                                y1={sparklineData.zeroY}
                                x2={sparklineData.width - 10}
                                y2={sparklineData.zeroY}
                                stroke="#334155"
                                strokeDasharray="4 4"
                                strokeWidth="1"
                              />

                              <path d={sparklineData.areaD} fill="url(#shareCardEquityGradOverview)" />

                              {sparklineData.discPathD && (
                                <path
                                  d={sparklineData.discPathD}
                                  fill="none"
                                  stroke="#38bdf8"
                                  strokeWidth="2"
                                  strokeDasharray="4 4"
                                  opacity="0.75"
                                />
                              )}

                              <path
                                d={sparklineData.pathD}
                                fill="none"
                                stroke={pnlVal >= 0 ? '#00E599' : '#FF4D4D'}
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />

                              <circle
                                cx={sparklineData.lastPoint.x}
                                cy={sparklineData.lastPoint.y}
                                r="5"
                                fill={pnlVal >= 0 ? '#00E599' : '#FF4D4D'}
                                className="drop-shadow-[0_0_8px_#00E599]"
                              />
                            </svg>
                          </div>
                        ) : (
                          <div className="h-[115px] flex items-center justify-center text-xs text-slate-500">
                            <span>Insufficient trade sequence for curve sparkline</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums pt-1">
                          <span>Initial: {displayStartingEquity}</span>
                          <span className={pnlVal >= 0 ? 'text-[#00E599] font-bold' : 'text-[#FF4D4D] font-bold'}>
                            Current: {displayCurrentEquity}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="relative z-10 flex items-center justify-between border-t border-slate-800/80 pt-3.5 text-xs text-slate-400">
                    <div className="flex items-center space-x-2 font-medium">
                      <span>Stateless institutional trading journal &amp; analytics</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {new Date().toISOString().slice(0, 10)}
                    </div>
                  </div>
                </>
              )}

              {/* ────────────────────────────────────────────────────────── */}
              {/* VARIANT 2: EQUITY & DISCIPLINE CURVE CARD                  */}
              {/* ────────────────────────────────────────────────────────── */}
              {activeTab === 'equity' && (
                <>
                  {/* Header */}
                  <div className="relative z-10 flex items-center justify-between border-b border-slate-800/80 pb-4">
                    <div>
                      <div className="text-2xl font-black tracking-tight text-white italic lowercase">
                        clearer.trade
                      </div>
                      <p className="text-[11px] font-semibold text-[#A4D8FF] tracking-wider uppercase mt-0.5">
                        Equity Trajectory &amp; Drawdown Resilience Audit
                      </p>
                    </div>

                    <div className="text-right flex items-center space-x-2">
                      <div className="text-sm font-bold text-slate-200">
                        {totalTrades} Trades &bull; {dateRangeStr}
                      </div>
                    </div>
                  </div>

                  {/* Middle Content */}
                  <div className="relative z-10 flex-1 flex flex-col justify-between py-2 space-y-3">
                    {/* Top Stats Ribbon (4 Metrics) */}
                    <div className="grid grid-cols-4 gap-4">
                      {/* Net Trajectory */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-xl flex flex-col justify-between shadow-xl">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          {isStealthMode ? 'Net Return' : 'Net Realized Return'}
                        </span>
                        <div
                          className={`text-2xl font-black tabular-nums my-0.5 ${
                            pnlVal >= 0 ? 'text-[#00E599]' : 'text-[#FF4D4D]'
                          }`}
                        >
                          {displayPnl}
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Win Rate: <strong className="text-white">{winRate.toFixed(1)}%</strong>
                        </span>
                      </div>

                      {/* Disciplined Edge */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-xl flex flex-col justify-between shadow-xl">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Disciplined Edge
                        </span>
                        <div className="text-2xl font-black tabular-nums my-0.5 text-sky-400">
                          {displayDisciplinedDelta}
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {tiltImpact < 0 ? 'Additional Edge Without Tilt' : '100% Rule Compliance'}
                        </span>
                      </div>

                      {/* Max Drawdown */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-xl flex flex-col justify-between shadow-xl">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Peak-to-Trough Drawdown
                        </span>
                        <div className="text-2xl font-black tabular-nums my-0.5 text-rose-400">
                          {displayMaxDrawdown}
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {maxDrawdownDuration > 0
                            ? `Recovery: ${maxDrawdownDuration} trades`
                            : `Avg DD: ${displayAvgDrawdown}`}
                        </span>
                      </div>

                      {/* Sharpe & Sortino */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-xl flex flex-col justify-between shadow-xl">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Risk-Adjusted Return
                        </span>
                        <div className="text-2xl font-black tabular-nums my-0.5 text-white">
                          {sortinoRatio || 'N/A'}{' '}
                          <span className="text-xs font-semibold text-[#A4D8FF]">Sortino</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Sharpe: <strong className="text-slate-200">{sharpeRatio || 'N/A'}</strong> &bull; PF: <strong className="text-[#A4D8FF]">{profitFactor}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Dedicated Wide High-Res Equity Sparkline */}
                    <div className="bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex-1 flex flex-col justify-between shadow-2xl relative min-h-[260px]">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/60 pb-2">
                        <div className="flex items-center space-x-2">
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-slate-200">Equity Trajectory</span>
                        </div>

                        {/* Dual Curve Legend */}
                        <div className="flex items-center space-x-4 text-xs normal-case tracking-normal font-semibold">
                          <div className="flex items-center space-x-1.5 text-slate-300">
                            <span className={`w-3.5 h-1 rounded-full ${pnlVal >= 0 ? 'bg-[#00E599]' : 'bg-[#FF4D4D]'}`} />
                            <span>Actual Trajectory</span>
                          </div>
                          {largeEquityData?.discPathD ? (
                            <div className="flex items-center space-x-1.5 text-sky-400">
                              <span className="w-4 h-0 border-b-2 border-dashed border-[#38bdf8]" />
                              <span>Disciplined (Zero-Tilt Baseline)</span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {largeEquityData ? (
                        <div className="relative flex-1 flex items-center justify-center py-2">
                          <svg
                            viewBox={`0 0 ${largeEquityData.width} ${largeEquityData.height}`}
                            className="w-full h-full max-h-[190px] overflow-visible"
                          >
                            <defs>
                              <linearGradient id="shareCardEquityGradWide" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#00E599" stopOpacity="0.30" />
                                <stop offset="100%" stopColor="#00E599" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Breakeven reference line */}
                            <line
                              x1="16"
                              y1={largeEquityData.zeroY}
                              x2={largeEquityData.width - 16}
                              y2={largeEquityData.zeroY}
                              stroke="#334155"
                              strokeDasharray="4 4"
                              strokeWidth="1"
                            />

                            {/* Area Gradient Fill */}
                            <path d={largeEquityData.areaD} fill="url(#shareCardEquityGradWide)" />

                            {/* Disciplined Curve if present */}
                            {largeEquityData.discPathD && (
                              <path
                                d={largeEquityData.discPathD}
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth="2.5"
                                strokeDasharray="5 5"
                                opacity="0.85"
                              />
                            )}

                            {/* Actual Equity Line */}
                            <path
                              d={largeEquityData.pathD}
                              fill="none"
                              stroke={pnlVal >= 0 ? '#00E599' : '#FF4D4D'}
                              strokeWidth="3.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />

                            {/* Glow Dot at end point */}
                            <circle
                              cx={largeEquityData.lastPoint.x}
                              cy={largeEquityData.lastPoint.y}
                              r="6"
                              fill={pnlVal >= 0 ? '#00E599' : '#FF4D4D'}
                              className="drop-shadow-[0_0_10px_#00E599]"
                            />
                          </svg>
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">
                          Insufficient trade sequence for curve sparkline
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-slate-400 font-medium pt-1 border-t border-slate-800/40">
                        <span>Starting Equity: {displayStartingEquity}</span>
                        <div className="flex items-center space-x-3">
                          {tiltImpact < 0 && (
                            <span className="text-sky-400 font-semibold text-xs">
                              Disciplined Edge: {displayDisciplinedDelta}
                            </span>
                          )}
                          <span className={pnlVal >= 0 ? 'text-[#00E599] font-bold' : 'text-[#FF4D4D] font-bold'}>
                            Current Equity: {displayCurrentEquity}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="relative z-10 flex items-center justify-between border-t border-slate-800/80 pt-3.5 text-xs text-slate-400">
                    <div className="flex items-center space-x-2 font-medium">
                      <span>Stateless institutional trading journal &amp; analytics</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {new Date().toISOString().slice(0, 10)}
                    </div>
                  </div>
                </>
              )}

              {/* ────────────────────────────────────────────────────────── */}
              {/* VARIANT 3: EXECUTION & BEHAVIORAL AUDIT CARD               */}
              {/* ────────────────────────────────────────────────────────── */}
              {activeTab === 'execution' && (
                <>
                  {/* Header */}
                  <div className="relative z-10 flex items-center justify-between border-b border-slate-800/80 pb-4">
                    <div>
                      <div className="text-2xl font-black tracking-tight text-white italic lowercase">
                        clearer.trade
                      </div>
                      <p className="text-[11px] font-semibold text-[#A4D8FF] tracking-wider uppercase mt-0.5">
                        Psychological &amp; Behavioral Execution Audit
                      </p>
                    </div>

                    <div className="text-right flex items-center space-x-2">
                      <div className="text-sm font-bold text-slate-200">
                        {totalTrades} Trades &bull; {metrics?.total_sessions || 1} Sessions Audited
                      </div>
                    </div>
                  </div>

                  {/* Middle Content */}
                  <div className="relative z-10 flex-1 flex flex-col justify-between py-2 space-y-3">
                    {/* Hero Grade Banner */}
                    <div className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-2xl flex items-center justify-between shadow-xl">
                      {/* Left: Grade Badge */}
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-16 h-16 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex items-center justify-center font-black text-3xl ${disciplineScore.letterColor}`}
                        >
                          {disciplineScore.grade}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-base font-extrabold text-white">
                              {disciplineScore.title}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
                            {disciplineScore.verdict}
                          </p>
                        </div>
                      </div>

                      {/* Right: Quick Ratios */}
                      <div className="flex items-center space-x-6 text-right border-l border-slate-800/80 pl-6">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                            Win Rate
                          </span>
                          <span className="text-xl font-extrabold text-white tabular-nums">
                            {winRate.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                            Profit Factor
                          </span>
                          <span className="text-xl font-extrabold text-[#A4D8FF] tabular-nums">
                            {profitFactor}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                            Tilt Loss
                          </span>
                          <span
                            className={`text-xl font-extrabold tabular-nums ${
                              tiltImpact < 0 ? 'text-[#FF4D4D]' : 'text-emerald-400'
                            }`}
                          >
                            {displayTiltImpact}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 2-Column Faults & Execution Quality Grid */}
                    <div className="grid grid-cols-2 gap-4 flex-1">
                      {/* Left: Emotional & Behavioral Leaks */}
                      <div className="bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between shadow-xl space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                            <span>Emotional &amp; Sizing Leaks</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 flex-1 my-1">
                          <div className="bg-slate-950/80 border border-slate-800/70 p-3.5 rounded-xl flex flex-col justify-between">
                            <span className="text-[11px] font-semibold text-slate-400">Revenge Trades</span>
                            <div className="flex items-baseline justify-between mt-2">
                              <span
                                className={`text-2xl font-black tabular-nums ${
                                  disciplineScore.revengeCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {disciplineScore.revengeCount}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 ${
                                  disciplineScore.revengeCount > 0 ? 'text-rose-400' : 'text-slate-400'
                                }`}
                              >
                                {disciplineScore.revengeCount === 0 ? 'Controlled' : 'Impulse'}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-950/80 border border-slate-800/70 p-3.5 rounded-xl flex flex-col justify-between">
                            <span className="text-[11px] font-semibold text-slate-400">Revenge Clusters</span>
                            <div className="flex items-baseline justify-between mt-2">
                              <span
                                className={`text-2xl font-black tabular-nums ${
                                  disciplineScore.clusterCount > 0 ? 'text-red-500' : 'text-emerald-400'
                                }`}
                              >
                                {disciplineScore.clusterCount}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 ${
                                  disciplineScore.clusterCount > 0 ? 'text-red-400' : 'text-slate-400'
                                }`}
                              >
                                {disciplineScore.clusterCount === 0 ? 'Zero Tilt' : 'Active Cluster'}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-950/80 border border-slate-800/70 p-3.5 rounded-xl flex flex-col justify-between">
                            <span className="text-[11px] font-semibold text-slate-400">Martingale Spikes</span>
                            <div className="flex items-baseline justify-between mt-2">
                              <span
                                className={`text-2xl font-black tabular-nums ${
                                  disciplineScore.martingaleCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                                }`}
                              >
                                {disciplineScore.martingaleCount}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 ${
                                  disciplineScore.martingaleCount > 0 ? 'text-amber-400' : 'text-slate-400'
                                }`}
                              >
                                {disciplineScore.martingaleCount === 0 ? 'Fixed Sizing' : 'Oversized'}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-950/80 border border-slate-800/70 p-3.5 rounded-xl flex flex-col justify-between">
                            <span className="text-[11px] font-semibold text-slate-400">Overtrading Days</span>
                            <div className="flex items-baseline justify-between mt-2">
                              <span
                                className={`text-2xl font-black tabular-nums ${
                                  disciplineScore.overtradingCount > 0 ? 'text-sky-400' : 'text-emerald-400'
                                }`}
                              >
                                {disciplineScore.overtradingCount}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 ${
                                  disciplineScore.overtradingCount > 0 ? 'text-sky-400' : 'text-slate-400'
                                }`}
                              >
                                {disciplineScore.overtradingCount === 0 ? 'Patience' : 'Frequency'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded-xl text-[11px] text-slate-400 flex items-center justify-between">
                          <span>Emotional Tilt Cost:</span>
                          <strong className={tiltImpact < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                            {displayTiltImpact}
                          </strong>
                        </div>
                      </div>

                      {/* Right: Execution Timing & Trade Management */}
                      <div className="bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between shadow-xl space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                            <Activity className="w-3.5 h-3.5 text-[#A4D8FF]" />
                            <span>Execution Timing &amp; Exits</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 flex-1 my-1">
                          <div className="bg-slate-950/80 border border-slate-800/70 p-3.5 rounded-xl flex flex-col justify-between">
                            <span className="text-[11px] font-semibold text-slate-400">Catching Knives (Early)</span>
                            <div className="flex items-baseline justify-between mt-2">
                              <span
                                className={`text-2xl font-black tabular-nums ${
                                  disciplineScore.earlyEntryCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                                }`}
                              >
                                {disciplineScore.earlyEntryCount}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 ${
                                  disciplineScore.earlyEntryCount > 0 ? 'text-amber-400' : 'text-slate-400'
                                }`}
                              >
                                {disciplineScore.earlyEntryCount === 0 ? 'Confirmed Entry' : 'Premature'}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-950/80 border border-slate-800/70 p-3.5 rounded-xl flex flex-col justify-between">
                            <span className="text-[11px] font-semibold text-slate-400">FOMO Chasing (Late)</span>
                            <div className="flex items-baseline justify-between mt-2">
                              <span
                                className={`text-2xl font-black tabular-nums ${
                                  disciplineScore.fomoCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                                }`}
                              >
                                {disciplineScore.fomoCount}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 ${
                                  disciplineScore.fomoCount > 0 ? 'text-amber-400' : 'text-slate-400'
                                }`}
                              >
                                {disciplineScore.fomoCount === 0 ? 'Disciplined' : 'Chased'}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-950/80 border border-slate-800/70 p-3.5 rounded-xl flex flex-col justify-between">
                            <span className="text-[11px] font-semibold text-slate-400">Cutting Winners Early</span>
                            <div className="flex items-baseline justify-between mt-2">
                              <span
                                className={`text-2xl font-black tabular-nums ${
                                  disciplineScore.earlyExitCount > 0 ? 'text-amber-300' : 'text-emerald-400'
                                }`}
                              >
                                {disciplineScore.earlyExitCount}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 ${
                                  disciplineScore.earlyExitCount > 0 ? 'text-amber-300' : 'text-slate-400'
                                }`}
                              >
                                {disciplineScore.earlyExitCount === 0 ? 'Runners Kept' : 'Fear Exit'}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-950/80 border border-slate-800/70 p-3.5 rounded-xl flex flex-col justify-between">
                            <span className="text-[11px] font-semibold text-slate-400">Holding Losers Long</span>
                            <div className="flex items-baseline justify-between mt-2">
                              <span
                                className={`text-2xl font-black tabular-nums ${
                                  disciplineScore.lateExitCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {disciplineScore.lateExitCount}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 ${
                                  disciplineScore.lateExitCount > 0 ? 'text-rose-400' : 'text-slate-400'
                                }`}
                              >
                                {disciplineScore.lateExitCount === 0 ? 'Strict Stops' : 'Stop Drift'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded-xl text-[11px] text-slate-400 flex items-center justify-between">
                          <span>Execution Discipline Index:</span>
                          <strong className="text-[#A4D8FF]">
                            {Math.max(0, 100 - disciplineScore.penaltyScore * 4)}% / 100
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="relative z-10 flex items-center justify-between border-t border-slate-800/80 pt-3.5 text-xs text-slate-400">
                    <div className="flex items-center space-x-2 font-medium">
                      <span>Stateless institutional trading journal &amp; analytics</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {new Date().toISOString().slice(0, 10)}
                    </div>
                  </div>
                </>
              )}

              {/* ────────────────────────────────────────────────────────── */}
              {/* VARIANT 4: AI AUDIT & RISK OFFICER DIAGNOSIS CARD          */}
              {/* ────────────────────────────────────────────────────────── */}
              {activeTab === 'audit' && (
                <>
                  {/* Header */}
                  <div className="relative z-10 flex items-center justify-between border-b border-slate-800/80 pb-4">
                    <div>
                      <div className="text-2xl font-black tracking-tight text-white italic lowercase">
                        clearer.trade
                      </div>
                      <p className="text-[11px] font-semibold text-[#A4D8FF] tracking-wider uppercase mt-0.5">
                        AI Risk Officer &bull; Psychological &amp; Execution Audit
                      </p>
                    </div>

                    <div className="text-right flex items-center space-x-2">
                      {auditResult?.model_name && (
                        <span className="bg-slate-800/80 px-2.5 py-1 rounded-full text-slate-200 text-[11px] font-medium border border-slate-700/60">
                          Engine: <strong className="text-[#A4D8FF]">{auditResult.model_name}</strong>
                        </span>
                      )}
                      <div className="text-sm font-bold text-slate-200">
                        {totalTrades} Trades &bull; {metrics?.total_sessions || 1} Sessions Audited
                      </div>
                    </div>
                  </div>

                  {/* Middle Content */}
                  <div className="relative z-10 flex-1 flex flex-col justify-between py-2 space-y-3">
                    {/* Top Status & Metrics Row */}
                    <div className="grid grid-cols-4 gap-4">
                      {/* Institutional Account Status Badge */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-3.5 rounded-xl flex flex-col justify-between shadow-xl">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Institutional Status
                        </span>
                        <div className="my-1">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-tight border bg-slate-800 border-slate-700/60 inline-block ${
                              auditResult?.status === 'STABLE'
                                ? 'text-emerald-400'
                                : auditResult?.status === 'PROBATION'
                                ? 'text-amber-400'
                                : auditResult?.status === 'SUSPENDED'
                                ? 'text-rose-400'
                                : 'text-[#A4D8FF]'
                            }`}
                          >
                            {auditResult?.status || 'STABLE'}
                          </span>
                        </div>
                      </div>

                      {/* Win Rate */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-3.5 rounded-xl flex flex-col justify-between shadow-xl">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Win Rate
                        </span>
                        <div className="text-2xl font-black text-white tabular-nums my-0.5">
                          {winRate.toFixed(1)}%
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {winningTrades}W / {losingTrades}L Sample
                        </span>
                      </div>

                      {/* Profit Factor */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-3.5 rounded-xl flex flex-col justify-between shadow-xl">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Profit Factor
                        </span>
                        <div className="text-2xl font-black text-[#A4D8FF] tabular-nums my-0.5">
                          {profitFactor}
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          Gross Profit / Gross Loss
                        </span>
                      </div>

                      {/* Tilt Cost */}
                      <div className="bg-slate-900/90 border border-slate-800/90 p-3.5 rounded-xl flex flex-col justify-between shadow-xl">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Emotional Tilt Impact
                        </span>
                        <div
                          className={`text-2xl font-black tabular-nums my-0.5 ${
                            tiltImpact < 0 ? 'text-[#FF4D4D]' : 'text-emerald-400'
                          }`}
                        >
                          {displayTiltImpact}
                        </div>
                      </div>
                    </div>

                    {/* Main Split: Left (Diagnostic Findings) vs Right (Risk Officer Assessment) */}
                    <div className="grid grid-cols-12 gap-4 flex-1">
                      {/* Left: Key Diagnostic Points (8 Cols) */}
                      <div className="col-span-8 bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between shadow-xl space-y-2.5">
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                            <Brain className="w-3.5 h-3.5 text-[#A4D8FF]" />
                            <span>AI Risk Officer Findings &amp; Directives</span>
                          </span>
                        </div>

                        <div className="space-y-2 flex-1 justify-center flex flex-col">
                          {parsedAuditPoints.map((pt, idx) => (
                            <div
                              key={idx}
                              className="bg-slate-950/80 border border-slate-800/70 p-2.5 rounded-xl flex items-start space-x-3 shadow-sm"
                            >
                              <div className="w-5 h-5 rounded-md bg-[#A4D8FF]/10 border border-[#A4D8FF]/30 text-[#A4D8FF] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                                {pt.num || idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                {pt.category && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#A4D8FF] block mb-0.5">
                                    {pt.category}
                                  </span>
                                )}
                                <p className="text-xs text-slate-200 leading-relaxed font-medium line-clamp-2">
                                  {pt.text}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Right: Risk Officer Scorecard (4 Cols) */}
                      <div className="col-span-4 bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between shadow-xl space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Discipline Scorecard</span>
                          </span>
                        </div>

                        {/* Grade Hero Display */}
                        <div className="flex items-center space-x-3.5 bg-slate-950/80 border border-slate-800/60 p-3 rounded-xl">
                          <div
                            className={`w-12 h-12 rounded-xl bg-slate-900 border border-slate-800/90 flex items-center justify-center font-black text-xl shrink-0 ${disciplineScore.letterColor}`}
                          >
                            {disciplineScore.grade}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">
                              {disciplineScore.title}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                              {disciplineScore.revengeCount + disciplineScore.martingaleCount === 0
                                ? 'Zero tilt clusters detected'
                                : `${disciplineScore.revengeCount} revenge, ${disciplineScore.martingaleCount} martingale`}
                            </div>
                          </div>
                        </div>

                        {/* Execution Ratios Summary */}
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Max Drawdown:</span>
                            <strong className="text-slate-200">{displayMaxDrawdown}</strong>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Downside Sortino:</span>
                            <strong className="text-[#A4D8FF]">{sortinoRatio || 'N/A'}</strong>
                          </div>
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Execution Restraint:</span>
                            <strong className="text-emerald-400">
                              {Math.max(0, 100 - disciplineScore.penaltyScore * 4)}% / 100
                            </strong>
                          </div>
                        </div>

                        {/* Quote Box */}
                        <div className="p-2.5 bg-slate-950/90 border border-slate-800/70 rounded-xl text-[10px] text-slate-400 leading-relaxed italic border-l-2 border-l-[#A4D8FF]">
                          &ldquo;{aiExecutiveVerdict}&rdquo;
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="relative z-10 flex items-center justify-between border-t border-slate-800/80 pt-3.5 text-xs text-slate-400">
                    <div className="flex items-center space-x-2 font-medium">
                      <span>Stateless institutional trading journal &amp; analytics</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {new Date().toISOString().slice(0, 10)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Modal Bottom Toolbar & Export Actions */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-3 border-t border-slate-800/80 bg-slate-900/60 gap-3 shrink-0">
          {/* Left: Card Display Settings */}
          <div className="flex items-center space-x-2.5">
            {/* Starting Balance Input with tight custom steppers */}
            <div
              className="flex items-center h-[34px] bg-slate-950 pl-2.5 pr-1 rounded-xl border border-slate-800 text-xs shadow-inner shrink-0 focus-within:border-[#A4D8FF]/50 transition-colors"
              title="Your initial account starting capital. Saved automatically in browser to compute exact portfolio % returns."
            >
              <span className="text-slate-400 font-semibold text-xs whitespace-nowrap mr-0.5">
                Starting Cap:
              </span>
              <span className="text-[#A4D8FF] font-bold text-xs">{currencySymbol}</span>
              <input
                type="number"
                min="100"
                step="500"
                value={startingBalance || ''}
                onChange={(e) => handleStartingBalanceChange(Number(e.target.value) || 0)}
                placeholder="10000"
                className="w-13 bg-transparent text-white font-bold text-xs focus:outline-none tabular-nums placeholder-slate-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-0.5 pr-0.5 text-left"
              />
              <div className="flex flex-col border-l border-slate-800/80 pl-0.5 ml-0.5 h-[22px] justify-center">
                <button
                  type="button"
                  onClick={() => incrementStartingBalance(500)}
                  className="text-slate-400 hover:text-white hover:bg-slate-800 rounded p-0 leading-none h-2.5 w-3 flex items-center justify-center transition-colors cursor-pointer"
                  title="Increase by $500"
                  aria-label="Increase starting balance"
                >
                  <ChevronUp className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => incrementStartingBalance(-500)}
                  className="text-slate-400 hover:text-white hover:bg-slate-800 rounded p-0 leading-none h-2.5 w-3 flex items-center justify-center transition-colors cursor-pointer"
                  title="Decrease by $500"
                  aria-label="Decrease starting balance"
                >
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>

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
              disabled={isExporting || !data}
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
              disabled={isExporting || !data}
              className={`h-[34px] px-4 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center space-x-2 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer ${
                isCopied
                  ? 'bg-emerald-500 text-black shadow-emerald-500/20'
                  : 'bg-[#A4D8FF] hover:bg-[#85c6f5] text-slate-950 shadow-[#A4D8FF]/10'
              }`}
            >
              {isCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
                  <span>Copied!</span>
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
