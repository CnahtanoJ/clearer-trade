'use client';

import React, { useState } from 'react';
import { Key, AlertCircle, Loader2, ArrowRight, ExternalLink, Laptop, RefreshCw, AlertTriangle, ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import { loginWithAccessToken, resetDeviceSlot } from '@/lib/api';
import { getHardwareFingerprint, getDeviceDisplayName } from '@/lib/fingerprint';
import { getBuyUrl } from '@/lib/utils';

const STORE_BUY_URL = getBuyUrl();

export interface DeviceSlotInfo {
  slot: number;
  fingerprint: string;
  name: string;
  activated_at: string;
  last_active?: string;
  last_reset_at?: string;
}

interface LoginModalProps {
  onSuccess: (token: string, traderId: string) => void;
  onOpenDisclaimer: () => void;
  onOpenPricing: () => void;
  onOpenDeviceManager?: (token?: string) => void;
}

export default function LoginModal({ onSuccess, onOpenDisclaimer, onOpenPricing, onOpenDeviceManager }: LoginModalProps) {
  const [accessToken, setAccessToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Device limit replacement state
  const [deviceLimitReached, setDeviceLimitReached] = useState(false);
  const [registeredDevices, setRegisteredDevices] = useState<DeviceSlotInfo[]>([]);
  const [replacingSlot, setReplacingSlot] = useState<number | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceSuccess, setReplaceSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken.trim()) {
      setError('Please enter your Access Key or click "Explore Live Demo Dashboard".');
      return;
    }

    setLoading(true);
    setError(null);
    setDeviceLimitReached(false);
    setReplaceError(null);
    setReplaceSuccess(null);

    try {
      const res = await loginWithAccessToken(accessToken.trim());
      if (res.success) {
        onSuccess(accessToken.trim(), res.trader_id || 'TRADER');
      } else if (res.devices_full) {
        setDeviceLimitReached(true);
        setRegisteredDevices(Array.isArray(res.devices) ? res.devices : []);
      } else {
        setError(res.error || 'Invalid Access Token.');
      }
    } catch {
      setError('Failed to connect to backend server. Make sure FastAPI is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceSeatAndLogin = async (slotNum: number) => {
    setReplacingSlot(slotNum);
    setReplaceError(null);
    setReplaceSuccess(null);

    try {
      const res = await resetDeviceSlot({
        accessToken: accessToken.trim(),
        slotId: slotNum,
        newFingerprint: getHardwareFingerprint(),
        deviceName: getDeviceDisplayName(),
      });

      if (res.success) {
        setReplaceSuccess(`Device Slot #${slotNum} replaced successfully! Authorizing...`);
        // Immediately complete login after replacement!
        setTimeout(() => {
          onSuccess(accessToken.trim(), 'TRADER');
        }, 600);
      } else {
        setReplaceError(res.message || `Failed to reset Device Slot #${slotNum}.`);
      }
    } catch {
      setReplaceError('Connection error while resetting device slot. Please try again.');
    } finally {
      setReplacingSlot(null);
    }
  };

  // Check if all 3 slots are locked on 7-day cooldown
  const allSlotsCooldown =
    registeredDevices.length >= 3 &&
    registeredDevices.every((slot) => {
      if (!slot.last_reset_at) return false;
      const rstDate = new Date(slot.last_reset_at);
      const diff = Math.floor((Date.now() - rstDate.getTime()) / (1000 * 3600 * 24));
      return diff < 7;
    });

  return (
    <div className="min-h-screen bg-transparent text-slate-200 font-sans flex flex-col justify-between p-6 sm:p-10 relative overflow-hidden">
      {/* Background Decorative Glow (Desktop Only) */}
      <div className="hidden sm:block absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-[#A4D8FF]/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Hero & Portal Body */}
      <main className="max-w-md w-full mx-auto my-auto py-12 z-10 space-y-6 text-center">
        {/* Title & Tagline */}
        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white italic lowercase">
            clearer.trade
          </h1>

          <p className="text-xs text-slate-400 italic max-w-sm mx-auto leading-relaxed pt-1">
            &ldquo;If you know the enemy and know yourself, you need not fear the result of a hundred battles.&rdquo;
            <span className="block text-[10px] text-slate-500 font-semibold not-italic mt-1 uppercase tracking-wider">— Sun Tzu, The Art of War</span>
          </p>
        </div>

        {/* Card Box Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5 text-left backdrop-blur-none sm:backdrop-blur-md">
          {/* Device Limit Reached View */}
          {deviceLimitReached ? (
            <div className="space-y-4">
              {allSlotsCooldown ? (
                <div className="p-3.5 bg-amber-950/50 border border-amber-800/80 rounded-xl space-y-1.5 text-amber-200">
                  <div className="flex items-center space-x-2 font-semibold text-xs text-amber-300">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>All 3 Device Seats Locked on Cooldown</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    To prevent unauthorized key sharing, slots cannot be reset more than once every 7 days. Please access clearer.trade from one of your existing registered devices below.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-950/40 border border-amber-800/60 rounded-xl space-y-1.5 text-amber-200">
                  <div className="flex items-center space-x-2 font-semibold text-xs text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>3/3 Active Device Seats Full</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Your Access Key is valid, but all 3 registered device seats are in use. Select a device below to disconnect and authorize this device:
                  </p>
                </div>
              )}

              {replaceError && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg flex items-center space-x-2 text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{replaceError}</span>
                </div>
              )}

              {replaceSuccess && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-lg flex items-center space-x-2 text-emerald-300 text-xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{replaceSuccess}</span>
                </div>
              )}

              {/* List of 3 active devices */}
              <div className="space-y-2.5 pt-1">
                {[1, 2, 3].map((slotNum) => {
                  const slotData = registeredDevices.find((d) => d.slot === slotNum) || registeredDevices[slotNum - 1];

                  let cooldownActive = false;
                  let daysLeft = 0;
                  if (slotData?.last_reset_at) {
                    const rstDate = new Date(slotData.last_reset_at);
                    const now = new Date();
                    const daysDiff = Math.floor((now.getTime() - rstDate.getTime()) / (1000 * 3600 * 24));
                    if (daysDiff < 7) {
                      cooldownActive = true;
                      daysLeft = Math.max(1, 7 - daysDiff);
                    }
                  }
                  const isBusy = replacingSlot === slotNum;

                  return (
                    <div
                      key={slotNum}
                      className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <span className="text-xs font-semibold text-slate-500 shrink-0 w-5 select-none">
                          #{slotNum}
                        </span>
                        <div className="overflow-hidden space-y-0.5">
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {slotData?.name || `Device Slot ${slotNum}`}
                            </span>
                            <span className="text-[10px] bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                              Active
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">
                            {slotData?.last_active
                              ? `Active: ${new Date(slotData.last_active).toLocaleDateString()}`
                              : slotData?.activated_at
                              ? `Activated: ${new Date(slotData.activated_at).toLocaleDateString()}`
                              : 'Registered seat'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleReplaceSeatAndLogin(slotNum)}
                        disabled={cooldownActive || isBusy || replacingSlot !== null}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center space-x-1.5 transition-colors border shrink-0 ${
                          cooldownActive
                            ? 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
                            : 'bg-[#A4D8FF] hover:bg-sky-300 text-black border-[#A4D8FF] font-bold shadow-md'
                        }`}
                        title={cooldownActive ? `Reset cooldown active (${daysLeft}d remaining)` : `Disconnect slot #${slotNum} and authorize this device`}
                      >
                        {isBusy ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Replacing...</span>
                          </>
                        ) : cooldownActive ? (
                          <>
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span className="text-[10px]">{daysLeft}d Cooldown</span>
                          </>
                        ) : (
                          <>
                            <Laptop className="w-3 h-3" />
                            <span>Replace &amp; Log In</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setDeviceLimitReached(false)}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5 border border-slate-700"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Key Input</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg flex items-center space-x-2 text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                      PRO Access Key
                    </label>
                    <a
                      href={STORE_BUY_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#A4D8FF] hover:text-[#A4D8FF] font-semibold flex items-center space-x-1"
                    >
                      <span>Buy Key</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Paste your access key..."
                    className="w-full px-4 py-2.5 bg-black border border-slate-800 rounded-xl text-white placeholder-slate-600 text-xs focus:outline-none focus:border-[#A4D8FF]/50 font-mono transition-colors"
                  />
                  <p className="text-[10px] text-slate-300 mt-1.5 leading-normal">
                    Licenses enforce 3x active device seat limits. Database is used strictly to validate active licenses, enforce 3x device seat limits, &amp; track AI audit quota (zero trade logs saved).{' '}
                    {onOpenDeviceManager && (
                      <button
                        type="button"
                        onClick={() => onOpenDeviceManager(accessToken)}
                        className="text-[#A4D8FF] underline font-semibold hover:text-white"
                      >
                        Manage Registered Devices
                      </button>
                    )}.
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-[#A4D8FF] hover:bg-[#A4D8FF] text-black font-bold rounded-xl text-xs transition-colors flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying License...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>Unlock Pro Features</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSuccess('', 'GUEST (DEMO)')}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5 border border-slate-700"
                  >
                    <span>Explore Live Demo Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        {/* Links */}
        <div className="flex items-center justify-center space-x-4 text-[11px] text-slate-500">
          <button
            type="button"
            onClick={onOpenPricing}
            className="text-[#A4D8FF] hover:text-[#A4D8FF] font-semibold transition-colors"
          >
            <span>Pricing &amp; Feature Comparison</span>
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={onOpenDisclaimer}
            className="hover:text-slate-300 underline transition-colors"
          >
            Risk Disclaimer &amp; License
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 z-10 pt-6 border-t border-slate-900 gap-2">
        <p>© 2026 clearer.trade. All rights reserved.</p>
        <p>Stateless analytics suite for traders.</p>
      </footer>
    </div>
  );
}
