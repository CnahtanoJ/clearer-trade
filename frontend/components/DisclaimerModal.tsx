'use client';

import React from 'react';
import { X } from 'lucide-react';

interface DisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DisclaimerModal({ isOpen, onClose }: DisclaimerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl relative text-slate-200 font-sans">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <h3 className="font-bold text-base uppercase tracking-wider text-white">Financial &amp; Risk Disclaimer</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs text-slate-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
          <p>
            <strong className="text-white">Not Financial Advice:</strong> All performance metrics, automated audits, and behavioral analyses provided by <span className="font-bold text-white italic">clearer.trade</span> are historical software diagnostic tools for educational review only. Nothing on this platform constitutes financial, investment, legal, or trading advice. We are not registered with SEC, CFTC, FCA, or ESMA.
          </p>
          <p>
            <strong className="text-white">High Risk Capital Warning:</strong> Trading financial instruments (including crypto, equities, foreign exchange, and futures) involves substantial risk of loss and is not suitable for all investors. Counterfactual simulations and disciplined cumulative PnL curves are mathematical models; past performance does not guarantee future gains.
          </p>
          <p>
            <strong className="text-white">AI Diagnostic Heuristics:</strong> AI-generated behavioral audits and tilt detection algorithms are automated statistical heuristic tools based on uploaded execution data. They should not be relied upon as sole indicators for risk management or active market positioning.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg text-sm transition-colors border border-slate-700"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}
