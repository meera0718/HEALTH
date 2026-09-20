import React, { useState, useEffect, useRef } from 'react';
import { Camera, AlertCircle, RefreshCw, X, UserPlus, CheckCircle2 } from 'lucide-react';
import { auth } from '../lib/auth';
import { DEMO_MODE } from '../config';

interface FaceRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegistrationSuccess: (accountId: string) => void;
}

export const FaceRegistrationModal: React.FC<FaceRegistrationModalProps> = ({
  isOpen,
  onClose,
  onRegistrationSuccess
}) => {
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [investigators, setInvestigators] = useState<Array<{account_id: string, full_name: string}>>([]);
  
  useEffect(() => {
    if (isOpen) {
      auth.getInvestigators().then((invs) => {
        setInvestigators(invs);
        if (invs.length > 0 && !selectedAccount) {
          setSelectedAccount(invs[0].account_id);
        }
      });
    }
  }, [isOpen]);

  const [cameraStatus, setCameraStatus] = useState<'IDLE' | 'STARTING' | 'ACTIVE' | 'DENIED' | 'ERROR'>('IDLE');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [registering, setRegistering] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const activeAccountId = selectedAccount;

  const startCamera = async () => {
    setCameraStatus('STARTING');
    setCameraError(null);
    setErrorMessage(null);
    setSuccessMsg(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access API is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          setCameraStatus('ACTIVE');
        };
      } else {
        setCameraStatus('ACTIVE');
      }
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraStatus('DENIED');
        setCameraError('Camera permission denied. Grant camera permissions to complete face registration.');
      } else {
        setCameraStatus('ERROR');
        setCameraError(err.message || 'Unable to access web camera stream.');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus('IDLE');
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setErrorMessage(null);
      setSuccessMsg(null);
      setRegistering(false);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const handleRegisterFace = async () => {
    if (!activeAccountId) {
      setErrorMessage('Please select or enter an Account ID to register a facial template.');
      return;
    }

    if (cameraStatus !== 'ACTIVE') {
      setErrorMessage('Camera stream must be active to capture facial biometric.');
      return;
    }

    setRegistering(true);
    setErrorMessage(null);
    setSuccessMsg(null);

    let frameDataB64 = 'registration_camera_capture';
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frameDataB64 = canvas.toDataURL('image/jpeg', 0.85);
      }
    }

    try {
      // Simulate 1s facial feature extraction delay
      await new Promise((r) => setTimeout(r, 1000));

      const res = await auth.registerFace(activeAccountId, frameDataB64);
      setSuccessMsg(res.message || `Face template registered successfully for ${activeAccountId}.`);
      
      setTimeout(() => {
        stopCamera();
        onRegistrationSuccess(activeAccountId);
      }, 1500);
    } catch (err: any) {
      setErrorMessage(!DEMO_MODE ? 'Enrollment failed.' : (err.message || 'Facial template registration failed.'));
    } finally {
      setRegistering(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-sans select-none">
      <div className="relative w-full max-w-lg bg-[#0b0f19] border border-white/20 rounded-3xl p-6 shadow-2xl overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <UserPlus className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              BIOMETRIC ENROLLMENT
            </h3>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 font-sans">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 font-sans">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-bold">{successMsg}</span>
          </div>
        )}

        {/* Account Selector */}
        <div className="mb-4 space-y-1.5">
          <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block">
            INVESTIGATOR EMAIL:
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="bg-black/60 border border-slate-700 text-indigo-300 text-xs px-3 py-2 rounded-xl outline-none cursor-pointer flex-1 font-mono"
            >
              <optgroup label="Security Investigators">
                {investigators.map((inv) => (
                  <option key={inv.account_id} value={inv.account_id}>
                    {inv.account_id} · {inv.full_name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Video Box */}
        <div className="relative w-full aspect-video bg-black/90 rounded-2xl border border-white/10 overflow-hidden flex flex-col items-center justify-center mb-5">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover transform -scale-x-100 ${
              cameraStatus === 'ACTIVE' ? 'block' : 'hidden'
            }`}
          />
          <canvas ref={canvasRef} className="hidden" />

          {cameraStatus === 'ACTIVE' && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div
                className={`w-44 h-44 rounded-full border-2 border-dashed flex items-center justify-center transition-all ${
                  successMsg
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : registering
                    ? 'border-indigo-400 animate-spin'
                    : 'border-indigo-400/80 animate-pulse'
                }`}
              >
                <div className="w-36 h-36 rounded-full border border-indigo-300/30 flex items-center justify-center text-[10px] text-indigo-300 font-bold tracking-widest uppercase">
                  {registering ? 'EXTRACTING BIOMETRIC...' : successMsg ? 'TEMPLATE SAVED' : 'POSITION FACE'}
                </div>
              </div>

              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[10px] text-indigo-400 font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                <span>REGISTRATION MODE</span>
              </div>
              <div className="absolute bottom-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-[10px] text-slate-300 font-mono">
                LIVENESS: <span className="text-cyan-400 font-bold">ACTIVE</span> · ENCRYPTED TEMPLATE
              </div>

            </div>
          )}

          {cameraStatus === 'STARTING' && (
            <div className="flex flex-col items-center gap-2 text-indigo-400">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
              <span className="text-xs text-slate-300">Opening Camera Stream...</span>
            </div>
          )}

          {cameraStatus === 'DENIED' && (
            <div className="p-6 text-center text-rose-300 font-sans text-xs space-y-3">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
              <div className="font-bold text-rose-200 text-sm">Camera Access Denied</div>
              <p className="text-slate-400 text-[11px] max-w-xs mx-auto">{cameraError}</p>
            </div>
          )}

          {cameraStatus === 'ERROR' && (
            <div className="p-6 text-center text-amber-300 font-sans text-xs space-y-3">
              <Camera className="w-10 h-10 text-amber-400 mx-auto" />
              <div className="font-bold text-amber-200 text-sm">Camera Stream Error</div>
              <p className="text-slate-400 text-[11px] max-w-xs mx-auto">{cameraError}</p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
          >
            CANCEL
          </button>

          <button
            type="button"
            onClick={handleRegisterFace}
            disabled={registering || cameraStatus !== 'ACTIVE' || !!successMsg}
            className="flex-1 py-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/50 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {registering ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>SAVING TEMPLATE...</span>
              </>
            ) : successMsg ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>REGISTERED</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>CAPTURE & REGISTER FACE</span>
              </>
            )}
          </button>
        </div>
        
        {/* Footer */}
        <div className="mt-4 text-center">
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
            Access is logged and audited.
          </span>
        </div>
      </div>
    </div>
  );
};
