'use client';

import React, { useState } from 'react';
import { HeatmapCell } from '@/types';

interface HeatmapChartProps {
  data: HeatmapCell[];
  theme?: 'classic' | 'monochrome';
}

export default function HeatmapChart({ data, theme = 'classic' }: HeatmapChartProps) {
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Quick lookup map: "day_index-hour" => cell
  const cellMap = new Map<string, HeatmapCell>();
  let maxAbsPnl = 1;
  if (Array.isArray(data)) {
    data.forEach((c) => {
      cellMap.set(`${c.day_index}-${c.hour}`, c);
      if (Math.abs(c.net_pnl) > maxAbsPnl) {
        maxAbsPnl = Math.abs(c.net_pnl);
      }
    });
  }

  const getCellStyle = (cell?: HeatmapCell) => {
    if (!cell || cell.trade_count === 0) {
      return 'bg-slate-900/40 border-slate-800/40 text-slate-600';
    }

    const intensity = Math.min(1.0, Math.max(0.15, Math.abs(cell.net_pnl) / maxAbsPnl));
    
    if (cell.net_pnl >= 0) {
      if (theme === 'monochrome') {
        return `bg-white/${Math.round(intensity * 80)} border-white/20 text-white font-semibold`;
      }
      return `bg-emerald-500/${Math.round(intensity * 75)} border-emerald-500/30 text-emerald-300 font-semibold`;
    } else {
      if (theme === 'monochrome') {
        return `bg-slate-600/${Math.round(intensity * 80)} border-slate-500/30 text-slate-300 font-semibold`;
      }
      return `bg-rose-500/${Math.round(intensity * 75)} border-rose-500/30 text-rose-300 font-semibold`;
    }
  };

  return (
    <div className="w-full space-y-3 font-sans">
      {/* Tooltip Header / Summary Callout */}
      <div className="h-6 flex justify-between items-center text-xs px-1">
        <span className="text-slate-300 font-bold">
          24×7 Trading Timing Heatmap <span className="text-[10px] text-[#A4D8FF] font-medium sm:hidden ml-1">(Swipe ➔)</span>
        </span>
        {hoveredCell ? (
          <span className="text-slate-200 bg-slate-800/90 px-2.5 py-0.5 rounded border border-slate-700 font-medium">
            <span className="font-bold text-slate-100">{hoveredCell.day_name} @ {String(hoveredCell.hour).padStart(2, '0')}:00</span> — {hoveredCell.trade_count} trades | Win Rate: {hoveredCell.win_rate}% | PnL: <span className={hoveredCell.net_pnl >= 0 ? 'text-[#A4D8FF] font-bold' : 'text-rose-400 font-bold'}>${hoveredCell.net_pnl >= 0 ? '+' : ''}{hoveredCell.net_pnl.toFixed(2)}</span>
          </span>
        ) : (
          <span className="text-slate-400 text-[11px] font-medium italic">Hover cell for hourly breakdown</span>
        )}
      </div>

      {/* Grid Container */}
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[580px] w-full space-y-1 px-1.5 py-1">
          {/* Hours Header Row */}
          <div className="grid grid-cols-[48px_repeat(24,minmax(0,1fr))] gap-1 text-[10px] text-slate-300 text-center font-semibold">
            <div className="text-slate-300 font-bold">Day / Hr</div>
            {hours.map((h) => (
              <div key={h} className="truncate text-slate-400 font-semibold">{h}h</div>
            ))}
          </div>

          {/* Days Rows */}
          {days.map((dayName, dIdx) => (
            <div key={dayName} className="grid grid-cols-[48px_repeat(24,minmax(0,1fr))] gap-1 items-center">
              <div className="text-xs font-bold text-slate-300 truncate">{dayName.slice(0, 3)}</div>
              {hours.map((h) => {
                const cell = cellMap.get(`${dIdx}-${h}`);
                return (
                  <div
                    key={`${dIdx}-${h}`}
                    onMouseEnter={() => setHoveredCell(cell || null)}
                    onMouseLeave={() => setHoveredCell(null)}
                    className={`h-7 rounded border transition-all duration-150 flex items-center justify-center text-[9px] cursor-pointer hover:brightness-125 hover:ring-1 hover:ring-white/50 hover:z-10 shadow-sm ${getCellStyle(cell)}`}
                  >
                    {cell && cell.trade_count > 0 ? (
                      <span>{cell.net_pnl >= 0 ? '+' : ''}{Math.round(cell.net_pnl)}</span>
                    ) : (
                      ''
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end space-x-4 text-[11px] text-slate-300 pt-1 font-semibold">
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded bg-emerald-500/60 border border-emerald-500/40"></div>
          <span>Profitable Hour</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded bg-rose-500/60 border border-rose-500/40"></div>
          <span>Toxic / Loss Hour</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 rounded bg-slate-900/60 border border-slate-800"></div>
          <span>No Activity</span>
        </div>
      </div>
    </div>
  );
}
