'use client';

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Trade } from '@/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface RegimeChartProps {
  trades: Trade[];
  theme?: 'classic' | 'monochrome';
}

function getExactCostBasis(price: number, size: number, pnl: number, exitPrice: number = 0): number {
  if (price > 0 && size > 0) {
    const costQty = price * size;
    const costNotional = size;

    if (exitPrice > 0 && Math.abs(pnl) > 0.01) {
      const diff = exitPrice - price;
      const expectedQty = size * diff;
      const expectedNotional = (size / price) * diff;
      if (Math.abs(pnl - expectedNotional) < Math.abs(pnl - expectedQty)) {
        return costNotional;
      }
    } else if (size > 10 * price && size > Math.abs(pnl) * 0.5) {
      return costNotional;
    }
    return costQty;
  }
  if (size > 0) return size;
  return Math.abs(pnl) > 0 ? Math.max(Math.abs(pnl) / 0.05, 50) : 100;
}

export default function RegimeChart({ trades, theme = 'classic' }: RegimeChartProps) {
  const regimes = [
    'Low Volatility Chop',
    'High Volatility Expansion',
    'Extreme Funding Squeeze',
  ];

  const regimeExpectancies: Record<string, number> = {};

  regimes.forEach((reg) => {
    const list = trades.filter(
      (t) => (t.market_regime || 'Low Volatility Chop') === reg
    );
    let totalPnl = 0;
    let totalCost = 0;
    let sumPct = 0;
    let count = 0;
    list.forEach((t) => {
      const price = Number(t.price || t.px || 0);
      const size = Number(t.size || t.sz || t.qty || 0);
      const pnl = Number(t.pnl || 0);
      const exitPx = Number(t.exit_price || 0);
      const cost = getExactCostBasis(price, size, pnl, exitPx);
      totalPnl += pnl;
      if (cost >= 0.01) {
        totalCost += cost;
        const tradePct = Math.max(-100, Math.min(200, (pnl / cost) * 100));
        sumPct += tradePct;
        count++;
      } else if (pnl !== 0) {
        sumPct += pnl > 0 ? 5 : -5;
        count++;
      }
    });
    if (totalCost > 0) {
      regimeExpectancies[reg] = Number(((totalPnl / totalCost) * 100).toFixed(2));
    } else if (count > 0) {
      regimeExpectancies[reg] = Number((sumPct / count).toFixed(2));
    } else {
      regimeExpectancies[reg] = 0.0;
    }
  });

  const chartData = {
    labels: regimes,
    datasets: [
      {
        label: 'Avg Return %',
        data: regimes.map((r) => regimeExpectancies[r] || 0),
        backgroundColor: regimes.map((r) => {
          const val = regimeExpectancies[r] || 0;
          if (theme === 'monochrome') return val >= 0 ? '#ffffff' : '#525252';
          return val >= 0 ? '#10b981' : '#ef4444';
        }),
        borderColor: regimes.map((r) => {
          const val = regimeExpectancies[r] || 0;
          if (theme === 'monochrome') return val >= 0 ? '#e5e5e5' : '#404040';
          return val >= 0 ? '#059669' : '#dc2626';
        }),
        borderWidth: 1,
        borderRadius: 4,
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
          label: (context: { raw?: unknown }) => `Avg Return: ${Number(context.raw ?? 0).toFixed(2)}%`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#cbd5e1', font: { family: 'sans-serif', size: 10, weight: 'bold' as const } },
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: '#cbd5e1',
          font: { family: 'sans-serif', size: 10, weight: 'bold' as const },
          callback: (value: string | number) => `${value}%`,
        },
      },
    },
  };

  return (
    <div className="h-44 w-full">
      <Bar data={chartData} options={options} />
    </div>
  );
}
