import React, { useState, useEffect } from 'react';
import { X, Clock, Check, Settings, Save } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-2xl border border-stone-300 max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-stone-200 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center font-bold text-xs">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 tracking-tight">
                Anchor Times Settings
              </h3>
              <p className="text-xs text-stone-500 font-mono">
                Optional event-anchored time resolution
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-stone-600 leading-relaxed font-sans">
          When you say things like <em>"finish before work"</em> or <em>"submit after work"</em>, Gemini silently resolves due dates against these anchor times. Not required to use the app.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-semibold text-stone-700 mb-1">
              Before Work / Morning Anchor
            </label>
            <input
              type="time"
              value={beforeWork}
              onChange={(e) => setBeforeWork(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:border-stone-900 focus:ring-1 focus:ring-stone-900 font-mono text-sm outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold text-stone-700 mb-1">
              After Work / Evening Anchor
            </label>
            <input
              type="time"
              value={afterWork}
              onChange={(e) => setAfterWork(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:border-stone-900 focus:ring-1 focus:ring-stone-900 font-mono text-sm outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold text-stone-700 mb-1">
              Before Sleep / Night Anchor
            </label>
            <input
              type="time"
              value={beforeSleep}
              onChange={(e) => setBeforeSleep(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:border-stone-900 focus:ring-1 focus:ring-stone-900 font-mono text-sm outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 hover:bg-stone-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
            >
              {saved ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5 text-amber-400" />
                  <span>{saving ? 'Saving...' : 'Save Anchors'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
