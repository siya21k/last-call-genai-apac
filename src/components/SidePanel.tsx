import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Settings,
  Shield,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  Zap,
  RotateCcw,
} from 'lucide-react';
import type { Task } from '../types';

interface SidePanelProps {
  tasks: Task[];
  onMarkTaskDone: (taskId: string) => Promise<void>;
  onReleaseTask?: (taskId: string) => Promise<void>;
  onCheckInTask?: (taskId: string) => Promise<void>;
  onOpenSettings: () => void;
  onOpenPartner: () => void;
  isLoading: boolean;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  tasks,
  onMarkTaskDone,
  onReleaseTask,
  onCheckInTask,
  onOpenSettings,
  onOpenPartner,
  isLoading,
}) => {
  const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);

  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'met' || t.status === 'released');

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending') return t.status === 'pending';
    if (filter === 'completed') return t.status === 'met' || t.status === 'released';
    return true;
  });

  const handleMarkDone = async (taskId: string) => {
    try {
      setCompletingTaskId(taskId);
      await onMarkTaskDone(taskId);
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleRelease = async (taskId: string) => {
    if (!onReleaseTask) return;
    try {
      setActionTaskId(taskId);
      await onReleaseTask(taskId);
    } finally {
      setActionTaskId(null);
    }
  };

  const handleCheckIn = async (taskId: string) => {
    if (!onCheckInTask) return;
    try {
      setActionTaskId(taskId);
      await onCheckInTask(taskId);
    } finally {
      setActionTaskId(null);
    }
  };

  const formatDueDate = (iso: string) => {
    try {
      const target = new Date(iso);
      const now = new Date();
      const diffMs = target.getTime() - now.getTime();
      const diffHours = Math.round(diffMs / (3600 * 1000));

      const timeStr = target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (diffHours > 0 && diffHours < 24) {
        return `Today at ${timeStr}`;
      }
      if (diffHours >= 24 && diffHours < 48) {
        return `Tomorrow at ${timeStr}`;
      }
      return `${target.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] bg-white rounded-2xl border border-stone-300 shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden font-sans">
      {/* Side Panel Titlebar */}
      <div className="bg-stone-900 text-stone-200 px-4 py-2.5 flex items-center justify-between border-b border-stone-800 select-none">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="font-mono text-xs font-semibold text-stone-100 tracking-wider">
            TASKS_PANEL // BOARD
          </span>
        </div>
        <span className="font-mono text-xs bg-stone-800 px-2 py-0.5 rounded text-amber-400 font-bold">
          {pendingTasks.length} OPEN
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 pt-3 pb-2 bg-stone-50 border-b border-stone-200 flex items-center gap-1 text-xs font-mono">
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all ${
            filter === 'pending'
              ? 'bg-stone-900 text-stone-100 font-semibold shadow-xs'
              : 'text-stone-600 hover:bg-stone-200/60'
          }`}
        >
          Pending ({pendingTasks.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('completed')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all ${
            filter === 'completed'
              ? 'bg-stone-900 text-stone-100 font-semibold shadow-xs'
              : 'text-stone-600 hover:bg-stone-200/60'
          }`}
        >
          Met ({completedTasks.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`py-1.5 px-2 rounded-lg text-center transition-all ${
            filter === 'all'
              ? 'bg-stone-900 text-stone-100 font-semibold shadow-xs'
              : 'text-stone-600 hover:bg-stone-200/60'
          }`}
        >
          All
        </button>
      </div>

      {/* Tasks List */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2 bg-[#faf9f6]/60">
        {filteredTasks.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-stone-400 font-mono text-xs">
            <CheckCircle2 className="w-8 h-8 mb-2 text-stone-300 stroke-1" />
            <p>No {filter} tasks.</p>
            <p className="text-[11px] text-stone-400 mt-1">Type in the thread to add a new task.</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isMet = task.status === 'met';
            const isMissed = task.status === 'missed';
            const isPending = task.status === 'pending';

            return (
              <div
                key={task.id}
                className={`p-3 rounded-xl border transition-all ${
                  isMet
                    ? 'bg-stone-100/60 border-stone-200/80 text-stone-400'
                    : isMissed
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                    : 'bg-white border-stone-200/90 text-stone-900 shadow-xs hover:border-stone-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <h4
                      className={`text-xs sm:text-[13px] font-semibold tracking-tight break-words leading-snug ${
                        isMet ? 'line-through text-stone-400' : 'text-stone-900'
                      }`}
                    >
                      {task.name}
                    </h4>

                    <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-stone-500">
                      <Clock className="w-3 h-3 text-stone-400 shrink-0" />
                      <span className="truncate">{formatDueDate(task.dueAt)}</span>
                    </div>
                  </div>

                  {/* Task Action Controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isPending && onCheckInTask && (
                      <button
                        type="button"
                        onClick={() => handleCheckIn(task.id)}
                        disabled={actionTaskId === task.id || completingTaskId === task.id}
                        title="Check in / Break paralysis with 2-min micro-step"
                        className="p-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-800 text-stone-600 transition-colors"
                      >
                        {actionTaskId === task.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5 text-amber-600" />
                        )}
                      </button>
                    )}

                    {isPending && onReleaseTask && (
                      <button
                        type="button"
                        onClick={() => handleRelease(task.id)}
                        disabled={actionTaskId === task.id || completingTaskId === task.id}
                        title="Release task without penalty (Amnesty)"
                        className="p-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Step 12: Direct One-Tap Manual Mark Done control */}
                    <button
                      type="button"
                      onClick={() => handleMarkDone(task.id)}
                      disabled={completingTaskId === task.id || isMet}
                      title={isMet ? 'Already completed' : 'Mark task done'}
                      className={`p-2 rounded-xl border flex items-center justify-center transition-all ${
                        isMet
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-300 cursor-default'
                          : 'bg-stone-100 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 text-stone-600 border-stone-300 active:scale-95'
                      }`}
                    >
                      {completingTaskId === task.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5 stroke-2" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Side Panel Footer Actions */}
      <div className="p-3 bg-white border-t border-stone-200 space-y-1.5 text-xs font-mono">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-stone-100 text-stone-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-stone-500" />
            <span>Anchor Times</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
        </button>

        <button
          type="button"
          onClick={onOpenPartner}
          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-stone-100 text-stone-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-stone-500" />
            <span>Accountability Partner</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
        </button>
      </div>
    </div>
  );
};
