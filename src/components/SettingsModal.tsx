import React, { useState, useEffect } from 'react';
import { Clock, Check, Save } from 'lucide-react';
import type { AnchorTimes } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  anchorTimes: AnchorTimes;
  onSaveAnchorTimes: (newTimes: AnchorTimes) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  anchorTimes,
  onSaveAnchorTimes,
}) => {
  const [beforeWork, setBeforeWork] = useState(anchorTimes.beforeWork || '08:30');
  const [afterWork, setAfterWork] = useState(anchorTimes.afterWork || '17:30');
  const [beforeSleep, setBeforeSleep] = useState(anchorTimes.beforeSleep || '23:00');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setBeforeWork(anchorTimes.beforeWork || '08:30');
      setAfterWork(anchorTimes.afterWork || '17:30');
      setBeforeSleep(anchorTimes.beforeSleep || '23:00');
      setSaved(false);
    }
  }, [isOpen, anchorTimes]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveAnchorTimes({
        beforeWork,
        afterWork,
        beforeSleep,
      });
      setSaved(true);
      setTimeout(() => {
        onClose();
      }, 700);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 font-sans select-none backdrop-blur-xs">
      <div className="retro-dialog max-w-md w-full bg-[#fffdfa] shadow-[5px_5px_0px_#2d2825] animate-in zoom-in-95 duration-100">
        {/* Title Bar with 3 Friendly Circular Buttons */}
        <div className="bg-[#f5b638] px-3 py-2 flex items-center justify-between border-b-2 border-[#2d2825]">
          <div className="flex items-center gap-2">
            <div className="retro-dots">
              <span className="retro-dot bg-[#ff7865]" />
              <span className="retro-dot bg-white" />
              <span className="retro-dot bg-[#52b7aa]" />
            </div>
            <div className="flex items-center gap-1.5 font-extrabold text-sm text-[#2d2825]">
              <Clock className="w-4 h-4 stroke-[2.5]" />
              <span>Anchor Times Settings</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 retro-btn flex items-center justify-center text-xs font-bold bg-[#fffdf9]"
          >
            ✕
          </button>
        </div>

        {/* Content Box */}
        <div className="p-4 space-y-3.5 text-xs text-[#2d2825]">
          <p className="font-medium text-stone-700 leading-relaxed">
            When you say natural phrases like <em>"finish before work"</em> or <em>"submit after work"</em>, deadlines calibrate silently against these personal anchors.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="retro-sunken p-3 space-y-3 bg-[#faf4e8]">
              <div>
                <label className="block text-xs font-bold text-[#2d2825] mb-1">
                  Before Work (Morning Anchor)
                </label>
                <input
                  type="time"
                  value={beforeWork}
                  onChange={(e) => setBeforeWork(e.target.value)}
                  className="retro-input w-full px-3 py-1.5 font-mono text-xs text-[#2d2825]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2d2825] mb-1">
                  After Work (Evening Anchor)
                </label>
                <input
                  type="time"
                  value={afterWork}
                  onChange={(e) => setAfterWork(e.target.value)}
                  className="retro-input w-full px-3 py-1.5 font-mono text-xs text-[#2d2825]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2d2825] mb-1">
                  Before Sleep (Night Anchor)
                </label>
                <input
                  type="time"
                  value={beforeSleep}
                  onChange={(e) => setBeforeSleep(e.target.value)}
                  className="retro-input w-full px-3 py-1.5 font-mono text-xs text-[#2d2825]"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="retro-btn px-4 py-1.5 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="retro-btn-primary px-5 py-1.5 text-xs font-bold flex items-center gap-1.5"
              >
                {saved ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
