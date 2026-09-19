import React from 'react';
import { X, ShieldCheck, Lock, LogOut } from 'lucide-react';
import ReflectiveCard from './ReflectiveCard';
import { auth } from '../lib/auth';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, onLogout }) => {
  if (!isOpen) return null;

  const currentUser = auth.getCurrentUser();
  const email = currentUser?.email || 'UNKNOWN EMAIL';
  const role = currentUser?.role ? `${currentUser.role.replace('_', ' ')}` : 'INVESTIGATOR';
  const name = currentUser?.name?.toUpperCase() || 'UNKNOWN USER';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-2 sm:p-4">
      <div className="relative flex flex-col items-center space-y-4 animate-in fade-in zoom-in-95 duration-200 font-sans max-w-md w-[95%] sm:w-full max-h-[90vh] overflow-y-auto p-2">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:-top-8 sm:right-0 text-slate-400 hover:text-white p-2 rounded-full bg-slate-800/80 border border-slate-700 cursor-pointer transition-colors z-10"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Header Label */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono text-xs font-bold uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5" />
            <span>AUTHENTICATED INVESTIGATOR CREDENTIALS</span>
          </div>
        </div>

        {/* React Bits ReflectiveCard ID Badge */}
        <ReflectiveCard
          userName={name}
          userRole={role}
          idNumber="HSX-8901-2345-6789"
          email={email}
          clearanceLevel="LEVEL-5 TOP SECRET"
          overlayColor="rgba(0, 0, 0, 0.35)"
          blurStrength={14}
          glassDistortion={15}
          metalness={0.9}
          roughness={0.4}
          displacementStrength={22}
          noiseScale={1.2}
          specularConstant={2.0}
        />

        {/* Footer Audit Callout & Logout Action */}
        <div className="w-full flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>CRYPTO-SIGNED BADGE</span>
          </div>

          {onLogout && (
            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>LOGOUT SESSION</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
