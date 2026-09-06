import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Sparkles,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CheckSquare,
  Square,
  ShieldAlert,
  Bot,
  User,
  ArrowRight,
} from 'lucide-react';
import type { Deadline, LocationTag, CheckInMessage } from '../types';

interface CheckInModalProps {
  deadline: Deadline;
  token: string;
  onClose: () => void;
  onCheckInCompleted: () => void;
}

const LOCATION_OPTIONS: { id: LocationTag; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'office', label: 'Office / Desk', icon: '💼' },
  { id: 'in bed', label: 'In Bed', icon: '🛏️' },
  { id: 'other', label: 'Other / Transit', icon: '📍' },
];

export const CheckInModal: React.FC<CheckInModalProps> = ({
  deadline,
  token,
  onClose,
  onCheckInCompleted,
}) => {
  const [locationTag, setLocationTag] = useState<LocationTag>('home');
  const [conversation, setConversation] = useState<CheckInMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completedResult, setCompletedResult] = useState<any | null>(null);
  const [actionItemChecked, setActionItemChecked] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize check-in on mount
  useEffect(() => {
    const isMissed = deadline.status === 'missed';
    const initialGreeting = isMissed
      ? `This deadline for "${deadline.name}" has passed. No shame — let's do a fast post-mortem. Where are you right now physically, and what was the real obstacle that froze you?`
      : `Let's tackle "${deadline.name}". It's due ${new Date(deadline.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. What is the single friction point keeping you from opening step 1 right now?`;

    setConversation([
      {
        role: 'assistant',
        text: initialGreeting,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [deadline]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const handleSendMessage = async (textToSend?: string) => {
    const message = textToSend || userInput;
    if (!message.trim() || sendingMessage) return;

    const userMsg: CheckInMessage = {
      role: 'user',
      text: message.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedConvo = [...conversation, userMsg];
    setConversation(updatedConvo);
    setUserInput('');
    setSendingMessage(true);

    try {
      const res = await fetch('/api/check-in/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deadlineName: deadline.name,
          dueAt: deadline.dueAt,
          locationTag,
          conversation: updatedConvo,
          userMessage: message.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to get guidance from AI');
      }

      const data = await res.json();
      setConversation([
        ...updatedConvo,
        {
          role: 'assistant',
          text: data.reply,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setConversation([
        ...updatedConvo,
        {
          role: 'assistant',
          text: "I hit a snag connecting to Gemini, but here's the core directive: pick the smallest possible physical move right now. Open the window, type one word, or grab water. What's the immediate next 2 minutes look like?",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleCompleteCheckIn = async () => {
    if (completing) return;
    setCompleting(true);

    try {
      const res = await fetch('/api/check-in/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          deadlineId: deadline.id,
          deadlineName: deadline.name,
          dueAt: deadline.dueAt,
          locationTag,
          conversation,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save check-in');
      }

      const result = await res.json();
      setCompletedResult(result);
      onCheckInCompleted();
    } catch (err) {
      console.error('Error completing check-in:', err);
      alert('Could not complete check-in. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  const getRiskDisplay = (risk: string) => {
    switch (risk) {
      case 'critical':
        return {
          badge: 'bg-rose-100 text-rose-800 border-rose-300',
          title: 'Critical Initiation Risk',
          desc: 'Urgent intervention protocol triggered.',
        };
      case 'medium':
        return {
          badge: 'bg-amber-100 text-amber-800 border-amber-300',
          title: 'Medium Initiation Risk',
          desc: 'Moderate friction detected. Execute micro-action immediately.',
        };
      default:
        return {
          badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          title: 'Low Initiation Risk',
          desc: 'Momentum is manageable. Proceed with step 1.',
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-2xl w-full flex flex-col h-[90vh] max-h-[720px] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                {deadline.status === 'missed' ? 'Post-Mortem Check-In' : 'Task Initiation Session'}
              </span>
              <span className="text-xs text-stone-500">
                Target: {new Date(deadline.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <h3 className="font-serif font-bold text-lg text-stone-900 mt-1 truncate max-w-md">
              {deadline.name}
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Location Tag Selector (Environmental Trigger Pattern) */}
        {!completedResult && (
          <div className="px-4 sm:px-5 py-2.5 bg-stone-100/70 border-b border-stone-200 flex items-center gap-2 overflow-x-auto text-xs">
            <span className="text-stone-500 font-medium shrink-0 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-stone-400" /> Location:
            </span>
            {LOCATION_OPTIONS.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => setLocationTag(loc.id)}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 shrink-0 ${
                  locationTag === loc.id
                    ? 'bg-stone-900 text-stone-100 font-medium shadow-xs'
                    : 'bg-white hover:bg-stone-200/80 text-stone-700 border border-stone-200'
                }`}
              >
                <span>{loc.icon}</span>
                <span>{loc.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Modal Body: Active Chat or Completed Summary */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {!completedResult ? (
            <>
              {/* Chat Messages */}
              {conversation.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[82%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-amber-600 text-white rounded-tr-xs'
                        : 'bg-stone-100 text-stone-800 rounded-tl-xs border border-stone-200/70'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <span
                      className={`text-[10px] mt-1 block text-right ${
                        msg.role === 'user' ? 'text-amber-200' : 'text-stone-400'
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {sendingMessage && (
                <div className="flex items-center gap-2 text-xs text-stone-500 italic p-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" />
                  <span>Last Call is synthesizing blunt initiation action...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          ) : (
            /* Structured Extraction Result Screen */
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-stone-500">
                    Category: {completedResult.entry?.category || 'General Focus'}
                  </span>
                  <span
                    className={`text-xs font-mono uppercase px-2.5 py-0.5 rounded-full font-bold border ${
                      getRiskDisplay(completedResult.entry?.riskLevel).badge
                    }`}
                  >
                    {completedResult.entry?.riskLevel} Risk
                  </span>
                </div>

                <h4 className="font-semibold text-stone-900 text-base mb-1">
                  Session Extraction Summary
                </h4>
                <p className="text-sm text-stone-700 leading-relaxed">
                  {completedResult.entry?.summary}
                </p>

                {completedResult.slackAlertSent && (
                  <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-xs text-rose-800">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      Critical Risk Alert was automatically transmitted to Slack accountability webhook.
                    </span>
                  </div>
                )}
              </div>

              {/* Action Items with checkboxes */}
              <div>
                <h4 className="font-serif font-bold text-base text-stone-900 mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Immediate Initiation Micro-Actions</span>
                </h4>
                <div className="space-y-2">
                  {completedResult.entry?.actionItems?.map((item: string, idx: number) => {
                    const checked = !!actionItemChecked[idx];
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setActionItemChecked((prev) => ({ ...prev, [idx]: !prev[idx] }))
                        }
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                          checked
                            ? 'bg-emerald-50/70 border-emerald-300 text-stone-500 line-through'
                            : 'bg-white hover:bg-stone-50 border-stone-200 text-stone-800'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                        )}
                        <span className="text-sm font-medium leading-tight">{item}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50/90 flex flex-col gap-3">
          {!completedResult ? (
            <>
              {/* Quick Prompt Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1">
                <span className="text-[11px] text-stone-400 shrink-0">Prompts:</span>
                {[
                  'Stuck scrolling in bed',
                  'Perfectionism paralysis',
                  'Missing step 1',
                  'Sensory overwhelm',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSendMessage(chip)}
                    className="px-2.5 py-1 rounded-lg bg-stone-200/80 hover:bg-stone-300 text-stone-700 shrink-0 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Chat Input Field */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="What is actually stopping you right now?..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!userInput.trim() || sendingMessage}
                  className="p-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* End Check-In & Structured Output Trigger */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-stone-400">
                  Keep it tight. 2-3 exchanges is ideal.
                </p>
                <button
                  type="button"
                  onClick={handleCompleteCheckIn}
                  disabled={completing || conversation.length < 2}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs font-semibold transition-all shadow-xs disabled:opacity-40"
                >
                  <span>{completing ? 'Extracting Action Plan...' : 'Finish Check-In & Save'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs font-medium transition-all"
              >
                Back to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
