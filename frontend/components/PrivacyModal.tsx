'use client';

import React from 'react';
import { X } from 'lucide-react';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacyModal({ isOpen, onClose }: PrivacyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden my-auto max-h-[90vh]">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Privacy Policy &amp; Security Architecture
            </h3>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
            <h4 className="font-bold text-white uppercase text-[11px] tracking-wider">1. 100% Stateless Trade Data &amp; Zero Retention</h4>
            <p className="text-slate-400 text-[11px]">
              clearer.trade operates on a 100% stateless architecture for all sensitive trade execution data. Uploaded CSV trade logs, PnL metrics, and strategy tags are processed in-memory during single request execution and immediately purged. We store zero trade logs, execution histories, or financial metrics on any database.
            </p>

            <h4 className="font-bold text-white uppercase text-[11px] tracking-wider">2. Third-Party AI Data Processing (BYOK)</h4>
            <p className="text-slate-400 text-[11px]">
              When utilizing custom OpenRouter API keys (BYOK), your keys are stored strictly inside your browser&apos;s local session storage. Prompts sent to OpenRouter or external LLM providers contain anonymized trade performance metrics and are governed under zero data retention policies for AI model training.
            </p>

            <h4 className="font-bold text-white uppercase text-[11px] tracking-wider">3. Local Browser Session Memory</h4>
            <p className="text-slate-400 text-[11px]">
              We do not use tracking cookies or sell user data. Active datasets and synced klines remain stored exclusively inside your browser&apos;s sessionStorage to prevent data loss on page refresh, and are automatically purged when you close your browser tab.
            </p>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-800/80 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
