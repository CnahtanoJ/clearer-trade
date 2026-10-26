'use client';

import React from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bubble } from 'react-chartjs-2';

ChartJS.register(LinearScale, PointElement, Tooltip, Legend);

interface SessionBubbleChartProps {
  sessionsList?: Array<{
    start_time?: string | number;
    duration_hours?: number;
    duration_minutes?: number;
    pnl?: number;
    trade_count?: number;
    [key: string]: unknown;
  }>;
  theme?: 'classic' | 'monochrome';
}

export default function SessionBubbleChart({ sessionsList = [], theme = 'classic' }: SessionBubbleChartProps) {
  const bubblePoints = sessionsList.map((s, idx) => ({
    x: s.duration_minutes ?? (s.duration_hours ? s.duration_hours * 60 : 30),
    y: s.pnl ?? 0,
    r: Math.min(Math.max((s.trade_count ?? 1) * 3, 4), 20),
    sessionName: `Session #${idx + 1}`,
    tradeCount: s.trade_count ?? 1,
  }));

  const chartData = {
    datasets: [
      {
        label: 'Sessions',
        data: bubblePoints,
        backgroundColor: bubblePoints.map((p) => {
          if (theme === 'monochrome') return p.y >= 0 ? 'rgba(255, 255, 255, 0.7)' : 'rgba(82, 82, 82, 0.7)';
          return p.y >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)';
        }),
        borderColor: bubblePoints.map((p) => {
          if (theme === 'monochrome') return p.y >= 0 ? '#ffffff' : '#737373';
          return p.y >= 0 ? '#10b981' : '#ef4444';
        }),
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: { raw?: unknown }) => {
            const raw = context.raw as { sessionName: string; x: number; y: number; tradeCount: number };
            return `${raw.sessionName}: ${raw.x} mins | PnL: $${raw.y.toFixed(2)} | Trades: ${raw.tradeCount}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Session Duration (Hours)',
          color: '#cbd5e1',
          font: { family: '"Plus Jakarta Sans", sans-serif', size: 10, weight: 'bold' as const },
        },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#cbd5e1', font: { family: '"Plus Jakarta Sans", sans-serif', size: 10, weight: 'bold' as const } },
      },
      y: {
        title: {
          display: true,
          text: 'Trade Intensity (Trades / Hr)',
          color: '#cbd5e1',
          font: { family: '"Plus Jakarta Sans", sans-serif', size: 10, weight: 'bold' as const },
        },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#cbd5e1', font: { family: '"Plus Jakarta Sans", sans-serif', size: 10, weight: 'bold' as const } },
      },
    },
  };

  return (
    <div className="w-full h-[280px] min-h-[260px] flex items-center justify-center">
      <Bubble data={chartData} options={options} />
    </div>
  );
}
