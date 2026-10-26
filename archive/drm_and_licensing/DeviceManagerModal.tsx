'use client';

import React, { useState, useEffect } from 'react';
import { Laptop, X, RefreshCw, AlertTriangle, CheckCircle, Clock, Check, LogOut } from 'lucide-react';
import { resetDeviceSlot, fetchTraderQuota } from '@/lib/api';
import { getHardwareFingerprint } from '@/lib/fingerprint';

export interface DeviceSlot {
  slot: number;
  fingerprint: string;
  name: string;
  activated_at: string;
  last_active?: string;
  last_reset_at?: string;
}

interface DeviceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  devices: DeviceSlot[];
  onDevicesUpdated?: () => void;
}

export default function DeviceManagerModal({
  isOpen,
  onClose,
  accessToken,
  devices = [],
  onDevicesUpdated,
}: DeviceManagerModalProps) {
  const [loadingSlot, setLoadingSlot] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [fetchedDevices, setFetchedDevices] = useState<DeviceSlot[]>([]);
  const [currentFp, setCurrentFp] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentFp(getHardwareFingerprint());
    }
  }, []);

  useEffect(() => {
    if (isOpen && accessToken) {
      fetchTraderQuota(accessToken).then((res) => {
        if (res && res.success && Array.isArray(res.devices)) {
          setFetchedDevices(res.devices);
        }
      });
    }
  }, [isOpen, accessToken]);

  if (!isOpen) return null;

  const currentDevices = (fetchedDevices && fetchedDevices.length > 0) ? fetchedDevices : devices;

  const handleResetSlot = async (slotId: number) => {
    setLoadingSlot(slotId);
    setMsg(null);
    try {
      const res = await resetDeviceSlot({
        accessToken,
        slotId,
      });

      if (res.success) {
        setMsg({ type: 'success', text: res.message || `Device slot #${slotId} successfully disconnected!` });
        if (Array.isArray(res.devices)) {
          setFetchedDevices(res.devices);
        }
        if (onDevicesUpdated) onDevicesUpdated();
      } else {
        setMsg({ type: 'error', text: res.message || `Failed to disconnect device seat #${slotId}.` });
      }
    } catch {
      setMsg({ type: 'error', text: 'Error connecting to server. Please try again.' });
    } finally {
      setLoadingSlot(null);
    }
  };

  const filledSlots = [1, 2, 3].map((slotNum) => {
    return currentDevices.find((d) => d.slot === slotNum) || null;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col space-y-4 p-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-[#A4D8FF]/10 border border-[#A4D8FF]/20 rounded-lg text-[#A4D8FF]">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider">
                Manage Registered Devices
              </h3>
              <p className="text-[11px] text-slate-400">3x Active Device Seat Limit (7-Day Reset Cooldown)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {msg && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center space-x-2 border ${
              msg.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
            }`}
          >
            {msg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{msg.text}</span>
          </div>
        )}

        <div className="space-y-3">
          {filledSlots.map((slotData, index) => {
            const slotNum = index + 1;
            const isActivated = Boolean(slotData);
            const isThisDevice = Boolean(isActivated && slotData?.fingerprint && slotData.fingerprint === currentFp);

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

            return (
              <div
                key={slotNum}
                className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  <span className="text-xs font-semibold text-slate-500 shrink-0 w-5 select-none">
                    #{slotNum}
                  </span>
                  <div className="overflow-hidden space-y-0.5">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="text-xs font-semibold text-slate-200 truncate">
                        {isActivated ? slotData?.name || `Registered Device ${slotNum}` : 'Empty Slot'}
                      </span>
                      {isThisDevice ? (
                        <span className="text-[10px] bg-sky-950/80 border border-sky-800/80 text-sky-300 px-1.5 py-0.5 rounded font-medium flex items-center space-x-1">
                          <Check className="w-2.5 h-2.5 inline" />
                          <span>This Device</span>
                        </span>
                      ) : isActivated ? (
                        <span className="text-[10px] bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      {isActivated && slotData?.activated_at
                        ? `Activated: ${new Date(slotData.activated_at).toLocaleDateString()}`
                        : 'Available for activation'}
                    </p>
                  </div>
                </div>

                {isActivated && !isThisDevice && (
                  <button
                    onClick={() => handleResetSlot(slotNum)}
                    disabled={loadingSlot === slotNum || cooldownActive}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center space-x-1.5 transition-colors border shrink-0 ${
                      cooldownActive
                        ? 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
                        : 'bg-slate-800 hover:bg-red-950/60 hover:text-red-300 text-slate-300 border-slate-700 hover:border-red-800/80'
                    }`}
                    title={
                      cooldownActive
                        ? `Reset available in ${daysLeft} day(s)`
                        : `Disconnect device in slot #${slotNum}`
                    }
                  >
                    {loadingSlot === slotNum ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                    ) : cooldownActive ? (
                      <>
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span className="text-[10px]">{daysLeft}d Cooldown</span>
                      </>
                    ) : (
                      <>
                        <LogOut className="w-3 h-3" />
                        <span>Disconnect</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg font-semibold transition-colors border border-slate-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
