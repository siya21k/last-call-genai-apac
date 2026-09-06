import React, { useState } from 'react';
import {
  Folder,
  BookOpen,
  Check,
  Clock,
  Settings,
  Shield,
  RefreshCw,
  Zap,
  RotateCcw,
  Plus,
  Pencil,
  X,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type { Task, JournalEntry, ConsequenceType } from '../types';
import { MascotFlower, CompletionRewardIcon, getRandomRewardType, type RewardType } from './Mascot';

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
  isPartner?: boolean;
  activeMainView?: 'thread' | 'partner';
  onSwitchToPartnerView?: () => void;
  onSwitchToThreadView?: () => void;
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
  isPartner = false,
  activeMainView = 'thread',
  onSwitchToPartnerView,
  onSwitchToThreadView,
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'journal'>('tasks');
  const [taskFilter, setTaskFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [actionTaskId, setActionTaskId] = useState<string | null>(null);

  // Momentary completion reward state for manual task completion
  const [recentTaskRewards, setRecentTaskRewards] = useState<Record<string, RewardType>>({});

  const triggerTaskReward = (taskId: string) => {
    const reward = getRandomRewardType();
    setRecentTaskRewards((prev) => ({ ...prev, [taskId]: reward }));
    setTimeout(() => {
      setRecentTaskRewards((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }, 3000);
  };

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
      triggerTaskReward(taskId);
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

  const toLocalInputString = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const YYYY = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const DD = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
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
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[540px] retro-card bg-[#fffdfa] p-2 sm:p-2.5 font-sans select-none shadow-[4px_4px_0px_#2d2825]">
      {/* Retro Window Header Bar */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b-2 border-[#2d2825]">
        <div className="flex items-center gap-3">
          {/* Three Friendly Circular Buttons */}
          <div className="retro-dots">
            <span className="retro-dot bg-[#ff7865]" />
            <span className="retro-dot bg-[#f5b638]" />
            <span className="retro-dot bg-[#52b7aa]" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#f5b638] border border-[#2d2825] flex items-center justify-center text-[#2d2825]">
              {activeTab === 'tasks' ? (
                <Folder className="w-3.5 h-3.5 stroke-[2.5]" />
              ) : (
                <BookOpen className="w-3.5 h-3.5 stroke-[2.5]" />
              )}
            </div>
            <span className="text-xs sm:text-sm font-extrabold tracking-tight text-[#2d2825]">
              {activeTab === 'tasks' ? 'Tasks & Focus' : 'Context Journal'}
            </span>
          </div>
        </div>

        {activeTab === 'tasks' && onAddTask && (
          <button
            type="button"
            onClick={() => (isAddingTask ? setIsAddingTask(false) : startAddTask())}
            className="retro-btn-primary px-3 py-1 text-xs font-bold flex items-center gap-1"
          >
            {isAddingTask ? <X className="w-3 h-3 stroke-[2.5]" /> : <Plus className="w-3 h-3 stroke-[3]" />}
            <span>{isAddingTask ? 'Cancel' : 'New Task'}</span>
          </button>
        )}
      </div>

      {/* Retro Rounded Tabs */}
      <div className="flex items-center justify-between gap-2 mb-2 select-none">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tasks Tab */}
          <button
            id="sidepanel-tasks-tab"
            type="button"
            onClick={() => {
              setActiveTab('tasks');
              if (activeMainView === 'partner' && onSwitchToThreadView) {
                onSwitchToThreadView();
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-[#2d2825] text-xs font-extrabold transition-all ${
              activeTab === 'tasks' && activeMainView !== 'partner'
                ? 'bg-[#f5b638] text-[#2d2825] shadow-[2px_2px_0px_#2d2825] translate-x-[-1px] translate-y-[-1px]'
                : 'bg-[#faf4e8] text-stone-600 hover:bg-[#fffdf9]'
            }`}
          >
            <Folder className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Tasks</span>
            <span className="px-1.5 py-0.2 rounded-md bg-white border border-[#2d2825] text-[10px] font-mono">
              {pendingTasks.length}
            </span>
          </button>

          {/* Journal Tab */}
          <button
            id="sidepanel-journal-tab"
            type="button"
            onClick={() => {
              setActiveTab('journal');
              if (activeMainView === 'partner' && onSwitchToThreadView) {
                onSwitchToThreadView();
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-[#2d2825] text-xs font-extrabold transition-all ${
              activeTab === 'journal' && activeMainView !== 'partner'
                ? 'bg-[#52b7aa] text-white shadow-[2px_2px_0px_#2d2825] translate-x-[-1px] translate-y-[-1px]'
                : 'bg-[#faf4e8] text-stone-600 hover:bg-[#fffdf9]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Journal</span>
            {journalEntries.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-md bg-white text-[#2d2825] border border-[#2d2825] text-[10px] font-mono">
                {journalEntries.length}
              </span>
            )}
          </button>

          {/* Partner Monitor Tab (Accessible independently without locking out thread) */}
          {isPartner && (
            <button
              id="sidepanel-partner-tab"
              type="button"
              onClick={() => {
                if (onSwitchToPartnerView) {
                  onSwitchToPartnerView();
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-[#2d2825] text-xs font-extrabold transition-all ${
                activeMainView === 'partner'
                  ? 'bg-[#d97706] text-white shadow-[2px_2px_0px_#2d2825] translate-x-[-1px] translate-y-[-1px]'
                  : 'bg-[#faf4e8] text-stone-600 hover:bg-[#fffdf9]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Partner View</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'tasks' ? (
        <>
          {/* Add Task Drawer */}
          {isAddingTask && (
            <form
              onSubmit={handleCreateTask}
              className="retro-dialog p-3 mb-2 bg-[#fffdfa] text-xs font-sans space-y-2.5 shadow-[3px_3px_0px_#2d2825]"
            >
              <div className="flex items-center justify-between pb-1 border-b border-stone-200 font-extrabold text-[#2d2825]">
                <span>New Task Entry</span>
                <span
                  onClick={() => setIsAddingTask(false)}
                  className="cursor-pointer text-xs leading-none p-1 hover:text-[#ff7865]"
                >
                  ✕
                </span>
              </div>
              <input
                type="text"
                placeholder="What needs to be done?"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                autoFocus
                required
                className="retro-input w-full px-3 py-1.5 text-xs text-[#2d2825]"
              />
              <div>
                <label className="block text-[10px] font-bold text-stone-600 mb-1">
                  Target Deadline (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={newTaskDueAt}
                  onChange={(e) => setNewTaskDueAt(e.target.value)}
                  className="retro-input w-full px-3 py-1.5 text-xs text-[#2d2825] font-mono"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingTask(false)}
                  className="retro-btn px-3 py-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTaskName.trim() || isSubmittingTask}
                  className="retro-btn-primary px-4 py-1 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingTask ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3 stroke-[3]" />
                  )}
                  <span>Save Task</span>
                </button>
              </div>
            </form>
          )}

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-[#faf4e8] border-2 border-[#2d2825] rounded-xl text-xs font-bold mb-2">
            <button
              type="button"
              onClick={() => setTaskFilter('pending')}
              className={`flex-1 py-1 px-2 rounded-lg text-center transition-all ${
                taskFilter === 'pending'
                  ? 'bg-[#ff7865] text-white shadow-[1.5px_1.5px_0px_#2d2825] border border-[#2d2825]'
                  : 'text-stone-700 hover:bg-white/60'
              }`}
            >
              Pending ({pendingTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setTaskFilter('completed')}
              className={`flex-1 py-1 px-2 rounded-lg text-center transition-all ${
                taskFilter === 'completed'
                  ? 'bg-[#52b7aa] text-white shadow-[1.5px_1.5px_0px_#2d2825] border border-[#2d2825]'
                  : 'text-stone-700 hover:bg-white/60'
              }`}
            >
              Done ({completedTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setTaskFilter('all')}
              className={`py-1 px-3 rounded-lg text-center transition-all ${
                taskFilter === 'all'
                  ? 'bg-[#f5b638] text-[#2d2825] shadow-[1.5px_1.5px_0px_#2d2825] border border-[#2d2825]'
                  : 'text-stone-700 hover:bg-white/60'
              }`}
            >
              All
            </button>
          </div>

          {/* Tasks List Container */}
          <div className="retro-sunken flex-1 p-2.5 overflow-y-auto space-y-2 bg-[#fdfaf4] select-text">
            {filteredTasks.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-center p-4">
                {/* Mascot Moment for Empty State */}
                <MascotFlower
                  mood="happy"
                  size={68}
                  message={
                    taskFilter === 'pending'
                      ? 'All clear! No pending tasks right now.'
                      : `No ${taskFilter} tasks found.`
                  }
                />
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isMet = task.status === 'met';
                const isMissed = task.status === 'missed';
                const isPending = task.status === 'pending';
                const isEditing = editingTaskId === task.id;
                const reward = recentTaskRewards[task.id];

                if (isEditing) {
                  return (
                    <div
                      key={task.id}
                      className="retro-dialog p-3 space-y-2 text-xs bg-white shadow-[3px_3px_0px_#2d2825]"
                    >
                      <div className="flex items-center justify-between pb-1 border-b border-stone-200 font-extrabold text-[#2d2825]">
                        <span>Edit Task / Push Deadline</span>
                        <span
                          onClick={() => setEditingTaskId(null)}
                          className="cursor-pointer hover:text-[#ff7865]"
                        >
                          ✕
                        </span>
                      </div>
                      <input
                        type="text"
                        value={editTaskName}
                        onChange={(e) => setEditTaskName(e.target.value)}
                        className="retro-input w-full px-3 py-1.5 text-xs text-[#2d2825]"
                        placeholder="Task name"
                      />
                      <div>
                        <label className="block text-[10px] font-bold text-stone-600 mb-0.5">
                          Deadline (Change or Push Back)
                        </label>
                        <input
                          type="datetime-local"
                          value={editTaskDueAt}
                          onChange={(e) => setEditTaskDueAt(e.target.value)}
                          className="retro-input w-full px-3 py-1.5 text-xs text-[#2d2825] font-mono"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingTaskId(null)}
                          className="retro-btn px-3 py-1 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!editTaskName.trim() || isSavingEdit}
                          onClick={() => handleSaveTaskEdit(task.id)}
                          className="retro-btn-primary px-3.5 py-1 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isSavingEdit ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3 stroke-[3]" />
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
                    className={`border-2 border-[#2d2825] rounded-xl p-2.5 transition-all shadow-[2px_2px_0px_#2d2825] ${
                      isMet
                        ? 'bg-[#f4efe5] text-stone-500'
                        : isMissed
                        ? 'bg-[#ffe8e5] text-rose-950'
                        : 'bg-[#ffffff] text-[#2d2825]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4
                            className={`text-xs font-bold tracking-tight break-words leading-snug ${
                              isMet ? 'line-through text-stone-400' : 'text-stone-900'
                            }`}
                          >
                            {task.name}
                          </h4>
                          {/* Momentary Completion Reward Icon */}
                          {reward && (
                            <div className="animate-bounce">
                              <CompletionRewardIcon type={reward} size={22} />
                            </div>
                          )}
                        </div>

                        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-stone-500">
                          <Clock className="w-3 h-3 stroke-[2.5]" />
                          <span className="truncate">{formatDueDate(task.dueAt)}</span>
                        </div>
                      </div>

                      {/* Task Action Controls */}
                      <div className="flex items-center gap-1.5 shrink-0 select-none">
                        {/* Edit Button */}
                        {onUpdateTask && (
                          <button
                            type="button"
                            onClick={() => startEditTask(task)}
                            title="Edit task or push deadline back"
                            className="retro-btn p-1.5 text-[#2d2825]"
                          >
                            <Pencil className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        )}

                        {/* Check-In Button */}
                        {isPending && onCheckInTask && (
                          <button
                            type="button"
                            onClick={() => handleCheckIn(task.id)}
                            disabled={actionTaskId === task.id || completingTaskId === task.id}
                            title="Initiate check-in (2-min action)"
                            className="retro-btn p-1.5 text-[#2d2825] bg-[#fff6cc]"
                          >
                            {actionTaskId === task.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Zap className="w-3.5 h-3.5 text-[#f5b638] stroke-[2.5]" />
                            )}
                          </button>
                        )}

                        {/* Release Button */}
                        {isPending && onReleaseTask && (
                          <button
                            type="button"
                            onClick={() => handleRelease(task.id)}
                            disabled={actionTaskId === task.id || completingTaskId === task.id}
                            title="Release task (Amnesty)"
                            className="retro-btn p-1.5 text-stone-600"
                          >
                            <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        )}

                        {/* Manual Mark Done */}
                        <button
                          type="button"
                          onClick={() => handleMarkDone(task.id)}
                          disabled={completingTaskId === task.id || isMet}
                          title={isMet ? 'Completed' : 'Mark done'}
                          className={`retro-btn px-2.5 py-1.5 flex items-center justify-center font-bold text-xs ${
                            isMet
                              ? 'opacity-40 cursor-default bg-stone-100'
                              : 'bg-[#52b7aa] text-white'
                          }`}
                        >
                          {completingTaskId === task.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5 stroke-[3] text-white" />
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
        <div className="flex-1 flex flex-col overflow-hidden bg-white select-text">
          {/* New Journal Entry Input */}
          <form onSubmit={handleCreateJournal} className="p-2.5 retro-sunken mb-2 text-xs space-y-2 bg-[#faf4e8]">
            <div className="font-bold text-[#2d2825] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#52b7aa] stroke-[2.5]" />
              <span>Record Context / Observation</span>
            </div>
            <textarea
              rows={2}
              placeholder="Record a thought, obstacle, or note..."
              value={newJournalText}
              onChange={(e) => setNewJournalText(e.target.value)}
              className="retro-input w-full p-2 text-xs text-[#2d2825] resize-none"
            />
            <div className="flex items-center justify-end select-none">
              <button
                type="submit"
                disabled={!newJournalText.trim() || isSubmittingJournal}
                className="retro-btn-primary px-3.5 py-1 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingJournal ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                )}
                <span>Save Note</span>
              </button>
            </div>
          </form>

          {/* Journal Entries List */}
          <div className="retro-sunken flex-1 p-2.5 overflow-y-auto space-y-2 bg-[#fdfaf4]">
            {journalEntries.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-center p-4">
                <MascotFlower
                  mood="winking"
                  size={64}
                  message="Your journal scratchpad is fresh and ready."
                />
              </div>
            ) : (
              journalEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="border-2 border-[#2d2825] rounded-xl p-2.5 bg-white shadow-[2px_2px_0px_#2d2825] space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-stone-500 border-b border-stone-200 pb-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-stone-400 stroke-[2.5]" />
                      {formatJournalDate(entry.createdAt)}
                    </span>
                    {onDeleteJournalEntry && (
                      <button
                        type="button"
                        onClick={() => handleDeleteJournal(entry.id)}
                        disabled={deletingJournalId === entry.id}
                        title="Delete note"
                        className="p-1 text-stone-400 hover:text-rose-600 rounded-md"
                      >
                        {deletingJournalId === entry.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-stone-900 leading-relaxed whitespace-pre-wrap font-medium">{entry.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Side Panel Footer Actions */}
      <div className="pt-2 border-t-2 border-[#2d2825] flex items-center gap-2 text-xs select-none">
        <button
          type="button"
          onClick={onOpenSettings}
          className="retro-btn flex-1 py-1.5 px-2 flex items-center justify-center gap-1.5 text-xs font-extrabold bg-[#fffdf9]"
        >
          <Settings className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Anchor Times</span>
        </button>

        <button
          type="button"
          onClick={onOpenPartner}
          className="retro-btn flex-1 py-1.5 px-2 flex items-center justify-center gap-1.5 text-xs font-extrabold bg-[#fffdf9]"
        >
          <Shield className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Partner</span>
        </button>
      </div>
    </div>
  );
};
