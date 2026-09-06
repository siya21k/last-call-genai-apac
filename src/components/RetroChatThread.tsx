import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Terminal,
  Clock,
  CheckCircle2,
  AlertCircle,
  Undo2,
  CornerDownLeft,
  RotateCcw,
  Sparkles,
  Zap,
  Shield,
} from 'lucide-react';
import type { ThreadMessage, Task } from '../types';

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending]);

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
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] bg-white rounded-2xl border border-stone-300 shadow-[0_4px_20px_rgba(0,0,0,0.06)] overflow-hidden font-sans">
      {/* Retro Window Header */}
      <div className="bg-stone-900 text-stone-200 px-4 py-2.5 flex items-center justify-between border-b border-stone-800 select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shadow-[0_0_6px_rgba(251,191,36,0.8)]"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-stone-700 inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-stone-700 inline-block"></span>
          </div>
          <Terminal className="w-4 h-4 text-amber-400" />
          <span className="font-mono text-xs font-semibold text-stone-100 tracking-wider">
            LAST_CALL // THREAD_TERMINAL
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-stone-400">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>ONLINE</span>
          </span>
          <span className="hidden sm:inline text-stone-600">|</span>
          <span className="hidden sm:inline text-stone-400">GEMINI_3.6_FLASH</span>
        </div>
      </div>

      {/* Retro Info Banner */}
      <div className="bg-stone-100/90 border-b border-stone-200 px-4 py-1.5 flex items-center justify-between text-[11px] font-mono text-stone-600">
        <div className="flex items-center gap-2 truncate">
          <span className="text-amber-700 font-semibold">[INFO]</span>
          <span className="truncate">
            Free-type a task, something you just finished, or what's stopping you right now.
          </span>
        </div>
      </div>

      {/* Messages Transcript Scroll Area */}
      <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3 bg-[#faf9f6]/70">
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

            return (
              <div
                key={msg.id}
                className={`p-3 sm:p-3.5 rounded-xl border text-xs font-mono transition-all ${
                  isAutoClose
                    ? 'bg-emerald-50/90 border-emerald-300/80 text-emerald-950 shadow-xs'
                    : isTaskCreated
                    ? 'bg-amber-50/90 border-amber-300/80 text-amber-950 shadow-xs'
                    : isCandidatePrompt
                    ? 'bg-amber-50/90 border-amber-300/80 text-amber-950 shadow-xs'
                    : isCheckinPrompt
                    ? 'bg-amber-50/95 border-amber-300/90 text-amber-950 shadow-xs ring-1 ring-amber-400/30'
                    : isAmnesty
                    ? 'bg-stone-200/90 border-stone-300 text-stone-900 shadow-xs'
                    : isReopened
                    ? 'bg-stone-200/90 border-stone-300 text-stone-900 shadow-xs'
                    : 'bg-stone-100/90 border-stone-200 text-stone-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <div className="mt-0.5 shrink-0">
                      {isAutoClose ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      ) : isTaskCreated ? (
                        <Clock className="w-4 h-4 text-amber-700" />
                      ) : isCandidatePrompt ? (
                        <AlertCircle className="w-4 h-4 text-amber-700" />
                      ) : isCheckinPrompt ? (
                        <Zap className="w-4 h-4 text-amber-600" />
                      ) : isAmnesty ? (
                        <Shield className="w-4 h-4 text-stone-600" />
                      ) : isReopened ? (
                        <Undo2 className="w-4 h-4 text-stone-700" />
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-stone-800 text-amber-400 text-[10px] font-bold">
                          SYSTEM
                        </span>
                      )}
                    </div>
                    <div className="flex-1 leading-relaxed whitespace-pre-wrap">
                      <span className="text-stone-400 text-[10px] mr-2 select-none">
                        [{formatTimestamp(msg.createdAt)}]
                      </span>
                      <span
                        className={
                          isAutoClose
                            ? 'font-semibold text-emerald-950'
                            : isTaskCreated
                            ? 'font-semibold text-amber-950'
                            : isCheckinPrompt
                            ? 'text-stone-900'
                            : isReopened
                            ? 'font-semibold text-stone-900'
                            : 'text-stone-800'
                        }
                      >
                        {msg.text}
                      </span>
                    </div>
                  </div>

                  {/* Step 4: Quick Undo action for auto-close confirmations */}
                  {isAutoClose && (
                    <button
                      type="button"
                      onClick={() => onSendMessage(undoPhrase)}
                      className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-emerald-100/70 border border-emerald-300 text-emerald-800 text-[11px] font-medium transition-colors"
                      title={relatedTask ? `Undo auto-close for ${relatedTask.name}` : 'Undo auto-close'}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Undo</span>
                    </button>
                  )}

                  {/* Step 4: Quick confirm action for candidate match prompts */}
                  {isCandidatePrompt && msg.relatedTaskId && (
                    <button
                      type="button"
                      onClick={() => onMarkTaskDone(msg.relatedTaskId!)}
                      className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 text-stone-100 text-[11px] font-medium transition-colors"
                    >
                      <span>Yes, mark done</span>
                    </button>
                  )}

                  {/* Stage 3: Quick complete micro-step action for check-in prompts */}
                  {isCheckinPrompt && msg.relatedTaskId && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (onCompleteCheckIn && msg.relatedTaskId) {
                          await onCompleteCheckIn(msg.relatedTaskId);
                        } else {
                          onSendMessage(`Done with 2-min action on ${relatedTask?.name || 'task'}`);
                        }
                      }}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-stone-950 font-semibold text-[11px] transition-colors shadow-xs"
                      title="Finish check-in session and lock in next physical action"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Done micro-step</span>
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // User message bubble
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[85%] sm:max-w-[70%] bg-stone-900 text-stone-50 rounded-2xl rounded-tr-xs px-4 py-2.5 shadow-xs border border-stone-800">
                <div className="text-xs sm:text-[13px] leading-relaxed break-words font-sans">
                  {msg.text}
                </div>
                <div className="mt-1 text-[10px] text-stone-400 font-mono text-right select-none">
                  {formatTimestamp(msg.createdAt)}
                </div>
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-stone-100 border border-stone-200 text-stone-600 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            <span>Evaluating message & matching actions...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts (Optional shortcuts) */}
      <div className="px-4 py-2 bg-stone-100/60 border-t border-stone-200/80 flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono no-scrollbar">
        <span className="text-stone-400 shrink-0 text-[10px] uppercase font-bold mr-1">Try:</span>
        <button
          type="button"
          onClick={() => handleChipClick('Just finished calling the vet')}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-white hover:bg-stone-200/70 border border-stone-300 text-stone-700 transition-colors"
        >
          Log: Called the vet
        </button>
        <button
          type="button"
          onClick={() => handleChipClick('Finished grocery run')}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-white hover:bg-stone-200/70 border border-stone-300 text-stone-700 transition-colors"
        >
          Log: Grocery run
        </button>
        <button
          type="button"
          onClick={() => handleChipClick('stuck on my task, help me initiate')}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-white hover:bg-stone-200/70 border border-stone-300 text-stone-700 transition-colors"
        >
          Check-in: Stuck / Help start
        </button>
        <button
          type="button"
          onClick={() => handleChipClick('wrong one')}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-white hover:bg-stone-200/70 border border-stone-300 text-stone-700 transition-colors"
        >
          Undo: Wrong one
        </button>
        <button
          type="button"
          onClick={() => handleChipClick('Pay electric bill before work tomorrow')}
          className="shrink-0 px-2.5 py-1 rounded-lg bg-white hover:bg-stone-200/70 border border-stone-300 text-stone-700 transition-colors"
        >
          + Task: Electric bill
        </button>
      </div>

      {/* Terminal Input Bar */}
      <form onSubmit={handleSubmit} className="p-3 sm:p-4 bg-white border-t border-stone-200 flex items-center gap-2">
        <div className="relative flex-1 flex items-center">
          <span className="absolute left-3 text-stone-400 font-mono text-sm pointer-events-none">
            &gt;
          </span>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type anything (e.g. 'Just finished calling the vet')..."
            disabled={isSending}
            className="w-full pl-8 pr-4 py-2.5 text-sm sm:text-base font-sans rounded-xl border border-stone-300 focus:border-stone-800 focus:ring-1 focus:ring-stone-800 bg-stone-50 focus:bg-white outline-none transition-all placeholder:text-stone-400 disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="px-4 sm:px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-xs disabled:opacity-40 disabled:hover:bg-stone-900 active:scale-95"
        >
          <span>Send</span>
          <CornerDownLeft className="w-3.5 h-3.5 text-amber-400" />
        </button>
      </form>
    </div>
  );
};
