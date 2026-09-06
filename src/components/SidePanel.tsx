import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Settings,
  Shield,
  ChevronRight,
  RefreshCw,
  Zap,
  RotateCcw,
  Plus,
  Pencil,
  X,
  BookOpen,
  Trash2,
  Calendar,
} from 'lucide-react';
import type { Task, JournalEntry, ConsequenceType } from '../types';

interface SidePanelProps {
  tasks: Task[];
  onMarkTaskDone: (taskId: string) => Promise<void>;
  onReleaseTask?: (taskId: string) => Promise<void>;
  onCheckInTask?: (taskId: string) => Promise<void>;
  onAddTask?: (task: {
    name: string;
    dueAt?: string;
    consequenceType?: ConsequenceType;
  }) => Promise<void>;
  onUpdateTask?: (
    taskId: string,
    updates: {
      name?: string;
      dueAt?: string;
      consequenceType?: ConsequenceType;
    }
  ) => Promise<void>;
  journalEntries?: JournalEntry[];
  onAddJournalEntry?: (text: string, title?: string, tags?: string[]) => Promise<void>;
  onDeleteJournalEntry?: (id: string) => Promise<void>;
  onOpenSettings: () => void;
  onOpenPartner: () => void;
  isLoading: boolean;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  tasks,
  onMarkTaskDone,
  onReleaseTask,
  onCheckInTask,
  onAddTask,
  onUpdateTask,
  journalEntries = [],
  onAddJournalEntry,
  onDeleteJournalEntry,
  onOpenSettings,
  onOpenPartner,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'journal'>('tasks');
  const [taskFilter, setTaskFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);

