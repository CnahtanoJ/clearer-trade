'use client';

import React from 'react';
import { HoldTimeAnalysis } from '@/types';

interface HoldTimeChartProps {
  data?: HoldTimeAnalysis;
  theme?: 'classic' | 'monochrome';
}

export default function HoldTimeChart({ data }: HoldTimeChartProps) {
  const filteredDurations = React.useMemo(() => {
    return (data?.trade_durations || []) as Array<{
      id: string;
      pnl: number;
      duration_mins: number;
      is_winner: boolean;
      side?: string;
    }>;
  }, [data?.trade_durations]);

  if (!data) {
    return (
      <div className="text-center py-6 text-slate-500 text-xs font-sans">
        No hold-time duration metrics available.
      </div>
    );
  }

  const winners = filteredDurations.filter((d) => d.pnl > 0);
  const losers = filteredDurations.filter((d) => d.pnl < 0);

  const calcMedian = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const calcAvg = (arr: number[]) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);

  const median_winner_mins = calcMedian(winners.map((w) => w.duration_mins));
  const median_loser_mins = calcMedian(losers.map((l) => l.duration_mins));
  const avg_winner_mins = calcAvg(winners.map((w) => w.duration_mins));
  const avg_loser_mins = calcAvg(losers.map((l) => l.duration_mins));

  const asymmetry_ratio = median_winner_mins > 0 ? median_loser_mins / median_winner_mins : 1.0;
  const isAsymmetric = asymmetry_ratio >= 1.5;

  const formatMins = (mins: number) => {
    if (mins < 60) return `${mins.toFixed(0)}m`;
    const hrs = (mins / 60).toFixed(1);
    return `${hrs}h`;
  };

  return (
    <div className="w-full space-y-4 font-sans">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Winner Hold Time Card */}
        <div className="bg-slate-900 border border-slate-800/40 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-300">Winner Median Hold</span>
          <div className="mt-2 space-y-0.5">
            <div className="text-2xl font-black text-emerald-400 tabular-nums">
              {formatMins(median_winner_mins)}
            </div>
            <div className="text-[11px] text-slate-400 font-medium truncate">
              Avg: <span className="text-slate-300">{formatMins(avg_winner_mins)}</span>
            </div>
          </div>
        </div>

        {/* Loser Hold Time Card */}
        <div className="bg-slate-900 border border-slate-800/40 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-300">Loser Median Hold</span>
          <div className="mt-2 space-y-0.5">
            <div className="text-2xl font-black text-red-400 tabular-nums">
              {formatMins(median_loser_mins)}
            </div>
            <div className="text-[11px] text-slate-400 font-medium truncate">
              Avg: <span className="text-slate-300">{formatMins(avg_loser_mins)}</span>
            </div>
          </div>
        </div>

        {/* Asymmetry Ratio Card */}
        <div className="bg-slate-900 border border-slate-800/40 rounded-xl p-3.5 flex flex-col justify-between h-full">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1 group relative cursor-help">
            Bag-Holding Ratio
            <div className="hidden group-hover:block absolute bottom-full mb-1 w-48 p-2 bg-black border border-slate-700 text-[10px] text-slate-300 rounded shadow-xl z-50 whitespace-normal font-normal">
              Measures how many times longer you hold losing trades compared to winning trades.
            </div>
          </span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-100 tabular-nums">
              {asymmetry_ratio.toFixed(1)}x
            </span>
            <span className={`text-[11px] font-bold ${isAsymmetric ? 'text-amber-400' : 'text-slate-400'}`}>
              {isAsymmetric ? 'Flaw' : 'Balanced'}
            </span>
          </div>
        </div>
      </div>

      {/* Asymmetry Warning Callout */}
      {isAsymmetric && (
        <div className="p-3 bg-[#A4D8FF]/10 border border-[#A4D8FF]/30 rounded-lg flex items-center justify-between text-xs text-sky-200">
          <div className="flex items-center space-x-2">
            <span className="font-bold uppercase tracking-wider text-[10px] bg-[#A4D8FF]/20 text-[#A4D8FF] px-1.5 py-0.5 rounded">
              Warning
            </span>
            <span>
              You hold losing trades <strong className="text-white">{asymmetry_ratio.toFixed(1)}x longer</strong> than winning trades ({formatMins(median_loser_mins)} vs {formatMins(median_winner_mins)}).
            </span>
          </div>
        </div>
      )}

      {/* Trade Hold-Time Bar Comparisons */}
      {filteredDurations.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex justify-between items-center text-[11px] font-medium text-slate-400 px-1">
            <span>Hold Duration Comparison (Longest First)</span>
            <span>Duration</span>
          </div>
          <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
            {[...filteredDurations]
              .sort((a, b) => b.duration_mins - a.duration_mins)
              .slice(0, 10)
              .map((td, idx) => {
                const maxDur = Math.max(...filteredDurations.map((t) => t.duration_mins), 1);
                const barWidth = Math.max(8, Math.min(100, (td.duration_mins / maxDur) * 100));
                return (
                  <div key={td.id || idx} className="grid grid-cols-[90px_1fr_60px] items-center gap-2 text-xs">
                    <span className="text-slate-400 text-[11px] truncate font-medium">{td.id}</span>
                    <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          td.is_winner ? 'bg-emerald-500/80' : 'bg-rose-500/80'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-right text-[11px] font-medium text-slate-300">
                      {formatMins(td.duration_mins)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
