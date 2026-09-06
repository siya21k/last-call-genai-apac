import React, { useState, useEffect } from 'react';
import { X, History, MapPin, Sparkles, AlertCircle, Clock, ChevronDown, ChevronUp, Bot, User } from 'lucide-react';
import type { Deadline, CheckInEntry } from '../types';

interface EntriesHistoryModalProps {
  deadline: Deadline;
  token: string;
  onClose: () => void;
}

export const EntriesHistoryModal: React.FC<EntriesHistoryModalProps> = ({
  deadline,
  token,
  onClose,
}) => {
  const [entries, setEntries] = useState<CheckInEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEntries() {
      try {
        setLoading(true);
        const res = await fetch(`/api/deadlines/${deadline.id}/check-in-open`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries || []);
        }
      } catch (err) {
        console.error('Failed to load history entries:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchEntries();
  }, [deadline, token]);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'medium':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-stone-200 text-stone-700 font-semibold">
                Historical Journal
              </span>
              <span className="text-xs text-stone-500">
                {entries.length} {entries.length === 1 ? 'Check-in' : 'Check-ins'} Logged
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

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-xs text-stone-500">
              Loading past check-ins...
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-2">
                <History className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-stone-800">No check-ins logged yet</p>
              <p className="text-xs text-stone-500 mt-0.5">
                Start a check-in on this deadline to explore initiation friction.
              </p>
            </div>
          ) : (
            entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs hover:border-stone-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-bold ${getRiskColor(entry.riskLevel)}`}>
                        {entry.riskLevel} Risk
                      </span>
                      <span className="text-xs font-semibold text-stone-800">
                        {entry.category}
                      </span>
                      <span className="text-[11px] text-stone-500 flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded">
                        <MapPin className="w-3 h-3 text-stone-400" />
                        <span>{entry.locationTag}</span>
                      </span>
                    </div>

                    <span className="text-[11px] text-stone-400 shrink-0">
                      {new Date(entry.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-sm text-stone-700 font-medium mb-3">
                    {entry.summary}
                  </p>

                  {entry.actionItems && entry.actionItems.length > 0 && (
                    <div className="mb-3 p-3 rounded-lg bg-stone-50 border border-stone-200/80">
                      <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-1.5">
                        Agreed Micro-Actions:
                      </span>
                      <ul className="space-y-1">
                        {entry.actionItems.map((act, i) => (
                          <li key={i} className="text-xs text-stone-700 flex items-start gap-1.5">
                            <span className="text-amber-600 font-bold">•</span>
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Expand Conversation Transcript */}
                  {entry.conversation && entry.conversation.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
                      >
                        <span>{isExpanded ? 'Hide Conversation Transcript' : 'View Conversation Transcript'}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-stone-100 space-y-2">
                          {entry.conversation.map((msg, mIdx) => (
                            <div
                              key={mIdx}
                              className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                                msg.role === 'assistant'
                                  ? 'bg-stone-100 text-stone-800'
                                  : 'bg-amber-50 text-amber-900 border border-amber-200'
                              }`}
                            >
                              <div className="flex items-center gap-1 text-[10px] font-bold uppercase mb-0.5 text-stone-500">
                                {msg.role === 'assistant' ? (
                                  <>
                                    <Bot className="w-3 h-3 text-stone-600" />
                                    <span>Last Call Coach</span>
                                  </>
                                ) : (
                                  <>
                                    <User className="w-3 h-3 text-amber-700" />
                                    <span>You</span>
                                  </>
                                )}
                              </div>
                              <p className="whitespace-pre-wrap">{msg.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-900 text-stone-100 text-xs font-medium hover:bg-stone-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
