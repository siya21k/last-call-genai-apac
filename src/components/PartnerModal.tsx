import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Check, Eye, RefreshCw, AlertTriangle, UserCheck, Clock } from 'lucide-react';
import type { PartnerInvite } from '../types';
import { getFreshToken } from '../lib/firebase';

interface PartnerModalProps {
  ownerUid: string;
  token: string;
  onClose: () => void;
  isOpen?: boolean;
}

interface ConflictPrompt {
  type: 'different_owner' | 'replace_active';
  title: string;
  message: string;
  email: string;
}

interface NoticeState {
  type: 'info' | 'warning' | 'success';
  title: string;
  message: string;
}

export const PartnerModal: React.FC<PartnerModalProps> = ({ ownerUid, token, onClose, isOpen = true }) => {
  const [invite, setInvite] = useState<PartnerInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPrompt | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const getActiveToken = useCallback(async (): Promise<string> => {
    try {
      const fresh = await getFreshToken();
      if (fresh) return fresh;
    } catch (_) {}
    return token;
  }, [token]);

  const fetchInvite = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const activeToken = await getActiveToken();

      let res: Response | null = null;
      let lastErr: any = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await fetch('/api/partner/invite', {
            headers: { Authorization: `Bearer ${activeToken}` },
          });
          break;
        } catch (netErr: any) {
          lastErr = netErr;
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 800));
          }
        }
      }

      if (!res) {
        throw lastErr || new Error('Connection refused');
      }

      if (res.ok) {
        const data = await res.json();
        setInvite(data.invite || null);
        setErrorMsg(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Failed to load partner invite.');
      }
    } catch (e: any) {
      console.error('Error loading partner invite:', e);
      const isNetError =
        e?.message === 'Failed to fetch' ||
        e?.message?.includes('Network') ||
        e?.message?.includes('network') ||
        e?.message?.includes('Connection');
      setErrorMsg(
        isNetError
          ? 'Unable to connect to partner service. Click Retry to reconnect.'
          : e.message || 'Error loading partner invite.'
      );
    } finally {
      setLoading(false);
    }
  }, [getActiveToken]);

  useEffect(() => {
    if (isOpen) {
      setConfirmRevoke(false);
      setConflictPrompt(null);
      setNotice(null);
      fetchInvite();
    } else {
      setConfirmRevoke(false);
      setConflictPrompt(null);
      setNotice(null);
    }
  }, [ownerUid, isOpen, fetchInvite]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Execute approval endpoint: POST /api/partner/invite/approve
  const executeApproveInvite = async (targetEmail: string, confirmOverwrite = false) => {
    if (!targetEmail.trim() || saving) return;

    try {
      setSaving(true);
      setErrorMsg(null);
      setNotice(null);
      setConflictPrompt(null);

      const activeToken = await getActiveToken();
      const res = await fetch('/api/partner/invite/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          email: targetEmail.trim(),
          confirmOverwrite,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(data.message || data.error || 'Failed to approve partner invite.');
        return;
      }

      // Handle structured responses from approve endpoint
      if (data.code === 'EMAIL_NOT_REGISTERED') {
        setNotice({
          type: 'warning',
          title: "Invited email hasn't signed in yet",
          message: data.message || `Account for ${targetEmail} hasn't signed into Last Call yet. Ask them to sign in with Google once so their account exists.`,
        });
        if (data.invite) {
          setInvite(data.invite);
        }
      } else if (data.code === 'ALREADY_SETUP') {
        setNotice({
          type: 'info',
          title: 'Already Set Up',
          message: data.message || `${targetEmail} is already your active accountability partner.`,
        });
        if (data.invite) {
          setInvite(data.invite);
        }
      } else if (data.requiresConfirmation) {
        if (data.code === 'DIFFERENT_OWNER_CONFLICT') {
          setConflictPrompt({
            type: 'different_owner',
            title: 'Accountability Partner Reassignment',
            message: data.message || 'This email is already a partner for a different owner — confirm to reassign.',
            email: targetEmail,
          });
        } else if (data.code === 'REPLACE_ACTIVE_PARTNER') {
          setConflictPrompt({
            type: 'replace_active',
            title: 'Replace Current Active Partner',
            message: data.message || 'You already have an active partner — confirm to replace.',
            email: targetEmail,
          });
        } else {
          setConflictPrompt({
            type: 'different_owner',
            title: 'Confirmation Required',
            message: data.message || 'Please confirm replacing the existing partnership.',
            email: targetEmail,
          });
        }
      } else if (data.code === 'INVITE_APPROVED' || data.success) {
        setNotice({
          type: 'success',
          title: 'Invite Approved & Sent',
          message: data.message || `Partner request approved! Waiting for ${targetEmail} to sign in and accept.`,
        });
        setEmailInput('');
        if (data.invite) {
          setInvite(data.invite);
        } else {
          await fetchInvite();
        }
      }
    } catch (e: any) {
      console.error('Error approving partner invite:', e);
      const isNetError = e?.message === 'Failed to fetch' || e?.message?.includes('Network');
      setErrorMsg(
        isNetError
          ? 'Network error reaching partner approval service. Please retry.'
          : e.message || 'Error processing partner invite.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeApproveInvite(emailInput, false);
  };

  const handleRevokePartner = async () => {
    try {
      setSaving(true);
      setErrorMsg(null);
      setNotice(null);
      const activeToken = await getActiveToken();
      const res = await fetch('/api/partner/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
      });

      if (res.ok) {
        setConfirmRevoke(false);
        setNotice({
          type: 'info',
          title: 'Access Revoked',
          message: 'Partner access has been revoked and all permissions cleared.',
        });
        await fetchInvite();
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Failed to revoke partner.');
      }
    } catch (e: any) {
      console.error('Error revoking partner:', e);
      const isNetError = e?.message === 'Failed to fetch' || e?.message?.includes('Network');
      setErrorMsg(
        isNetError ? 'Network error revoking partner. Please retry.' : e.message || 'Error revoking partner.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="partner-modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/40 font-sans select-none backdrop-blur-xs"
    >
      <div
        id="partner-modal-container"
        onClick={(e) => e.stopPropagation()}
        className="retro-dialog max-w-lg w-full bg-[#fffdfa] shadow-[5px_5px_0px_#2d2825] animate-in zoom-in-95 duration-100"
      >
        {/* Title Bar */}
        <div className="bg-[#52b7aa] px-3 py-2 flex items-center justify-between border-b-2 border-[#2d2825]">
          <div className="flex items-center gap-2">
            <div className="retro-dots">
              <span className="retro-dot bg-[#ff7865]" />
              <span className="retro-dot bg-[#f5b638]" />
              <span className="retro-dot bg-white" />
            </div>
            <div className="flex items-center gap-1.5 font-extrabold text-sm text-[#2d2825]">
              <Shield className="w-4 h-4 stroke-[2.5]" />
              <span>Accountability Partner</span>
            </div>
          </div>
          <button
            id="partner-modal-close-btn"
            type="button"
            onClick={onClose}
            className="w-6 h-6 retro-btn flex items-center justify-center text-xs font-bold bg-[#fffdf9]"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-3.5 text-xs text-[#2d2825]">
          {/* Privacy Architecture Notice */}
          <div className="retro-sunken p-3 space-y-1 bg-[#faf4e8]">
            <div className="font-extrabold flex items-center gap-1.5 text-[#2d2825]">
              <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Strict Privacy Isolation</span>
            </div>
            <p className="text-[11px] leading-relaxed text-stone-700 font-medium">
              Your partner can <strong>ONLY</strong> view the aggregate daily strip line and whether a hard-consequence task is approaching. They have zero access to your check-in chats, task avoidance notes, or personal thoughts.
            </p>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="retro-sunken p-2.5 bg-[#ffe8e5] text-rose-950 text-xs font-bold border-2 border-rose-400 rounded-xl flex items-center justify-between gap-2">
              <span className="flex-1 leading-snug">{errorMsg}</span>
              <button
                id="partner-retry-btn"
                type="button"
                onClick={() => fetchInvite()}
                disabled={loading}
                className="retro-btn text-[11px] px-2.5 py-1 bg-white font-extrabold flex items-center gap-1 shrink-0"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Structured Notice Banner */}
          {notice && (
            <div
              className={`retro-sunken p-2.5 text-xs rounded-xl border-2 space-y-0.5 ${
                notice.type === 'warning'
                  ? 'bg-[#fff7e6] border-[#f5b638] text-amber-950'
                  : notice.type === 'success'
                  ? 'bg-[#eefaf6] border-[#52b7aa] text-[#1e584f]'
                  : 'bg-[#f0f4f8] border-stone-400 text-stone-900'
              }`}
            >
              <div className="font-extrabold flex items-center gap-1.5">
                {notice.type === 'warning' ? (
                  <Clock className="w-3.5 h-3.5 text-amber-700 stroke-[2.5]" />
                ) : notice.type === 'success' ? (
                  <Check className="w-3.5 h-3.5 text-[#52b7aa] stroke-[3]" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5 text-stone-700" />
                )}
                <span>{notice.title}</span>
              </div>
              <p className="text-[11px] leading-relaxed font-medium">{notice.message}</p>
            </div>
          )}

          {/* Interactive Conflict Confirmation Box */}
          {conflictPrompt && (
            <div className="retro-sunken p-3 bg-[#fff2e8] border-2 border-[#f5b638] rounded-xl space-y-2">
              <div className="font-extrabold text-xs text-amber-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 stroke-[2.5]" />
                <span>{conflictPrompt.title}</span>
              </div>
              <p className="text-[11px] text-stone-800 font-medium leading-relaxed">
                {conflictPrompt.message}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  id="cancel-conflict-btn"
                  type="button"
                  onClick={() => setConflictPrompt(null)}
                  className="retro-btn px-2.5 py-1 text-xs font-bold bg-white"
                >
                  Cancel
                </button>
                <button
                  id="confirm-conflict-btn"
                  type="button"
                  onClick={() => executeApproveInvite(conflictPrompt.email, true)}
                  disabled={saving}
                  className="retro-btn-primary px-3 py-1 text-xs font-extrabold flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Confirming...</span>
                    </>
                  ) : (
                    <span>Confirm & Reassign</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="retro-sunken py-6 text-center text-xs text-stone-500 font-mono">
              Checking partner record...
            </div>
          ) : invite && invite.status === 'active' ? (
            /* Active Partner State */
            <div className="retro-sunken p-3 space-y-2 bg-white">
              <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#52b7aa] border border-[#2d2825]" />
                  <span className="text-xs font-extrabold text-[#2d2825]">
                    Active Partner
                  </span>
                </div>
                <span className="text-[10px] font-mono text-stone-500">
                  Assigned {new Date(invite.acceptedAt || invite.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#52b7aa] stroke-[2.5]" />
                <span>{invite.email}</span>
              </div>

              <p className="text-[11px] text-stone-600">
                Partner has access to your high-level daily strip and hard-consequence escalation alerts.
              </p>

              <div className="pt-2 flex justify-end gap-2 items-center">
                {confirmRevoke ? (
                  <div className="flex items-center gap-2 bg-[#ffe8e5] p-1.5 rounded-lg border border-rose-300">
                    <span className="text-[11px] font-bold text-rose-950">Revoke partner access?</span>
                    <button
                      id="confirm-revoke-btn"
                      type="button"
                      onClick={handleRevokePartner}
                      disabled={saving}
                      className="retro-btn px-2.5 py-0.5 text-xs text-rose-800 font-extrabold bg-white"
                    >
                      {saving ? 'Revoking...' : 'Yes, Revoke'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRevoke(false)}
                      disabled={saving}
                      className="retro-btn px-2 py-0.5 text-xs font-bold bg-[#fffdf9]"
                    >
                      Back
                    </button>
                  </div>
                ) : (
                  <button
                    id="revoke-partner-btn"
                    type="button"
                    onClick={() => setConfirmRevoke(true)}
                    disabled={saving}
                    className="retro-btn px-3 py-1 text-xs text-rose-700 font-bold bg-[#fffdf9]"
                  >
                    Revoke Partner
                  </button>
                )}
              </div>
            </div>
          ) : invite && invite.status === 'pending' ? (
            /* Pending Invite State */
            <div className="retro-sunken p-3 space-y-2.5 bg-white">
              <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f5b638] border border-[#2d2825] animate-pulse" />
                  <span className="text-xs font-extrabold text-[#2d2825]">
                    Invite Approved — Awaiting Acceptance
                  </span>
                </div>
                <span className="text-[10px] font-mono text-stone-500">
                  {new Date(invite.approvedAt || invite.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#f5b638] stroke-[2.5]" />
                <span>{invite.email}</span>
              </div>

              <div className="p-2.5 bg-[#faf4e8] rounded-lg border border-stone-200 text-[11px] text-stone-700 space-y-1 font-medium leading-relaxed">
                <p>
                  <strong>Next step:</strong> When <strong>{invite.email}</strong> signs in with Google, they will see a prompt:
                </p>
                <div className="p-1.5 bg-white rounded border border-[#2d2825]/20 font-mono text-[10px] text-[#2d2825]">
                  &ldquo;{ownerUid ? 'Your buddy' : 'Owner'} wants to share their focus status with you — accept?&rdquo;
                </div>
                <p className="text-[10px] text-stone-500">
                  Partner access will only activate once they explicitly click Accept.
                </p>
              </div>

              <div className="pt-1 flex justify-between items-center">
                <button
                  id="recheck-partner-status-btn"
                  type="button"
                  onClick={() => executeApproveInvite(invite.email, false)}
                  disabled={saving}
                  className="retro-btn text-[11px] px-2.5 py-1 text-stone-700 font-bold bg-[#fffdf9] flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${saving ? 'animate-spin' : ''}`} />
                  <span>Re-check Status</span>
                </button>

                {confirmRevoke ? (
                  <div className="flex items-center gap-2 bg-[#fff2e8] p-1.5 rounded-lg border border-amber-300">
                    <span className="text-[11px] font-bold text-amber-950">Cancel this pending invite?</span>
                    <button
                      id="confirm-cancel-invite-btn"
                      type="button"
                      onClick={handleRevokePartner}
                      disabled={saving}
                      className="retro-btn px-2.5 py-0.5 text-xs text-rose-800 font-extrabold bg-white"
                    >
                      {saving ? 'Cancelling...' : 'Yes, Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRevoke(false)}
                      disabled={saving}
                      className="retro-btn px-2 py-0.5 text-xs font-bold bg-[#fffdf9]"
                    >
                      Back
                    </button>
                  </div>
                ) : (
                  <button
                    id="cancel-pending-invite-btn"
                    type="button"
                    onClick={() => setConfirmRevoke(true)}
                    disabled={saving}
                    className="retro-btn px-3 py-1 text-xs font-bold text-rose-700 bg-[#fffdf9]"
                  >
                    Cancel Invite
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* No Partner State - Add Partner Form */
            <form onSubmit={handleFormSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#2d2825] mb-1">
                  Partner Google Email Address
                </label>
                <input
                  id="partner-email-input"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="partner@example.com"
                  required
                  className="retro-input w-full px-3 py-1.5 text-xs text-[#2d2825]"
                />
                <p className="text-[10px] text-stone-500 mt-1">
                  The partner will receive an in-app prompt to accept your accountability request upon signing in.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  id="cancel-partner-form-btn"
                  type="button"
                  onClick={onClose}
                  className="retro-btn px-3 py-1 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  id="send-partner-invite-btn"
                  type="submit"
                  disabled={!emailInput.trim() || saving}
                  className="retro-btn-primary px-4 py-1 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Approving...</span>
                    </>
                  ) : (
                    <span>Add Partner</span>
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="pt-2 flex justify-end border-t border-stone-200">
            <button
              id="partner-modal-done-btn"
              type="button"
              onClick={onClose}
              className="retro-btn px-4 py-1 text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
