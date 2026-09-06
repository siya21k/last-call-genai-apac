import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { RetroChatThread } from './components/RetroChatThread';
import { SidePanel } from './components/SidePanel';
import { SettingsModal } from './components/SettingsModal';
import { PartnerModal } from './components/PartnerModal';
import { DailyStripHeader } from './components/DailyStripHeader';
import { auth, loginWithGoogle, logout, onAuthStateChanged, testConnection } from './lib/firebase';
import type { Task, ThreadMessage, AnchorTimes, UserProfile, PartnerStatusView, DailyStrip } from './types';
import { Clock, ShieldCheck, UserCheck, AlertTriangle, CheckCircle2, Shield, Eye, RefreshCw } from 'lucide-react';

export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Core Thread & Task State
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyStrips, setDailyStrips] = useState<DailyStrip[]>([]);
  const [anchorTimes, setAnchorTimes] = useState<AnchorTimes>({
    beforeWork: '08:30',
    afterWork: '17:30',
    beforeSleep: '23:00',
  });
  const [loadingData, setLoadingData] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);

  // Partner view state
  const isPartner = user?.role === 'partner' && !!user?.ownerUid;
  const [partnerStatus, setPartnerStatus] = useState<PartnerStatusView | null>(null);
  const [loadingPartnerStatus, setLoadingPartnerStatus] = useState(false);

  // Listen to Firebase Auth state
  useEffect(() => {
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const claims = idTokenResult.claims as any;
          const idToken = idTokenResult.token;

          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
            role: claims.role,
            ownerUid: claims.ownerUid,
          });
          setToken(idToken);
        } catch (e) {
          console.error('Error fetching token:', e);
        }
      } else {
        setUser(null);
        setToken(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch thread and task list
  const loadThreadData = useCallback(async () => {
    if (!token) return;

    if (isPartner) {
      // Partner fetch strict status endpoint only
      try {
        setLoadingPartnerStatus(true);
        const res = await fetch(`/api/partner/status?ownerUid=${user?.ownerUid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPartnerStatus(data);
        }
      } catch (err) {
        console.error('Error fetching partner status:', err);
      } finally {
        setLoadingPartnerStatus(false);
      }
      return;
    }

    try {
      setLoadingData(true);
      const res = await fetch('/api/thread', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setTasks(data.tasks || []);
        setDailyStrips(data.dailyStrips || []);
        if (data.anchorTimes) {
          setAnchorTimes(data.anchorTimes);
        }
      }
    } catch (err) {
      console.error('Error fetching thread data:', err);
    } finally {
      setLoadingData(false);
    }
  }, [token, isPartner, user?.ownerUid]);

  useEffect(() => {
    if (token) {
      loadThreadData();
    }
  }, [token, loadThreadData]);

  // Send message in thread
  const handleSendMessage = async (text: string) => {
    if (!token || !text.trim() || isSending) return;

    try {
      setIsSending(true);
      const res = await fetch('/api/thread/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
      });

      if (res.ok) {
        const data = await res.json();
        // Append user and system messages
        setMessages((prev) => {
          const next = [...prev];
          if (data.userMessage && !next.some((m) => m.id === data.userMessage.id)) {
            next.push(data.userMessage);
          }
          if (data.systemMessage && !next.some((m) => m.id === data.systemMessage.id)) {
            next.push(data.systemMessage);
          }
          return next;
        });

        // If task was created, append to tasks list
        if (data.createdTask) {
          setTasks((prev) => [data.createdTask, ...prev]);
        }

        // Re-sync thread data to refresh daily strip and task states
        await loadThreadData();
      }
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Step 12: Direct One-Tap Manual Mark Done
  const handleMarkTaskDone = async (taskId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/done`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        // Update local task state
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: 'met' } : t))
        );
        // Refresh thread messages to display inline confirmation
        await loadThreadData();
      }
    } catch (err) {
      console.error('Error marking task done:', err);
    }
  };

  // Stage 3: Shame-Free Task Release (Amnesty)
  const handleReleaseTask = async (taskId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/release`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: 'released' } : t))
        );
        await loadThreadData();
      }
    } catch (err) {
      console.error('Error releasing task:', err);
    }
  };

  // Stage 3: Direct Task Check-In Coaching (Initiate)
  const handleCheckInTask = async (taskId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        await loadThreadData();
      }
    } catch (err) {
      console.error('Error checking in on task:', err);
    }
  };

  // Stage 3: Complete Check-In Session (Fire completion schema {summary, nextPhysicalAction})
  const handleCompleteCheckIn = async (taskId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/checkin/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        await loadThreadData();
      }
    } catch (err) {
      console.error('Error completing check-in:', err);
    }
  };

  // Save anchor times settings
  const handleSaveAnchorTimes = async (newTimes: AnchorTimes) => {
    if (!token) return;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ anchorTimes: newTimes }),
      });
      if (res.ok) {
        setAnchorTimes(newTimes);
      }
    } catch (err) {
      console.error('Error saving anchor times:', err);
    }
  };

  // Auth Handlers
  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      setMessages([]);
      setTasks([]);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Demo Login for preview environment
  const handleDemoLogin = (role: 'owner' | 'partner' = 'owner') => {
    const demoUid = role === 'owner' ? 'demo_owner_101' : 'demo_partner_202';
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      btoa(
        JSON.stringify({
          user_id: demoUid,
          email: role === 'owner' ? 'alex.owner@example.com' : 'jordan.partner@example.com',
          role: role === 'partner' ? 'partner' : undefined,
          ownerUid: role === 'partner' ? 'demo_owner_101' : undefined,
        })
      ) +
      '.signature';

    setUser({
      uid: demoUid,
      email: role === 'owner' ? 'alex.owner@example.com' : 'jordan.partner@example.com',
      displayName: role === 'owner' ? 'Alex Rivera' : 'Jordan (Partner)',
      photoURL: null,
      role: role === 'partner' ? 'partner' : undefined,
      ownerUid: role === 'partner' ? 'demo_owner_101' : undefined,
    });
    setToken(mockToken);
  };

  return (
    <div className="min-h-screen bg-[#f6f5f1] text-stone-900 flex flex-col font-sans selection:bg-amber-200">
      <Header
        user={user}
        onLogin={handleGoogleLogin}
        onLogout={handleLogout}
        onOpenPartnerModal={() => setIsPartnerModalOpen(true)}
        isPartnerMode={isPartner}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {!user ? (
          /* Unauthenticated Landing / Sign In Screen */
          <div className="max-w-2xl mx-auto my-8 bg-white rounded-3xl border border-stone-200/90 p-8 sm:p-10 shadow-[0_2px_12px_rgba(0,0,0,0.04)] text-center">
            <div className="w-14 h-14 rounded-2xl bg-stone-900 text-stone-100 flex items-center justify-center mx-auto mb-5 shadow-xs">
              <Clock className="w-7 h-7 text-amber-400" />
            </div>

            <span className="font-mono text-[10px] uppercase px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-bold tracking-wider">
              Retro Instant-Messenger Focus Journal
            </span>

            <h1 className="font-extrabold text-3xl sm:text-4xl text-stone-900 tracking-tight mt-3 mb-2">
              Last Call
            </h1>
            <p className="text-stone-600 text-sm sm:text-base leading-relaxed mb-6 max-w-lg mx-auto">
              A blunt, irreverent focus thread for people with ADHD and time-blindness. Type tasks in natural language, log completed items, or initiate check-ins to break activation thresholds.
            </p>

            <div className="space-y-3 max-w-xs mx-auto">
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 text-sm font-semibold transition-all shadow-xs active:scale-[0.98]"
              >
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                  className="w-4 h-4 bg-white rounded-full p-0.5"
                />
                <span>Sign In with Google</span>
              </button>

              <div className="pt-2 text-[10px] text-stone-400 uppercase tracking-widest font-mono">
                or explore in preview
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleDemoLogin('owner')}
                  className="px-3.5 py-2.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-colors"
                >
                  Preview as Owner
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoLogin('partner')}
                  className="px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-700 text-xs font-semibold transition-colors"
                >
                  Preview as Partner
                </button>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-stone-100 text-left text-xs text-stone-500 space-y-2 max-w-md mx-auto">
              <div className="flex items-center gap-2 text-stone-800 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Zero-Trust Security & Request-Triggered Architecture</span>
              </div>
              <p className="text-stone-500 text-[11px] leading-relaxed">
                Direct Firestore writes are strictly denied on all user subcollections. All task creation, AI extraction, and status transitions execute through verified backend endpoints.
              </p>
            </div>
          </div>
        ) : isPartner ? (
          /* Step 11: Accountability Partner View (Strictly computed endpoint payload) */
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/80 border border-indigo-200/90 text-indigo-900 flex items-start gap-3.5 shadow-xs">
              <UserCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold tracking-tight">
                  Accountability Partner Read-Only View
                </h3>
                <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                  Viewing focus status for owner <span className="font-mono font-bold bg-indigo-100/70 px-1.5 py-0.5 rounded">{user.ownerUid}</span>. Per strict privacy rules, this view contains no raw tasks, no numbers, and no conversation transcripts.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-6">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-stone-400 font-bold">
                  DAILY STRIP SUMMARY
                </span>
                <div className="mt-2 p-4 rounded-xl bg-stone-50 border border-stone-200 font-mono text-sm text-stone-800">
                  {loadingPartnerStatus ? (
                    <div className="flex items-center gap-2 text-stone-400 text-xs">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading daily strip...</span>
                    </div>
                  ) : (
                    partnerStatus?.dailyStripLine || 'No activity logged yet today.'
                  )}
                </div>
              </div>

              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-stone-400 font-bold">
                  HIGH-CONSEQUENCE STATUS
                </span>
                <div className="mt-2">
                  {partnerStatus?.hasHardConsequenceInEscalationWindow ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Hard-consequence task within 48h escalation window.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-mono">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>No hard-consequence tasks currently in escalation window.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100 text-[11px] font-mono text-stone-400 flex items-center justify-between">
                <span>Access: Backend Verified Endpoint</span>
                <span>Firestore Direct Read: Denied</span>
              </div>
            </div>
          </div>
        ) : (
          /* Step 1: Owner Primary View - Retro Chat Thread + Side Panel */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
            {/* Primary Thread Container (Span 2) */}
            <div className="lg:col-span-2">
              <DailyStripHeader strips={dailyStrips} />
              <RetroChatThread
                messages={messages}
                onSendMessage={handleSendMessage}
                isSending={isSending}
                tasks={tasks}
                onMarkTaskDone={handleMarkTaskDone}
                onCompleteCheckIn={handleCompleteCheckIn}
              />
            </div>

            {/* Side Panel Container (Span 1) */}
            <div className="lg:col-span-1">
              <SidePanel
                tasks={tasks}
                onMarkTaskDone={handleMarkTaskDone}
                onReleaseTask={handleReleaseTask}
                onCheckInTask={handleCheckInTask}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenPartner={() => setIsPartnerModalOpen(true)}
                isLoading={loadingData}
              />
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal (Anchor Times) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        anchorTimes={anchorTimes}
        onSaveAnchorTimes={handleSaveAnchorTimes}
      />

      {/* Partner Invite Modal */}
      {isPartnerModalOpen && user && token && !isPartner && (
        <PartnerModal
          isOpen={isPartnerModalOpen}
          ownerUid={user.uid}
          token={token}
          onClose={() => setIsPartnerModalOpen(false)}
        />
      )}

      {/* Retro Footer */}
      <footer className="border-t border-stone-200/80 py-4 text-center text-xs text-stone-500 bg-[#f6f5f1]/60 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-[11px] text-stone-600">
            <span className="font-bold text-stone-800">LAST CALL</span>
            <span>•</span>
            <span>Retro Executive Function Thread</span>
          </div>
          <span className="font-mono text-[10px] text-stone-400">
            Request-Triggered Engine // Google Cloud Starter Tier Compliant
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
