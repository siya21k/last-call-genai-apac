import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { RetroChatThread } from './components/RetroChatThread';
import { SidePanel } from './components/SidePanel';
import { SettingsModal } from './components/SettingsModal';
import { PartnerModal } from './components/PartnerModal';
import { DailyStripHeader } from './components/DailyStripHeader';
import { MascotFlower, DecorativeSparkle } from './components/Mascot';
import {
  auth,
  loginWithGoogle,
  logout,
  onAuthStateChanged,
  onIdTokenChanged,
  testConnection,
  onSnapshot,
  doc,
  db,
} from './lib/firebase';
import type {
  Task,
  ThreadMessage,
  AnchorTimes,
  UserProfile,
  PartnerStatusView,
  DailyStrip,
  JournalEntry,
  ConsequenceType,
  PresenceState,
  PartnerInvite,
} from './types';
import {
  Clock,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Shield,
  ArrowLeft,
  MessageSquare,
  RotateCcw,
  Heart,
} from 'lucide-react';

export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Welcome mascot toast (appears briefly after signing in, then disappears)
  const [showWelcomeMascot, setShowWelcomeMascot] = useState(false);

  // Core Thread & Task State
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyStrips, setDailyStrips] = useState<DailyStrip[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
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

  // Incoming Partner Invite state (for invited user)
  const [incomingInvite, setIncomingInvite] = useState<PartnerInvite | null>(null);
  const [respondingInvite, setRespondingInvite] = useState(false);

  // Partner view state & independent view navigation
  const isPartner = user?.role === 'partner' && !!user?.ownerUid;
  const [activeMainView, setActiveMainView] = useState<'thread' | 'partner'>('thread');
  const [partnerStatus, setPartnerStatus] = useState<PartnerStatusView | null>(null);
  const [partnerStatusError, setPartnerStatusError] = useState<string | null>(null);
  const [loadingPartnerStatus, setLoadingPartnerStatus] = useState(false);
  const [showEndPartnerConfirm, setShowEndPartnerConfirm] = useState(false);
  const [presence, setPresence] = useState<PresenceState | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  // Listen to Firebase Auth state
  useEffect(() => {
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idTokenResult = await firebaseUser.getIdTokenResult(true);
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

          // Trigger brief friendly welcome mascot toast
          setShowWelcomeMascot(true);
          setTimeout(() => setShowWelcomeMascot(false), 4500);
        } catch (e) {
          console.error('Error fetching token:', e);
        }
      } else {
        setUser(null);
        setToken(null);
      }
      setAuthLoading(false);
    });

    const unsubIdToken = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const fresh = await firebaseUser.getIdToken();
          setToken(fresh);
        } catch (_) {}
      }
    });

    return () => {
      unsubscribe();
      unsubIdToken();
    };
  }, []);

  // Fetch personal thread & workspace data for current user
  const loadWorkspaceData = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingData(true);
      const [threadRes, journalRes] = await Promise.all([
        fetch('/api/thread', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/journal', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (threadRes.ok) {
        const data = await threadRes.json();
        setMessages(data.messages || []);
        setTasks(data.tasks || []);
        setDailyStrips(data.dailyStrips || []);
        if (data.profile?.anchorTimes) {
          setAnchorTimes(data.profile.anchorTimes);
        }
      }

      if (journalRes.ok) {
        const jData = await journalRes.json();
        setJournalEntries(jData.entries || []);
      }
    } catch (err) {
      console.error('Error loading workspace data:', err);
    } finally {
      setLoadingData(false);
    }
  }, [token]);

  // Fetch partner status (computed read-only endpoint)
  const loadPartnerStatus = useCallback(
    async (overrideToken?: string, overrideOwnerUid?: string) => {
      const activeToken = overrideToken || token;
      const activeOwnerUid = overrideOwnerUid || user?.ownerUid;
      if (!activeToken || !activeOwnerUid) return;

      try {
        setLoadingPartnerStatus(true);
        setPartnerStatusError(null);
        const res = await fetch(`/api/partner/status?ownerUid=${activeOwnerUid}`, {
          headers: { Authorization: `Bearer ${activeToken}` },
        });

        if (res.ok) {
          const data = await res.json();
          setPartnerStatus(data);
        } else {
          const err = await res.json().catch(() => ({}));
          console.warn('[Partner] Error fetching status:', err);
          setPartnerStatusError(err.error || `Unable to load partner status (${res.status})`);
        }
      } catch (err: any) {
        console.error('Error fetching partner status:', err);
        setPartnerStatusError(err.message || 'Network error fetching partner status.');
      } finally {
        setLoadingPartnerStatus(false);
      }
    },
    [token, user?.ownerUid]
  );

  // Load user data on token or role updates
  useEffect(() => {
    if (token) {
      loadWorkspaceData();
      if (isPartner) {
        loadPartnerStatus();
      }
    }
  }, [token, isPartner, loadWorkspaceData, loadPartnerStatus]);

  // Check for incoming partner invites
  const checkIncomingInvite = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/partner/incoming-invite', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIncomingInvite(data.incomingInvite || null);
      }
    } catch (err) {
      console.warn('Error checking incoming partner invites:', err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      checkIncomingInvite();
    }
  }, [token, checkIncomingInvite]);

  // Handle accepting partner invite
  const handleAcceptInvite = async () => {
    if (!incomingInvite?.ownerUid || !token || respondingInvite) return;
    const targetOwnerUid = incomingInvite.ownerUid;

    try {
      setRespondingInvite(true);
      const res = await fetch('/api/partner/invite/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ownerUid: targetOwnerUid }),
      });

      if (res.ok) {
        setIncomingInvite(null);

        // Force token refresh with verification loop so custom claims take effect immediately
        let freshToken = token;
        let resolvedRole: 'owner' | 'partner' = 'partner';
        let resolvedOwnerUid: string | undefined = targetOwnerUid;

        if (auth.currentUser) {
          let attempts = 0;
          while (attempts < 5) {
            attempts++;
            try {
              const idTokenResult = await auth.currentUser.getIdTokenResult(true);
              const claims = idTokenResult.claims as any;
              freshToken = idTokenResult.token;
              if (claims.role === 'partner' && claims.ownerUid === targetOwnerUid) {
                resolvedRole = claims.role;
                resolvedOwnerUid = claims.ownerUid;
                break;
              }
            } catch (e) {
              console.warn('[Auth] Token refresh attempt error:', e);
            }
            if (attempts < 5) {
              await new Promise((r) => setTimeout(r, 250));
            }
          }
        }

        setToken(freshToken);
        setUser((prev) =>
          prev
            ? {
                ...prev,
                role: resolvedRole,
                ownerUid: resolvedOwnerUid,
              }
            : null
        );

        // Fetch partner status with the verified fresh token
        await loadPartnerStatus(freshToken, resolvedOwnerUid);
        // Switch to partner view so the user sees the confirmation immediately
        setActiveMainView('partner');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to accept partner invite.');
      }
    } catch (err: any) {
      console.error('Error accepting partner invite:', err);
      alert('Error accepting partner invite. Please try again.');
    } finally {
      setRespondingInvite(false);
    }
  };

  // Handle declining partner invite
  const handleDeclineInvite = async () => {
    if (!incomingInvite?.ownerUid || !token || respondingInvite) return;
    try {
      setRespondingInvite(true);
      await fetch('/api/partner/invite/decline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ownerUid: incomingInvite.ownerUid }),
      });
      setIncomingInvite(null);
    } catch (err: any) {
      console.error('Error declining partner invite:', err);
    } finally {
      setRespondingInvite(false);
    }
  };

  // Handle partner voluntarily disconnecting / revoking access (irreversible)
  const handlePartnerSelfRevoke = async () => {
    if (!token || respondingInvite) return;
    try {
      setRespondingInvite(true);
      const res = await fetch('/api/partner/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        setShowEndPartnerConfirm(false);
        setPartnerStatus(null);
        setActiveMainView('thread');

        if (auth.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true);
          const idTokenResult = await auth.currentUser.getIdTokenResult(true);
          const claims = idTokenResult.claims as any;
          setToken(freshToken);
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  role: claims.role,
                  ownerUid: claims.ownerUid,
                }
              : null
          );
        } else {
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  role: undefined,
                  ownerUid: undefined,
                }
              : null
          );
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to end partner relationship.');
      }
    } catch (err) {
      console.error('Error disconnecting partner:', err);
      alert('Network error ending partner relationship.');
    } finally {
      setRespondingInvite(false);
    }
  };

  // Realtime Presence listener for Partner: subscribes directly to /users/{ownerUid}/presence/current
  useEffect(() => {
    if (!isPartner || !user?.ownerUid) return;

    const presenceDocRef = doc(db, 'users', user.ownerUid, 'presence', 'current');
    const unsubscribe = onSnapshot(
      presenceDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setPresence(snapshot.data() as PresenceState);
        } else {
          setPresence({ isCheckingIn: false, updatedAt: null });
        }
      },
      (err) => {
        console.warn('[Partner] Realtime presence subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [isPartner, user?.ownerUid]);

  // Regular tick to recompute client-side staleness (10-minute timeout guard)
  useEffect(() => {
    if (!isPartner) return;
    const interval = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [isPartner]);

  // Client-Side Staleness Guard:
  // "Display 'currently checking in' ONLY when isCheckingIn === true AND (now - updatedAt) is less than 10 minutes."
  const isLiveCheckingIn = useMemo(() => {
    if (!presence || !presence.isCheckingIn) return false;
    let updatedMs = 0;
    if (presence.updatedAt?.toMillis) {
      updatedMs = presence.updatedAt.toMillis();
    } else if (presence.updatedAt?.seconds) {
      updatedMs = presence.updatedAt.seconds * 1000;
    } else if (typeof presence.updatedAt === 'string') {
      updatedMs = new Date(presence.updatedAt).getTime();
    } else if (presence.updatedAt instanceof Date) {
      updatedMs = presence.updatedAt.getTime();
    }
    if (!updatedMs || isNaN(updatedMs)) return false;
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    return nowMs - updatedMs < TEN_MINUTES_MS;
  }, [presence, nowMs]);

  // Mood Tap: optionally flavor today's daily strip summary
  const handleMoodTap = async (date: string, mood: string | null) => {
    if (!token) return;
    try {
      const res = await fetch('/api/dailystrips/mood', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date, mood }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.dailyStrips) {
          setDailyStrips(data.dailyStrips);
        }
      }
    } catch (err) {
      console.error('Error updating mood tap:', err);
    }
  };

  // Add Journal Entry
  const handleAddJournalEntry = async (text: string) => {
    if (!token || !text.trim()) return;
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setJournalEntries((prev) => [data.entry, ...prev]);
        await loadWorkspaceData();
      }
    } catch (err) {
      console.error('Error adding journal entry:', err);
    }
  };

  // Delete Journal Entry
  const handleDeleteJournalEntry = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/journal/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setJournalEntries((prev) => prev.filter((e) => e.id !== id));
      }
    } catch (err) {
      console.error('Error deleting journal entry:', err);
    }
  };

  // Direct Add Task
  const handleAddTask = async (task: {
    name: string;
    dueAt?: string;
    consequenceType?: ConsequenceType;
  }) => {
    if (!token || !task.name.trim()) return;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: task.name.trim(),
          dueAt: task.dueAt,
          consequenceType: task.consequenceType || 'unspecified',
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) => [data.task, ...prev]);
        }
        if (data.systemMessage) {
          setMessages((prev) => [...prev, data.systemMessage]);
        }
        await loadWorkspaceData();
      }
    } catch (err) {
      console.error('Error creating task:', err);
    }
  };

  // Direct Edit Task (with tracking reset if dueAt changed)
  const handleUpdateTask = async (
    taskId: string,
    updates: {
      name?: string;
      dueAt?: string;
      consequenceType?: ConsequenceType;
    }
  ) => {
    if (!token) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? data.task : t))
          );
        }
        await loadWorkspaceData();
      }
    } catch (err) {
      console.error('Error updating task:', err);
    }
  };

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
        body: JSON.stringify({
          message: text,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
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

        if (data.createdTask) {
          setTasks((prev) => [data.createdTask, ...prev]);
        }

        await loadWorkspaceData();
      }
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Direct One-Tap Manual Mark Done
  const handleMarkTaskDone = async (taskId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/done`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: 'met' } : t))
        );
        await loadWorkspaceData();
      }
    } catch (err) {
      console.error('Error marking task done:', err);
    }
  };

  // Task Release (Amnesty)
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
        await loadWorkspaceData();
      }
    } catch (err) {
      console.error('Error releasing task:', err);
    }
  };

  // Direct Task Check-In Coaching (Initiate)
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
        await loadWorkspaceData();
      }
    } catch (err) {
      console.error('Error checking in on task:', err);
    }
  };

  // Complete Check-In Session
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
        await loadWorkspaceData();
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

  return (
    <div className="min-h-screen bg-[#fcf6ed] text-[#2d2825] flex flex-col font-sans relative overflow-x-hidden">
      {/* Decorative Sparkles sparingly placed in background */}
      <DecorativeSparkle className="absolute top-20 right-10 hidden md:block" size={24} color="#f5b638" />
      <DecorativeSparkle className="absolute bottom-24 left-8 hidden md:block" size={20} color="#ff7865" />
      <DecorativeSparkle className="absolute top-1/2 right-6 hidden xl:block" size={18} color="#52b7aa" />

      {/* Brief Mascot Moment Toast after Sign-in */}
      {showWelcomeMascot && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300 pointer-events-none">
          <div className="retro-card bg-[#fffdfa] p-3 flex items-center gap-3 shadow-[4px_4px_0px_#2d2825]">
            <MascotFlower size={48} mood="winking" />
            <div>
              <div className="font-extrabold text-xs text-[#2d2825]">Welcome back!</div>
              <div className="text-[11px] text-stone-600 font-medium">Ready when you are.</div>
            </div>
          </div>
        </div>
      )}

      <Header
        user={user}
        onLogin={handleGoogleLogin}
        onLogout={handleLogout}
        onOpenPartnerModal={() => setIsPartnerModalOpen(true)}
        isPartnerMode={isPartner}
        activeMainView={activeMainView}
        onSwitchView={setActiveMainView}
        partnerOwnerName={partnerStatus?.ownerName}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-4">
        {/* Incoming Partner Invite Banner */}
        {user && incomingInvite && !isPartner && (
          <div
            id="incoming-partner-invite-banner"
            className="mb-4 retro-dialog bg-[#fff7e6] border-2 border-[#f5b638] p-3.5 shadow-[4px_4px_0px_#2d2825] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="flex items-center gap-2.5 text-xs text-[#2d2825]">
              <Shield className="w-5 h-5 text-[#f5b638] stroke-[2.5] shrink-0" />
              <div>
                <div className="font-extrabold text-sm text-[#2d2825]">
                  Accountability Partner Request
                </div>
                <div className="text-stone-700 font-medium text-[11px] mt-0.5">
                  <span className="font-bold text-[#2d2825] bg-white px-1.5 py-0.5 rounded border border-stone-300 font-mono">
                    {incomingInvite.ownerName || incomingInvite.ownerEmail || incomingInvite.ownerUid}
                  </span>{' '}
                  wants to share their daily focus status with you — accept?
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                id="accept-incoming-invite-btn"
                type="button"
                onClick={handleAcceptInvite}
                disabled={respondingInvite}
                className="retro-btn-primary px-3.5 py-1 text-xs font-extrabold flex items-center gap-1.5"
              >
                {respondingInvite ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Accepting...</span>
                  </>
                ) : (
                  <span>Accept Request</span>
                )}
              </button>
              <button
                id="decline-incoming-invite-btn"
                type="button"
                onClick={handleDeclineInvite}
                disabled={respondingInvite}
                className="retro-btn px-2.5 py-1 text-xs font-bold text-stone-600 bg-white"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {!user ? (
          /* Unauthenticated Landing / Sign In Screen */
          <div className="max-w-xl mx-auto my-6 sm:my-8 retro-dialog bg-[#fffdfa] shadow-[5px_5px_0px_#2d2825] select-none animate-in fade-in duration-200">
            {/* Window Header */}
            <div className="bg-[#f5b638] px-3 py-2 flex items-center justify-between border-b-2 border-[#2d2825]">
              <div className="flex items-center gap-2">
                <div className="retro-dots">
                  <span className="retro-dot bg-[#ff7865]" />
                  <span className="retro-dot bg-white" />
                  <span className="retro-dot bg-[#52b7aa]" />
                </div>
                <div className="flex items-center gap-1.5 font-extrabold text-xs text-[#2d2825]">
                  <Clock className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Welcome to Last Call</span>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 text-center space-y-4">
              {/* Mascot Moment for Landing with Subtle Idle Eye Drift */}
              <div className="py-1">
                <MascotFlower mood="happy" size={76} animatedEyes={true} />
              </div>

              <div className="inline-block px-3.5 py-1 rounded-full bg-[#fca5b0]/40 border border-[#2d2825] text-[11px] font-bold text-[#2d2825]">
                A focus companion, not a to-do list
              </div>

              <h1 className="font-extrabold text-2xl sm:text-3xl text-[#2d2825] tracking-tight">
                Last Call
              </h1>

              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="text-[#2d2825] text-sm sm:text-base font-extrabold leading-snug">
                  You already know what needs doing. This just helps you actually start.
                </p>
                <p className="text-stone-700 text-xs sm:text-sm leading-relaxed font-medium">
                  Talk to it like a person. It figures out the rest.
                </p>
              </div>

              {/* Three Miniature Retro Window Feature Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-left">
                {/* Feature Card 1: Chat/Message */}
                <div className="border-2 border-[#2d2825] bg-[#fffdfa] shadow-[2px_2px_0px_#2d2825] flex flex-col overflow-hidden">
                  <div className="bg-[#f0ebe1] px-2 py-1 border-b-2 border-[#2d2825] flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff7865]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f5b638]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#52b7aa]" />
                    </div>
                    <MessageSquare className="w-3.5 h-3.5 text-[#2d2825] stroke-[2.2]" />
                  </div>
                  <div className="p-2.5 flex-1 flex items-center">
                    <p className="text-[11px] font-bold text-[#2d2825] leading-snug">
                      Say it out loud, it becomes a task.
                    </p>
                  </div>
                </div>

                {/* Feature Card 2: Check/Undo */}
                <div className="border-2 border-[#2d2825] bg-[#fffdfa] shadow-[2px_2px_0px_#2d2825] flex flex-col overflow-hidden">
                  <div className="bg-[#f0ebe1] px-2 py-1 border-b-2 border-[#2d2825] flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff7865]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f5b638]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#52b7aa]" />
                    </div>
                    <RotateCcw className="w-3.5 h-3.5 text-[#2d2825] stroke-[2.2]" />
                  </div>
                  <div className="p-2.5 flex-1 flex items-center">
                    <p className="text-[11px] font-bold text-[#2d2825] leading-snug">
                      Get it wrong? One tap undoes it.
                    </p>
                  </div>
                </div>

                {/* Feature Card 3: Heart/Care */}
                <div className="border-2 border-[#2d2825] bg-[#fffdfa] shadow-[2px_2px_0px_#2d2825] flex flex-col overflow-hidden">
                  <div className="bg-[#f0ebe1] px-2 py-1 border-b-2 border-[#2d2825] flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff7865]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#f5b638]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#52b7aa]" />
                    </div>
                    <Heart className="w-3.5 h-3.5 text-[#ff7865] stroke-[2.2]" />
                  </div>
                  <div className="p-2.5 flex-1 flex items-center">
                    <p className="text-[11px] font-bold text-[#2d2825] leading-snug">
                      Miss something? No streaks, no red flags — just a gentle check back in.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 max-w-xs mx-auto pt-1">
                <button
                  id="google-sign-in-btn"
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full retro-btn-primary px-4 py-2.5 text-xs sm:text-sm font-bold flex items-center justify-center gap-2.5"
                >
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt="Google"
                    className="w-4 h-4 bg-white rounded-full p-0.5"
                  />
                  <span>Sign In with Google</span>
                </button>
              </div>

              <div className="mt-3 pt-3 border-t-2 border-[#2d2825]/10 text-left text-xs text-stone-600 space-y-1 max-w-xs mx-auto">
                <div className="flex items-center gap-1.5 text-[#2d2825] font-bold text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#52b7aa] stroke-[2.5]" />
                  <span>Zero-Trust Security</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  All mutations execute strictly through verified backend endpoints with full role validation.
                </p>
              </div>
            </div>
          </div>
        ) : isPartner && activeMainView === 'partner' ? (
          /* Step 11: Accountability Partner View (Independent View) */
          <div className="max-w-2xl mx-auto retro-dialog bg-[#fffdfa] shadow-[5px_5px_0px_#2d2825] space-y-2 select-none">
            <div className="bg-[#52b7aa] px-3 py-2 flex items-center justify-between border-b-2 border-[#2d2825]">
              <div className="flex items-center gap-2">
                <div className="retro-dots">
                  <span className="retro-dot bg-[#ff7865]" />
                  <span className="retro-dot bg-[#f5b638]" />
                  <span className="retro-dot bg-white" />
                </div>
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#2d2825]">
                  <UserCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Partner Focus Monitor</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadPartnerStatus()}
                  disabled={loadingPartnerStatus}
                  className="retro-btn px-2 py-0.5 text-[10px] font-bold bg-white text-[#2d2825] flex items-center gap-1"
                  title="Refresh partner status"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingPartnerStatus ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMainView('thread')}
                  className="retro-btn px-2 py-0.5 text-[10px] font-extrabold bg-[#fffdfa] text-[#2d2825] flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Back to My Thread</span>
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs text-[#2d2825]">
              <div className="retro-sunken p-3 space-y-1 bg-[#faf4e8]">
                <div className="font-extrabold text-[#2d2825]">Accountability Partner Read-Only View</div>
                <p className="text-[11px] text-stone-700 leading-relaxed font-medium">
                  Viewing focus status for{' '}
                  <span className="font-bold text-[#2d2825] bg-white px-1.5 py-0.5 rounded-md border border-[#2d2825]">
                    {partnerStatus?.ownerName || 'Focus Partner'}
                  </span>{' '}
                  <span className="font-mono text-[10px] text-stone-500">({user.ownerUid})</span>.
                  Per strict privacy rules, this view contains no raw tasks, no numbers, and no chat transcripts.
                </p>
              </div>

              {partnerStatusError && (
                <div className="p-3 bg-[#ffe8e5] border-2 border-[#2d2825] rounded-xl flex items-center justify-between text-xs text-rose-900 shadow-[2px_2px_0px_#2d2825]">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                    <span>{partnerStatusError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadPartnerStatus()}
                    className="retro-btn px-2 py-1 text-[11px] font-bold bg-white text-rose-800 shrink-0 ml-2"
                  >
                    Retry
                  </button>
                </div>
              )}

              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-stone-600 flex items-center justify-between">
                  <span>Live Focus Presence</span>
                  <span className="text-[9px] font-mono text-stone-500 font-normal">Realtime Listener</span>
                </span>
                <div className="mt-1.5">
                  {isLiveCheckingIn ? (
                    <div className="flex items-center justify-between p-3 rounded-xl border-2 border-[#2d2825] bg-[#e6f4f1] text-[#1e584f] text-xs font-bold shadow-[2px_2px_0px_#2d2825]">
                      <div className="flex items-center gap-2.5">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#52b7aa] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-[#1e584f]"></span>
                        </span>
                        <div>
                          <div className="leading-none font-extrabold text-[#17463f]">Currently Mid Check-In (Live)</div>
                          <div className="text-[10px] font-normal text-[#2b7267] mt-0.5">Focus heartbeat active on owner thread</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono bg-white/70 px-2 py-0.5 rounded border border-[#52b7aa] text-[#1e584f]">
                        Active
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 rounded-xl border-2 border-[#2d2825] bg-[#f8f6f2] text-stone-600 text-xs font-medium shadow-[2px_2px_0px_#2d2825]">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-stone-400 inline-block" />
                        <div>
                          <div className="font-bold text-stone-700 leading-none">Not actively checking in</div>
                          <div className="text-[10px] text-stone-500 mt-0.5">
                            {presence?.isCheckingIn
                              ? 'Previous session timed out (>10m idle guard applied)'
                              : 'Idle / Standby mode'}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-stone-400">Idle</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-stone-600">
                  Daily Strip Summary
                </span>
                <div className="mt-1.5 p-3.5 retro-sunken bg-white font-sans text-xs text-stone-900 font-medium">
                  {loadingPartnerStatus ? (
                    <div className="flex items-center gap-2 text-stone-500 text-xs">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading daily strip...</span>
                    </div>
                  ) : (
                    partnerStatus?.dailyStripLine || 'No activity logged yet today.'
                  )}
                </div>
              </div>

              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-stone-600">
                  High-Consequence Status
                </span>
                <div className="mt-1.5">
                  {partnerStatus?.hasHardConsequenceInEscalationWindow ? (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl border-2 border-[#2d2825] bg-[#ffe8e5] text-rose-950 text-xs font-bold shadow-[2px_2px_0px_#2d2825]">
                      <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 stroke-[2.5]" />
                      <span>Hard-consequence task within 48h escalation window.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl border-2 border-[#2d2825] bg-[#eefaf6] text-emerald-950 text-xs font-bold shadow-[2px_2px_0px_#2d2825]">
                      <CheckCircle2 className="w-4 h-4 text-[#52b7aa] shrink-0 stroke-[2.5]" />
                      <span>No hard-consequence tasks currently in escalation window.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* End Relationship Confirmation Box */}
              {showEndPartnerConfirm ? (
                <div className="p-3 bg-[#ffe8e5] border-2 border-rose-600 rounded-xl space-y-2 animate-in fade-in duration-150">
                  <div className="font-bold text-rose-950 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-700" />
                    <span>Confirm Ending Partner Relationship</span>
                  </div>
                  <p className="text-[11px] text-rose-900 leading-relaxed font-medium">
                    This will permanently revoke your partner access to {partnerStatus?.ownerName || 'this user'}'s focus status. You will not be able to monitor their updates again unless they send a new invite.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handlePartnerSelfRevoke}
                      disabled={respondingInvite}
                      className="retro-btn px-3 py-1 text-xs font-extrabold bg-rose-700 text-white hover:bg-rose-800"
                    >
                      {respondingInvite ? 'Revoking Access...' : 'Yes, End Relationship'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEndPartnerConfirm(false)}
                      disabled={respondingInvite}
                      className="retro-btn px-3 py-1 text-xs font-bold bg-white text-stone-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-3 border-t border-stone-200 text-[10px] text-stone-500 flex flex-col sm:flex-row sm:items-center sm:justify-between font-mono gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span>Access: Verified Backend Route + Scoped Realtime Listener</span>
                    <span>Direct Reads: Denied (Except /presence/current)</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setActiveMainView('thread')}
                      className="retro-btn px-2.5 py-1 text-[11px] font-bold text-stone-700 bg-white"
                    >
                      Back to My Thread
                    </button>
                    <button
                      id="disconnect-partner-btn"
                      type="button"
                      onClick={() => setShowEndPartnerConfirm(true)}
                      className="retro-btn px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-white"
                    >
                      End Relationship...
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Step 1: Owner Primary View - Retro Chat Thread + Side Panel */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
            {/* Primary Thread Container (Span 2) */}
            <div className="lg:col-span-2 space-y-2">
              <DailyStripHeader strips={dailyStrips} onMoodTap={handleMoodTap} />
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
                onAddTask={handleAddTask}
                onUpdateTask={handleUpdateTask}
                journalEntries={journalEntries}
                onAddJournalEntry={handleAddJournalEntry}
                onDeleteJournalEntry={handleDeleteJournalEntry}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenPartner={() => setIsPartnerModalOpen(true)}
                isLoading={loadingData}
                isPartner={isPartner}
                activeMainView={activeMainView}
                onSwitchToPartnerView={() => setActiveMainView('partner')}
                onSwitchToThreadView={() => setActiveMainView('thread')}
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

      {/* Retro Friendly Status Bar */}
      <footer className="mt-auto px-3 sm:px-6 py-2 select-none">
        <div className="max-w-6xl mx-auto retro-card bg-[#fffdfa] px-4 py-2 flex items-center justify-between text-xs font-bold text-stone-700 shadow-[2px_2px_0px_#2d2825]">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#2d2825]">LAST CALL</span>
            <span>•</span>
            <span className="text-[11px] font-medium hidden sm:inline">ADHD Calibration & Task Initiation</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#52b7aa] inline-block" />
            <span className="text-[11px] font-mono">READY</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
