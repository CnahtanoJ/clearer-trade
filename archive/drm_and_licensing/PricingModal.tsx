import React from 'react';
import { Check, Lock, ArrowRight, ExternalLink } from 'lucide-react';
import { getBuyUrl } from '@/lib/utils';
import { getPricingConfig } from '@/lib/pricing';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFreeDemo?: () => void; // Optional: only needed if they can click "Explore Free Demo"
  showFreeDemoButton?: boolean;
}

export const STORE_URL = "https://whop.com/clearertrade";

export default function PricingModal({ isOpen, onClose, onFreeDemo, showFreeDemoButton = false }: PricingModalProps) {
  if (!isOpen) return null;

  const pricing = getPricingConfig();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col my-auto max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <span className="font-black text-xl sm:text-2xl tracking-tight text-white italic lowercase">what do you get?</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition-colors"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>

        {/* Modal Body: Compact Comparison Table to prevent scroll */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Side-by-Side Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
            {/* Free Tier Card */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3 h-full">
              <div className="space-y-1.5 pt-[13px]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">Free Tier</h4>
                    <span className="bg-slate-800 text-slate-400 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0">
                      BASIC
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-semibold">$0 / Forever</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Essential trade log metrics &amp; interactive tag editing.
                </p>
              </div>
              {showFreeDemoButton ? (
                <button
                  onClick={onFreeDemo}
                  className="w-full h-9 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition-colors border border-slate-700 flex items-center justify-center space-x-1.5"
                >
                  <span>Explore Free Demo</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              ) : (
                <div className="h-9 flex items-center justify-center text-xs text-slate-500 font-semibold bg-slate-900/50 rounded-lg border border-slate-800">
                  Current Plan (If Not PRO)
                </div>
              )}
            </div>

            {/* Pro Tier Card */}
            <div className="bg-gradient-to-b from-sky-950/20 to-slate-950/80 border border-[#A4D8FF]/30 rounded-xl p-4 flex flex-col justify-between space-y-3 h-full relative overflow-hidden">
              <div className="absolute inset-0 bg-[#A4D8FF]/5 pointer-events-none"></div>
              <div className="space-y-1.5 relative z-10">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-bold text-[#A4D8FF] uppercase tracking-wider">PRO Access Key</h4>
                    <span className="bg-[#A4D8FF] text-black text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0">
                      {pricing.isDiscountActive ? pricing.promoTitle : 'PRO ACCESS'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {pricing.isDiscountActive && (
                      <span className="text-xs text-slate-500 line-through decoration-red-500/50">{pricing.regularPrice}</span>
                    )}
                    <span className="text-xs text-[#A4D8FF] font-bold">
                      {pricing.isDiscountActive ? pricing.discountedPrice : pricing.regularPrice} / Lifetime
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                  {pricing.promoNote}
                </p>
              </div>
              <a
                href={getBuyUrl()}
                id="pro-buy-link"
                target="_blank"
                rel="noreferrer"
                className="w-full h-9 bg-[#A4D8FF] hover:bg-sky-300 text-black font-bold text-xs rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-lg border border-[#A4D8FF] relative z-10"
              >
                <span>Get PRO Access Key ({pricing.isDiscountActive ? pricing.discountedPrice : pricing.regularPrice})</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Feature Comparison Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden text-[11px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                  <th className="p-2 pl-3 font-bold">Feature / Metric</th>
                  <th className="p-2 font-bold text-center w-24">Free Tier</th>
                  <th className="p-2 font-bold text-center w-32 text-[#A4D8FF] bg-[#A4D8FF]/5">PRO FEATURES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="p-2 pl-3">
                    <div className="font-semibold text-white">Private Trade Data</div>
                    <div className="text-[10px] text-slate-400">100% in-memory processing. Zero log retention.</div>
                  </td>
                  <td className="p-2 text-center"><Check className="w-3.5 h-3.5 text-slate-500 mx-auto" /></td>
                  <td className="p-2 text-center bg-[#A4D8FF]/5"><Check className="w-4 h-4 text-[#A4D8FF] mx-auto" /></td>
                </tr>

                <tr>
                  <td className="p-2 pl-3">
                    <div className="font-semibold text-white">Interactive Editor</div>
                    <div className="text-[10px] text-slate-400">Edit strategy tags in-browser &amp; export.</div>
                  </td>
                  <td className="p-2 text-center"><Check className="w-3.5 h-3.5 text-slate-500 mx-auto" /></td>
                  <td className="p-2 text-center bg-[#A4D8FF]/5"><Check className="w-4 h-4 text-[#A4D8FF] mx-auto" /></td>
                </tr>

                <tr>
                  <td className="p-2 pl-3">
                    <div className="font-semibold text-white">Core Metrics</div>
                    <div className="text-[10px] text-slate-400">Win Rate %, Net PnL, Profit Factor &amp; Max Drawdown.</div>
                  </td>
                  <td className="p-2 text-center"><Check className="w-3.5 h-3.5 text-slate-500 mx-auto" /></td>
                  <td className="p-2 text-center bg-[#A4D8FF]/5"><Check className="w-4 h-4 text-[#A4D8FF] mx-auto" /></td>
                </tr>

                <tr>
                  <td className="p-2 pl-3">
                    <div className="font-semibold text-white">Behavioral Leak Detection</div>
                    <div className="text-[10px] text-slate-400">Detect revenge trades, size spikes &amp; tilt.</div>
                  </td>
                  <td className="p-2 text-center text-slate-600"><Lock className="w-3.5 h-3.5 mx-auto" /></td>
                  <td className="p-2 text-center font-bold bg-[#A4D8FF]/5"><Check className="w-4 h-4 text-[#A4D8FF] mx-auto" /></td>
                </tr>

                <tr>
                  <td className="p-2 pl-3">
                    <div className="font-semibold text-white">Execution Timing Faults</div>
                    <div className="text-[10px] text-slate-400">Bad entry/exit timing (knives, chasing).</div>
                  </td>
                  <td className="p-2 text-center text-slate-600"><Lock className="w-3.5 h-3.5 mx-auto" /></td>
                  <td className="p-2 text-center font-bold bg-[#A4D8FF]/5"><Check className="w-4 h-4 text-[#A4D8FF] mx-auto" /></td>
                </tr>

                <tr>
                  <td className="p-2 pl-3">
                    <div className="font-semibold text-white">Tilt Loss Calculation</div>
                    <div className="text-[10px] text-slate-400">Calculate exact dollar losses from tilt.</div>
                  </td>
                  <td className="p-2 text-center text-slate-600"><Lock className="w-3.5 h-3.5 mx-auto" /></td>
                  <td className="p-2 text-center font-bold bg-[#A4D8FF]/5"><Check className="w-4 h-4 text-[#A4D8FF] mx-auto" /></td>
                </tr>

                <tr>
                  <td className="p-2 pl-3">
                    <div className="font-semibold text-white">Quantitative Risk</div>
                    <div className="text-[10px] text-slate-400">Sharpe Ratio &amp; expected return.</div>
                  </td>
                  <td className="p-2 text-center text-slate-600"><Lock className="w-3.5 h-3.5 mx-auto" /></td>
                  <td className="p-2 text-center font-bold bg-[#A4D8FF]/5"><Check className="w-4 h-4 text-[#A4D8FF] mx-auto" /></td>
                </tr>

                <tr>
                  <td className="p-2 pl-3">
                    <div className="font-semibold text-white">AI Behavioral Audit</div>
                    <div className="text-[10px] text-slate-400">AI critique &amp; risk guidelines.</div>
                  </td>
                  <td className="p-2 text-center text-slate-500 text-[9px]">BYOK Only</td>
                  <td className="p-2 text-center font-bold text-purple-400 bg-[#A4D8FF]/5 text-[10px]">{pricing.includedAudits} Lifetime Audits + BYOK</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
