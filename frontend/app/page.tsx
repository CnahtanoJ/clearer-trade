'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const Dashboard = dynamic(() => import('@/components/Dashboard'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-[#070a0f] text-slate-200">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-[#A4D8FF]" />
        <p className="text-sm font-semibold tracking-wider uppercase">Loading Dashboard...</p>
      </div>
    </div>
  ),
});

const DisclaimerModal = dynamic(() => import('@/components/DisclaimerModal'), {
  ssr: false,
});

export default function Home() {
  const [traderId, setTraderId] = useState('Trader');
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedTraderId = localStorage.getItem('trader_id');
    if (savedTraderId) {
      setTraderId(savedTraderId);
    }
  }, []);

  if (!isMounted) return null;

  return (
    <main className="min-h-screen bg-transparent text-white selection:bg-neutral-800 relative z-10">
      <Dashboard
        traderId={traderId}
        onOpenDisclaimer={() => setIsDisclaimerOpen(true)}
      />

      <DisclaimerModal
        isOpen={isDisclaimerOpen}
        onClose={() => setIsDisclaimerOpen(false)}
      />
    </main>
  );
}
