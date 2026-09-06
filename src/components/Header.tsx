import React from 'react';
import { Clock, Shield, UserCheck, LogOut, LogIn, User, Sparkles } from 'lucide-react';
import type { UserProfile } from '../types';

interface HeaderProps {
  user: UserProfile | null;
  onLogin: () => void;
  onLogout: () => void;
  onOpenPartnerModal: () => void;
  isPartnerMode?: boolean;
  activeMainView?: 'thread' | 'partner';
  onSwitchView?: (view: 'thread' | 'partner') => void;
  partnerOwnerName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onLogin,
  onLogout,
  onOpenPartnerModal,
  isPartnerMode = false,
  activeMainView = 'thread',
  onSwitchView,
  partnerOwnerName,
}) => {
  return (
    <header className="sticky top-0 z-30 px-3 sm:px-6 pt-2 pb-1 select-none">
      <div className="max-w-6xl mx-auto retro-card bg-[#fffdfa] px-3 sm:px-4 h-14 flex items-center justify-between shadow-[3px_3px_0px_#2d2825]">
        {/* Brand & Archetype */}
        <div className="flex items-center gap-3">
          {/* Three Friendly Circular Buttons */}
          <div className="retro-dots">
            <span className="retro-dot bg-[#ff7865]" />
            <span className="retro-dot bg-[#f5b638]" />
            <span className="retro-dot bg-[#52b7aa]" />
          </div>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#f5b638] border-2 border-[#2d2825] flex items-center justify-center shadow-[1.5px_1.5px_0px_#2d2825]">
              <Clock className="w-4 h-4 text-[#2d2825] stroke-[2.5]" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-[#2d2825] flex items-center gap-1">
                Last Call
              </span>
            </div>
          </div>

          <div className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#fca5b0]/40 border border-[#2d2825] text-[11px] font-bold text-[#2d2825]">
            <Sparkles className="w-3 h-3 text-[#ff7865]" />
            <span>Focus & Time-Blindness</span>
          </div>
        </div>

        {/* User Actions & Auth */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {isPartnerMode && (
                <div className="hidden sm:flex items-center gap-1 bg-[#faf4e8] p-0.5 rounded-xl border-2 border-[#2d2825]">
                  <button
                    id="header-thread-view-btn"
                    type="button"
                    onClick={() => onSwitchView?.('thread')}
                    className={`px-2.5 py-1 text-xs font-extrabold rounded-lg transition-all ${
                      activeMainView === 'thread'
                        ? 'bg-[#f5b638] text-[#2d2825] shadow-[1px_1px_0px_#2d2825]'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    My Thread
                  </button>
                  <button
                    id="header-partner-view-btn"
                    type="button"
                    onClick={() => onSwitchView?.('partner')}
                    className={`px-2.5 py-1 text-xs font-extrabold rounded-lg flex items-center gap-1 transition-all ${
                      activeMainView === 'partner'
                        ? 'bg-[#52b7aa] text-white shadow-[1px_1px_0px_#2d2825]'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <UserCheck className="w-3 h-3 stroke-[2.5]" />
                    <span>Partner Monitor</span>
                  </button>
                </div>
              )}

              <button
                onClick={onOpenPartnerModal}
                className="retro-btn px-2.5 sm:px-3 py-1.5 text-xs flex items-center gap-1.5 font-bold bg-[#fffdf9]"
                title="Manage Accountability Partner"
              >
                <Shield className="w-3.5 h-3.5 text-[#2d2825] stroke-[2.5]" />
                <span className="hidden sm:inline">Partner</span>
              </button>

              <div className="flex items-center gap-2 pl-2 border-l-2 border-[#2d2825]">
                <div className="w-7 h-7 rounded-xl border-2 border-[#2d2825] bg-[#fca5b0] text-[#2d2825] flex items-center justify-center text-xs font-bold overflow-hidden shadow-[1.5px_1.5px_0px_#2d2825]">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
                  ) : (
                    user.displayName?.charAt(0).toUpperCase() || <User className="w-3.5 h-3.5 stroke-[2.5]" />
                  )}
                </div>
                <div className="hidden md:block text-left text-xs font-bold truncate max-w-[120px] text-[#2d2825]">
                  {user.displayName || user.email?.split('@')[0] || 'User'}
                </div>
                <button
                  onClick={onLogout}
                  className="retro-btn px-2.5 py-1.5 text-xs font-bold flex items-center gap-1 bg-[#fffdf9]"
                  title="Sign out"
                >
                  <LogOut className="w-3 h-3 text-[#2d2825] stroke-[2.5]" />
                  <span className="hidden sm:inline">Exit</span>
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={onLogin}
              className="retro-btn-primary px-4 py-1.5 text-xs font-bold flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Log In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
