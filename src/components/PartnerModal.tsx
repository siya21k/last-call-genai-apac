import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Copy, Check, Eye, RefreshCw } from 'lucide-react';
import type { PartnerInvite } from '../types';
import { getFreshToken } from '../lib/firebase';

interface PartnerModalProps {
  ownerUid: string;
  token: string;
  onClose: () => void;
  isOpen?: boolean;
}

export const PartnerModal: React.FC<PartnerModalProps> = ({ ownerUid, token, onClose, isOpen = true }) => {
  const [invite, setInvite] = useState<PartnerInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailInput, setEmailInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getActiveToken = useCallback(async (): Promise<string> => {
    try {
      const fresh = await getFreshToken();
      if (fresh) return fresh;
    } catch (_) {}
    return token;
  }, [token]);

  const fetchInvite = useCallback(async (isRetry = false) => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const activeToken = await getActiveToken();

      let res: Response | null = null;
      let lastErr: any = null;

      // Auto-retry once on transient connection hiccups (e.g., container cold-start or reboot)
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
      fetchInvite();
    } else {
      setConfirmRevoke(false);
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

  const handleSaveInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || saving) return;

    try {
      setSaving(true);
      setErrorMsg(null);
      const activeToken = await getActiveToken();
      const res = await fetch('/api/partner/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          email: emailInput.trim(),
          partnerEmail: emailInput.trim(),
        }),
      });

      if (res.ok) {
        await fetchInvite();
        setEmailInput('');
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Failed to send partner invite.');
      }
    } catch (e: any) {
      console.error('Error saving partner invite:', e);
      const isNetError = e?.message === 'Failed to fetch' || e?.message?.includes('Network');
      setErrorMsg(isNetError ? 'Network error sending invite. Please check your connection and retry.' : (e.message || 'Error saving partner invite.'));
    } finally {
      setSaving(false);
    }
  };

  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const handleRevokePartner = async () => {
    try {
      setSaving(true);
      setErrorMsg(null);
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
        await fetchInvite();
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Failed to revoke partner.');
      }
    } catch (e: any) {
      console.error('Error revoking partner:', e);
      const isNetError = e?.message === 'Failed to fetch' || e?.message?.includes('Network');
      setErrorMsg(isNetError ? 'Network error revoking partner. Please retry.' : (e.message || 'Error revoking partner.'));
    } finally {
      setSaving(false);
    }
  };

  const adminCommand = invite?.email
    ? `node scripts/assign-partner.js --email ${invite.email} --ownerUid ${ownerUid}`
    : '';

  const copyToClipboard = () => {
    if (!adminCommand) return;
    navigator.clipboard.writeText(adminCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/40 font-sans select-none backdrop-blur-xs"
    >
      <div
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
              Your partner can <strong>ONLY</strong> view the aggregate daily strip summary and whether a hard-consequence task is approaching. They have zero access to your check-in chats, avoidance reasons, or personal journal notes.
            </p>
          </div>

          {errorMsg && (
            <div className="retro-sunken p-2.5 bg-[#ffe8e5] text-rose-950 text-xs font-bold border-2 border-rose-400 rounded-xl flex items-center justify-between gap-2">
              <span className="flex-1 leading-snug">{errorMsg}</span>
              <button
                type="button"
                onClick={() => fetchInvite(true)}
                disabled={loading}
                className="retro-btn text-[11px] px-2.5 py-1 bg-white font-extrabold flex items-center gap-1 shrink-0"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                <span>Retry</span>
              </button>
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
                  Assigned {new Date(invite.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="font-bold text-stone-900 text-sm">{invite.email}</div>

              <div className="pt-2 flex justify-end gap-2 items-center">
                {confirmRevoke ? (
                  <div className="flex items-center gap-2 bg-[#ffe8e5] p-1.5 rounded-lg border border-rose-300">
                    <span className="text-[11px] font-bold text-rose-950">Revoke access?</span>
                    <button
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
                    type="button"
                    onClick={() => setConfirmRevoke(true)}
                    disabled={saving}
                    className="retro-btn px-3 py-1 text-xs text-rose-700 font-bold bg-[#fffdf9]"
                  >
                    Revoke Access
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
                    Invite Pending Claim
                  </span>
                </div>
                <span className="text-[10px] font-mono text-stone-500">
                  Created {new Date(invite.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div className="font-bold text-stone-900 text-sm">{invite.email}</div>

              <div className="retro-sunken p-2.5 text-[11px] font-mono space-y-1 bg-[#faf4e8]">
                <div className="text-stone-700 font-bold">Terminal Role Assignment:</div>
                <div className="bg-[#2d2825] text-[#52b7aa] p-2 rounded-lg overflow-x-auto text-[10px] flex items-center justify-between gap-2">
                  <span className="truncate">{adminCommand}</span>
                  <button
                    type="button"
                    onClick={copyToClipboard}
                    className="retro-btn px-2 py-0.5 text-[10px] shrink-0 text-[#2d2825] flex items-center gap-1 bg-[#fffdf9]"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-700 stroke-[3]" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="pt-1 flex justify-end gap-2 items-center">
                {confirmRevoke ? (
                  <div className="flex items-center gap-2 bg-[#fff2e8] p-1.5 rounded-lg border border-amber-300">
                    <span className="text-[11px] font-bold text-amber-950">Cancel this pending invite?</span>
                    <button
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
            /* No Partner State */
            <form onSubmit={handleSaveInvite} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#2d2825] mb-1">
                  Partner Google Email Address
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="partner@example.com"
                  required
                  className="retro-input w-full px-3 py-1.5 text-xs text-[#2d2825]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
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
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>Send Invite</span>
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="pt-2 flex justify-end border-t border-stone-200">
            <button
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
