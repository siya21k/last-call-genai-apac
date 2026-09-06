import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Terminal,
  Clock,
  Check,
  AlertCircle,
  Undo2,
  RotateCcw,
  Hourglass,
  Shield,
  Sparkles,
} from 'lucide-react';
import type { ThreadMessage, Task } from '../types';
import { CompletionRewardIcon, getRandomRewardType, type RewardType } from './Mascot';

interface RetroChatThreadProps {
  messages: ThreadMessage[];
  onSendMessage: (text: string) => Promise<void>;
  isSending: boolean;
  tasks: Task[];
  onMarkTaskDone: (taskId: string) => Promise<void>;
  onCompleteCheckIn?: (taskId: string) => Promise<void>;
}

export const RetroChatThread: React.FC<RetroChatThreadProps> = ({
  messages,
  onSendMessage,
  isSending,
  tasks,
  onMarkTaskDone,
  onCompleteCheckIn,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Momentary completion reward state: key is messageId or taskId, clears after 3s
  const [activeRewards, setActiveRewards] = useState<Record<string, RewardType>>({});

  const triggerReward = (id: string) => {
    const reward = getRandomRewardType();
    setActiveRewards((prev) => ({ ...prev, [id]: reward }));
    setTimeout(() => {
      setActiveRewards((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 3000);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

  // Check if a new auto-close message arrived and trigger a momentary reward
  const prevMessagesCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesCount.current) {
      const latest = messages[messages.length - 1];
      if (latest && latest.messageType === 'auto-close') {
        triggerReward(latest.id);
      }
    }
    prevMessagesCount.current = messages.length;
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;
    const text = inputText;
    setInputText('');
    await onSendMessage(text);
    inputRef.current?.focus();
  };

  const handleChipClick = (suggestion: string) => {
    setInputText(suggestion);
    inputRef.current?.focus();
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
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
            <div className="w-6 h-6 rounded-lg bg-[#52b7aa] border border-[#2d2825] flex items-center justify-center text-white">
              <Terminal className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="text-xs sm:text-sm font-extrabold tracking-tight text-[#2d2825]">
              Focus Terminal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#52b7aa]/20 border border-[#2d2825] text-[11px] font-bold text-[#2d2825]">
          <span className="w-2 h-2 rounded-full bg-[#52b7aa] inline-block animate-pulse"></span>
          <span>Online</span>
        </div>
      </div>

      {/* Messages Transcript Scroll Area */}
      <div className="retro-sunken flex-1 p-3 sm:p-4 overflow-y-auto space-y-3.5 bg-[#fdfaf4] select-text">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isSystem = msg.role === 'system';
          const isTaskCreated = msg.messageType === 'task-created';
          const isAutoClose = msg.messageType === 'auto-close';
          const isCandidatePrompt = msg.messageType === 'candidate-prompt';
          const isReopened = msg.messageType === 'reopened';
          const isCheckinPrompt = msg.messageType === 'checkin-prompt';
          const isAmnesty = msg.messageType === 'amnesty';

          if (isSystem) {
            const relatedTask = tasks.find((t) => t.id === msg.relatedTaskId);
            const undoPhrase = relatedTask ? `undo ${relatedTask.name}` : 'undo that';
            const reward = activeRewards[msg.id] || (msg.relatedTaskId ? activeRewards[msg.relatedTaskId] : null);

            // Dialog color theme based on message archetype
            let headerBg = 'bg-[#f5b638]'; // Default Warm Mustard
            let caption = 'System Notice';
            let TitleIcon = Terminal;

            if (isAutoClose) {
              headerBg = 'bg-[#52b7aa]'; // Teal
              caption = 'Task Completed';
              TitleIcon = Check;
            } else if (isCandidatePrompt) {
              headerBg = 'bg-[#ff7865]'; // Coral
              caption = 'Confirm Completion';
              TitleIcon = AlertCircle;
            } else if (isCheckinPrompt) {
              headerBg = 'bg-[#fca5b0]'; // Dusty Pink
              caption = 'Focus Check-In';
              TitleIcon = Hourglass;
            } else if (isTaskCreated) {
              headerBg = 'bg-[#52b7aa]'; // Teal
              caption = 'Task Logged';
              TitleIcon = Clock;
            } else if (isAmnesty) {
              headerBg = 'bg-[#f5b638]';
              caption = 'Amnesty Notice';
              TitleIcon = Shield;
            } else if (isReopened) {
              headerBg = 'bg-[#f5b638]';
              caption = 'Task Reopened';
              TitleIcon = RotateCcw;
            }

            return (
              <div
                key={msg.id}
                className="max-w-md w-full sm:w-auto self-start retro-dialog bg-white shadow-[3px_3px_0px_#2d2825] animate-in fade-in duration-150"
              >
                {/* Colored Header Bar with 3 Friendly Circular Buttons */}
                <div
                  className={`${headerBg} px-2.5 py-1.5 flex items-center justify-between border-b-2 border-[#2d2825] select-none`}
                >
                  <div className="flex items-center gap-2">
                    <div className="retro-dots">
                      <span className="w-2 h-2 rounded-full border border-[#2d2825] bg-white/70" />
                      <span className="w-2 h-2 rounded-full border border-[#2d2825] bg-white/70" />
                      <span className="w-2 h-2 rounded-full border border-[#2d2825] bg-white/70" />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#2d2825]">
                      <TitleIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{caption}</span>
                    </div>
                  </div>

                  {/* Momentary Completion Reward Icon if active */}
                  {reward && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white border border-[#2d2825] animate-bounce">
                      <CompletionRewardIcon type={reward} size={20} />
                      <span className="text-[10px] font-extrabold text-[#2d2825]">Yay!</span>
                    </div>
                  )}
                </div>

                {/* Content Area */}
                <div className="p-3 text-xs text-[#2d2825] bg-[#fffdfa]">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                      {isAutoClose ? (
                        <div className="w-7 h-7 rounded-xl bg-[#52b7aa]/30 border border-[#2d2825] flex items-center justify-center">
                          <Check className="w-4 h-4 text-[#2d2825] stroke-[3]" />
                        </div>
                      ) : isCandidatePrompt ? (
                        <div className="w-7 h-7 rounded-xl bg-[#ff7865]/30 border border-[#2d2825] flex items-center justify-center">
                          <AlertCircle className="w-4 h-4 text-[#2d2825] stroke-[2.5]" />
                        </div>
                      ) : isCheckinPrompt ? (
                        <div className="w-7 h-7 rounded-xl bg-[#fca5b0]/40 border border-[#2d2825] flex items-center justify-center">
                          <Hourglass className="w-4 h-4 text-[#2d2825] stroke-[2.5]" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-xl bg-[#f5b638]/30 border border-[#2d2825] flex items-center justify-center">
                          <Clock className="w-4 h-4 text-[#2d2825] stroke-[2.5]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="leading-relaxed text-stone-900 font-sans break-words whitespace-pre-wrap font-medium">
                        {msg.text}
                      </p>
                      <div className="mt-1 text-[10px] text-stone-500 font-mono">
                        {formatTimestamp(msg.createdAt)}
                      </div>
                    </div>
                  </div>

                  {/* Tactile Rounded Buttons */}
                  <div className="mt-3 pt-2 border-t border-stone-200 flex items-center justify-end gap-2 select-none">
                    {isCandidatePrompt && msg.relatedTaskId && (
                      <button
                        type="button"
                        onClick={async () => {
                          triggerReward(msg.id);
                          await onMarkTaskDone(msg.relatedTaskId!);
                        }}
                        className="retro-btn-primary px-3.5 py-1 text-xs"
                      >
                        Yes, done
                      </button>
                    )}

                    {isAutoClose && (
                      <button
                        type="button"
                        onClick={() => onSendMessage(undoPhrase)}
                        className="retro-btn px-3 py-1 text-xs flex items-center gap-1"
                        title={relatedTask ? `Undo auto-close for ${relatedTask.name}` : 'Undo auto-close'}
                      >
                        <Undo2 className="w-3 h-3 stroke-[2.5]" />
                        <span>Undo</span>
                      </button>
                    )}

                    {isCheckinPrompt && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (msg.relatedTaskId) triggerReward(msg.relatedTaskId);
                          if (onCompleteCheckIn && msg.relatedTaskId) {
                            await onCompleteCheckIn(msg.relatedTaskId);
                          } else {
                            onSendMessage(`Done with 2-min action on ${relatedTask?.name || 'task'}`);
                          }
                        }}
                        className="retro-btn-primary px-3.5 py-1 text-xs"
                      >
                        Done step
                      </button>
                    )}

                    {/* Standard friendly acknowledgment button */}
                    <button
                      type="button"
                      className="retro-btn px-3.5 py-1 text-xs"
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          // User Message Box
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[85%] sm:max-w-[70%] border-2 border-[#2d2825] rounded-2xl shadow-[2.5px_2.5px_0px_#2d2825] bg-[#fff6cc] text-[#2d2825] p-3 animate-in fade-in duration-100">
                <div className="flex items-center justify-between gap-3 pb-1 mb-1 border-b border-[#2d2825]/20 text-[10px] font-bold select-none">
                  <span className="uppercase tracking-wider text-[#2d2825]">You</span>
                  <span className="font-mono text-stone-600">{formatTimestamp(msg.createdAt)}</span>
                </div>
                <div className="text-xs sm:text-[13px] leading-relaxed break-words font-sans text-stone-900 font-medium">
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="retro-dialog p-2.5 flex items-center gap-2 text-xs font-bold max-w-xs bg-white shadow-[2px_2px_0px_#2d2825]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f5b638] border border-[#2d2825] animate-ping"></span>
            <span>Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Action Chips */}
      <div className="py-2 px-1 flex items-center gap-1.5 overflow-x-auto text-xs no-scrollbar select-none">
        <span className="text-[11px] font-extrabold text-stone-600 mr-1 shrink-0">
          Try:
        </span>
        <button
          type="button"
          onClick={() => handleChipClick('Just finished calling the vet')}
          className="px-2.5 py-1 rounded-full border border-[#2d2825] bg-[#fffdf9] hover:bg-[#fca5b0]/30 text-xs font-bold text-[#2d2825] shrink-0 transition-colors"
        >
          Log: Called the vet
        </button>
        <button
          type="button"
          onClick={() => handleChipClick('Finished grocery run')}
          className="px-2.5 py-1 rounded-full border border-[#2d2825] bg-[#fffdf9] hover:bg-[#fca5b0]/30 text-xs font-bold text-[#2d2825] shrink-0 transition-colors"
        >
          Log: Grocery run
        </button>
        <button
          type="button"
          onClick={() => handleChipClick('stuck on my task, help me initiate')}
          className="px-2.5 py-1 rounded-full border border-[#2d2825] bg-[#fffdf9] hover:bg-[#52b7aa]/30 text-xs font-bold text-[#2d2825] shrink-0 transition-colors"
        >
          Check-in: Stuck
        </button>
        <button
          type="button"
          onClick={() => handleChipClick('undo that')}
          className="px-2.5 py-1 rounded-full border border-[#2d2825] bg-[#fffdf9] hover:bg-[#ff7865]/30 text-xs font-bold text-[#2d2825] shrink-0 transition-colors"
        >
          Undo last
        </button>
      </div>

      {/* Input Form Bar */}
      <form onSubmit={handleSubmit} className="pt-1 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Drop a task, log an activity, or say you're stuck..."
          disabled={isSending}
          className="retro-input flex-1 px-3 py-2 text-xs sm:text-sm font-sans"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="retro-btn-primary px-4 py-2 text-xs sm:text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </form>
    </div>
  );
};
