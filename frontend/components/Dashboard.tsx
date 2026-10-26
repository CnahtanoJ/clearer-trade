'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  UploadCloud,
  AlertOctagon,
  Loader2,
  ShieldCheck,
  Edit3,
  Printer,
  Zap,
  Info,
  ExternalLink,
  CheckCircle,
  Download,
  SlidersHorizontal,
  Share2,
} from 'lucide-react';
import { ProcessedData, AuditResponse, Trade, AutoConfig } from '@/types';
import {
  fetchDemoData,
  requestAiAudit,
  reanalyzeTradingLog,
  downloadCsvTemplate,
  enrichTicksAPI,
  autoDetectCsvSettings,
} from '@/lib/api';

import EquityChart from './EquityChart';
import TradeTable from './TradeTable';
import ScatterChart from './ScatterChart';
import DonutChart from './DonutChart';
import RegimeChart from './RegimeChart';
import SessionBubbleChart from './SessionBubbleChart';
import StrategyMatrix from './StrategyMatrix';
import DataEditorModal from './DataEditorModal';
import HeatmapChart from './HeatmapChart';
import HoldTimeChart from './HoldTimeChart';
import ColumnMapperModal from './ColumnMapperModal';
import TermsModal from './TermsModal';
import PrivacyModal from './PrivacyModal';
import ShareCardModal from './ShareCardModal';

interface DashboardProps {
  accessToken?: string;
  traderId?: string;
  onOpenDisclaimer?: () => void;
}

function detectDelimiter(line: string): string {
  const delimiters = [',', ';', '\t', '|'];
  let maxCount = 0;
  let detected = ',';
  for (const d of delimiters) {
    const count = (line.match(new RegExp(`\\${d}(?=(?:[^"]*"[^"]*")*[^"]*$)`, 'g')) || []).length;
    if (count > maxCount) {
      maxCount = count;
      detected = d;
    }
  }
  return detected;
}

