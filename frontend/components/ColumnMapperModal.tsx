'use client';

import React, { useState } from 'react';
import { X, FileText, Download, ArrowRight, Clock, Info } from 'lucide-react';
import { ProcessedData, AutoConfig } from '@/types';
import { downloadCsvTemplate, reanalyzeTradingLog } from '@/lib/api';

interface ColumnMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  csvHeaders: string[];
  sampleRows: Record<string, unknown>[];
  rawCsvText: string;
  onSuccess: (data: ProcessedData) => void;
  accessToken?: string;
  autoConfig?: AutoConfig | null;
  isManualOpen?: boolean;
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

function parseFlexibleTimestamp(raw: string, dateOrder: 'AUTO' | 'MDY' | 'DMY' | 'YMD' = 'AUTO'): number {
  if (!raw || !raw.trim()) return Date.now();
  const cleaned = raw.trim().replace(/^["']|["']$/g, '');

  const num = Number(cleaned);
  if (!isNaN(num) && num > 0) {
    return num < 1e11 ? num * 1000 : num;
  }

  // Clean hyphens like "5/15/2025 - 19:40:38" -> "5/15/2025 19:40:38"
  const sanitized = cleaned.replace(/(\d{1,4}[\/\.-]\d{1,2}[\/\.-]\d{1,4})\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)/, '$1 $2');

  const parts = sanitized.split(/\s+/);
  const datePart = parts[0] || '';
  const timePart = parts[1] || '00:00:00';

  const dParts = datePart.split(/[\/\.-]/).map(Number);
  const tParts = timePart.split(':').map(Number);
  if (dParts.length === 3) {
    const first = dParts[0];
    const second = dParts[1];
    let year = dParts[2];

    let month = first;
    let day = second;

    if (first > 1000 || dateOrder === 'YMD') {
      // ISO / YMD (YYYY-MM-DD or YYYY/MM/DD)
      year = first;
      month = second;
      day = dParts[2];
    } else if (dateOrder === 'DMY') {
      day = first;
      month = second;
    } else if (dateOrder === 'MDY') {
      month = first;
      day = second;
    } else {
      // AUTO
      if (first > 12) {
        day = first;
        month = second;
      } else {
        month = first;
        day = second;
      }
    }

    const hh = tParts[0] || 0;
    const mm = tParts[1] || 0;
    const ss = tParts[2] || 0;
    const utcMs = Date.UTC(year, month - 1, day, hh, mm, ss);
    if (!isNaN(utcMs)) return utcMs;
  }

  const parsed = Date.parse(sanitized);
  if (!isNaN(parsed)) return parsed;

  return Date.now();
}

export default function ColumnMapperModal({
  isOpen,
  onClose,
  csvHeaders = [],
  sampleRows = [],
  rawCsvText,
  onSuccess,
  accessToken = '',
  autoConfig,
}: ColumnMapperModalProps) {
  const [timestampCol, setTimestampCol] = useState('');
  const [dateOrder, setDateOrder] = useState<'AUTO' | 'MDY' | 'DMY' | 'YMD'>('AUTO');
  const [symbolCol, setSymbolCol] = useState('');
  const [sideCol, setSideCol] = useState('');
  const [priceCol, setPriceCol] = useState('');
  const [exitPriceCol, setExitPriceCol] = useState('');
  const [qtyCol, setQtyCol] = useState('');
  const [sizeFormat, setSizeFormat] = useState<'AUTO' | 'QTY' | 'NOTIONAL'>('AUTO');
  const [pnlCol, setPnlCol] = useState('');
  const [currency, setCurrency] = useState('$');
  const [dataFormat, setDataFormat] = useState<'FIFO' | 'CONSOLIDATED'>('FIFO');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoProcessed, setHasAutoProcessed] = useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setHasAutoProcessed(false);
      setLoading(false);
      setError(null);
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen && autoConfig) {
      setTimestampCol(autoConfig.timestampCol);
      setSymbolCol(autoConfig.symbolCol);
      setSideCol(autoConfig.sideCol);
      setPriceCol(autoConfig.priceCol);
      setExitPriceCol(autoConfig.exitPriceCol || '');
      setQtyCol(autoConfig.qtyCol);
      setPnlCol(autoConfig.pnlCol);
      setCurrency(autoConfig.currency || autoConfig.currencySymbol || '$');
      setDataFormat(autoConfig.isConsolidated || autoConfig.dataFormat === 'CONSOLIDATED' ? 'CONSOLIDATED' : 'FIFO');
    } else if (isOpen && csvHeaders.length > 0) {
      setTimestampCol(csvHeaders.find((h) => /time|date|timestamp|opened|created/i.test(h)) || csvHeaders[0] || '');
      setSymbolCol(csvHeaders.find((h) => /symbol|pair|asset|coin|ticker|instrument|market/i.test(h)) || (csvHeaders[1] && !/pnl|price|size/i.test(csvHeaders[1]) ? csvHeaders[1] : '') || '');
      setSideCol(csvHeaders.find((h) => /side|type|direction|action|dir|buy/i.test(h)) || (csvHeaders[2] && !/pnl|price|size/i.test(csvHeaders[2]) ? csvHeaders[2] : '') || '');
      setPriceCol(csvHeaders.find((h) => /entry|exec_price|fill_price|px|cost/i.test(h) || (/price/i.test(h) && !/exit|close/i.test(h))) || '');
      setExitPriceCol(csvHeaders.find((h) => /exit|close_price|sell_price/i.test(h)) || '');
      setQtyCol(csvHeaders.find((h) => /qty|quantity|size|amount|vol|sz|shares|contracts/i.test(h)) || '');
      setPnlCol(csvHeaders.find((h) => /pnl|pl|profit|loss|realized|closed|rpnl|cpnl/i.test(h)) || '');
    }
  }, [autoConfig, csvHeaders, isOpen]);


  if (!isOpen) return null;

  if (loading && autoConfig && autoConfig.confidence >= 90 && hasAutoProcessed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="w-10 h-10 border-4 border-[#A4D8FF]/30 border-t-[#A4D8FF] rounded-full animate-spin mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Auto-Processing Journal</h3>
            <p className="text-xs text-slate-400">Matching Hyperliquid / exchange schema...</p>
          </div>
        </div>
      </div>
    );
  }

  const handleProcessMapping = async (
    overrideTs?: string,
    overrideSym?: string,
    overrideSide?: string,
    overridePx?: string,
    overrideSz?: string,
    overridePnl?: string,
    overrideFormat?: 'FIFO' | 'CONSOLIDATED'
  ) => {
    const tsStr = typeof overrideTs === 'string' ? overrideTs : timestampCol;
    const symStr = typeof overrideSym === 'string' ? overrideSym : symbolCol;
    const sideStr = typeof overrideSide === 'string' ? overrideSide : sideCol;
    const pxStr = typeof overridePx === 'string' ? overridePx : priceCol;
    const szStr = typeof overrideSz === 'string' ? overrideSz : qtyCol;
    const pnlStr = typeof overridePnl === 'string' ? overridePnl : pnlCol;
    const format = overrideFormat === 'FIFO' || overrideFormat === 'CONSOLIDATED' ? overrideFormat : dataFormat;

    if (!tsStr) {
      setError('Please select a Timestamp / Date column to process trades.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const lines = rawCsvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        setError('CSV file contains no data rows.');
        setLoading(false);
        return;
      }

      const headers = parseCsvLine(lines[0]);
      
      const findHeaderIdx = (colName: unknown) => {
        if (!colName || typeof colName !== 'string') return -1;
        const target = colName.trim().toLowerCase();
        return headers.findIndex((h) => String(h || '').trim().toLowerCase() === target);
      };

      const tsIdx = findHeaderIdx(tsStr);
      const symIdx = findHeaderIdx(symStr);
      const sideIdx = findHeaderIdx(sideStr);
      const priceIdx = findHeaderIdx(pxStr);
      const exitPriceIdx = findHeaderIdx(exitPriceCol);
      const qtyIdx = findHeaderIdx(szStr);
      const pnlIdx = findHeaderIdx(pnlStr);

      const tradesList: Record<string, unknown>[] = [];

      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        if (tsIdx !== -1 && tsIdx >= row.length) continue;

        const rawTs = tsIdx !== -1 ? row[tsIdx] : new Date().toISOString();
        const parsedTs = parseFlexibleTimestamp(rawTs, dateOrder);

        const tradeObj: Record<string, unknown> = {
          timestamp: parsedTs,
          symbol: symIdx !== -1 && row[symIdx] ? row[symIdx] : 'UNKNOWN',
          side: sideIdx !== -1 && row[sideIdx] ? row[sideIdx] : 'Buy',
          price: priceIdx !== -1 ? parseFloat(row[priceIdx]) || 0 : 0,
          exit_price: exitPriceIdx !== -1 ? parseFloat(row[exitPriceIdx]) || 0 : 0,
          qty: qtyIdx !== -1 ? parseFloat(row[qtyIdx]) || 1.0 : 1.0,
          pnl: pnlIdx !== -1 ? parseFloat(row[pnlIdx]) || 0 : 0,
        };

        tradesList.push(tradeObj);
      }

      if (tradesList.length === 0) {
        setError('Could not extract any valid trades from mapped columns.');
        setLoading(false);
        return;
      }

      const data = await reanalyzeTradingLog(tradesList, accessToken, format === 'CONSOLIDATED');
      if (data && data.success) {
        // Attach the currency to the returned data so the dashboard can use it
        data.currencySymbol = currency;
        onSuccess(data);
        onClose();
      } else {
        setError(data?.error || 'Failed to process mapped CSV.');
      }
    } catch (e: unknown) {
      const err = e as Error;
      setError(`Error parsing CSV: ${err.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 text-slate-200 font-sans my-auto max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-[#A4D8FF]" />
            <h3 className="font-bold text-base text-white uppercase tracking-wider">CSV Column Mapping</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400">
          Match your CSV headers to clearer.trade fields. We auto-detect standard names, but you can select custom columns below or{' '}
          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="text-[#A4D8FF] hover:text-emerald-300 font-semibold underline transition-colors inline-flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            download standard template
          </button>.
        </p>

        {/* Eye-catching clean callouts */}
        <div className="space-y-2 text-xs font-sans">
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex items-start space-x-2.5 shadow-sm">
            <Clock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-slate-200 block text-xs">Date / Timestamp Format</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Standard dates (e.g. <code className="bg-slate-950 px-1 py-0.5 rounded text-blue-300 font-mono">2025-05-15</code>, <code className="bg-slate-950 px-1 py-0.5 rounded text-blue-300 font-mono">05/15/2025 19:40</code>) and timestamps are parsed in <strong className="text-slate-300">UTC (GMT+0)</strong>.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex items-start space-x-2.5 shadow-sm">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-slate-200 block text-xs">Symbol Ticker Matching</span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Use standard market tickers (e.g. <code className="bg-slate-950 px-1 py-0.5 rounded text-emerald-300 font-mono">BTC</code>, <code className="bg-slate-950 px-1 py-0.5 rounded text-emerald-300 font-mono">AAPL</code>, <code className="bg-slate-950 px-1 py-0.5 rounded text-emerald-300 font-mono">EURUSD</code>) for live 5m tick candle precision.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-red-300 text-xs">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-xs">
          {/* DATA FORMAT SELECTOR AT TOP */}
          <div className="col-span-2">
            <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
              Data Format / Ledger Schema <span className="text-red-400">*</span>
            </label>
            <select
              value={dataFormat}
              onChange={(e) => setDataFormat(e.target.value as 'FIFO' | 'CONSOLIDATED')}
              className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF]"
            >
              <option value="FIFO">Raw Order Fills (FIFO Matching)</option>
              <option value="CONSOLIDATED">Completed Trades (1 Row = 1 Trade)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
              Timestamp / Date Column <span className="text-red-400">*</span>
            </label>
            <select
              value={timestampCol}
              onChange={(e) => setTimestampCol(e.target.value)}
              className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF]"
            >
              {csvHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
              Date Format Preference
            </label>
            <select
              value={dateOrder}
              onChange={(e) => setDateOrder(e.target.value as 'AUTO' | 'MDY' | 'DMY')}
              className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF] font-sans text-xs"
            >
              <option value="AUTO">Auto-Detect</option>
              <option value="MDY">US Format (MM/DD/YYYY)</option>
              <option value="DMY">EU / Global Format (DD/MM/YYYY)</option>
              <option value="YMD">ISO / Asian Format (YYYY/MM/DD)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
              Symbol / Ticker <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <select
              value={symbolCol}
              onChange={(e) => setSymbolCol(e.target.value)}
              className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF]"
            >
              <option value="">-- None (Default: UNKNOWN) --</option>
              {csvHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
              Side (Buy / Sell) <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <select
              value={sideCol}
              onChange={(e) => setSideCol(e.target.value)}
              className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF]"
            >
              <option value="">-- None (Default: Spot Buy) --</option>
              {csvHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {dataFormat === 'CONSOLIDATED' ? (
            <>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
                  Entry Price <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <select
                  value={priceCol}
                  onChange={(e) => setPriceCol(e.target.value)}
                  className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF]"
                >
                  <option value="">-- None (Default: 0.00) --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
                  Exit Price <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <select
                  value={exitPriceCol}
                  onChange={(e) => setExitPriceCol(e.target.value)}
                  className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF]"
                >
                  <option value="">-- None (Default: 0.00) --</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
                Execution Price <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <select
                value={priceCol}
                onChange={(e) => setPriceCol(e.target.value)}
                className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF]"
              >
                <option value="">-- None (Default: 0.00) --</option>
                {csvHeaders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
              Quantity / Size <span className="text-slate-500 font-normal">(Optional)</span>
            </label>
            <select
              value={qtyCol}
              onChange={(e) => setQtyCol(e.target.value)}
              className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF]"
            >
              <option value="">-- None (Default: 1.0) --</option>
              {csvHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
              Size Interpretation Mode
            </label>
            <select
              value={sizeFormat}
              onChange={(e) => setSizeFormat(e.target.value as 'AUTO' | 'QTY' | 'NOTIONAL')}
              className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF] text-xs font-sans"
            >
              <option value="AUTO">Auto-Detect (Exact Math Equation)</option>
              <option value="QTY">Coin / Contract Quantity (e.g. 0.002 BTC)</option>
              <option value="NOTIONAL">Dollar Amount Spent (e.g. $500)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold uppercase tracking-wider text-[10px]">
              Realized PnL (Optional)
            </label>
            <select
              value={pnlCol}
              onChange={(e) => setPnlCol(e.target.value)}
              className="w-full bg-black border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#A4D8FF]"
            >
              <option value="">-- None (Auto-Calculate) --</option>
              {csvHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sampleRows.length > 0 && (
          <div className="space-y-1.5 pt-2">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
              Preview Mapped Rows ({sampleRows.length} sample):
            </span>
            <div className="bg-black border border-slate-800 rounded-lg p-2 overflow-x-auto text-xs font-sans text-slate-300">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                    <th className="pb-1 px-2">Timestamp / Date</th>
                    <th className="pb-1 px-2">Symbol / Ticker</th>
                    <th className="pb-1 px-2">Side</th>
                    <th className="pb-1 px-2">Execution Price</th>
                    <th className="pb-1 px-2">Quantity / Size</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.slice(0, 3).map((row, idx) => {
                    const rawVal = row[timestampCol] || row['time'] || row['date'] || '';
                    return (
                      <tr key={idx} className="border-b border-slate-900">
                        <td className="py-1 px-2 text-[#A4D8FF] font-bold tabular-nums">
                          {String(rawVal).slice(0, 24) || '(Empty)'}
                        </td>
                        <td className="py-1 px-2">{String(row[symbolCol] ?? '')}</td>
                        <td className="py-1 px-2">{String(row[sideCol] ?? '')}</td>
                        <td className="py-1 px-2 tabular-nums">{String(row[priceCol] ?? '')}</td>
                        <td className="py-1 px-2 tabular-nums">{String(row[qtyCol] ?? '')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="pt-3 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleProcessMapping()}
            disabled={loading}
            className="px-5 py-2 bg-[#A4D8FF] hover:bg-[#A4D8FF] text-black font-bold rounded-lg text-xs flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            <span>{loading ? 'Processing...' : 'Analyze Mapped Trades'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
