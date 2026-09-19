import React, { useState } from 'react';
import { X, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { auth } from '../lib/auth';

interface AddInvestigatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddInvestigatorModal: React.FC<AddInvestigatorModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !fullName.trim() || !password) {
      setStatus('error');
      setMessage('Email, Password, and Full Name are required.');
      return;
    }

    if (password.length < 8) {
      setStatus('error');
      setMessage('Password must be at least 8 characters long.');
      return;
    }

    setStatus('loading');
    setMessage('');
    
    try {
      await auth.addInvestigator(email.trim(), password, fullName.trim());
      setStatus('success');
      setMessage(`Investigator ${email} added successfully.`);
      setTimeout(() => {
        onClose();
        setEmail('');
        setPassword('');
        setFullName('');
        setStatus('idle');
        window.location.reload(); // Quick way to refresh the investigator list if needed
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Failed to add investigator.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-sans select-none">
      <div className="relative w-full max-w-md bg-[#0b0f19] border border-indigo-500/30 rounded-3xl p-6 shadow-2xl overflow-hidden font-mono">
        <div className="flex items-center justify-between pb-4 border-b border-indigo-500/20 mb-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <UserPlus className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              ADD INVESTIGATOR
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {status === 'error' && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 font-sans">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{message}</span>
          </div>
        )}

        {status === 'success' && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5 font-sans">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ENTER EMAIL"
              disabled={status === 'loading' || status === 'success'}
              className="w-full bg-black/60 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ENTER PASSWORD"
                disabled={status === 'loading' || status === 'success'}
                className="w-full bg-black/60 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Dr. Jane Smith"
              disabled={status === 'loading' || status === 'success'}
              className="w-full bg-black/60 border border-slate-700 text-white text-xs px-3 py-2 rounded-xl outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={status === 'loading' || status === 'success'}
            className="w-full py-3 mt-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/50 text-white text-xs font-bold tracking-wider transition-all disabled:opacity-50"
          >
            {status === 'loading' ? 'ADDING...' : 'ADD TO AUTHORIZED ROSTER'}
          </button>
        </form>
      </div>
    </div>
  );
};
