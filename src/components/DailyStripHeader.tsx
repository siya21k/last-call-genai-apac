import React, { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Check, FileText } from 'lucide-react';
import type { DailyStrip } from '../types';

interface DailyStripHeaderProps {
  strips: DailyStrip[];
  onMoodTap?: (date: string, mood: string | null) => Promise<void>;
}

const MOOD_OPTIONS = [
  { emoji: '⚡', label: 'Energetic', desc: 'high gear' },
  { emoji: '🌿', label: 'Calm', desc: 'steady' },
  { emoji: '🌫️', label: 'Foggy', desc: 'drifting' },
  { emoji: '🥱', label: 'Tired', desc: 'low battery' },
  { emoji: '🫠', label: 'Overwhelmed', desc: 'melting' },
];

export const DailyStripHeader: React.FC<DailyStripHeaderProps> = ({ strips, onMoodTap }) => {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [isUpdatingMood, setIsUpdatingMood] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayStrip = strips.find((s) => s.date === todayStr);
  const activeStrips = strips.filter((s) => s.line && s.line.trim().length > 0);

  const formatStripDate = (dateStr: string) => {
    try {
      if (dateStr === todayStr) return 'Today';
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0];
      if (dateStr === yesterday) return 'Yesterday';
      const target = new Date(dateStr + 'T00:00:00');
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

  const handleSelectMood = async (emoji: string) => {
    if (!onMoodTap || isUpdatingMood) return;
    const currentMood = todayStrip?.mood;
    const nextMood = currentMood === emoji ? null : emoji;
    setIsUpdatingMood(true);
    try {
      await onMoodTap(todayStr, nextMood);
    } finally {
      setIsUpdatingMood(false);
    }
  };

  const expandedStrip = strips.find((s) => s.date === expandedDate);

  return (
    <div className="mb-3 space-y-2 select-none font-sans">
      {/* Daily Strip Window Bar */}
      <div className="retro-card bg-[#fffdfa] p-2.5 space-y-2 shadow-[3px_3px_0px_#2d2825]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Title & Dots */}
          <div className="flex items-center gap-2">
            <div className="retro-dots">
              <span className="retro-dot bg-[#ff7865]" />
              <span className="retro-dot bg-[#f5b638]" />
              <span className="retro-dot bg-[#52b7aa]" />
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#f5b638]/30 border border-[#2d2825] text-xs font-bold text-[#2d2825]">
              <Calendar className="w-3.5 h-3.5 text-[#2d2825] stroke-[2.5]" />
              <span>Daily Strip</span>
            </div>
          </div>

          {/* Optional Mood Tap for Today */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-bold text-stone-600 hidden sm:inline">
              Vibe:
            </span>
            <div className="flex items-center gap-1 p-0.5 bg-[#faf4e8] border border-[#2d2825] rounded-xl">
              {MOOD_OPTIONS.map((m) => {
                const isSelected = todayStrip?.mood === m.emoji;
                return (
                  <button
                    key={m.emoji}
                    type="button"
                    onClick={() => handleSelectMood(m.emoji)}
                    disabled={isUpdatingMood}
                    title={`${m.label} (${m.desc}) — optionally flavors today's summary`}
                    className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-[#ff7865] text-white border-2 border-[#2d2825] shadow-[1.5px_1.5px_0px_#2d2825] scale-105'
                        : 'hover:bg-white/80 active:scale-95'
                    }`}
                  >
                    <span>{m.emoji}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Strips Carousel / Buttons */}
        {activeStrips.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
            {activeStrips.map((strip) => {
              const isExpanded = expandedDate === strip.date;
              const itemCount = strip.items?.length || 0;

              return (
                <button
                  key={strip.date}
                  type="button"
                  onClick={() => toggleExpand(strip.date)}
                  className={`retro-btn px-3 py-1 text-xs flex items-center gap-2 shrink-0 ${
                    isExpanded
                      ? 'bg-[#fca5b0]/50 border-2 border-[#2d2825] shadow-[1px_1px_0px_#2d2825] translate-x-[1px] translate-y-[1px]'
                      : 'bg-[#fffdf9]'
                  }`}
                  title="Click to view logged activities"
                >
                  <span className="font-extrabold text-[#2d2825] text-[11px] shrink-0">
                    {formatStripDate(strip.date)}:
                  </span>
                  {strip.mood && <span className="text-xs shrink-0">{strip.mood}</span>}
                  <span className="truncate max-w-[180px] sm:max-w-xs text-stone-800 font-sans">
                    "{strip.line}"
                  </span>
                  {itemCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-md bg-[#faf4e8] border border-[#2d2825] text-[10px] font-mono font-bold text-[#2d2825]">
                      {itemCount}
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-stone-700 shrink-0 stroke-[2.5]" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-stone-700 shrink-0 stroke-[2.5]" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-stone-500 font-sans italic px-1">
            Activity summary will appear here as tasks and notes are logged.
          </div>
        )}
      </div>

      {/* Expandable Activity Details Window */}
      {expandedStrip && (
        <div className="retro-dialog bg-[#fffdfa] p-3 space-y-2 text-xs shadow-[3px_3px_0px_#2d2825]">
          <div className="flex items-center justify-between pb-1.5 border-b-2 border-[#2d2825]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#52b7aa] border border-[#2d2825] flex items-center justify-center text-white">
                <Calendar className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <span className="font-bold text-sm text-[#2d2825]">
                Activity Log — {formatStripDate(expandedStrip.date)}
              </span>
              {expandedStrip.mood && (
                <span className="text-sm px-1.5 py-0.5 rounded-full bg-[#f5b638]/40 border border-[#2d2825]">
                  {expandedStrip.mood}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpandedDate(null)}
              className="w-6 h-6 retro-btn flex items-center justify-center font-bold text-xs"
            >
              ✕
            </button>
          </div>

          <div className="retro-sunken p-2.5 max-h-56 overflow-y-auto space-y-1.5 bg-[#ffffff] select-text">
            {expandedStrip.items && expandedStrip.items.length > 0 ? (
              expandedStrip.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg border border-stone-200 bg-[#fffdfa] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.type === 'task' ? (
                      <div className="w-4 h-4 rounded-md bg-[#52b7aa]/30 border border-[#2d2825] flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-[#2d2825] stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-md bg-[#f5b638]/30 border border-[#2d2825] flex items-center justify-center shrink-0">
                        <FileText className="w-3 h-3 text-[#2d2825] stroke-[2.5]" />
                      </div>
                    )}
                    <span className="truncate font-sans font-medium text-stone-900">{item.text}</span>
                  </div>
                  {item.timestamp && (
                    <span className="text-[10px] font-mono text-stone-500 shrink-0">
                      {formatItemTime(item.timestamp)}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p className="text-stone-500 font-sans text-xs py-2 text-center italic">
                "{expandedStrip.line}"
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
