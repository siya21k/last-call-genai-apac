import React from 'react';
import { Flame, AlertTriangle, CalendarClock, Info, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import type { UserStatus } from '../types';

interface StatusSummaryProps {
  status: UserStatus | null;
  loading?: boolean;
}

export const StatusSummary: React.FC<StatusSummaryProps> = ({ status, loading }) => {
  const streak = status?.streak ?? 0;
  const currentRiskLevel = status?.currentRiskLevel ?? 'none';
  const nextDeadlineName = status?.nextDeadlineName;
  const nextDeadlineAt = status?.nextDeadlineAt;

  const formatDueRelative = (isoString?: string | null) => {
    if (!isoString) return 'No pending deadlines';
    const due = new Date(isoString).getTime();
    const now = Date.now();
    const diffMs = due - now;

    if (diffMs < 0) {
      const minsAgo = Math.floor(Math.abs(diffMs) / (1000 * 60));
      const hoursAgo = Math.floor(minsAgo / 60);
      if (hoursAgo > 0) return `${hoursAgo}h ${minsAgo % 60}m overdue (Post-mortem ready)`;
      return `${minsAgo}m overdue (Post-mortem ready)`;
    }

    const mins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `Due in ${days}d ${hours % 24}h`;
    if (hours > 0) return `Due in ${hours}h ${mins % 60}m`;
    return `Due in ${mins}m`;
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'critical':
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-800',
          dot: 'bg-rose-600 animate-pulse',
          label: 'Critical Risk',
          sub: 'Immediate intervention needed',
        };
      case 'medium':
        return {
          bg: 'bg-amber-50 border-amber-200 text-amber-800',
          dot: 'bg-amber-500',
          label: 'Medium Risk',
          sub: 'Friction detected on active task',
        };
      case 'low':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          dot: 'bg-emerald-500',
          label: 'Low Risk',
          sub: 'Low friction reported',
        };
      default:
        return {
          bg: 'bg-stone-100 border-stone-200 text-stone-600',
          dot: 'bg-stone-400',
          label: 'Clear / None',
          sub: 'No active friction logged',
        };
    }
  };

  const riskBadge = getRiskBadge(currentRiskLevel);

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Bento Tile: Streak: "Eventually Done" Framing */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-sm hover:border-amber-200/80 transition-all flex flex-col justify-between group">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/70 text-amber-600 flex items-center justify-center shadow-xs">
              <Flame className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 font-mono">
              Momentum
            </span>
          </div>
          <div className="group/tip relative cursor-pointer" title="About streak calculation">
            <Info className="w-4 h-4 text-stone-400 hover:text-stone-600 transition-colors" />
            <div className="absolute right-0 bottom-full mb-2 hidden group-hover/tip:block w-64 p-3 bg-stone-900 text-stone-100 text-[11px] rounded-xl shadow-xl z-30 leading-snug border border-stone-800">
              <span className="font-semibold text-amber-400">"Eventually Done" Metric:</span> Tasks marked completed (even after their initial deadline passed) still count toward your streak. Finishing late is real progress.
            </div>
          </div>
        </div>

        <div className="my-3">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-mono font-bold text-stone-900 tracking-tight">
              {streak}
            </span>
            <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider font-mono">
              completed
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1 leading-relaxed">
            Consecutive completed tasks. Late finishes count.
          </p>
        </div>

        <div className="pt-2.5 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400 font-mono">
          <span>Walks to last missed</span>
          <span className="text-amber-600 font-medium">ADHD-Calibrated</span>
        </div>
      </div>

      {/* 2. Bento Tile: Next Horizon Deadline */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-sm hover:border-sky-200/80 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200/70 text-sky-600 flex items-center justify-center shadow-xs">
              <CalendarClock className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 font-mono">
              Horizon
            </span>
          </div>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium border border-stone-200/60">
            Next Up
          </span>
        </div>

        <div className="my-3">
          <div className="font-semibold text-stone-900 text-base truncate" title={nextDeadlineName || 'No pending tasks'}>
            {nextDeadlineName || 'All caught up'}
          </div>
          <div className="text-xs font-mono font-medium text-sky-700 mt-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
            <span>{formatDueRelative(nextDeadlineAt)}</span>
          </div>
        </div>

        <div className="pt-2.5 border-t border-stone-100 text-[11px] text-stone-400 font-mono truncate">
          {nextDeadlineAt ? new Date(nextDeadlineAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'No upcoming deadlines'}
        </div>
      </div>

      {/* 3. Bento Tile: Current Risk Level */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-sm hover:border-rose-200/80 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200/70 text-rose-600 flex items-center justify-center shadow-xs">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 font-mono">
              Friction Risk
            </span>
          </div>
        </div>

        <div className="my-3">
          <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-semibold ${riskBadge.bg}`}>
            <span className={`w-2 h-2 rounded-full ${riskBadge.dot}`} />
            <span>{riskBadge.label}</span>
          </div>
          <p className="text-xs text-stone-500 mt-2 leading-relaxed">
            {riskBadge.sub}
          </p>
        </div>

        <div className="pt-2.5 border-t border-stone-100 text-[11px] text-stone-400 font-mono">
          Evaluated via Gemini extraction
        </div>
      </div>

      {/* 4. Bento Tile: ADHD Micro-Step Focus Rule (Dark Bento Accent Card) */}
      <div className="bg-stone-900 text-stone-100 rounded-2xl border border-stone-800 p-5 shadow-[0_2px_8px_rgba(0,0,0,0.12)] flex flex-col justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 -mt-2 -mr-2 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none"></div>

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-stone-800 border border-stone-700 text-amber-400 flex items-center justify-center shadow-xs">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 font-mono">
              Activation Rule
            </span>
          </div>
          <Sparkles className="w-4 h-4 text-amber-400/80" />
        </div>

        <div className="my-3 relative z-10">
          <div className="text-xs font-medium text-stone-300 leading-relaxed">
            "Lower the activation threshold. Don't complete the project right now—just touch the canvas for 2 minutes."
          </div>
        </div>

        <div className="pt-2.5 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-400 font-mono relative z-10">
          <span>Anti-procrastination</span>
          <span className="text-amber-400 font-semibold">Gemini 3.6</span>
        </div>
      </div>
    </section>
  );
};

