import React, { useState } from 'react';
import { 
  Shield, LayoutDashboard,
  ShieldAlert, UserCheck, LogOut, Cpu, X, Users, FileText, Activity,
  Server, Boxes, Bot
} from 'lucide-react';
import { UserProfileModal } from '../UserProfileModal';
import { auth } from '../../lib/auth';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout?: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  onLogout,
  isOpenMobile = false,
  onCloseMobile
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const navItems = [
    { id: 'command', label: '▣ COMMAND CENTER', icon: LayoutDashboard },
    { id: 'pipeline', label: '🔀 DETECTION PIPELINE', icon: Activity },
    { id: 'patients', label: '📊 PATIENT COHORT', icon: Users },
    { id: 'honeypot', label: '🍯 HONEYPOT SIMULATOR', icon: ShieldAlert },
    { id: 'features', label: '◈ FEATURE ENGINE', icon: Cpu },
    { id: 'fec', label: '🛡 FEC ENGINE', icon: Shield },
    { id: 'devices', label: '🛡 LIVE DEVICES', icon: Server },
    { id: 'twin', label: '🏥 3D DIGITAL TWIN', icon: Boxes },
    { id: 'report', label: '📄 SECURITY REPORT', icon: FileText },
    { id: 'ai-assistant', label: 'AI ASSISTANT', icon: Bot },
  ];

  const handleSelect = (id: string) => {
    setActiveTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  const sidebarContent = (
    <aside className="w-64 bg-[#0d1117] border-r border-[#1e293b] flex flex-col justify-between h-full select-none font-sans overflow-y-auto">
      <div>
        {/* Brand Header */}
        <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-slate-100 tracking-wide text-xs font-mono">HEALTHSHIELD-X</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] text-cyan-400 font-mono uppercase tracking-wider">v2.0 · PROTECTED</span>
              </div>
            </div>
          </div>

          {/* Close button for mobile screen */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/80 border border-slate-700 touch-manipulation min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4 text-slate-200" />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="p-2 space-y-1 font-mono">
          <div className="px-3 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
            SOC COMMAND SYSTEM
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-cyan-600/15 text-cyan-300 border border-cyan-500/40 font-bold shadow-sm shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Status & Profile Trigger */}
      <div className="p-3 border-t border-[#1e293b] text-xs text-slate-500 space-y-2">
        <button
          onClick={() => setIsProfileOpen(true)}
          className="w-full p-2 rounded-xl bg-[#161b22] border border-[#1e293b] hover:border-cyan-500/50 flex items-center gap-2 text-slate-300 transition-all cursor-pointer"
          title="Click to inspect Reflective User Credentials ID Badge"
        >
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold">
            <UserCheck className="w-3.5 h-3.5" />
          </div>
          <div className="text-left font-mono text-[9px]">
            <div className="font-bold text-slate-200 uppercase">{auth.getCurrentUser()?.name || 'UNKNOWN USER'}</div>
            <div className="text-cyan-400 text-[8px]">CLEARANCE BADGE →</div>
          </div>
        </button>

        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full py-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>LOGOUT SESSION</span>
          </button>
        )}

        <div className="flex items-center justify-between font-mono text-[9px] pt-1">
          <span>● PROTECTED</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 font-bold">DEMO ENV</span>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar (visible lg+) */}
      <div className="hidden lg:block h-screen sticky top-0 z-30">
        {sidebarContent}
      </div>

      {/* Mobile Drawer (visible < lg when open) */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
            onClick={onCloseMobile} 
          />
          <div className="relative z-10 h-full max-w-xs w-full shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* User Profile ReflectiveCard Badge Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onLogout={onLogout}
      />
    </>
  );
};
