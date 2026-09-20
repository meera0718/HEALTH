import React, { useState } from 'react';
import { ShieldCheck, LogIn, Lock, CheckCircle2 } from 'lucide-react';
import Hyperspeed from '../components/Hyperspeed';
import { auth } from '../lib/auth';

interface LogoutDashboardProps {
  onReEnterGateway: () => void;
}

export const LogoutDashboard: React.FC<LogoutDashboardProps> = ({ onReEnterGateway }) => {
  const [isWarping, setIsWarping] = useState(false);

  const handleReEnter = () => {
    setIsWarping(true);
    auth.logout();
    setTimeout(() => {
      onReEnterGateway();
    }, 1200);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black font-sans flex items-center justify-center">
      {/* Fullscreen React Bits Hyperspeed WebGL Tunnel Shader */}
      <div className="absolute inset-0 z-0">
        <Hyperspeed
          effectOptions={{
            distortion: 'turbulentDistortion',
            length: 400,
            roadWidth: 10,
            islandWidth: 2,
            lanesPerRoad: 4,
            fov: isWarping ? 150 : 90,
            fovSpeedUp: 160,
            speedUp: isWarping ? 8 : 2,
            carLightsFade: 0.4,
            totalSideLightSticks: 25,
            lightPairsPerRoadWay: 45,
            shoulderLinesWidthPercentage: 0.05,
            brokenLinesWidthPercentage: 0.1,
            brokenLinesLengthPercentage: 0.5,
            lightStickWidth: [0.12, 0.5],
            lightStickHeight: [1.3, 1.7],
            movingAwaySpeed: [60, 80],
            movingCloserSpeed: [-120, -160],
            carLightsLength: [400 * 0.03, 400 * 0.2],
            carLightsRadius: [0.05, 0.14],
            carWidthPercentage: [0.3, 0.5],
            carShiftX: [-0.8, 0.8],
            carFloorSeparation: [0, 5],
            colors: {
              roadColor: 0x080808,
              islandColor: 0x0a0a0a,
              background: 0x000000,
              shoulderLines: 0xffffff,
              brokenLines: 0xffffff,
              leftCars: [0x6366f1, 0x38bdf8, 0x4f46e5],
              rightCars: [0x10b981, 0x059669, 0x34d399],
              sticks: 0x38bdf8
            }
          }}
        />
      </div>

      {/* Dark Vignette Atmosphere */}
      <div className="absolute inset-0 bg-radial from-transparent via-black/40 to-black/90 pointer-events-none z-1" />

      {/* Logout Dashboard Card & Terminal Summary */}
      <div className="relative z-10 max-w-lg w-full mx-4 p-8 bg-[#0f172a]/85 backdrop-blur-xl border border-indigo-500/30 rounded-3xl shadow-2xl space-y-6 text-center">
        {/* Shield Header Badge */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/20 animate-pulse">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider mb-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>SESSION TERMINATED & CLEARED</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight font-sans">
            LOGOUT COMPLETED
          </h1>
          <p className="text-xs text-slate-300 mt-1 font-sans">
            Investigation session state has been securely purged and logged to audit ledger.
          </p>
        </div>

        {/* Security Audit Receipt Box */}
        <div className="bg-[#161b22]/90 border border-[#1e293b] rounded-2xl p-4 text-left font-mono text-xs space-y-2.5 shadow-inner">
          <div className="flex justify-between items-center pb-2 border-b border-[#1e293b]">
            <span className="text-slate-400">Authenticated User:</span>
            <span className="text-indigo-300 font-bold">investigator@gmail.com</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Clearance Level:</span>
            <span className="text-emerald-400 font-bold">LEVEL-5 TOP SECRET</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Forensic Audit Hash:</span>
            <span className="text-slate-300 text-[10px]">0x9F82A4C2E8109FBC</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-[#1e293b]">
            <span className="text-slate-400">JWT Security Token:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <Lock className="w-3 h-3" /> REVOKED
            </span>
          </div>
        </div>

        {/* Action Button to Re-Enter Secure Gateway */}
        <button
          onClick={handleReEnter}
          disabled={isWarping}
          className={`w-full py-3.5 px-6 rounded-xl font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-xl transition-all cursor-pointer ${
            isWarping
              ? 'bg-indigo-600 text-white animate-pulse shadow-indigo-500/50 scale-95'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:scale-[1.02]'
          }`}
        >
          <LogIn className="w-4 h-4" />
          <span>{isWarping ? 'ENGAGING HYPERSPEED WARP...' : 'RE-ENTER SECURE GATEWAY'}</span>
        </button>
      </div>
    </div>
  );
};
