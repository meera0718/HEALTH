import React, { useState } from 'react';
import { Mail, LockKeyhole, Eye, EyeOff, ShieldCheck, RefreshCw, AlertCircle, ScanFace, UserPlus } from 'lucide-react';
import type { GatewayState } from './AccessButton';

interface LoginPanelProps {
  gatewayState: GatewayState;
  onSubmit: (email: string, pass: string) => Promise<void>;
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;
  onOpenFaceLogin?: () => void;
  onOpenFaceRegister?: () => void;
}

export const LoginPanel: React.FC<LoginPanelProps> = ({
  gatewayState,
  onSubmit,
  errorMessage,
  setErrorMessage,
  onOpenFaceLogin,
  onOpenFaceRegister
}) => {
  const [email, setEmail] = useState('investigator@gmail.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    setEmailFieldError(null);
    setErrorMessage(null);
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setEmailFieldError(null);

    // Basic email validation
    if (!email.toLowerCase().trim().includes('@')) {
      setEmailFieldError('Use a valid email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your authorized password.');
      return;
    }

    await onSubmit(email.trim(), password);
  };

  const isAuthenticating = gatewayState === 'AUTHENTICATING';
  const isAuthorized = gatewayState === 'AUTHORIZED';

  return (
    <div className="liquid-glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 w-[min(400px,calc(100vw-32px))] border border-white/15 shadow-2xl backdrop-blur-xl relative z-20">
      {/* Panel Header */}
      <div className="mb-3 sm:mb-4 text-center border-b border-white/10 pb-2 sm:pb-2.5">
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/20 mb-1 text-indigo-400">
          <ShieldCheck className="w-4 h-4 text-indigo-300" />
        </div>
        <h2 className="font-bold text-white text-sm sm:text-base tracking-wider font-mono uppercase">
          SECURE ACCESS
        </h2>
        <p className="text-white/50 text-[11px] font-sans">
          Authorized personnel only.
        </p>
      </div>

      {/* Error Alert Box */}
      {errorMessage && (
        <div className="mb-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 font-sans">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span className="leading-snug">{errorMessage}</span>
        </div>
      )}

      {/* Form Inputs */}
      <form onSubmit={handleSubmit} className={`space-y-2.5 ${isAuthenticating ? 'opacity-50 pointer-events-none blur-[1px]' : ''}`}>
        {/* Gmail Input */}
        <div>
          <label className="text-[10px] font-mono font-semibold text-white/70 uppercase tracking-widest block mb-1">
            AUTHORIZED EMAIL
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-white/50 absolute left-3 top-2.5" />
            <input
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="investigator@email.com"
              autoComplete="email"
              required
              disabled={isAuthenticating || isAuthorized}
              className={`w-full bg-white/[0.03] border text-xs text-white pl-9 pr-3 py-2 sm:py-2.5 rounded-xl focus:outline-none transition-colors placeholder-white/30 font-mono ${
                emailFieldError
                  ? 'border-rose-500/60 focus:border-rose-500'
                  : 'border-white/15 focus:border-indigo-400/60'
              }`}
            />
          </div>
          {emailFieldError && (
            <span className="text-[10px] text-rose-400 mt-1 block font-sans font-medium">
              {emailFieldError}
            </span>
          )}
        </div>

        {/* Password Input */}
        <div>
          <label className="text-[10px] font-mono font-semibold text-white/70 uppercase tracking-widest block mb-1">
            AUTHORIZED PASSWORD
          </label>
          <div className="relative">
            <LockKeyhole className="w-4 h-4 text-white/50 absolute left-3 top-2.5" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="Enter authorized password"
              autoComplete="current-password"
              required
              disabled={isAuthenticating || isAuthorized}
              className="w-full bg-white/[0.03] border border-white/15 text-xs text-white pl-9 pr-9 py-2 sm:py-2.5 rounded-xl focus:outline-none focus:border-indigo-400/60 transition-colors placeholder-white/30 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Toggle password visibility"
              className="absolute right-2.5 top-2.5 text-white/40 hover:text-white/80 p-0.5 rounded transition-colors"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Submit Login Button */}
        <button
          type="submit"
          disabled={isAuthenticating || isAuthorized}
          className={`w-full mt-1.5 py-2.5 sm:py-3 rounded-xl font-bold text-xs tracking-wider font-mono flex items-center justify-center gap-2 transition-all shadow-xl cursor-pointer ${
            isAuthorized
              ? 'bg-emerald-600 text-white border border-emerald-400/50'
              : isAuthenticating
              ? 'bg-indigo-600/50 text-white/80 cursor-wait border border-indigo-500/30'
              : 'bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/40'
          }`}
        >
          {isAuthenticating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-300" />
              <span>VERIFYING CREDENTIALS...</span>
            </>
          ) : isAuthorized ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              <span>ACCESS GRANTED — ENTERING CONSOLE</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>AUTHENTICATE & ENTER</span>
            </>
          )}
        </button>

        {(onOpenFaceLogin || onOpenFaceRegister) && (
          <div className="pt-1">
            <div className="relative flex py-1.5 items-center">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink mx-2 text-[9px] font-mono text-white/40 uppercase font-semibold">OR OPTIONAL</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2">
              {onOpenFaceLogin && (
                <button
                  type="button"
                  onClick={onOpenFaceLogin}
                  disabled={isAuthenticating || isAuthorized}
                  className="w-full py-2 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 font-mono font-bold text-[10px] sm:text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg hover:border-cyan-400 disabled:opacity-50"
                >
                  <ScanFace className="w-3 h-3 text-cyan-400 animate-pulse" />
                  <span>LOGIN WITH FACE</span>
                </button>
              )}

              {onOpenFaceRegister && (
                <button
                  type="button"
                  onClick={onOpenFaceRegister}
                  disabled={isAuthenticating || isAuthorized}
                  className="w-full py-2 rounded-xl bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-500/40 text-indigo-300 font-mono font-bold text-[10px] sm:text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg hover:border-indigo-400 disabled:opacity-50"
                >
                  <UserPlus className="w-3 h-3 text-indigo-400" />
                  <span>REGISTER FACE</span>
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