function parseCsvLine(line: string, delimiter?: string): string[] {
  const delim = delimiter || detectDelimiter(line);
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === delim && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

function parseInlineBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="text-slate-200 font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function renderFormattedAudit(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div className="space-y-2 text-xs text-slate-300 leading-relaxed font-sans">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        if (trimmed.startsWith('# ')) {
          return (
            <h3 key={idx} className="text-sm font-black text-slate-200 uppercase tracking-wider border-b border-slate-800/50 pb-2 mt-4 mb-2">
              {trimmed.replace(/^#\s+/, '')}
            </h3>
          );
        }

        if (trimmed.startsWith('## ')) {
          return (
            <h4 key={idx} className="text-xs font-bold text-[#A4D8FF] uppercase tracking-widest mt-4 mb-1">
              {trimmed.replace(/^##\s+/, '')}
            </h4>
          );
        }

        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numberedMatch) {
          const num = numberedMatch[1];
          const content = numberedMatch[2];
          return (
            <div key={idx} className="flex items-start space-x-2.5 bg-slate-900/80 border border-slate-800/50 p-3 rounded-lg my-1.5 shadow-sm">
              <span className="flex-shrink-0 w-5 h-5 bg-[#A4D8FF]/10 text-[#A4D8FF] font-bold border border-amber-500/20 rounded flex items-center justify-center text-[10px]">
                {num}
              </span>
              <div className="text-slate-200 text-xs font-medium">
                {parseInlineBold(content)}
              </div>
            </div>
          );
        }

        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          const content = trimmed.replace(/^[\*\-]\s+/, '');
          return (
            <div key={idx} className="flex items-start space-x-2 my-1 pl-1">
              <span className="text-[#A4D8FF] font-bold mt-0.5">•</span>
              <div className="text-slate-300">
                {parseInlineBold(content)}
              </div>
            </div>
          );
        }

        return (
          <p key={idx} className="text-slate-300">
            {parseInlineBold(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

// Tooltip Helper Component
const MetricTooltip = ({ text, align = 'center' }: { text: string; align?: 'center' | 'right' | 'left' }) => {
  let posClass = 'left-1/2 -translate-x-1/2';
  if (align === 'right') {
    posClass = 'right-0 left-auto transform-none';
  } else if (align === 'left') {
    posClass = 'left-0 transform-none';
  }

  return (
    <span className="group relative inline-flex items-center ml-1 text-slate-500 hover:text-slate-300 cursor-help">
      <Info className="w-3 h-3 shrink-0" />
      <span className={`pointer-events-none absolute bottom-full ${posClass} mb-1.5 hidden group-hover:block w-48 p-2 bg-slate-900 border border-slate-700 text-slate-200 text-[10px] leading-tight rounded-md shadow-2xl z-[100] text-center font-normal`}>
        {text}
      </span>
    </span>
  );
};

export default function Dashboard({
  accessToken,
  traderId,
  onOpenDisclaimer,
}: DashboardProps) {
  const [data, setData] = useState<ProcessedData | null>(null);
  const [activeFilename, setActiveFilename] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [autoConfig, setAutoConfig] = useState<AutoConfig | null>(null);
  const [renderStage, setRenderStage] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Restore active dataset from sessionStorage on mount (preserves synced klines across page refresh)
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('cs_active_dataset');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.success && Array.isArray(parsed.trades)) {
          if (traderId === 'GUEST (DEMO)' && !parsed.metrics?.is_demo) {
            sessionStorage.removeItem('cs_active_dataset');
            return;
          }
          if (traderId === 'GUEST (FREE)' && parsed.metrics?.is_demo) {
            sessionStorage.removeItem('cs_active_dataset');
            return;
          }
          setData(parsed);
        }
      }
    } catch {
      // Ignore cache restore errors
    }
  }, [traderId]);

  // Save active dataset to sessionStorage on change
  useEffect(() => {
    if (data) {
      try {
        sessionStorage.setItem('cs_active_dataset', JSON.stringify(data));
      } catch (err) {
        console.warn('sessionStorage full or unavailable, attempting compressed fallback cache:', err);
        try {
          // Fallback for large datasets (>5MB): strip heavy debug logs & limit stored trade payload to essential chart/metric fields
          const lightData = {
            ...data,
            metrics: {
              ...data.metrics,
              tick_sync_debug: [],
            },
            trades: (data.trades || []).slice(0, 300).map((t) => ({
              id: t.id,
              timestamp: t.timestamp,
              date: t.date,
              symbol: t.symbol,
              asset: t.asset,
              side: t.side,
              px: t.px,
              pnl: t.pnl,
              is_open: t.is_open,
              strategy_tag: t.strategy_tag,
              mae_pct: t.mae_pct,
              mfe_pct: t.mfe_pct,
              t_plus_30m_px: t.t_plus_30m_px,
              is_live_tick: t.is_live_tick,
              data_source: t.data_source,
            })),
          };
          sessionStorage.setItem('cs_active_dataset', JSON.stringify(lightData));
        } catch {
          // Storage strictly unavailable or completely full, ignore
        }
      }
    }
  }, [data]);

  // Stagger chart rendering to minimize main thread blocking
  useEffect(() => {
    if (!data) {
      setRenderStage(0);
      return;
    }
    setRenderStage(1); // Render primary layout & EquityChart immediately
    const timer = setTimeout(() => {
      setRenderStage(2); // Render other secondary charts after 150ms
    }, 150);
    return () => clearTimeout(timer);
  }, [data]);

  // Chart Theme Switcher (Classic vs Monochrome)
  const chartTheme = 'classic';

  // Modals & Drawers
  const [isDataEditorOpen, setIsDataEditorOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isShareCardOpen, setIsShareCardOpen] = useState(false);

  // AI Audit state (Pure BYOK)
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [byokKey, setByokKey] = useState('');
  const [customModelInput, setCustomModelInput] = useState('deepseek/deepseek-chat');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('openrouter_api_key');
      if (savedKey) setByokKey(savedKey);
      const savedModel = localStorage.getItem('openrouter_model');
      if (savedModel) setCustomModelInput(savedModel);
    }
  }, []);

  const handleKeyChange = (val: string) => {
    setByokKey(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('openrouter_api_key', val);
    }
  };

  const handleModelChange = (val: string) => {
    setCustomModelInput(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('openrouter_model', val);
    }
  };

  // Column Mapper state
  const [isColumnMapperOpen, setIsColumnMapperOpen] = useState(false);
  const [isManualMapping, setIsManualMapping] = useState(false);
  const [mapperCsvHeaders, setMapperCsvHeaders] = useState<string[]>([]);
  const [mapperSampleRows, setMapperSampleRows] = useState<Record<string, unknown>[]>([]);
  const [rawCsvText, setRawCsvText] = useState('');
  const [isEnrichingTicks, setIsEnrichingTicks] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState(10);

  const isPro = true;

  const handleEnrichTicks = async () => {
    if (!data?.trades || data.trades.length === 0) return;
    setIsEnrichingTicks(true);
    setEnrichProgress(15);

    const interval = setInterval(() => {
      setEnrichProgress((prev) => (prev >= 85 ? 85 : prev + 15));
    }, 200);

    try {
      const isDemoSession = Boolean(data?.metrics?.is_demo || traderId === 'GUEST (DEMO)');
      const res = await enrichTicksAPI(
        data.trades as unknown as Record<string, unknown>[],
        accessToken,
        Boolean(data?.metrics?.is_consolidated),
        isDemoSession
      );
      if (res && res.success) {
        setEnrichProgress(100);
        setTimeout(() => {
          setData(res);
        }, 200);
      } else {
        alert(res?.error || 'Tick enrichment failed. Please try again.');
      }
    } catch (e) {
      console.error('Enrich ticks failed:', e);
      alert('Failed to connect to tick enrichment backend.');
    } finally {
      clearInterval(interval);
      setTimeout(() => {
        setIsEnrichingTicks(false);
        setEnrichProgress(10);
      }, 300);
    }
  };

  const processCsvFile = useCallback((file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Please provide a valid .csv file.');
      return;
    }

    setActiveFilename(file.name);
    setUploading(true);
    setUploadError(null);
    setAuditResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setRawCsvText(text);
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length > 0) {
          const headers = parseCsvLine(lines[0]);
          setMapperCsvHeaders(headers);

          const samples: Record<string, unknown>[] = [];
          for (let i = 1; i < Math.min(lines.length, 6); i++) {
            const row = parseCsvLine(lines[i]);
            const obj: Record<string, unknown> = {};
            headers.forEach((h, idx) => {
              obj[h] = row[idx] || '';
            });
            samples.push(obj);
          }
          setMapperSampleRows(samples);

          const autoSettings = autoDetectCsvSettings(headers, samples);
          setAutoConfig(autoSettings);

          // Open column mapping verification modal immediately
          setIsManualMapping(false);
          setIsColumnMapperOpen(true);
        } else {
          setUploadError('The selected CSV file appears to be empty.');
        }
      }
      setUploading(false);
    };

    reader.onerror = () => {
      setUploadError('Failed to read CSV file.');
      setUploading(false);
    };

    reader.readAsText(file);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processCsvFile(file);
    }
    // Reset input value so selecting same file works again
    e.target.value = '';
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types?.includes('Files')) {
      dragCounterRef.current += 1;
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processCsvFile(file);
    }
  }, [processCsvFile]);

  const handleLoadDemo = async () => {
    setActiveFilename('Demo Sample Trading Journal');
    setUploading(true);
    setUploadError(null);
    setAuditResult(null);
    try {
      sessionStorage.removeItem('cs_active_dataset');
    } catch {
      // Ignore
    }

    try {
      const res = await fetchDemoData(accessToken);
      if (res.success) {
        if (res.metrics) {
          res.metrics.has_tick_data = false;
        }
        setData(res);
      } else {
        setUploadError(res.error || 'Failed to load demo dataset.');
      }
    } catch {
      setUploadError('Failed to connect to backend demo endpoint.');
    } finally {
      setUploading(false);
    }
  };

  const handleReanalyzeTrades = async (updatedTrades: Trade[], tokenOverride?: string, forceConsolidated?: boolean) => {
    setUploading(true);
    const activeToken = tokenOverride !== undefined ? tokenOverride : accessToken;
    try {
      const isConsol = forceConsolidated !== undefined ? forceConsolidated : Boolean(data?.metrics?.is_consolidated);
      const isDemoSession = Boolean(data?.metrics?.is_demo || traderId === 'GUEST (DEMO)');
      const res = await reanalyzeTradingLog(updatedTrades, activeToken, isConsol, isDemoSession);
      if (res.success) {
        setData(res);
      } else {
        alert(res.error || 'Re-analysis failed.');
      }
    } catch {
      alert('Failed to connect to re-analysis endpoint.');
    } finally {
      setUploading(false);
    }
  };

  const handleExecuteAudit = async () => {
    if (!data) return;

    if (!byokKey.trim()) {
      setAuditError('Please enter your OpenRouter API key to run the AI Behavioral Audit.');
      return;
    }

    setAuditLoading(true);
    setAuditError(null);

    try {
      const activeModel = customModelInput.trim() || 'deepseek/deepseek-chat';
      const res = await requestAiAudit({
        accessToken,
        useCustomKey: true,
        apiKey: byokKey.trim(),
        customModel: activeModel,
        metrics: data.metrics as unknown as Record<string, unknown>,
        trades: data.trades as unknown as Record<string, unknown>[],
      });

      if (res.success) {
        setAuditResult(res);
      } else {
        setAuditError(res.error || 'Audit request failed.');
      }
    } catch {
      setAuditError('Error connecting to backend audit service.');
    } finally {
      setAuditLoading(false);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  // Calculate 30m drift
  let totalDrift = 0;
  let driftCount = 0;
  if (data?.trades && isPro) {
    data.trades.forEach((t) => {
      const price = t.px || t.price || 0;
      const t30 = t.t_plus_30m_px || 0;
      if (price > 0 && t30 > 0) {
        const raw = (t30 - price) / price;
        const side = (t.side || '').toUpperCase();
        const isLong = side.includes('BUY') || side.includes('LONG') || side === 'B';
        const driftPct = (isLong ? raw : -raw) * 100;
        totalDrift += driftPct;
        driftCount++;
      }
    });
  }
  const avgDrift = driftCount > 0 ? totalDrift / driftCount : 0.0;
  const pnlVal = data?.metrics ? (data.metrics.realized_pnl ?? data.metrics.net_profit ?? data.metrics.net_pnl ?? data.metrics.total_pnl ?? 0) : 0;
  const unrealizedPnl = data?.metrics?.unrealized_pnl ?? 0;
  const netTotalPnl = data?.metrics?.net_total_pnl ?? data?.metrics?.total_pnl ?? (pnlVal + unrealizedPnl);
  const totalTrades = data?.metrics?.total_trades ?? data?.metrics?.realized_trades_count ?? 0;
  const avgTradePnl = totalTrades > 0 ? pnlVal / totalTrades : 0;
  const currencySymbol = data?.currencySymbol || '$';

  const { maxDrawdownDollar, avgDrawdownDollar } = useMemo(() => {
    if (typeof data?.metrics?.max_drawdown_dollars === 'number') {
      return {
        maxDrawdownDollar: data.metrics.max_drawdown_dollars,
        avgDrawdownDollar: data.metrics.avg_drawdown_dollars ?? 0,
      };
    }
    const points = data?.equity_curve || [];
    if (points.length === 0) return { maxDrawdownDollar: 0, avgDrawdownDollar: 0 };
    let peak = 0;
    let maxDrop = 0;
    let sumDrop = 0;
    for (let i = 0; i < points.length; i++) {
      const eq = points[i].equity;
      if (eq > peak) peak = eq;
      const drop = peak - eq;
      if (drop > maxDrop) maxDrop = drop;
      sumDrop += drop;
    }
    return {
      maxDrawdownDollar: maxDrop,
      avgDrawdownDollar: points.length > 0 ? sumDrop / points.length : 0,
    };
  }, [data?.metrics?.max_drawdown_dollars, data?.metrics?.avg_drawdown_dollars, data?.equity_curve]);


  return (
    <div
      className="min-h-screen text-slate-200 font-sans pb-16 relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Institutional Drag-and-Drop Viewport Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-none transition-opacity">
          <div className="max-w-md w-full bg-slate-900 border-2 border-dashed border-[#A4D8FF]/60 rounded-xl p-8 text-center space-y-3 shadow-2xl">
            <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center mx-auto text-[#A4D8FF]">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Drop CSV File to Audit
              </h4>
              <p className="text-xs text-slate-400">
                Release file to parse executions and map columns
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Navigation Header */}
      <header className="border-b border-slate-800/40 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0" data-html2canvas-ignore="true">
        <div className="flex items-center justify-between w-full sm:w-auto space-x-2">
          <div className="flex items-center space-x-2">
            <span className="font-black text-xl tracking-tight text-slate-200 italic lowercase">clearer.trade</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-4 w-full sm:w-auto">
          {data && (
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="text-xs px-2.5 sm:px-3 py-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-medium transition-all flex items-center space-x-1.5 border border-slate-800/80"
              title="Download standard CSV template for manual logging"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">CSV Template</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 space-y-6">

        {/* Dynamic Toolbar (Upload & File Info) */}
        <div className="bg-slate-900/80 border border-slate-800/40 rounded-xl p-4 sm:p-5 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4" data-html2canvas-ignore="true">
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <div className="p-2.5 bg-slate-800/80 border border-slate-700/60 rounded-lg text-[#A4D8FF] shrink-0">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider truncate">
                {activeFilename || (data?.metrics?.is_demo ? 'Demo Sample Trading Journal' : 'Trading Journal')}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto justify-start md:justify-end overflow-x-auto pb-1 md:pb-0">
            <label className="h-10 px-3.5 bg-[#A4D8FF] hover:bg-[#85c6f5] text-black font-extrabold text-xs rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-md text-center whitespace-nowrap shrink-0">
              <UploadCloud className="w-4 h-4 text-black shrink-0" />
              <span>{uploading ? 'Analyzing...' : 'Upload CSV'}</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={uploading}
              className="h-10 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 rounded-lg font-bold text-xs flex items-center justify-center space-x-1 transition-colors disabled:opacity-40 text-center whitespace-nowrap shrink-0"
            >
              <span>Load Demo</span>
            </button>

            {data && (
              <button
                type="button"
                onClick={() => {
                  if (data?.metrics?.is_demo) return;
                  setIsColumnMapperOpen(true);
                }}
                disabled={Boolean(data?.metrics?.is_demo)}
                className={`h-10 px-3 bg-slate-900 text-slate-300 border border-slate-800/80 rounded-lg font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors text-center whitespace-nowrap shrink-0 ${
                  data?.metrics?.is_demo ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-800'
                }`}
                title={data?.metrics?.is_demo ? 'Column mapping is configured for custom uploaded CSV files' : 'Edit custom CSV column mapping'}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#A4D8FF] shrink-0" />
                <span>Map Columns</span>
              </button>
            )}

            {data?.trades && (
              <button
                type="button"
                disabled={Boolean(data?.metrics?.is_demo)}
                onClick={() => {
                  if (data?.metrics?.is_demo) return;
                  const el = document.getElementById('trade-table-ledger');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`h-10 px-3 bg-slate-900 text-slate-300 border border-slate-800/80 rounded-lg font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors text-center whitespace-nowrap shrink-0 ${
                  data?.metrics?.is_demo ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-800'
                }`}
                title={data?.metrics?.is_demo ? 'Inline table editing is enabled for uploaded trade logs' : 'Edit trade data'}
              >
                <Edit3 className="w-3.5 h-3.5 text-[#A4D8FF] shrink-0" />
                <span>Edit Data</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (data?.metrics?.is_demo) return;
                handlePrintPdf();
              }}
              disabled={!data || Boolean(data?.metrics?.is_demo)}
              className={`h-10 px-3 bg-slate-900 text-slate-200 border border-slate-800/60 rounded-lg font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors text-center whitespace-nowrap shrink-0 ${
                !data || data?.metrics?.is_demo ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-800'
              }`}
              title={data?.metrics?.is_demo ? 'PDF report export is available for uploaded trade logs' : 'Export PDF Report'}
            >
              <Printer className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsShareCardOpen(true);
              }}
              disabled={!data}
              className={`h-10 px-3 bg-slate-900 text-slate-200 border border-slate-800/60 rounded-lg font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors text-center whitespace-nowrap shrink-0 ${
                !data ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-800'
              }`}
              title={!data ? 'Load or upload trades to share performance card' : 'Generate and export shareable performance card'}
            >
              <Share2 className="w-3.5 h-3.5 text-[#A4D8FF] shrink-0" />
              <span>Share Card</span>
            </button>
          </div>
        </div>

        {uploadError && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-red-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertOctagon className="w-4 h-4 shrink-0 text-red-500/90" />
              <span>{uploadError}</span>
            </div>
            {rawCsvText && (
              <button
                type="button"
                onClick={() => setIsColumnMapperOpen(true)}
                className="px-3 py-1 bg-[#A4D8FF] hover:bg-[#6898bc] text-black font-bold text-[11px] rounded transition-colors shrink-0 ml-2 shadow-md"
              >
                Map CSV Columns
              </button>
            )}
          </div>
        )}

        {/* Initial Empty State & Interactive Drop Zone */}
        {!data && !uploading && (
          <label className="block cursor-pointer py-16 px-6 text-center space-y-4 border border-dashed border-slate-800/80 hover:border-slate-700 rounded-xl bg-slate-900/30 hover:bg-slate-900/50 transition-colors">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto text-[#A4D8FF]">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Drag &amp; Drop CSV Here, or Click to Browse
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Supports Bybit, Binance, MT4/MT5, TradeLocker, or custom CSV logs.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center space-x-3 text-xs">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleLoadDemo();
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 rounded-lg font-bold text-xs transition-colors"
              >
                Load Demo
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  downloadCsvTemplate();
                }}
                className="text-slate-400 hover:text-slate-200 underline text-xs transition-colors"
              >
                Download CSV Template
              </button>
            </div>
          </label>
        )}

        {/* Dashboard Results View */}
        {data && (
          <div className="space-y-6">
            {/* Inline Executive Audit Hero Banner */}
            <div className="bg-slate-900/80 border border-slate-800/40 rounded-xl p-5 shadow-2xl relative overflow-hidden space-y-4" data-html2canvas-ignore="true">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/40 pb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    Behavior &amp; Execution Audit
                  </h3>
                  <p className="text-xs text-slate-300 font-medium">Detects revenge trades, tilt patterns &amp; execution flaws</p>
                </div>

                {/* Top Control Bar: Pure BYOK Key Input + Model Selector + Run Button */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full sm:w-auto">
                  <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                      BYOK
                    </span>
                    <input
                      type="password"
                      placeholder="OpenRouter Key (sk-or-v1-...)"
                      value={byokKey}
                      onChange={(e) => handleKeyChange(e.target.value)}
                      className="bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-44 sm:w-52 font-mono font-medium"
                    />
                    <input
                      type="text"
                      placeholder="Model ID"
                      value={customModelInput}
                      onChange={(e) => handleModelChange(e.target.value)}
                      title="OpenRouter Model ID (e.g. deepseek/deepseek-chat, google/gemini-2.5-flash)"
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none w-32 sm:w-40 font-mono"
                    />
                  </div>

                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 px-2.5 py-1.5 rounded-lg font-medium transition-colors flex items-center space-x-1 shrink-0"
                    title="Get a free/cheap OpenRouter API key"
                  >
                    <span>Get Key</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </a>

                  {/* Run Audit Button */}
                  <button
                    type="button"
                    onClick={handleExecuteAudit}
                    disabled={auditLoading || !data}
                    className="w-full sm:w-auto justify-center px-4 py-2 bg-[#A4D8FF] hover:bg-[#85c6f5] text-black font-extrabold text-xs rounded-lg transition-all shadow-md disabled:opacity-40 flex items-center space-x-1.5 shrink-0"
                  >
                    {auditLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                        <span>Auditing Log...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-black" />
                        <span>Run Audit</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Recommended Tick Sync Guidance Banner */}
              {!data.metrics.has_tick_data && (
                <div className="py-2.5 px-3.5 bg-slate-900/80 border border-slate-800/60 rounded-lg text-[11px] text-slate-300 flex items-center justify-between gap-2">
                  <span>
                    <strong className="text-[#A4D8FF] font-semibold">Recommended:</strong> Click <strong className="text-slate-200 font-semibold">Sync Market Ticks</strong> from the top toolbar before running your audit to unlock 30m price drift &amp; execution fault analytics for the AI engine.
                  </span>
                  {isPro && (
                    <button
                      onClick={handleEnrichTicks}
                      disabled={isEnrichingTicks}
                      className="px-2.5 py-1 bg-[#A4D8FF]/10 hover:bg-[#A4D8FF]/20 text-[#A4D8FF] border border-[#A4D8FF]/30 text-[10px] font-bold rounded transition-colors shrink-0"
                    >
                      Sync Ticks
                    </button>
                  )}
                </div>
              )}

              {/* Audit Display Content */}
              {auditLoading ? (
                <div className="py-8 text-center space-y-2 bg-slate-900/60 border border-slate-800/50 rounded-xl">
                  <Loader2 className="w-6 h-6 text-[#A4D8FF] animate-spin mx-auto" />
                  <p className="text-xs text-slate-300 font-medium">
                    Scanning trades for revenge entries, position size spikes, and emotional tilt patterns...
                  </p>
                </div>
              ) : auditResult ? (
                <div className="space-y-4 animate-fadeIn">
                  {(traderId === 'GUEST (DEMO)' || auditResult.model_name) && (
                    <div className="flex items-center justify-end space-x-3 text-[11px] text-slate-300 font-mono">
                      {traderId === 'GUEST (DEMO)' && (
                        <span className="text-[10px] text-[#A4D8FF] font-medium bg-[#A4D8FF]/10 px-2.5 py-1 rounded-full border border-[#A4D8FF]/30 font-sans">
                          Demo Sample Analysis ($0 Preview)
                        </span>
                      )}
                      {auditResult.model_name && (
                        <span className="bg-slate-800/80 px-2.5 py-1 rounded-full text-slate-200 font-medium">
                          Engine: <strong className="text-[#A4D8FF]">{auditResult.model_name}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  <div className="p-5 bg-slate-900/90 border border-slate-800/50 rounded-xl text-slate-300 text-xs leading-relaxed font-sans">
                    {renderFormattedAudit(auditResult.audit)}
                  </div>
                </div>
              ) : auditError ? (
                <div className="p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl text-red-300 text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertOctagon className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{auditError}</span>
                  </div>
                </div>
              ) : (
                <div className="py-3.5 px-4 bg-slate-900/60 border border-slate-800/50 rounded-xl text-xs text-slate-300">
                  No audit generated yet for this dataset. Click <strong className="text-[#A4D8FF] font-bold">Run Audit</strong> to detect psychological tilt and trade execution flaws.
                </div>
              )}
            </div>

            {/* Open Positions Guidance Banner */}
            {(() => {
              const openCount = data.metrics.open_positions_count ?? (data.trades ? data.trades.filter(t => t.is_open === true || String(t.is_open).toLowerCase() === 'true').length : 0);
              const isZeroRealized = (data.metrics.total_trades ?? 0) === 0 && openCount > 0;
              if (openCount <= 0) return null;
              return (
                <div className="py-3 px-4 bg-[#0e1626] border border-blue-500/30 rounded-xl text-xs text-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg font-sans">
                  <div className="flex items-center space-x-2.5">
                    <span className="font-extrabold text-slate-200 bg-slate-800 px-2.5 py-1 rounded text-[10px] uppercase tracking-wider shrink-0">
                      {isZeroRealized ? (data.metrics.is_consolidated ? 'Notice: Missing Exit Trades' : 'Notice: Unmatched Fills') : 'Open Positions Detected'}
                    </span>
                    <span className="text-slate-300">
                      <strong>{openCount} Open Position(s)</strong> {data.metrics.is_consolidated ? 'missing an exit price.' : 'parsed via FIFO matching.'} Open positions without exit fills have unrealized PnL and are excluded from closed trade metrics.
                    </span>
                  </div>
                  {isZeroRealized && !data.metrics.is_consolidated && (
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-[11px] font-medium text-slate-400">
                        If rows are trades:
                      </span>
                      <button
                        onClick={() => handleReanalyzeTrades(data.trades || [], undefined, true)}
                        className="text-[11px] font-bold text-slate-950 bg-[#A4D8FF] hover:bg-[#85c6f5] px-3.5 py-1.5 rounded-lg transition-all shadow-md flex items-center space-x-1"
                      >
                        <span>Switch to 1 Row = 1 Trade</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Top Stat Row: 3 Symmetrical 2-Card Columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 [page-break-inside:avoid]">
              {/* Column 1: Net Realized PnL & Total Trades */}
              <div className="bg-slate-900/80 border border-slate-800/40 p-4 rounded-xl flex items-center justify-between shadow-2xl relative min-w-0">
                <div className="space-y-1 min-w-0 flex-1 pr-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block truncate">Net Realized PnL</span>
                  <div
                    className={`text-xl sm:text-2xl font-black tabular-nums truncate ${pnlVal >= 0 ? 'text-green-400' : 'text-red-500/90'
                      }`}
                  >
                    {currencySymbol}{pnlVal >= 1_000_000 ? `${(pnlVal / 1_000_000).toFixed(2)}M` : pnlVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  {unrealizedPnl !== 0 && (
                    <div className="text-[10px] text-slate-400 font-medium space-y-0.5 pt-0.5">
                      <div>Floating: <span className={unrealizedPnl >= 0 ? 'text-blue-400 font-bold' : 'text-amber-400 font-bold'}>{currencySymbol}{unrealizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
                      <div>Total PnL: <span className={netTotalPnl >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{currencySymbol}{netTotalPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
                    </div>
                  )}
                </div>

                <div className="text-right space-y-1 border-l border-slate-800/40 pl-4 py-1 shrink-0">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center space-x-1 justify-end">
                    <span>Total Trades</span>
                    <MetricTooltip align="right" text="Grand total of all positions parsed (Closed + Open). Breakdown displayed below." />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-slate-200 tabular-nums text-right">
                    <span>{data.metrics?.total_records || ((data.metrics?.total_trades || 0) + (data.metrics?.open_positions_count || 0)) || totalTrades}</span>
                  </div>
                  {(data.metrics?.open_positions_count ?? 0) > 0 ? (
                    <div className="text-[10px] font-semibold text-slate-400 text-right tracking-tight">
                      Closed: <span className="text-slate-200">{data.metrics?.realized_trades_count ?? data.metrics?.total_trades ?? (totalTrades - (data.metrics?.open_positions_count || 0))}</span> &bull; Open: <span className="text-blue-400 font-bold">{data.metrics.open_positions_count}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Column 2: Trade Expectancy & Consistency Score */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/80 border border-slate-800/40 p-3.5 rounded-xl space-y-1 flex flex-col justify-between min-w-0">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span className="truncate">Avg Return</span>
                    <MetricTooltip text="Average dollar profit (or loss) generated per trade." />
                  </div>
                  <div
                    className={`text-lg font-bold tabular-nums truncate ${avgTradePnl >= 0 ? 'text-green-400' : 'text-red-500/90'
                      }`}
                  >
                    {currencySymbol}{avgTradePnl.toFixed(2)}
                  </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800/40 p-3.5 rounded-xl space-y-1 flex flex-col justify-between relative min-w-0">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span className="truncate">Sortino Ratio</span>
                    <MetricTooltip text="Downside Risk-Adjusted Return. A higher Sortino ratio indicates steady gains without high downside volatility." />
                  </div>
                  <div className="flex flex-col pt-1">
                    <span className="text-lg font-bold text-blue-400 tabular-nums truncate">
                      {data.metrics.sortino_ratio ?? '0.00'}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate mt-0.5">
                      Sharpe: {data.metrics.sharpe_ratio ?? '0.00'} (Total Vol)
                    </span>
                  </div>
                </div>
              </div>

              {/* Column 3: Tilt Impact & Market Ticks Proxy Button */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/80 border border-slate-800/40 p-3.5 rounded-xl space-y-1 flex flex-col justify-between relative min-w-0">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span className="truncate">Tilt Impact</span>
                    <MetricTooltip text="Total dollar loss caused by emotional revenge trades, position size spikes, and panic exits." />
                  </div>
                  <span className="text-lg font-bold tabular-nums truncate tracking-tight mt-0.5 text-[#ff6b6b]">
                    {(data.metrics.tilt_pnl_impact ?? 0) < 0 ? '-' : ''}${Math.abs(data.metrics.tilt_pnl_impact ?? 0).toFixed(2)}
                  </span>
                </div>

                {/* Market Ticks Proxy Card */}
                {!data.metrics.has_tick_data ? (
                  isEnrichingTicks ? (
                    <div className="bg-slate-900/80 border border-[#A4D8FF]/30 p-2.5 rounded-xl flex flex-col justify-between items-center text-center relative overflow-hidden shadow-[0_0_15px_rgba(164,216,255,0.05)]">
                      <span className="text-[10px] text-[#A4D8FF] font-extrabold uppercase tracking-wider flex items-center space-x-1">
                        <Loader2 className="w-3 h-3 animate-spin text-[#A4D8FF]" />
                        <span>Fetching Ticks</span>
                      </span>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden my-0.5">
                        <div
                          className="bg-[#A4D8FF] h-full rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${enrichProgress}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold">Syncing K-lines...</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEnrichTicks}
                      className="h-full w-full bg-slate-900/90 hover:bg-slate-850 border border-[#A4D8FF]/40 hover:border-[#A4D8FF]/70 text-slate-200 font-extrabold p-2 rounded-xl flex flex-col justify-center items-center text-center transition-all cursor-pointer group min-w-0 shadow-[0_0_12px_rgba(164,216,255,0.08)]"
                    >
                      <div className="flex items-center justify-center space-x-1.5 text-[11px] font-black text-slate-200 group-hover:text-[#A4D8FF] transition-colors w-full px-0.5">
                        <Zap className="w-3.5 h-3.5 text-[#A4D8FF] shrink-0 fill-[#A4D8FF]/20" />
                        <span className="truncate">Sync Market Ticks</span>
                        <MetricTooltip align="right" text="Fetches 5m public candlestick market data from Coinbase/Hyperliquid/Binance/Bybit/Yahoo to unlock MAE/MFE, 30m Post-Exit Drift, and Execution Timing analytics." />
                      </div>
                      <span className="text-[9px] text-slate-400 group-hover:text-slate-300 font-medium mt-0.5 transition-colors">
                        Unlocks MAE/MFE &amp; Timing
                      </span>
                    </button>
                  )
                ) : (
                  (() => {
                    const liveCount = data.metrics.live_tick_count ?? 0;
                    const totalCount = data.metrics.total_records || data.metrics.total_trades || (data.trades?.length || 0);
                    const fallbackCount = data.metrics.fallback_tick_count ?? Math.max(0, totalCount - liveCount);
                    const failedSyms: string[] = data.metrics.failed_tick_symbols || [];
                    const debugLogs: string[] = data.metrics.tick_sync_debug || [];
                    const failedStr = failedSyms.length > 0 ? ` Failed/proxy symbols: ${failedSyms.join(', ')}.` : '';
                    const debugStr = debugLogs.length > 0 ? ` Diagnostics: ${debugLogs.slice(0, 3).join('; ')}` : '';
                    const tooltipText = `Public 5m candlestick data synced (${liveCount}/${totalCount} live candles retrieved via multi-exchange failovers). ${fallbackCount > 0 ? `${fallbackCount} trade(s) used empirical fallback.${failedStr}${debugStr}` : '100% exact tick precision.'}`;
                    const ratioText = totalCount > 0 ? `${liveCount}/${totalCount} TICKS` : '✓ SYNCED';

                    return (
                      <div className="bg-slate-900 border border-slate-800/50 p-2.5 rounded-xl flex flex-col justify-between items-center text-center h-full min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center space-x-1">
                          <CheckCircle className="w-3 h-3 text-[#A4D8FF]/90" />
                          <span>Market Ticks</span>
                          <MetricTooltip align="right" text={tooltipText} />
                        </span>
                        <span className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider bg-emerald-950/60 border border-emerald-500/20 text-[#A4D8FF]/90 px-2 py-0.5 rounded">
                          {ratioText}
                        </span>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>

            {/* Main 3 Grouped Metric Cards (Core Performance, Behavior & Sessions, Execution Faults) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 [page-break-inside:avoid]">
              {/* Group 1: Core Performance */}
              <div className="bg-slate-900/60 border border-slate-800/40 pt-4 pb-5 px-5 rounded-xl space-y-3 flex flex-col justify-between h-full">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center space-x-2">
                  <span>Core Performance</span>
                </h4>
                <div className="grid grid-cols-2 gap-2.5 text-xs flex-1">
                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-3.5 flex flex-col justify-center">
                    <div className="text-slate-300 font-semibold text-[13px] flex items-center justify-between">
                      <span>Win Rate</span>
                      <MetricTooltip text="Percentage of trades that closed in net profit." />
                    </div>
                    <p className="mt-1 text-xl font-extrabold text-[#A4D8FF]/90 tabular-nums">
                      {data.metrics.win_rate.toFixed(1)}%
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-3.5 flex flex-col justify-center">
                    <div className="text-slate-300 font-semibold text-[13px] flex items-center justify-between">
                      <span>Profit Factor</span>
                      <MetricTooltip text="Gross Profits divided by Gross Losses. Above 1.5 indicates robust edge." />
                    </div>
                    <p className="mt-1 text-xl font-extrabold text-slate-200 tabular-nums">
                      {typeof data.metrics.profit_factor === 'number' ? data.metrics.profit_factor.toFixed(2) : data.metrics.profit_factor}
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-3.5 flex flex-col justify-center">
                    <div className="text-slate-300 font-semibold text-[13px] flex items-center justify-between">
                      <span>Avg Drawdown</span>
                      <MetricTooltip text="Average peak-to-trough dollar drop across all closed trades." />
                    </div>
                    <p className="mt-1 text-xl font-extrabold text-sky-200 tabular-nums">
                      {avgDrawdownDollar > 0 ? `-${currencySymbol}${avgDrawdownDollar.toFixed(2)}` : `${currencySymbol}0.00`}
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-3.5 flex flex-col justify-center">
                    <div className="text-slate-300 font-semibold text-[13px] flex items-center justify-between">
                      <span>Max Drawdown</span>
                      <MetricTooltip text="Maximum cumulative equity peak-to-trough dollar drop experienced." />
                    </div>
                    <div className="flex items-baseline justify-between mt-1">
                      <p className="text-xl font-extrabold text-red-500/90 tabular-nums">
                        {maxDrawdownDollar > 0 ? `-${currencySymbol}${maxDrawdownDollar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${currencySymbol}0.00`}
                      </p>
                      {(data.metrics.max_drawdown_duration ?? 0) > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Recovery: {data.metrics.max_drawdown_duration} trades
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 2: Behavior & Sessions */}
              <div className="bg-slate-900/60 border border-slate-800/40 pt-4 pb-5 px-5 rounded-xl space-y-3 flex flex-col justify-between h-full">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center space-x-2">
                  <span>Behavior & Sessions</span>
                </h4>
                <div className="grid grid-cols-2 gap-2.5 text-xs flex-1">
                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-2.5 flex flex-col justify-center">
                    <div className="text-slate-300 text-[11px] font-medium flex items-center justify-between">
                      <span>Revenge Trades</span>
                      <MetricTooltip text="Emotional re-entries opened within 15 minutes of a losing trade." />
                    </div>
                    <p className="mt-2 text-base font-bold text-red-500/90 tabular-nums">
                      {data.metrics.num_revenge_trades ?? 0}
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-2.5 flex flex-col justify-center">
                    <div className="text-slate-300 text-[11px] font-medium flex items-center justify-between">
                      <span>Revenge Clusters</span>
                      <MetricTooltip text="Rapid impulse sequences of 3+ trades opened within 5 minutes of a loss." />
                    </div>
                    <p className="mt-2 text-base font-bold text-rose-500 tabular-nums">
                      {data.metrics.num_revenge_clusters ?? 0}
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-2.5 flex flex-col justify-center">
                    <div className="text-slate-300 text-[11px] font-medium flex items-center justify-between">
                      <span>Martingale Spikes</span>
                      <MetricTooltip text="Doubling down or increasing position size >= 1.5x larger right after a loss." />
                    </div>
                    <p className="mt-2 text-base font-bold text-[#A4D8FF] tabular-nums">
                      {data.metrics.num_martingale_trades ?? 0}
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-2.5 flex flex-col justify-center">
                    <div className="text-slate-300 text-[11px] font-medium flex items-center justify-between">
                      <span>Overtrading Days</span>
                      <MetricTooltip text="Days where trade frequency exceeded 2x your normal daily average." />
                    </div>
                    <p className="mt-2 text-base font-bold text-sky-200 tabular-nums">
                      {data.metrics.num_overtrading_spikes ?? 0}
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-2.5 flex flex-col justify-center">
                    <div className="text-slate-300 text-[11px] font-medium flex items-center justify-between">
                      <span>Tilt Sessions</span>
                      <MetricTooltip text="High-loss trading sessions driven by emotional overtrading." />
                    </div>
                    <p className="mt-2 text-base font-bold text-red-500/90 tabular-nums">
                      {data.metrics.tilt_sessions ?? 0}
                    </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800/40 rounded-lg p-2.5 flex flex-col justify-center">
                    <div className="text-slate-300 text-[11px] font-medium flex items-center justify-between">
                      <span>Total Sessions</span>
                      <MetricTooltip text="Distinct trading sessions separated by 4+ hours of inactivity." />
                    </div>
                    <div className="flex items-baseline justify-between mt-0.5">
                      <p className="text-base font-bold text-slate-200 tabular-nums">{data.metrics.total_sessions ?? 0}</p>
                      <div className="text-[10px] text-slate-400 font-medium" title="Average trade frequency per session">
                        {data.metrics.avg_trades_per_session ? `${data.metrics.avg_trades_per_session.toFixed(1)} Trades/Session` : `${(data.metrics.total_trades / Math.max(1, data.metrics.total_sessions || 1)).toFixed(1)} Trades/Session`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group 3: Execution Faults */}
              {!data.metrics.has_tick_data ? (
                <div className="bg-slate-900/60 border border-slate-800/40 pt-4 pb-5 px-5 rounded-xl text-center flex flex-col items-center justify-center space-y-2 min-h-[220px] h-full shadow-2xl">
                  <span className="px-3 py-1 bg-[#A4D8FF] text-black border border-[#A4D8FF]/60 shadow-sm text-[10px] font-extrabold rounded-full uppercase tracking-wider">
                    Tick Data Required
                  </span>
                  <p className="text-sm font-bold text-slate-200">Execution Faults Locked</p>
                  <p className="text-xs text-slate-400 max-w-[240px] leading-relaxed">
                    Please run <strong className="text-[#A4D8FF]">Market Ticks Proxy</strong> from the top dashboard toolbar to fetch public candle data and unlock this feature.
                  </p>
                </div>
              ) : (
                <div className="bg-slate-900/60 border border-slate-800/40 pt-4 pb-5 px-5 rounded-xl space-y-3 flex flex-col justify-between h-full">
                  <h4 className="text-sm font-semibold text-slate-300 flex items-center space-x-2">
                    <span>Execution Faults</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2.5 text-xs flex-1">
                    <div className="bg-slate-900/60 border border-slate-800/40 rounded-lg p-3.5 flex flex-col justify-center">
                      <div className="text-slate-300 font-semibold text-[11px] sm:text-xs flex items-center justify-between gap-1">
                        <span className="shrink leading-tight">Entering Too Early</span>
                        <MetricTooltip text="Premature counter-trend entry: Entering too early before price stabilization (catching knives on longs, fading pumps on shorts)." />
                      </div>
                      <p className="mt-2.5 text-xl font-extrabold text-slate-200 tabular-nums">
                        {data.metrics.num_early_entries ?? 0}
                      </p>
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800/40 rounded-lg p-3.5 flex flex-col justify-center">
                      <div className="text-slate-300 font-semibold text-[11px] sm:text-xs flex items-center justify-between gap-1">
                        <span className="shrink leading-tight">FOMO Chasing</span>
                        <MetricTooltip text="Late entry execution: Entering late into extended moves right before a reversal (chasing tops on longs, selling bottoms on shorts)." />
                      </div>
                      <p className="mt-2.5 text-xl font-extrabold text-slate-200 tabular-nums">
                        {data.metrics.num_late_entries ?? 0}
                      </p>
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800/40 rounded-lg p-3.5 flex flex-col justify-center">
                      <div className="text-slate-300 font-semibold text-[11px] sm:text-xs flex items-center justify-between gap-1">
                        <span className="shrink leading-tight">Cutting Winners Early</span>
                        <MetricTooltip text="Closing profitable trades prematurely out of fear before reaching your target." />
                      </div>
                      <p className="mt-2.5 text-xl font-extrabold text-slate-200 tabular-nums">
                        {data.metrics.num_early_exits ?? 0}
                      </p>
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800/40 rounded-lg p-3.5 flex flex-col justify-center">
                      <div className="text-slate-300 font-semibold text-[11px] sm:text-xs flex items-center justify-between gap-1">
                        <span className="shrink leading-tight">Holding Losers Long</span>
                        <MetricTooltip text="Holding losing positions past your planned stop loss out of hope." />
                      </div>
                      <p className="mt-2.5 text-xl font-extrabold text-slate-200 tabular-nums">
                        {data.metrics.num_late_exits ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Equity Curve Chart */}
            <div className="bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 shadow-2xl space-y-4 [page-break-inside:avoid] min-h-[350px] flex flex-col justify-center">
              {renderStage >= 1 ? (
                <EquityChart
                  equityData={data.equity_curve}
                  disciplinedData={isPro ? data.disciplined_equity_curve : []}
                  pnlBars={data.chart_data?.pnl_bars}
                  theme={chartTheme}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-xs text-slate-500 font-mono">Loading chart...</div>
              )}
            </div>

            {/* ── EXECUTION ANALYSIS SECTION ────────────────────────────── */}
            <div className="space-y-6 pt-4">
              <div className="flex items-center space-x-3 border-b border-slate-800/50 pb-3">
                <h2 className="text-xl font-semibold text-slate-200 italic">
                  Execution Analysis
                </h2>
                <div className="flex-1 h-px bg-slate-800"></div>
              </div>

              {/* Grid 1: Drift Card + Regime Expectancy (2 col) vs Scatter (3 col) */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-stretch">
                    {/* Left Stack */}
                    <div className="md:col-span-2 flex flex-col space-y-6">
                      {/* Counterfactual Drift Card */}
                      {!data.metrics.has_tick_data ? (
                        <div className="bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 shadow-xl text-center flex flex-col justify-center items-center space-y-2 min-h-[120px] h-full">
                          <span className="px-3 py-1 bg-[#A4D8FF] text-black border border-[#A4D8FF]/60 shadow-sm text-[10px] font-extrabold rounded-full uppercase tracking-wider">
                            Tick Data Required
                          </span>
                          <p className="text-sm font-bold text-slate-200">30m Post-Exit Price Drift Locked</p>
                          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                            Please run <strong className="text-[#A4D8FF]">Market Ticks Proxy</strong> from the top dashboard toolbar to fetch public candle data and unlock this chart.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 shadow-xl text-center flex flex-col justify-center min-h-[120px]">
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">
                            30m Post-Entry Price Drift
                          </p>
                          <p
                            className={`text-3xl font-black mb-1 tabular-nums ${avgDrift >= 0 ? 'text-green-400' : 'text-red-500/90'
                              }`}
                          >
                            {avgDrift > 0 ? '+' : ''}
                            {avgDrift.toFixed(2)}%
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Average price move in your direction 30m post-entry
                          </p>
                        </div>
                      )}

                      {/* Performance by Market Condition */}
                      <div className="bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 shadow-xl flex-1 flex flex-col justify-between min-h-[280px]">
                        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-4">
                          Performance by Market Condition
                        </h3>
                        {renderStage >= 2 ? (
                          <RegimeChart trades={data.trades} theme={chartTheme} />
                        ) : (
                          <div className="h-[220px] flex items-center justify-center text-xs text-slate-500 font-mono">Loading condition chart...</div>
                        )}
                      </div>
                    </div>

                    {/* MAE / MFE Scatter Chart */}
                    {!data.metrics.has_tick_data ? (
                      <div className="md:col-span-3 bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 shadow-xl flex flex-col justify-center items-center text-center space-y-2 min-h-[300px] h-full">
                        <span className="px-3 py-1 bg-[#A4D8FF] text-black border border-[#A4D8FF]/60 shadow-sm text-[10px] font-extrabold rounded-full uppercase tracking-wider">
                          Tick Data Required
                        </span>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-200">Risk vs Reward (MAE / MFE) Locked</p>
                          <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                            Please run <strong className="text-[#A4D8FF]">Market Ticks Proxy</strong> from the top dashboard toolbar to fetch public candle data and unlock this chart.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="md:col-span-3 bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 shadow-xl flex flex-col justify-between min-h-[300px]">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                            Risk vs. Reward (MAE / MFE)
                          </h3>
                          {data.metrics.has_tick_data && (data.metrics.fallback_tick_count ?? 0) > 0 && (
                            <span
                              className="text-[10px] text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 rounded flex items-center space-x-1"
                              title="Some non-crypto or unindexed tickers used mathematical PnL estimates due to missing Binance Vision K-lines."
                            >
                              <Info className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>{data.metrics.fallback_tick_count} trade{data.metrics.fallback_tick_count === 1 ? '' : 's'} estimated (PnL Fallback)</span>
                            </span>
                          )}
                          {data.metrics.has_tick_data && (data.metrics.fallback_tick_count ?? 0) === 0 && (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded flex items-center space-x-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span>100% Live Exchange Ticks</span>
                            </span>
                          )}
                        </div>
                        {renderStage >= 2 ? (
                          <ScatterChart trades={data.trades} theme={chartTheme} />
                        ) : (
                          <div className="h-[280px] flex items-center justify-center text-xs text-slate-500 font-mono">Loading timing chart...</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Full-width 24x7 Day-Time Heatmap */}
                  <div className="bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 space-y-4 shadow-xl">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest border-b border-slate-800/50 pb-3 flex items-center justify-between">
                      <span>Day of Week / Time-of-Day Heatmap</span>
                      <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 bg-slate-800 border border-slate-700/60 rounded">
                        UTC Timezone
                      </span>
                    </h3>
                    {renderStage >= 2 ? (
                      <HeatmapChart data={data.metrics.heatmap_matrix || []} theme={chartTheme} />
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-xs text-slate-500 font-mono">Loading heatmap chart...</div>
                    )}
                  </div>

                  {/* Side-by-Side: Trading Sessions Distribution + Hold-Time Asymmetry */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                    <div className="bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 shadow-xl flex flex-col justify-between h-full">
                      <div>
                        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest border-b border-slate-800/50 pb-3">
                          Trading Sessions Distribution
                        </h3>
                        <div className="pt-2">
                          {renderStage >= 2 ? (
                            <SessionBubbleChart sessionsList={data.metrics.sessions_list} theme={chartTheme} />
                          ) : (
                            <div className="h-[250px] flex items-center justify-center text-xs text-slate-500 font-mono">Loading sessions chart...</div>
                          )}
                        </div>
                      </div>

                      {/* Session Analytics Summary Footer */}
                      {data.metrics.sessions_list && data.metrics.sessions_list.length > 0 && (
                        <div className="pt-3 border-t border-slate-800/40 grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-slate-900/60 border border-slate-800/40 rounded-lg p-2 flex flex-col justify-between">
                            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-center space-x-1">
                              <span>Total Sessions</span>
                              <MetricTooltip text="Distinct trading sessions grouped dynamically by 4+ hour inactivity gaps between trades." />
                            </div>
                            <span className="text-sm font-extrabold text-slate-200 tabular-nums mt-0.5">{data.metrics.sessions_list.length}</span>
                          </div>

                          <div className="bg-slate-900/60 border border-slate-800/40 rounded-lg p-2 flex flex-col justify-between">
                            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-center space-x-1">
                              <span>Tilt Sessions</span>
                              <MetricTooltip text="Negative PnL sessions driven by emotional revenge trades, position size spikes, or overtrading." />
                            </div>
                            <span className="text-sm font-extrabold text-[#A4D8FF] tabular-nums mt-0.5">
                              {data.metrics.sessions_list.filter((s: Record<string, unknown>) => Boolean(s.is_tilt)).length}
                            </span>
                          </div>

                          <div className="bg-slate-900/60 border border-slate-800/40 rounded-lg p-2 flex flex-col justify-between">
                            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-center space-x-1">
                              <span>Avg Intensity</span>
                              <MetricTooltip text="Average number of position trades executed per active trading session." />
                            </div>
                            <span className="text-sm font-extrabold text-[#A4D8FF]/90 tabular-nums mt-0.5">
                              {(data.metrics.sessions_list.reduce((a: number, b: Record<string, unknown>) => a + (Number(b.trade_count) || 1), 0) / Math.max(1, data.metrics.sessions_list.length)).toFixed(1)} / sess
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 space-y-4 shadow-xl">
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest border-b border-slate-800/50 pb-3">
                        Hold-Time Asymmetry (Winner vs Loser)
                      </h3>
                      {renderStage >= 2 ? (
                        <HoldTimeChart data={data.metrics.hold_time_analysis} theme={chartTheme} />
                      ) : (
                        <div className="h-[280px] flex items-center justify-center text-xs text-slate-500 font-mono">Loading hold-time chart...</div>
                      )}
                    </div>
                  </div>
              </div>

            {/* ── STRATEGY ANALYSIS SECTION ────────────────────────────── */}
            <div className="space-y-6 pt-4">
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-800/50 pb-3">
                <h2 className="text-xl font-semibold text-slate-200 italic">
                  Strategy Analysis
                </h2>
                <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 bg-slate-900 border border-slate-800/50 px-2.5 py-1 rounded-md font-sans">
                  <Info className="w-3.5 h-3.5 text-[#A4D8FF] shrink-0" />
                  <span>Strategy tags are optional. Untagged trades default to &quot;UNTAGGED&quot; &amp; can be tagged in the ledger below.</span>
                </div>
                <div className="flex-1 h-px bg-slate-800"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Strategy Matrix Table (2 cols) */}
                <div className="md:col-span-2">
                  {renderStage >= 2 ? (
                    <StrategyMatrix summaryMatrix={data.metrics.summary_matrix} />
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-xs text-slate-500 bg-slate-900/60 border border-slate-800/40 rounded-xl p-5 shadow-xl font-mono">Loading strategy data...</div>
                  )}
                </div>

                {/* Exposure Donut Chart (1 col) */}
                <div className="md:col-span-1 bg-slate-900/60 border border-slate-800/40 rounded-xl pt-4 pb-5 px-5 shadow-xl min-h-[280px]">
                  {renderStage >= 2 ? (
                    <DonutChart
                      assetExposure={data.chart_data?.asset_exposure}
                      directionExposure={data.chart_data?.direction_exposure}
                      strategyExposure={data.chart_data?.strategy_exposure}
                      theme={chartTheme}
                    />
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-xs text-slate-500 font-mono">Loading exposure chart...</div>
                  )}
                </div>
              </div>
            </div>

            {/* Trade History Ledger & Strategy Tag Editor Table */}
            <TradeTable
              trades={data.trades}
              onReanalyze={handleReanalyzeTrades}
              isPro={isPro}
              currencySymbol={currencySymbol}
              isConsolidated={Boolean(data?.metrics?.is_consolidated)}
            />
          </div>
        )}

        {/* ── FOOTER & LEGAL ────────────────────────────────────────────── */}
        <footer className="mt-16 border-t border-slate-800/40 pt-10 pb-12 text-xs text-slate-500 font-sans space-y-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1.5 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start">
                <span className="font-black text-xl tracking-tight text-slate-200 italic lowercase">clearer.trade</span>
              </div>
              <p className="text-[11px] text-slate-400 max-w-md">
                Stateless institutional trading journal &amp; psychological risk engine. Zero server-side log retention.
              </p>
            </div>

            {/* Navigation Links */}
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-x-3.5 gap-y-2 text-xs font-medium text-slate-400">
              <button
                onClick={() => setIsPrivacyModalOpen(true)}
                className="hover:text-slate-200 transition-colors"
              >
                Privacy Policy
              </button>
              <span className="text-slate-800">|</span>
              <button
                onClick={() => setIsTermsModalOpen(true)}
                className="hover:text-slate-200 transition-colors"
              >
                Terms of Service
              </button>
              <span className="text-slate-800">|</span>
              <button
                onClick={onOpenDisclaimer}
                className="hover:text-slate-200 transition-colors"
              >
                Risk Disclaimer &amp; License
              </button>
            </div>
          </div>

          <div className="border-t border-slate-900 pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-4">
            <p>© 2026 clearer.trade. Open source under MIT License. Software provided for analytical purposes only.</p>
            <div className="flex items-center space-x-3 text-slate-400">
              <a
                href="https://github.com/CnahtanoJ/clearer-trade"
                target="_blank"
                rel="noreferrer"
                className="text-[#A4D8FF] hover:underline transition-colors font-semibold flex items-center space-x-1"
              >
                <span>GitHub</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              <span className="text-slate-700">|</span>
              <a href="mailto:support@clearer.trade" className="hover:text-slate-200 transition-colors">
                support@clearer.trade
              </a>
              <span className="text-slate-700">|</span>
              <a href="https://x.com/clearertrade" target="_blank" rel="noreferrer" className="hover:text-slate-200 transition-colors">
                X / Twitter
              </a>
            </div>
          </div>
        </footer>
      </main>

      {/* Modals */}


      {data && (
        <DataEditorModal
          isOpen={isDataEditorOpen}
          onClose={() => setIsDataEditorOpen(false)}
          trades={data.trades}
          onSave={handleReanalyzeTrades}
        />
      )}



      <PrivacyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />

      <TermsModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
      />

      <ShareCardModal
        isOpen={isShareCardOpen}
        onClose={() => setIsShareCardOpen(false)}
        data={data}
        auditResult={auditResult}
      />

      {/* ── COLUMN MAPPER MODAL ────────────────────────────────────────────── */}
      <ColumnMapperModal
        isOpen={isColumnMapperOpen}
        onClose={() => setIsColumnMapperOpen(false)}
        csvHeaders={mapperCsvHeaders}
        sampleRows={mapperSampleRows}
        rawCsvText={rawCsvText}
        accessToken={accessToken}
        autoConfig={autoConfig}
        isManualOpen={isManualMapping}
        onSuccess={(mappedData) => {
          try {
            sessionStorage.setItem('cs_active_dataset', JSON.stringify(mappedData));
          } catch {
            // ignore capacity limits
          }
          setData(mappedData);
          setUploadError(null);
          setIsColumnMapperOpen(false);
        }}
      />
    </div>
  );
}
