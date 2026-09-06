import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { StatusSummary } from './components/StatusSummary';
import { DeadlineList } from './components/DeadlineList';
import { CheckInModal } from './components/CheckInModal';
import { EntriesHistoryModal } from './components/EntriesHistoryModal';
import { PartnerModal } from './components/PartnerModal';
import { auth, loginWithGoogle, logout, onAuthStateChanged, testConnection } from './lib/firebase';
import type { Deadline, UserStatus, UserProfile } from './types';
import { Clock, ShieldCheck, Sparkles, UserCheck, AlertCircle } from 'lucide-react';

export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  // Modals state
  const [activeCheckInDeadline, setActiveCheckInDeadline] = useState<Deadline | null>(null);
  const [activeHistoryDeadline, setActiveHistoryDeadline] = useState<Deadline | null>(null);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);

  // Partner view mode
  const isPartner = user?.role === 'partner' && !!user?.ownerUid;

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

  // Fetch deadlines and aggregate status
  const loadDashboardData = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingData(true);

      // 1. Fetch deadlines (lazy missed-check executes on backend)
      if (!isPartner) {
        const dlRes = await fetch('/api/deadlines', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (dlRes.ok) {
          const dlData = await dlRes.json();
          setDeadlines(dlData.deadlines || []);
        }
      }

      // 2. Fetch aggregate status (accessible to owner and partner)
      const statusRes = await fetch('/api/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData.status || null);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoadingData(false);
    }
  }, [token, isPartner]);

  useEffect(() => {
    if (token) {
      loadDashboardData();
    }
  }, [token, loadDashboardData]);

  // Auth Handlers
  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error('Login error:', err);
      // If popup was blocked or iframe restriction occurs, show clear fallback option
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
        alert('Popup blocked. You can also click "Try Instant Preview Mode" below to explore without popups.');
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setDeadlines([]);
    setStatus(null);
  };

  // Demo user for quick verification in sandboxed iframe
  const handleDemoLogin = (role: 'owner' | 'partner' = 'owner') => {
    const demoUid = role === 'owner' ? 'demo_owner_101' : 'demo_partner_202';
    const fakeToken =
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
      displayName: role === 'owner' ? 'Alex (Owner)' : 'Jordan (Partner)',
      photoURL: null,
      role: role === 'partner' ? 'partner' : undefined,
      ownerUid: role === 'partner' ? 'demo_owner_101' : undefined,
    });
    setToken(fakeToken);
  };

  // Deadline Handlers
  const handleAddDeadline = async (name: string, dueAt: string) => {
    if (!token) return;
    const res = await fetch('/api/deadlines', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, dueAt }),
    });

    if (res.ok) {
      const data = await res.json();
      setDeadlines((prev) => [data.deadline, ...prev]);
      setStatus(data.status);
    } else {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create deadline');
    }
  };

  const handleMarkDone = async (id: string) => {
    if (!token) return;
    const res = await fetch(`/api/deadlines/${id}/mark-done`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      setDeadlines((prev) =>
        prev.map((d) => (d.id === id ? data.deadline : d))
      );
      setStatus(data.status);
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to mark done');
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f5f1] text-stone-900 flex flex-col font-sans selection:bg-amber-200">
      <Header
        user={user}
        status={status}
        onLogin={handleGoogleLogin}
        onLogout={handleLogout}
        onOpenPartnerModal={() => setIsPartnerModalOpen(true)}
        isPartnerMode={isPartner}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {!user ? (
          /* Unauthenticated Landing / Sign In Screen - Bento Grid Layout */
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
              {/* Hero Bento Card (Span 2) */}
              <div className="md:col-span-2 bg-white rounded-2xl sm:rounded-3xl border border-stone-200/90 p-7 sm:p-9 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col justify-between relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-stone-900 text-stone-100 flex items-center justify-center shadow-xs">
                      <Clock className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold tracking-wider">
                        ADHD & Time-Blindness Tool
                      </span>
                      <h1 className="font-extrabold text-2xl sm:text-3xl text-stone-900 tracking-tight mt-0.5">
                        Last Call
                      </h1>
                    </div>
                  </div>

                  <p className="text-stone-600 text-sm sm:text-base leading-relaxed max-w-xl mb-6">
                    A blunt, irreverent focus and task-initiation journal for people with ADHD. It doesn't give you generic motivational quotes—it helps you identify what is physically freezing you right now, breaks down the activation threshold with Gemini, and protects your momentum.
                  </p>
                </div>

                <div className="relative z-10 pt-4 border-t border-stone-100 space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <button
                      onClick={handleGoogleLogin}
                      className="flex-1 flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 text-sm font-semibold transition-all shadow-xs active:scale-[0.98]"
                    >
                      <img
                        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                        alt="Google"
                        className="w-4 h-4 bg-white rounded-full p-0.5"
                      />
                      <span>Sign In with Google</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDemoLogin('owner')}
                        className="flex-1 sm:flex-initial px-3.5 py-3 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-semibold transition-colors"
                      >
                        Preview as Owner
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDemoLogin('partner')}
                        className="flex-1 sm:flex-initial px-3.5 py-3 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-700 text-xs font-semibold transition-colors"
                      >
                        Preview as Partner
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bento Card 2: Initiation Focus Prompt */}
              <div className="bg-stone-900 text-stone-100 rounded-2xl sm:rounded-3xl border border-stone-800 p-6 sm:p-7 shadow-[0_2px_8px_rgba(0,0,0,0.1)] flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 font-semibold tracking-wider">
                      Gemini Initiation
                    </span>
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <h3 className="font-bold text-base text-stone-100 tracking-tight mb-2">
                    "What's actually stopping you right now?"
                  </h3>
                  <p className="text-stone-300 text-xs leading-relaxed">
                    Narrowly scoped to task-initiation. The AI helps you name the physical obstacle—bed, phone paralysis, overwhelm—with zero shame and high urgency.
                  </p>
                </div>

                <div className="pt-4 border-t border-stone-800 font-mono text-[11px] text-stone-400 flex items-center justify-between">
                  <span>Structured Extraction</span>
                  <span className="text-amber-400">Risk Assessment</span>
                </div>
              </div>

              {/* Bento Card 3: "Eventually Done" Metric */}
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200/90 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col justify-between">
                <div>
                  <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200/60">
                    ADHD Psychology
                  </span>
                  <h3 className="font-bold text-base text-stone-900 tracking-tight mt-3 mb-1">
                    "Eventually Done" Metric
                  </h3>
                  <p className="text-stone-600 text-xs leading-relaxed">
                    Most tools punish you for missing a deadline by wiping out your streak. Here, tasks marked completed (even hours or days late) still count toward your streak.
                  </p>
                </div>
                <div className="pt-4 border-t border-stone-100 font-mono text-[11px] text-stone-400">
                  Late finishes count as real progress
                </div>
              </div>

              {/* Bento Card 4: Accountability Partner RBAC */}
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200/90 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col justify-between">
                <div>
                  <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 font-semibold border border-indigo-200/60">
                    Role-Based Access
                  </span>
                  <h3 className="font-bold text-base text-stone-900 tracking-tight mt-3 mb-1">
                    Zero-Leak Partner View
                  </h3>
                  <p className="text-stone-600 text-xs leading-relaxed">
                    Invite an accountability partner who can see your high-level streak and risk status, while all private journals and chat transcripts remain strictly locked to you.
                  </p>
                </div>
                <div className="pt-4 border-t border-stone-100 font-mono text-[11px] text-stone-400">
                  Enforced via Firebase Custom Claims
                </div>
              </div>

              {/* Bento Card 5: Security Architecture */}
              <div className="bg-white rounded-2xl sm:rounded-3xl border border-stone-200/90 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-stone-800 mb-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-sm">Zero-Trust Cloud Run</span>
                  </div>
                  <p className="text-stone-600 text-xs leading-relaxed">
                    Direct client writes to Firestore are blocked. All deadline calculations, AI evaluations, and streak updates run inside transactional Admin SDK server endpoints.
                  </p>
                </div>
                <div className="pt-4 border-t border-stone-100 font-mono text-[11px] text-stone-400">
                  OWASP Top 10 & LLM-Hardened
                </div>
              </div>
            </div>
          </div>
        ) : isPartner ? (
          /* Partner Read-Only View */
          <div className="space-y-6">
            <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/80 border border-indigo-200/90 text-indigo-900 flex items-start gap-3.5 shadow-xs">
              <UserCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold tracking-tight">
                  Accountability Partner Read-Only View
                </h3>
                <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                  You are viewing the focus status for owner <span className="font-mono font-bold bg-indigo-100/70 px-1.5 py-0.5 rounded">{user.ownerUid}</span>. Per strict security rules, you have read access exclusively to this aggregate status document — private check-in conversations and task history remain confidential.
                </p>
              </div>
            </div>

            <StatusSummary status={status} loading={loadingData} />
          </div>
        ) : (
          /* Owner Interactive Dashboard */
          <>
            <StatusSummary status={status} loading={loadingData} />

            <DeadlineList
              deadlines={deadlines}
              onAddDeadline={handleAddDeadline}
              onMarkDone={handleMarkDone}
              onStartCheckIn={(dl) => setActiveCheckInDeadline(dl)}
              onViewHistory={(dl) => setActiveHistoryDeadline(dl)}
              loading={loadingData}
            />
          </>
        )}
      </main>

      {/* Check-In Modal (Multi-turn Gemini initiation session) */}
      {activeCheckInDeadline && token && (
        <CheckInModal
          deadline={activeCheckInDeadline}
          token={token}
          onClose={() => setActiveCheckInDeadline(null)}
          onCheckInCompleted={() => {
            loadDashboardData();
          }}
        />
      )}

      {/* Entries History Modal */}
      {activeHistoryDeadline && token && (
        <EntriesHistoryModal
          deadline={activeHistoryDeadline}
          token={token}
          onClose={() => setActiveHistoryDeadline(null)}
        />
      )}

      {/* Accountability Partner Modal */}
      {isPartnerModalOpen && user && token && (
        <PartnerModal
          ownerUid={user.uid}
          token={token}
          onClose={() => setIsPartnerModalOpen(false)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-stone-200/80 py-6 text-center text-xs text-stone-500 bg-[#f6f5f1]/60 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-700">Last Call</span>
            <span>•</span>
            <span>ADHD Executive Function Journal</span>
          </div>
          <span className="font-mono text-[11px] text-stone-400">
            Fallback Ladder: Gemini 3.6 Flash → 3.1 Flash-Lite → Latest → 3.7 Flash
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
