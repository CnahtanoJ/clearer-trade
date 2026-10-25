'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { StrategyStat } from '@/types';

interface StrategyMatrixProps {
  summaryMatrix?: {
    OVERALL?: Record<string, StrategyStat>;
    LONG?: Record<string, StrategyStat>;
    SHORT?: Record<string, StrategyStat>;
  };
}

export default function StrategyMatrix({ summaryMatrix }: StrategyMatrixProps) {
  const [activeTab, setActiveTab] = useState<'OVERALL' | 'LONG' | 'SHORT'>('OVERALL');

  const currentTabMatrix = summaryMatrix?.[activeTab] || {};
  const entries = Object.entries(currentTabMatrix);

  return (
    <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-6 shadow-2xl space-y-4 font-sans h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center space-x-2">
            <h3 className="text-xs font-bold text-white uppercase tracking-widest font-sans">
              Strategy Statistics Matrix
            </h3>
            <div className="relative group inline-block">
              <Info className="w-3.5 h-3.5 text-slate-500 hover:text-[#A4D8FF] cursor-pointer transition-colors" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-3 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-300 shadow-2xl z-50 leading-relaxed font-sans normal-case tracking-normal">
                <span className="font-bold text-[#A4D8FF] block mb-0.5">Strategy Tags Are Optional</span>
                If your CSV has no strategy column, trades auto-assign as <em className="text-white">UNTAGGED</em>. You can tag or rename setups anytime in the Trade Ledger below.
              </div>
            </div>
          </div>
          <div className="flex space-x-2 font-sans text-xs">
            {(['OVERALL', 'LONG', 'SHORT'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-0.5 px-2 transition-colors ${
                  activeTab === tab
                    ? 'text-white border-b-2 border-white font-bold'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto max-h-[300px]">
          <table className="w-full text-left border-collapse text-xs font-sans">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 uppercase tracking-wider font-medium">
                <th className="py-2 px-3 font-semibold">Strategy Tag</th>
                <th className="py-2 px-3 font-semibold text-right">Trades</th>
                <th className="py-2 px-3 font-semibold text-right">Net Profit</th>
                <th className="py-2 px-3 font-semibold text-right">Win Rate</th>
                <th className="py-2 px-3 font-semibold text-right">Profit Factor</th>
                <th className="py-2 px-3 font-semibold text-right">Avg Return</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {entries.length > 0 ? (
                entries.map(([tag, stats]) => (
                  <tr key={tag} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">{tag}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{stats.total_trades}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold tabular-nums ${
                        stats.net_profit >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      ${stats.net_profit.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {stats.win_rate ? stats.win_rate.toFixed(1) : '0.0'}%
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {stats.profit_factor === 'Inf'
                        ? '∞'
                        : stats.profit_factor === '-Inf'
                        ? '-∞'
                        : typeof stats.profit_factor === 'number'
                        ? stats.profit_factor.toFixed(2)
                        : stats.profit_factor}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right tabular-nums font-semibold ${
                        (stats.avg_profit_pct || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {stats.avg_profit_pct
                        ? `${stats.avg_profit_pct > 0 ? '+' : ''}${stats.avg_profit_pct.toFixed(2)}%`
                        : '0.00%'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                    No strategies found for direction: {activeTab}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
