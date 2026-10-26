'use client';

import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export type TimeframeOption = 'trade' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface EquityChartProps {
  equityData: { timestamp: number; equity: number }[];
  disciplinedData?: { timestamp: number; equity: number }[];
  pnlBars?: number[];
  theme?: 'classic' | 'monochrome';
}

function formatGroupKey(ts: number, timeframe: TimeframeOption): string {
  if (!ts || ts < 100000) return 'N/A';
  const ms = ts < 1e11 ? ts * 1000 : ts;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return 'N/A';

  if (timeframe === 'daily') {
    return d.toISOString().slice(0, 10);
  }
  if (timeframe === 'weekly') {
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setUTCDate(diff);
    return `${monday.toISOString().slice(0, 10)}`;
  }
  if (timeframe === 'monthly') {
    return d.toISOString().slice(0, 7);
  }
  if (timeframe === 'yearly') {
    return String(d.getUTCFullYear());
  }
  return 'N/A';
}

export default function EquityChart({
  equityData,
  disciplinedData,
  pnlBars,
  theme = 'classic',
}: EquityChartProps) {
  const [tab, setTab] = useState<'equity' | 'pnl'>('equity');
  const [timeframe, setTimeframe] = useState<TimeframeOption>('trade');

  // Compute calculated PnL per trade
  const rawPnlBars = useMemo(() => {
    if (pnlBars && pnlBars.length > 0) return pnlBars;
    return equityData.map((d, idx) =>
      idx === 0 ? d.equity : d.equity - equityData[idx - 1].equity
    );
  }, [equityData, pnlBars]);

  // Aggregated Data Computation
  const { labels, finalEquity, finalDisciplined, finalPnl } = useMemo(() => {
    if (timeframe === 'trade' || equityData.length === 0) {
      return {
        labels: equityData.map((_, idx) => `Trade #${idx + 1}`),
        finalEquity: equityData.map((d) => d.equity),
        finalDisciplined: (disciplinedData || []).map((d) => d.equity),
        finalPnl: rawPnlBars,
      };
    }

    // Grouping for daily, weekly, monthly, yearly
    const groups: Map<
      string,
      {
        label: string;
        lastEquity: number;
        lastDisciplined?: number;
        pnlSum: number;
      }
    > = new Map();

    equityData.forEach((item, idx) => {
      const key = formatGroupKey(item.timestamp, timeframe);
      const discItem = disciplinedData && disciplinedData[idx];
      const pnlVal = rawPnlBars[idx] || 0;

      if (!groups.has(key)) {
        groups.set(key, {
          label: key,
          lastEquity: item.equity,
          lastDisciplined: discItem ? discItem.equity : undefined,
          pnlSum: pnlVal,
        });
      } else {
        const existing = groups.get(key)!;
        existing.lastEquity = item.equity;
        if (discItem) existing.lastDisciplined = discItem.equity;
        existing.pnlSum += pnlVal;
      }
    });

    const groupArray = Array.from(groups.values());
    const hasDisciplined = (disciplinedData || []).length > 0;

    return {
      labels: groupArray.map((g) => g.label),
      finalEquity: groupArray.map((g) => g.lastEquity),
      finalDisciplined: hasDisciplined
        ? groupArray.map((g) => g.lastDisciplined ?? g.lastEquity)
        : [],
      finalPnl: groupArray.map((g) => Math.round(g.pnlSum * 100) / 100),
    };
  }, [equityData, disciplinedData, rawPnlBars, timeframe]);

  const actualBorder = theme === 'monochrome' ? '#ffffff' : '#3b82f6';
  const actualBg = theme === 'monochrome' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(59, 130, 246, 0.05)';
  const discBorder = theme === 'monochrome' ? '#a3a3a3' : '#eab308';

  // Cumulative PnL Line Datasets
  const lineDatasets = [
    {
      label: 'Cumulative PnL ($)',
      data: finalEquity,
      borderColor: actualBorder,
      backgroundColor: actualBg,
      borderWidth: 2,
      fill: true,
      tension: 0.1,
      pointRadius: timeframe === 'trade' ? 2 : 3,
      pointHoverRadius: 5,
    },
  ];

  if (finalDisciplined.length > 0) {
    lineDatasets.push({
      label: 'Disciplined PnL (Tilt Filtered)',
      data: finalDisciplined,
      borderColor: discBorder,
      backgroundColor: 'transparent',
      borderWidth: 2,
      fill: false,
      tension: 0.1,
      pointRadius: timeframe === 'trade' ? 0 : 3,
      pointHoverRadius: 4,
    });
  }

  // PnL Bar Dataset
  const barDataset = {
    labels,
    datasets: [
      {
        label: timeframe === 'trade' ? 'PnL per Trade ($)' : `Aggregated PnL (${timeframe})`,
        data: finalPnl,
        backgroundColor: finalPnl.map((val) => {
          if (theme === 'monochrome') return val >= 0 ? '#ffffff' : '#525252';
          return val >= 0 ? '#10b981' : '#ef4444';
        }),
        borderColor: finalPnl.map((val) => {
          if (theme === 'monochrome') return val >= 0 ? '#e5e5e5' : '#404040';
          return val >= 0 ? '#059669' : '#dc2626';
        }),
        borderWidth: 1,
        borderRadius: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#a3a3a3',
          font: { family: 'sans-serif', size: 11 },
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: '#171717',
        titleColor: '#ffffff',
        bodyColor: '#e5e5e5',
        borderColor: '#262626',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#cbd5e1', font: { family: 'sans-serif', size: 10, weight: 'bold' as const } },
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#cbd5e1',
          font: { family: 'sans-serif', size: 10, weight: 'bold' as const },
          callback: (value: string | number) => `$${value}`,
        },
      },
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-3 text-xs font-sans">
          <button
            onClick={() => setTab('equity')}
            className={`pb-0.5 transition-colors ${
              tab === 'equity'
                ? 'text-white border-b-2 border-white font-bold'
                : 'text-slate-400 hover:text-white font-medium'
            }`}
          >
            Cumulative PnL
          </button>
          <span className="text-slate-600">/</span>
          <button
            onClick={() => setTab('pnl')}
            className={`pb-0.5 transition-colors ${
              tab === 'pnl'
                ? 'text-white border-b-2 border-white font-bold'
                : 'text-slate-400 hover:text-white font-medium'
            }`}
          >
            PnL Breakdown
          </button>
        </div>

        {/* Timeframe aggregation pill selector */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] font-sans">
          {(['trade', 'daily', 'weekly', 'monthly', 'yearly'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded-md capitalize font-semibold transition-all ${
                timeframe === tf
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72 w-full">
        {tab === 'equity' ? (
          <Line data={{ labels, datasets: lineDatasets }} options={options} />
        ) : (
          <Bar data={barDataset} options={options} />
        )}
      </div>
    </div>
  );
}
