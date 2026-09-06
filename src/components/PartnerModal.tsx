import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  UserCheck,
  UserX,
  Copy,
  Check,
  AlertCircle,
  Terminal,
  Clock,
  Send,
  Eye,
} from 'lucide-react';
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

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !emailInput.includes('@')) return;

    try {
      setSaving(true);
      const res = await fetch('/api/partner/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: emailInput.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setInvite(data.invite);
        setEmailInput('');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to send invite');
      }
    } catch (e) {
      console.error('Error creating invite:', e);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-stone-900 leading-tight">
                Accountability Partner
              </h3>
              <p className="text-xs text-stone-500">
                Share a high-level status view without exposing private journals
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Privacy Architecture Notice */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600 leading-relaxed">
            <div className="font-semibold text-stone-900 flex items-center gap-1.5 mb-1">
              <Eye className="w-3.5 h-3.5 text-indigo-600" />
              <span>Strict Privacy Isolation (RBAC)</span>
            </div>
            Your partner can <strong>ONLY</strong> read the aggregate status summary (current focus risk level and next deadline name). They have zero access to your check-in chats, avoidance locations, or personal entries.
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-stone-500">
              Checking partner record...
            </div>
          ) : invite && invite.status === 'active' ? (
            /* Active Partner State */
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-mono uppercase font-bold text-emerald-800">
                    Active Partner
                  </span>
                </div>
                <span className="text-[11px] text-stone-400">
                  Assigned {new Date(invite.createdAt).toLocaleDateString()}
                </span>
              </div>

              <div>
                <div className="text-sm font-semibold text-stone-900">{invite.email}</div>
                <div className="text-xs font-mono text-stone-500 mt-0.5">UID: {invite.partnerUid}</div>
              </div>

              <div className="pt-2 border-t border-emerald-200/60 flex justify-end">
                <button
                  type="button"
                  onClick={handleRevokePartner}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-medium transition-colors"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Revoke Partner Access</span>
                </button>
              </div>
            </div>
          ) : invite && invite.status === 'pending' ? (
            /* Pending Invite State */
            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-mono uppercase font-bold text-amber-800">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Invite Pending</span>
                  </div>
                  <span className="text-[11px] text-stone-500">
                    Created {new Date(invite.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="text-sm font-semibold text-stone-900">{invite.email}</div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Per security directives, custom claims can only be granted out-of-band via the Admin SDK to prevent client privilege escalation.
                </p>
              </div>

              {/* Copyable Admin Command Box */}
              <div className="p-3 rounded-xl bg-stone-900 text-stone-100 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5 text-amber-400" />
                    <span>Run in Cloud Shell or terminal to activate:</span>
                  </span>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-[11px] font-medium"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy Command'}</span>
                  </button>
                </div>
                <pre className="font-mono text-xs overflow-x-auto p-2 bg-black/40 rounded-lg text-stone-200 select-all">
                  {adminCommand}
                </pre>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={handleRevokePartner}
                  disabled={saving}
                  className="text-xs text-rose-600 hover:text-rose-700"
                >
                  Cancel pending invite
                </button>
                <button
                  onClick={fetchInvite}
                  className="text-xs text-stone-600 hover:text-stone-900 font-medium"
                >
                  Refresh status
                </button>
              </div>
            </div>
          ) : (
            /* Invite Creation Form */
            <form onSubmit={handleCreateInvite} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
                  Partner's Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. partner@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="text-[11px] text-stone-500 leading-snug">
                You can invite exactly one accountability partner. They will only see your focus status and next deadline name.
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving || !emailInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-50 text-xs font-medium transition-all shadow-xs disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5 text-amber-400" />
                  <span>{saving ? 'Creating...' : 'Invite Partner'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-100 text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
