'use client';

import React, { useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface DonutChartProps {
  assetExposure?: Record<string, number>;
  directionExposure?: Record<string, number>;
  strategyExposure?: Record<string, number>;
  theme?: 'classic' | 'monochrome';
}

export default function DonutChart({
  assetExposure = {},
  directionExposure = {},
  strategyExposure = {},
  theme = 'classic',
}: DonutChartProps) {
  const [donutType, setDonutType] = useState<'asset' | 'direction' | 'strategy'>('asset');

  const dataMap = React.useMemo(() => {
    let rawDataMap: Record<string, number> = {};
    if (donutType === 'asset') rawDataMap = assetExposure;
    else if (donutType === 'direction') rawDataMap = directionExposure;
    else if (donutType === 'strategy') rawDataMap = strategyExposure;

    const entries = Object.entries(rawDataMap).sort((a, b) => b[1] - a[1]);
    if (entries.length <= 7) return rawDataMap;

    const top6 = entries.slice(0, 6);
    const rest = entries.slice(6);
    const otherSum = rest.reduce((acc, [, val]) => acc + val, 0);

    const result: Record<string, number> = {};
    top6.forEach(([k, v]) => { result[k] = v; });
    result[`Other (${rest.length})`] = otherSum;
    return result;
  }, [donutType, assetExposure, directionExposure, strategyExposure]);

  const labels = Object.keys(dataMap);
  const values = Object.values(dataMap);

  const classicColors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#8b5cf6', // purple
    '#38bdf8', // amber
    '#ec4899', // pink
    '#6366f1', // indigo
    '#14b8a6', // teal
    '#6b7280', // gray for Other
  ];

  const monochromeColors = [
    '#ffffff',
    '#d4d4d4',
    '#a3a3a3',
    '#737373',
    '#525252',
    '#404040',
    '#262626',
    '#171717',
  ];

  const selectedColors = theme === 'monochrome' ? monochromeColors : classicColors;

  const chartData = {
    labels: labels.length > 0 ? labels : ['No Data'],
    datasets: [
      {
        data: values.length > 0 ? values : [1],
        backgroundColor: values.length > 0 ? selectedColors.slice(0, labels.length) : ['#333333'],
        borderColor: '#0a0a0a',
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: '#9ca3af',
          font: { family: '"Plus Jakarta Sans", sans-serif', size: 10 },
        },
      },
      tooltip: {
        callbacks: {
          label: (context: { label?: string; raw?: unknown }) => {
            const label = context.label || '';
            const val = (context.raw as number) || 0;
            return `${label}: ${val} trade(s)`;
          },
        },
      },
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Exposure Breakdown
        </span>
        <select
          value={donutType}
          onChange={(e) => setDonutType(e.target.value as 'asset' | 'direction' | 'strategy')}
          className="bg-black text-xs border border-slate-800 rounded px-2 py-1 text-white font-sans focus:outline-none"
        >
          <option value="asset">Ticker Distribution</option>
          <option value="direction">Direction (Long/Short)</option>
          <option value="strategy">Strategy Tag</option>
        </select>
      </div>

      <div className="h-56 w-full flex items-center justify-center">
        <Doughnut data={chartData} options={options} />
      </div>
    </div>
  );
}
