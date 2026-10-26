'use client';

import React from 'react';
import { Gift, X, CheckCircle, ExternalLink } from 'lucide-react';

interface AffiliateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AffiliateModal({ isOpen, onClose }: AffiliateModalProps) {
  if (!isOpen) return null;

  const affiliatePortalUrl = process.env.NEXT_PUBLIC_AFFILIATE_URL || "https://whop.com/clearertrade/affiliates";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-[#A4D8FF]/10 border border-[#A4D8FF]/20 rounded-lg text-[#A4D8FF]">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                <span>Affiliate Partner Program</span>
                <span className="text-[10px] bg-[#A4D8FF]/10 text-[#A4D8FF] px-2 py-0.5 rounded border border-[#A4D8FF]/30 font-extrabold">
                  30%+ COMMISSION
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Earn 30%+ payout on every PRO Access Key sold.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-slate-300">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <div className="text-[#A4D8FF] font-bold">
              <span>How the Partner Program Works</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Share your official Whop referral link with your trading community, Twitter/X followers, YouTube viewers, or Discord members. When a trader upgrades to clearer.trade PRO via Whop, you instantly get credited with <strong className="text-slate-200">30%+ of the sale</strong>.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-slate-200 uppercase text-[11px] tracking-wider">Partner Benefits:</h4>
            <ul className="space-y-2 text-[11px] text-slate-400">
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-[#A4D8FF] shrink-0" />
                <span>30%+ direct commission on all PRO license purchases</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-[#A4D8FF] shrink-0" />
                <span>Automated instant payouts managed directly through Whop</span>
              </li>
              <li className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-[#A4D8FF] shrink-0" />
                <span>High conversion rates for institutional trading logs &amp; AI behavioral audit features</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">Powered by Whop Affiliates</span>
          <a
            href={affiliatePortalUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 bg-[#A4D8FF] hover:bg-[#8ccaff] text-black font-bold text-xs rounded-lg transition-all flex items-center space-x-1.5 shadow-md border border-[#A4D8FF]"
          >
            <span>Join Program &amp; Get Links</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
