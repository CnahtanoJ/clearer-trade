'use client';

import React, { useState } from 'react';
import { Trade } from '@/types';
import { X, Save, RotateCcw } from 'lucide-react';

interface DataEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  trades: Trade[];
  onSave: (updatedTrades: Trade[]) => void;
}

export default function DataEditorModal({
  isOpen,
  onClose,
  trades,
  onSave,
}: DataEditorModalProps) {
  const [editedTrades, setEditedTrades] = useState<Trade[]>(trades);

  if (!isOpen || !trades || trades.length === 0) return null;

  const standardKeys = ['date', 'timestamp', 'asset', 'symbol', 'side', 'sz', 'size', 'price', 'px', 'entry_price', 'exit_price', 'pnl', 'strategy_tag'];
  const columns = Object.keys(trades[0] || {}).filter(k => standardKeys.includes(k.toLowerCase()));

  const handleCellChange = (rowIndex: number, colKey: string, val: string) => {
    const updated = [...editedTrades];
    let numVal: number | string = val;
    if (val !== '' && !isNaN(Number(val))) {
      numVal = Number(val);
    }
    updated[rowIndex] = { ...updated[rowIndex], [colKey]: numVal };
    setEditedTrades(updated);
  };

  const handleSave = () => {
    onSave(editedTrades);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/80">
          <div>
            <h3 className="text-sm font-bold font-sans text-slate-200 uppercase tracking-wider">
              Raw Data Grid Editor ({editedTrades.length} Rows)
            </h3>
            <p className="text-xs text-slate-400">
              Directly edit trade values and re-run analytics pipeline
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Spreadsheet Grid */}
        <div className="flex-1 overflow-auto p-4 bg-slate-950/40">
          <table className="w-full text-left border-collapse font-sans text-xs">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 shadow z-10">
              <tr>
                <th className="p-2 border border-slate-800 text-slate-500 font-bold">#</th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="p-2 border border-slate-800 font-bold uppercase tracking-wider text-slate-300 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {editedTrades.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-2 border border-slate-800 text-slate-500 text-center font-bold">
                    {idx + 1}
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="p-1 border border-slate-800">
                      <input
                        type="text"
                        value={row[col] !== undefined && row[col] !== null ? String(row[col]) : ''}
                        onChange={(e) => handleCellChange(idx, col, e.target.value)}
                        className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-slate-600 px-1 py-0.5 font-sans text-xs text-slate-200"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-950/80">
          <button
            onClick={() => setEditedTrades(trades)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-sans flex items-center space-x-1.5 transition-colors border border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Edits</span>
          </button>

          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold font-sans transition-colors border border-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-[#A4D8FF]/60 text-[#A4D8FF] font-bold rounded text-xs font-sans flex items-center space-x-2 shadow-lg transition-all"
            >
              <Save className="w-4 h-4 text-[#A4D8FF]" />
              <span>Save &amp; Reanalyze</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