  // Add Task Form State
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDueAt, setNewTaskDueAt] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Edit Task State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskName, setEditTaskName] = useState('');
  const [editTaskDueAt, setEditTaskDueAt] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Journal Form State
  const [newJournalText, setNewJournalText] = useState('');
  const [isSubmittingJournal, setIsSubmittingJournal] = useState(false);
  const [deletingJournalId, setDeletingJournalId] = useState<string | null>(null);

  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'met' || t.status === 'released');

  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === 'pending') return t.status === 'pending';
    if (taskFilter === 'completed') return t.status === 'met' || t.status === 'released';
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

  // Helper to format ISO datetime for <input type="datetime-local">
  const toLocalInputString = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const mi = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };

  const startAddTask = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setNewTaskName('');
    setNewTaskDueAt(toLocalInputString(tomorrow));
    setIsAddingTask(true);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim() || !onAddTask || isSubmittingTask) return;

    try {
      setIsSubmittingTask(true);
      const isoDueAt = newTaskDueAt ? new Date(newTaskDueAt).toISOString() : undefined;
      await onAddTask({
        name: newTaskName.trim(),
        dueAt: isoDueAt,
        consequenceType: 'unspecified',
      });
      setNewTaskName('');
      setIsAddingTask(false);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const startEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTaskName(task.name);
    try {
      setEditTaskDueAt(toLocalInputString(new Date(task.dueAt)));
    } catch {
      setEditTaskDueAt('');
    }
  };

  const handleSaveTaskEdit = async (taskId: string) => {
    if (!editTaskName.trim() || !onUpdateTask || isSavingEdit) return;

    try {
      setIsSavingEdit(true);
      const isoDueAt = editTaskDueAt ? new Date(editTaskDueAt).toISOString() : undefined;
      await onUpdateTask(taskId, {
        name: editTaskName.trim(),
        dueAt: isoDueAt,
      });
      setEditingTaskId(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCreateJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJournalText.trim() || !onAddJournalEntry || isSubmittingJournal) return;

    try {
      setIsSubmittingJournal(true);
      await onAddJournalEntry(newJournalText.trim());
      setNewJournalText('');
    } finally {
      setIsSubmittingJournal(false);
    }
  };

  const handleDeleteJournal = async (id: string) => {
    if (!onDeleteJournalEntry || deletingJournalId) return;
    try {
      setDeletingJournalId(id);
      await onDeleteJournalEntry(id);
    } finally {
      setDeletingJournalId(null);
    }
  };

  const formatDueDate = (iso: string) => {
    try {
      const target = new Date(iso);
      const now = new Date();
      const timeStr = target.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
      const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayDiff = Math.round((targetDate.getTime() - nowDate.getTime()) / (24 * 3600 * 1000));

      if (dayDiff === 0) return `Today at ${timeStr}`;
      if (dayDiff === 1) return `Tomorrow at ${timeStr}`;
      if (dayDiff === -1) return `Yesterday at ${timeStr}`;
      return `${target.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
    } catch {
      return iso;
    }
  };

  const formatJournalDate = (iso: string) => {
    try {
      const target = new Date(iso);
      return target.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[520px] bg-white rounded-2xl border border-stone-300 shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden font-sans">
      {/* Side Panel Titlebar */}
      <div className="bg-stone-900 text-stone-200 px-4 py-2.5 flex items-center justify-between border-b border-stone-800 select-none">
        <div className="flex items-center gap-1.5 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              activeTab === 'tasks'
                ? 'bg-stone-800 text-amber-400 font-semibold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>TASKS</span>
            <span className="text-[10px] bg-stone-900 px-1.5 py-0.2 rounded text-stone-300">
              {pendingTasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('journal')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
              activeTab === 'journal'
                ? 'bg-stone-800 text-amber-400 font-semibold'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>JOURNAL</span>
            {journalEntries.length > 0 && (
              <span className="text-[10px] bg-stone-900 px-1.5 py-0.2 rounded text-stone-300">
                {journalEntries.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'tasks' && onAddTask && (
          <button
            type="button"
            onClick={() => (isAddingTask ? setIsAddingTask(false) : startAddTask())}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-stone-950 font-mono text-xs font-semibold transition-colors shadow-xs"
            title="Add Task manually"
          >
            {isAddingTask ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
            <span>{isAddingTask ? 'Cancel' : 'Add Task'}</span>
          </button>
        )}
      </div>

      {activeTab === 'tasks' ? (
        <>
          {/* Permanent Add Task Affordance Drawer */}
          {isAddingTask && (
            <form onSubmit={handleCreateTask} className="p-3 bg-amber-50/70 border-b border-amber-200 text-xs font-sans">
              <div className="font-mono text-[11px] font-bold text-amber-900 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <Plus className="w-3 h-3 text-amber-700" />
                <span>New Task</span>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="What needs to be done?"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  autoFocus
                  required
                  className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs"
                />
                <div>
                  <label className="block font-mono text-[10px] text-stone-500 mb-1">Due Date & Time (Optional)</label>
                  <input
                    type="datetime-local"
                    value={newTaskDueAt}
                    onChange={(e) => setNewTaskDueAt(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-xs font-mono"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingTask(false)}
                    className="px-2.5 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-stone-600 font-mono text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newTaskName.trim() || isSubmittingTask}
                    className="flex items-center gap-1 px-3 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-mono text-xs font-semibold disabled:opacity-50"
                  >
                    {isSubmittingTask ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    <span>Save Task</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Filter Tabs */}
          <div className="px-3 pt-3 pb-2 bg-stone-50 border-b border-stone-200 flex items-center gap-1 text-xs font-mono">
            <button
              type="button"
              onClick={() => setTaskFilter('pending')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all ${
                taskFilter === 'pending'
                  ? 'bg-stone-900 text-stone-100 font-semibold shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/60'
              }`}
            >
              Pending ({pendingTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setTaskFilter('completed')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all ${
                taskFilter === 'completed'
                  ? 'bg-stone-900 text-stone-100 font-semibold shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/60'
              }`}
            >
              Met ({completedTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setTaskFilter('all')}
              className={`py-1.5 px-2 rounded-lg text-center transition-all ${
                taskFilter === 'all'
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
                <p>No {taskFilter} tasks.</p>
                <p className="text-[11px] text-stone-400 mt-1">Use "+ Add Task" or type in thread.</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isMet = task.status === 'met';
                const isMissed = task.status === 'missed';
                const isPending = task.status === 'pending';
                const isEditing = editingTaskId === task.id;

                if (isEditing) {
                  return (
                    <div
                      key={task.id}
                      className="p-3 rounded-xl border border-amber-300 bg-amber-50/50 shadow-xs space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] text-amber-800 font-bold uppercase">
                        <span>Edit Task / Push Deadline</span>
                        <button
                          type="button"
                          onClick={() => setEditingTaskId(null)}
                          className="text-stone-400 hover:text-stone-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editTaskName}
                        onChange={(e) => setEditTaskName(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-stone-900 text-xs"
                        placeholder="Task name"
                      />
                      <div>
                        <label className="block font-mono text-[10px] text-stone-500 mb-1">
                          Deadline (Change or Push Back)
                        </label>
                        <input
                          type="datetime-local"
                          value={editTaskDueAt}
                          onChange={(e) => setEditTaskDueAt(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg text-stone-800 text-xs font-mono"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingTaskId(null)}
                          className="px-2 py-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 text-stone-600 font-mono text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!editTaskName.trim() || isSavingEdit}
                          onClick={() => handleSaveTaskEdit(task.id)}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-mono text-xs font-semibold disabled:opacity-50"
                        >
                          {isSavingEdit ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>Save Changes</span>
                        </button>
                      </div>
                    </div>
                  );
                }

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
                        {/* Permanent Edit Task Button */}
                        {onUpdateTask && (
                          <button
                            type="button"
                            onClick={() => startEditTask(task)}
                            title="Edit task or push deadline back"
                            className="p-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}

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
                            title="Release task (Amnesty)"
                            className="p-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Direct One-Tap Manual Mark Done control */}
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
        </>
      ) : (
        /* Journal Section */
        <div className="flex-1 flex flex-col overflow-hidden bg-[#faf9f6]/60">
          {/* New Journal Entry Input */}
          <form onSubmit={handleCreateJournal} className="p-3 bg-white border-b border-stone-200 text-xs">
            <div className="font-mono text-[11px] font-bold text-stone-700 mb-1.5 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-600" />
              <span>Record Observation / Note</span>
            </div>
            <textarea
              rows={2}
              placeholder="Jot down a quick thought, focus obstacle, or context note..."
              value={newJournalText}
              onChange={(e) => setNewJournalText(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-xs resize-none"
            />
            <div className="flex items-center justify-end pt-1.5">
              <button
                type="submit"
                disabled={!newJournalText.trim() || isSubmittingJournal}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-mono text-xs font-semibold disabled:opacity-50"
              >
                {isSubmittingJournal ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                <span>Add Note</span>
              </button>
            </div>
          </form>

          {/* Journal Entries List */}
          <div className="flex-1 p-3 overflow-y-auto space-y-2">
            {journalEntries.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-stone-400 font-mono text-xs">
                <BookOpen className="w-8 h-8 mb-2 text-stone-300 stroke-1" />
                <p>No journal notes yet.</p>
                <p className="text-[11px] text-stone-400 mt-1">Capture low-friction context notes above.</p>
              </div>
            ) : (
              journalEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 rounded-xl border border-stone-200/90 bg-white shadow-xs space-y-1.5 group text-xs"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-stone-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-stone-300" />
                      {formatJournalDate(entry.createdAt)}
                    </span>
                    {onDeleteJournalEntry && (
                      <button
                        type="button"
                        onClick={() => handleDeleteJournal(entry.id)}
                        disabled={deletingJournalId === entry.id}
                        title="Delete note"
                        className="text-stone-400 hover:text-rose-600 p-1 rounded transition-colors opacity-70 group-hover:opacity-100"
                      >
                        {deletingJournalId === entry.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-stone-800 leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

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
