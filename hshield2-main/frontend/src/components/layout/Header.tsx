import React, { useState } from 'react';
import { Bell, Search, ShieldCheck, UserCheck, Menu } from 'lucide-react';
import { UserProfileModal } from '../UserProfileModal';
import { AddInvestigatorModal } from '../AddInvestigatorModal';
import { auth } from '../../lib/auth';

interface HeaderProps {
  selectedIncidentId: string;
  setSelectedIncidentId: (id: string) => void;
  incidents: Array<{ id: string; title: string }>;
  onLogout?: () => void;
  onToggleNotifications?: () => void;
  unreadCount?: number;
  onOpenMobileSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedIncidentId: _selectedIncidentId,
  setSelectedIncidentId: _setSelectedIncidentId,
  incidents: _incidents,
  onLogout,
  onToggleNotifications,
  unreadCount = 3,
  onOpenMobileSidebar
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAddInvestigatorOpen, setIsAddInvestigatorOpen] = useState(false);

  const currentUser = auth.getCurrentUser();
  const isInvestigator = currentUser?.role === 'INVESTIGATOR';

  return (
    <>
      <header className="h-16 bg-[#0d1117]/80 backdrop-blur border-b border-[#1e293b] px-2 sm:px-6 flex items-center justify-between sticky top-0 z-20 font-sans">
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Mobile Hamburger Toggle Button */}
          {onOpenMobileSidebar && (
            <button
              onClick={onOpenMobileSidebar}
              className="lg:hidden text-slate-300 hover:text-white p-2 rounded-lg bg-[#161b22] border border-[#1e293b] cursor-pointer touch-manipulation min-h-[40px] min-w-[40px] flex items-center justify-center"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5 text-cyan-400" />
            </button>
          )}

          <span className="text-xs text-cyan-400 font-mono font-bold tracking-wider hidden sm:inline uppercase">
            SOC COMMAND
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">


          {/* Quick Search (desktop only) */}
          <div className="relative hidden xl:block w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search telemetry..."
              className="w-full bg-[#161b22] border border-[#1e293b] text-xs text-slate-200 pl-9 pr-3 py-1.5 rounded-md focus:outline-none focus:border-cyan-500 placeholder-slate-500 font-mono"
            />
          </div>

          {/* Live Security Monitor Badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold hidden md:flex">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>● SYSTEM ONLINE</span>
          </div>

          {/* Notification Bell */}
          <button
            onClick={onToggleNotifications}
            className="p-2 rounded-md hover:bg-[#161b22] text-slate-400 hover:text-slate-200 relative cursor-pointer"
            title="View Security Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-mono font-bold flex items-center justify-center absolute -top-1 -right-1">
                {unreadCount}
              </span>
            )}
          </button>

          {/* User Avatar Button */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex items-center gap-2 border-l border-[#1e293b] pl-2 sm:pl-3 hover:opacity-80 transition-all cursor-pointer"
            title="Click to view Reflective ID Credentials Badge"
          >
            <div className="w-7 h-7 rounded-full bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-xs font-bold text-cyan-300">
              <UserCheck className="w-4 h-4" />
            </div>
            <span className="text-xs text-slate-200 font-semibold font-mono hidden xl:inline">
              {currentUser?.name || 'UNKNOWN USER'}
            </span>
          </button>

          {isInvestigator && (
            <button
              onClick={() => setIsAddInvestigatorOpen(true)}
              className="ml-2 px-3 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 text-xs font-mono font-bold transition-all cursor-pointer"
            >
              + ADD INVESTIGATOR
            </button>
          )}
        </div>
      </header>

      {/* User Profile ReflectiveCard Badge Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        onLogout={onLogout}
      />

      <AddInvestigatorModal
        isOpen={isAddInvestigatorOpen}
        onClose={() => setIsAddInvestigatorOpen(false)}
      />
    </>
  );
};
