import React, { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, CheckCircle2, ListChecks, FileText, Clock } from 'lucide-react';
import type { DailyStrip } from '../types';

interface DailyStripHeaderProps {
  strips: DailyStrip[];
}

export const DailyStripHeader: React.FC<DailyStripHeaderProps> = ({ strips }) => {
  // A day with nothing logged simply doesn't appear — never shown as empty or red.
  const activeStrips = strips.filter((s) => s.line && s.line.trim().length > 0);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

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

  const formatItemTime = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const toggleExpand = (date: string) => {
    setExpandedDate((prev) => (prev === date ? null : date));
  };

  const expandedStrip = activeStrips.find((s) => s.date === expandedDate);

  return (
    <div className="mb-3 space-y-2 select-none font-sans">
      {/* Horizontal Strip Carousel / Chips */}
      <div className="px-1 py-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-200/80 text-stone-700 text-[10px] font-mono font-bold tracking-wider uppercase shrink-0">
          <Calendar className="w-3 h-3 text-stone-500" />
          <span>DAILY STRIP</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {activeStrips.map((strip) => {
            const isExpanded = expandedDate === strip.date;
            const itemCount = strip.items?.length || 0;

            return (
              <button
                key={strip.date}
                type="button"
                onClick={() => toggleExpand(strip.date)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono shrink-0 transition-all cursor-pointer ${
                  isExpanded
                    ? 'bg-amber-100/80 border-amber-400 text-stone-900 shadow-xs'
                    : 'bg-white/90 border-stone-200/90 shadow-xs text-stone-700 hover:border-stone-400'
                }`}
                title="Click to expand activities and logs for this day"
              >
                <span className="text-amber-800 font-bold text-[11px] shrink-0">
                  {formatStripDate(strip.date)}:
                </span>
                <span className="truncate max-w-[240px] sm:max-w-xs text-stone-700">
                  "{strip.line}"
                </span>
                {itemCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-stone-100 rounded text-[10px] text-stone-500 font-sans font-medium">
                    {itemCount}
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expandable Plain List View of Completed Tasks & Log Entries */}
      {expandedStrip && (
        <div className="mx-1 p-3.5 bg-stone-50/95 rounded-2xl border border-stone-300 shadow-xs space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="font-bold text-stone-900 uppercase">
                {formatStripDate(expandedStrip.date)} // ACTIVITY LOG
              </span>
              <span className="text-[11px] text-stone-500 font-sans italic">
                "{expandedStrip.line}"
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExpandedDate(null)}
              className="text-[11px] font-mono text-stone-500 hover:text-stone-900 transition-colors px-2 py-0.5 rounded bg-stone-200/60"
            >
              Close
            </button>
          </div>

          {/* Plain List */}
          {expandedStrip.items && expandedStrip.items.length > 0 ? (
            <ul className="space-y-1.5">
              {expandedStrip.items.map((item, idx) => {
                const isTask = item.type === 'task';
                const timeStr = formatItemTime(item.timestamp || item.time);

                return (
                  <li
                    key={item.id || `${item.type}-${idx}`}
                    className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg bg-white border border-stone-200/80 text-xs font-sans text-stone-800"
                  >
                    <div className="mt-0.5 shrink-0">
                      {isTask ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-amber-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <span className="leading-snug break-words">
                        <span className="font-mono text-[10px] text-stone-400 uppercase mr-1.5">
                          [{isTask ? 'COMPLETED TASK' : 'LOGGED'}]
                        </span>
                        {item.text}
                      </span>
                      {timeStr && (
                        <span className="font-mono text-[10px] text-stone-400 shrink-0 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {timeStr}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="py-3 px-2 text-stone-500 font-mono text-xs flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-stone-400" />
              <span>Summary recorded: "{expandedStrip.line}"</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
