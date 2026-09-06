import React from 'react';
import { Sparkles, Calendar, ChevronRight } from 'lucide-react';
import type { DailyStrip } from '../types';

interface DailyStripHeaderProps {
  strips: DailyStrip[];
}

export const DailyStripHeader: React.FC<DailyStripHeaderProps> = ({ strips }) => {
  // A day with nothing logged simply doesn't appear — never shown as empty or red.
  const activeStrips = strips.filter((s) => s.line && s.line.trim().length > 0);

  if (activeStrips.length === 0) {
    return null;
  }

  const formatStripDate = (dateStr: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const target = new Date(dateStr + 'T00:00:00');
      if (dateStr === today) {
        return 'Today';
      }
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0];
      if (dateStr === yesterday) {
        return 'Yesterday';
      }
      return target.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="mb-3 px-1 py-1 flex items-center gap-2 overflow-x-auto no-scrollbar select-none">
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-200/80 text-stone-700 text-[10px] font-mono font-bold tracking-wider uppercase shrink-0">
        <Calendar className="w-3 h-3 text-stone-500" />
        <span>DAILY STRIP</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {activeStrips.map((strip) => (
          <div
            key={strip.date}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/90 border border-stone-200/90 shadow-xs text-xs font-mono shrink-0 hover:border-stone-300 transition-colors"
          >
            <span className="text-amber-700 font-bold text-[11px] shrink-0">
              {formatStripDate(strip.date)}:
            </span>
            <span className="text-stone-700 text-xs truncate max-w-[280px] sm:max-w-md">
              "{strip.line}"
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
