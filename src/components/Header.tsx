import React from 'react';
import { Clock, Shield, UserCheck, LogOut, LogIn, User, Sparkles } from 'lucide-react';
import type { UserProfile, UserStatus } from '../types';

interface HeaderProps {
  user: UserProfile | null;
  status: UserStatus | null;
  onLogin: () => void;
  onLogout: () => void;
  onOpenPartnerModal: () => void;
  isPartnerMode?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  status,
  onLogin,
  onLogout,
  onOpenPartnerModal,
  isPartnerMode = false,
}) => {
  return (
    <header className="border-b border-stone-200/80 bg-[#f6f5f1]/80 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand & Archetype */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-stone-900 text-stone-100 flex items-center justify-center font-bold text-base shadow-xs">
            <Clock className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-stone-900">
                Last Call
              </span>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 font-semibold tracking-wider">
                ADHD Focus Journal
              </span>
            </div>
            <p className="text-[11px] text-stone-500 hidden sm:block">
              Task initiation & time-blindness calibration powered by Gemini
            </p>
          </div>
        </div>

        {/* User Actions & Auth */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              {isPartnerMode ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-xs font-semibold font-mono">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Partner View: {user.ownerUid?.slice(0, 8)}...</span>
                </div>
              ) : (
                <button
                  onClick={onOpenPartnerModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200/90 bg-white hover:bg-stone-50 text-stone-700 text-xs font-medium transition-all shadow-xs"
                  title="Manage Accountability Partner"
                >
                  <Shield className="w-3.5 h-3.5 text-stone-500" />
                  <span className="hidden sm:inline">Partner</span>
                </button>
              )}

              <div className="flex items-center gap-2 pl-2 border-l border-stone-200">
                <div className="w-8 h-8 rounded-xl bg-stone-200 text-stone-700 flex items-center justify-center text-xs font-semibold overflow-hidden shadow-xs">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" />
                  ) : (
                    user.displayName?.charAt(0).toUpperCase() || <User className="w-4 h-4" />
                  )}
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-xs font-semibold text-stone-900 leading-tight">
                    {user.displayName || user.email?.split('@')[0] || 'Member'}
                  </div>
                  <div className="text-[10px] text-stone-500 font-mono leading-tight truncate max-w-[120px]">
                    {user.email}
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="p-1.5 text-stone-400 hover:text-stone-700 rounded-xl hover:bg-stone-200/60 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={onLogin}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-900 text-stone-50 hover:bg-stone-800 text-xs font-medium transition-all shadow-xs active:scale-[0.98]"
            >
              <LogIn className="w-3.5 h-3.5 text-amber-400" />
              <span>Sign In with Google</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

