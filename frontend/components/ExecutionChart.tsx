'use client';

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface ExecutionChartProps {
  hourlyDistribution?: { hour: number; pnl: number; count: number }[];
  theme?: 'classic' | 'monochrome';
}

export default function ExecutionChart({ hourlyDistribution, theme = 'classic' }: ExecutionChartProps) {
  if (!hourlyDistribution || hourlyDistribution.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center text-xs text-slate-500 font-sans">
        No execution timing data available.
      </div>
    );
  }

  const labels = hourlyDistribution.map((d) => `${String(d.hour).padStart(2, '0')}:00`);
  const pnlData = hourlyDistribution.map((d) => d.pnl);

  const backgroundColors = pnlData.map((pnl) => {
    if (theme === 'monochrome') return pnl >= 0 ? '#ffffff' : '#525252';
    return pnl >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)';
  });
  const borderColors = pnlData.map((pnl) => {
    if (theme === 'monochrome') return pnl >= 0 ? '#e5e5e5' : '#404040';
    return pnl >= 0 ? '#22c55e' : '#ef4444';
  });

  const data = {
    labels,
    datasets: [
      {
        label: 'Hourly PnL ($)',
        data: pnlData,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#171717',
        titleColor: '#ffffff',
        bodyColor: '#e5e5e5',
        borderColor: '#262626',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: '#737373',
          font: {
            family: 'sans-serif',
            size: 10,
          },
        },
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.05)',
        },
        ticks: {
          color: '#737373',
          font: {
            family: 'sans-serif',
            size: 10,
          },
        },
      },
    },
  };

  return (
    <div className="h-56 w-full">
      <Bar data={data} options={options} />
    </div>
  );
}
