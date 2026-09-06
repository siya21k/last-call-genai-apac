import React, { useState, useEffect } from 'react';
import { Shield, Copy, Check, Eye } from 'lucide-react';
import type { PartnerInvite } from '../types';

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

  const fetchInvite = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/partner/invite', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInvite(data.invite || null);
      }
    } catch (e) {
      console.error('Error loading partner invite:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInvite();
    }
  }, [ownerUid, token, isOpen]);

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
      const res = await fetch('/api/partner/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partnerEmail: emailInput.trim() }),
      });

      if (res.ok) {
        await fetchInvite();
        setEmailInput('');
      }
    } catch (e) {
      console.error('Error saving partner invite:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokePartner = async () => {
    if (!confirm('Revoke partner access? They will immediately lose access to your status summary.')) return;

    try {
      setSaving(true);
      const res = await fetch('/api/partner/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        await fetchInvite();
      }
    } catch (e) {
      console.error('Error revoking partner:', e);
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

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleRevokePartner}
                  disabled={saving}
                  className="retro-btn px-3 py-1 text-xs text-rose-700 font-bold bg-[#fffdf9]"
                >
                  Revoke Access
                </button>
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

              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleRevokePartner}
                  disabled={saving}
                  className="retro-btn px-3 py-1 text-xs font-bold"
                >
                  Cancel Invite
                </button>
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
                  type="submit"
                  disabled={!emailInput.trim() || saving}
                  className="retro-btn-primary px-4 py-1 text-xs font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Send Invite'}
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
