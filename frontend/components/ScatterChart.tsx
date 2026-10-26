'use client';

import React from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';
import { Trade } from '@/types';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

interface ScatterChartProps {
  trades: Trade[];
  theme?: 'classic' | 'monochrome';
}

export default function ScatterChart({ trades, theme = 'classic' }: ScatterChartProps) {
  const winners: { x: number; y: number; pnl: number; asset: string }[] = [];
  const losers: { x: number; y: number; pnl: number; asset: string }[] = [];

  trades.forEach((t) => {
    const mae = t.mae_pct ?? 0;
    const mfe = t.mfe_pct ?? 0;
    const pnl = t.pnl ?? 0;
    const asset = t.symbol || t.asset || 'N/A';

    const point = { x: mae, y: mfe, pnl, asset };
    if (pnl >= 0) {
      winners.push(point);
    } else {
      losers.push(point);
    }
  });

  const winnerBg = theme === 'monochrome' ? '#ffffff' : '#10b981';
  const winnerBorder = theme === 'monochrome' ? '#e5e5e5' : '#059669';
  const loserBg = theme === 'monochrome' ? '#525252' : '#ef4444';
  const loserBorder = theme === 'monochrome' ? '#404040' : '#dc2626';

  const chartData = {
    datasets: [
      {
        label: 'Winners (Positive PnL)',
        data: winners,
        backgroundColor: winnerBg,
        borderColor: winnerBorder,
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: 'Losers (Negative PnL)',
        data: losers,
        backgroundColor: loserBg,
        borderColor: loserBorder,
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7,
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
          color: '#9ca3af',
          font: { family: 'sans-serif', size: 10 },
        },
      },
      tooltip: {
        callbacks: {
          label: (context: { raw?: unknown }) => {
            const raw = context.raw as { x: number; y: number; pnl: number; asset: string };
            return `${raw.asset}: Max Dip ${raw.x.toFixed(2)}%, Peak Profit ${raw.y.toFixed(2)}% | PnL: $${raw.pnl.toFixed(2)}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Max Dip During Trade % (MAE)',
          color: '#9ca3af',
          font: { family: 'sans-serif', size: 11 },
        },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#9ca3af', font: { family: 'sans-serif', size: 10 } },
      },
      y: {
        title: {
          display: true,
          text: 'Max Peak Profit % (MFE)',
          color: '#9ca3af',
          font: { family: 'sans-serif', size: 11 },
        },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#9ca3af', font: { family: 'sans-serif', size: 10 } },
      },
    },
  };

  return (
    <div className="h-64 w-full">
      <Scatter data={chartData} options={options} />
    </div>
  );
}
