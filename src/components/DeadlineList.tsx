import React, { useState } from 'react';
import {
  Plus,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  History,
  Clock,
  Sparkles,
  Calendar,
  ChevronRight,
  Flame,
} from 'lucide-react';
import type { Deadline, DeadlineStatus } from '../types';

interface DeadlineListProps {
  deadlines: Deadline[];
  onAddDeadline: (name: string, dueAt: string) => Promise<void>;
  onMarkDone: (id: string) => Promise<void>;
  onStartCheckIn: (deadline: Deadline) => void;
  onViewHistory: (deadline: Deadline) => void;
  loading?: boolean;
}

export const DeadlineList: React.FC<DeadlineListProps> = ({
  deadlines,
  onAddDeadline,
  onMarkDone,
  onStartCheckIn,
  onViewHistory,
  loading,
}) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'met' | 'missed'>('pending');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDueTime, setNewDueTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Quick preset helpers for ADHD quick entry
  const setQuickTime = (hoursFromNow: number) => {
    const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
    setNewDueDate(d.toISOString().split('T')[0]);
    setNewDueTime(d.toTimeString().slice(0, 5));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDueDate || !newDueTime) return;

    try {
      setSubmitting(true);
      const dueAt = new Date(`${newDueDate}T${newDueTime}:00`).toISOString();
      await onAddDeadline(newName.trim(), dueAt);
      setNewName('');
      setNewDueDate('');
      setNewDueTime('');
      setIsAddModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDoneClick = async (id: string) => {
    try {
      setActionLoadingId(id);
      await onMarkDone(id);
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredDeadlines = deadlines.filter((d) => {
    if (filter === 'all') return true;
    return d.status === filter;
  });

  const getStatusBadge = (status: DeadlineStatus) => {
    switch (status) {
      case 'met':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Met
          </span>
        );
      case 'missed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" /> Missed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
    }
  };

  const getRiskTag = (risk: string | null) => {
    if (!risk) return null;
    const map: Record<string, { bg: string; text: string }> = {
      critical: { bg: 'bg-rose-100 text-rose-800 border-rose-200', text: 'Critical Risk' },
      medium: { bg: 'bg-amber-100 text-amber-800 border-amber-200', text: 'Medium Risk' },
      low: { bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', text: 'Low Risk' },
    };
    const c = map[risk] || { bg: 'bg-stone-100 text-stone-700', text: risk };
    return (
      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${c.bg}`}>
        {c.text}
      </span>
    );
  };

  const formatDue = (iso: string) => {
    const due = new Date(iso);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const dateFormatted = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeFormatted = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    if (diffMs < 0) {
      const hoursAgo = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
      return (
        <span className="text-rose-600 font-medium">
          {hoursAgo > 0 ? `${hoursAgo}h ago` : 'just now'} ({dateFormatted}, {timeFormatted})
        </span>
      );
    }

    const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
    if (hoursLeft < 24) {
      return (
        <span className="text-amber-700 font-medium">
          In {hoursLeft}h ({timeFormatted})
        </span>
      );
    }

    return (
      <span className="text-stone-600">
        {dateFormatted} at {timeFormatted}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header & Controls */}
      <div className="p-5 sm:p-6 border-b border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg text-stone-900 tracking-tight">Focus Deadlines</h2>
            <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold border border-stone-200/60">
              {deadlines.length} total
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Log tasks you are avoiding. Start a check-in anytime — even after a missed deadline.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Deadline Button */}
          <button
            onClick={() => {
              setQuickTime(2); // default 2 hours ahead
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 text-xs font-semibold transition-all shadow-xs active:scale-[0.98]"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Add Deadline</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs - Bento Segmented Style */}
      <div className="px-5 py-3 bg-[#faf9f6] border-b border-stone-200/70 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="inline-flex p-1 bg-stone-200/60 rounded-xl gap-1">
          {(['pending', 'missed', 'met', 'all'] as const).map((tab) => {
            const count =
              tab === 'pending'
                ? deadlines.filter((d) => d.status === 'pending').length
                : tab === 'missed'
                ? deadlines.filter((d) => d.status === 'missed').length
                : tab === 'met'
                ? deadlines.filter((d) => d.status === 'met').length
                : deadlines.length;

            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize flex items-center gap-1.5 ${
                  filter === tab
                    ? 'bg-white text-stone-900 shadow-xs font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <span>{tab}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                    filter === tab
                      ? 'bg-stone-100 text-stone-800 font-bold'
                      : 'bg-stone-200/50 text-stone-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <span className="text-[11px] font-mono text-stone-400 hidden sm:block">
          ADHD Time-Blindness Mode
        </span>
      </div>

      {/* List Container */}
      <div className="divide-y divide-stone-100">
        {filteredDeadlines.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200/60 text-stone-400 flex items-center justify-center mx-auto mb-3 shadow-xs">
              <Calendar className="w-5 h-5 text-stone-500" />
            </div>
            <h3 className="text-sm font-semibold text-stone-900">
              {filter === 'pending'
                ? 'No pending deadlines right now'
                : `No ${filter} deadlines found`}
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1 leading-relaxed">
              Add a task you find yourself avoiding. The AI check-in is built specifically to break through task-initiation paralysis.
            </p>
            {filter !== 'pending' ? (
              <button
                onClick={() => setFilter('pending')}
                className="mt-4 text-xs text-amber-600 hover:text-amber-700 font-semibold"
              >
                Switch to pending view
              </button>
            ) : (
              <button
                onClick={() => {
                  setQuickTime(2);
                  setIsAddModalOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-900 text-stone-100 text-xs font-semibold hover:bg-stone-800 transition-all shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>Create first deadline</span>
              </button>
            )}
          </div>
        ) : (
          filteredDeadlines.map((deadline) => (
            <div
              key={deadline.id}
              className="p-4 sm:p-5 hover:bg-[#faf9f6]/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
            >
              {/* Task Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <h3 className="font-semibold text-stone-900 text-sm sm:text-base truncate tracking-tight">
                    {deadline.name}
                  </h3>
                  {getStatusBadge(deadline.status)}
                  {getRiskTag(deadline.latestRiskLevel)}
                </div>

                <div className="flex items-center gap-3 text-xs text-stone-500 flex-wrap">
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    <span>Target: {formatDue(deadline.dueAt)}</span>
                  </div>

                  {deadline.status === 'missed' && (
                    <span className="text-amber-700 font-medium text-[10px] font-mono bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Post-mortem check-in open
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                {/* Check-in Trigger */}
                <button
                  onClick={() => onStartCheckIn(deadline)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 text-amber-950 text-xs font-semibold transition-all shadow-xs active:scale-[0.98]"
                  title="Start a task initiation check-in with Gemini"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    {deadline.status === 'missed' ? 'Post-Mortem' : 'Check In'}
                  </span>
                </button>

                {/* History Trigger */}
                <button
                  onClick={() => onViewHistory(deadline)}
                  className="p-2 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 border border-stone-200 transition-colors"
                  title="View past check-in logs & action items"
                >
                  <History className="w-4 h-4" />
                </button>

                {/* Mark Done Trigger */}
                {deadline.status !== 'met' ? (
                  <button
                    onClick={() => handleMarkDoneClick(deadline.id)}
                    disabled={actionLoadingId === deadline.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-all shadow-xs active:scale-[0.98] disabled:opacity-50"
                    title={
                      deadline.status === 'missed'
                        ? 'Finished late? Mark met anyway — late finishes count towards streak!'
                        : 'Mark task as done'
                    }
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{deadline.status === 'missed' ? 'Mark Done Late' : 'Done'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1 text-xs text-emerald-700 font-semibold px-2.5 py-1 bg-emerald-50 rounded-xl border border-emerald-200/60">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Completed</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Deadline Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xl max-w-md w-full p-6 relative">
            <h3 className="font-bold text-lg text-stone-900 mb-1 tracking-tight">
              Add New Deadline
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Enter the exact task and when it is due. Avoid vague commitments.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5 font-mono">
                  Task Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Submit Q3 expense report to finance"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5 font-mono">
                    Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5 font-mono">
                    Due Time
                  </label>
                  <input
                    type="time"
                    required
                    value={newDueTime}
                    onChange={(e) => setNewDueTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                  />
                </div>
              </div>

              {/* Quick Presets for ADHD Ease */}
              <div>
                <span className="text-[11px] text-stone-400 block mb-1.5 font-mono">Quick Horizon Presets:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setQuickTime(1)}
                    className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition-colors"
                  >
                    In 1 Hour
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickTime(3)}
                    className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition-colors"
                  >
                    In 3 Hours
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickTime(24)}
                    className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium transition-colors"
                  >
                    Tomorrow
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 hover:bg-stone-100 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs font-semibold transition-all shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Deadline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
