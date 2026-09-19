import React, { useState, useEffect, useRef } from 'react';
import { Camera, AlertCircle, RefreshCw, X, ScanFace, CheckCircle2 } from 'lucide-react';
import { auth, type UserProfile } from '../lib/auth';
import { DEMO_MODE } from '../config';

interface FaceLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (profile: UserProfile) => void;
  onSecurityAlert?: (path: string) => void;
}

export const FaceLoginModal: React.FC<FaceLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSecurityAlert
}) => {
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [investigators, setInvestigators] = useState<Array<{account_id: string, email: string, display_id: string, full_name: string}>>([]);
  
  useEffect(() => {
    if (isOpen) {
      auth.getInvestigators().then((invs) => {
        setInvestigators(invs);
        if (invs.length > 0 && !selectedAccount) {
          setSelectedAccount(invs[0].email);
        }
      });
    }
  }, [isOpen]);

  const [cameraStatus, setCameraStatus] = useState<'IDLE' | 'STARTING' | 'ACTIVE' | 'DENIED' | 'ERROR'>('IDLE');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [verifying, setVerifying] = useState<boolean>(false);
  const [livenessState, setLivenessState] = useState<'PENDING' | 'SCANNING' | 'VERIFIED' | 'FAILED'>('PENDING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const activeAccountId = selectedAccount;

  // Start camera stream when modal opens
  const startCamera = async () => {
    setCameraStatus('STARTING');
    setCameraError(null);
    setErrorMessage(null);

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
          setLivenessState('SCANNING');
        };
      } else {
        setCameraStatus('ACTIVE');
        setLivenessState('SCANNING');
      }
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraStatus('DENIED');
        setCameraError('Camera permission was denied. Please grant camera permissions to use optional Face Detect Login.');
      } else {
        setCameraStatus('ERROR');
        setCameraError(err.message || 'Unable to access web camera stream. Please ensure camera is connected.');
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
      setVerifying(false);
      setLivenessState('PENDING');
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const handleVerifyFace = async () => {
    if (!activeAccountId) {
      setErrorMessage('Please select or enter an Account ID for face verification.');
      return;
    }

    if (cameraStatus !== 'ACTIVE') {
      setErrorMessage('Camera stream must be active to verify facial biometric.');
      return;
    }

    setVerifying(true);
    setErrorMessage(null);

    // Capture current frame from canvas
    let frameDataB64 = 'live_camera_capture';
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        frameDataB64 = canvas.toDataURL('image/jpeg', 0.8);
      }
    }

    try {
      // Simulate 1.2s liveness & biometric feature matching delay
      await new Promise((r) => setTimeout(r, 1200));

      const profile = await auth.loginWithFace(activeAccountId, frameDataB64, true);
      setLivenessState('VERIFIED');
      
      setTimeout(() => {
        stopCamera();
        onSuccess(profile);
      }, 600);
    } catch (err: any) {
      setLivenessState('FAILED');
      const msg = !DEMO_MODE ? 'Authentication failed.' : (err.message || 'Face verification failed. Facial biometric does not match registered profile.');
      setErrorMessage(msg);

      if (activeAccountId.toUpperCase().startsWith('P') && onSecurityAlert) {
        onSecurityAlert(`/face-login-failed/${activeAccountId}`);
      }
    } finally {
      setVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-sans select-none">
      <div className="relative w-full max-w-lg bg-[#0b0f19] border border-white/20 rounded-3xl p-6 shadow-2xl overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2 text-cyan-400">
            <ScanFace className="w-5 h-5 text-cyan-400 animate-pulse" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              BIOMETRIC AUTHENTICATION
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

        {/* Error Notification Banner */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 font-sans">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMessage}</span>
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
              className="bg-black/60 border border-slate-700 text-cyan-300 text-xs px-3 py-2 rounded-xl outline-none cursor-pointer flex-1 font-mono"
            >
              <optgroup label="Security Investigators">
                {investigators.map((inv) => (
                  <option key={inv.email} value={inv.email}>
                    {inv.display_id} · {inv.full_name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Camera Stream Preview Box */}
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

          {/* Scanner Overlay graphics when camera active */}
          {cameraStatus === 'ACTIVE' && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Target Reticle Bounding Box */}
              <div
                className={`w-44 h-44 rounded-full border-2 border-dashed flex items-center justify-center transition-all ${
                  livenessState === 'VERIFIED'
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : livenessState === 'FAILED'
                    ? 'border-rose-500 bg-rose-500/10'
                    : verifying
                    ? 'border-amber-400 animate-spin'
                    : 'border-cyan-400/80 animate-pulse'
                }`}
              >
                <div className="w-36 h-36 rounded-full border border-cyan-300/30 flex items-center justify-center text-[10px] text-cyan-300 font-bold tracking-widest uppercase">
                  {verifying ? 'COMPUTING BIOMETRIC...' : livenessState === 'VERIFIED' ? 'FACE MATCHED' : 'ALIGN FACE'}
                </div>
              </div>

              {/* Top & Bottom Status text over video */}
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[10px] text-emerald-400 font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>LIVE FEED ACTIVE</span>
              </div>
              <div className="absolute bottom-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-[10px] text-slate-300 font-mono">
                LIVENESS: <span className="text-cyan-400 font-bold">ACTIVE</span> · ENCRYPTED TEMPLATE
              </div>
            </div>
          )}

          {/* Fallback States if Camera Not Active */}
          {cameraStatus === 'STARTING' && (
            <div className="flex flex-col items-center gap-2 text-cyan-400">
              <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
              <span className="text-xs text-slate-300">Opening Camera Stream...</span>
            </div>
          )}

          {cameraStatus === 'DENIED' && (
            <div className="p-6 text-center text-rose-300 font-sans text-xs space-y-3">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
              <div className="font-bold text-rose-200 text-sm">Camera Permission Denied</div>
              <p className="text-slate-400 text-[11px] max-w-xs mx-auto">
                Camera access is required for optional Face Verification. You can allow camera access in browser settings or log in using your password.
              </p>
              <button
                onClick={startCamera}
                className="px-4 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/50 text-rose-200 text-xs font-mono transition cursor-pointer"
              >
                Retry Camera Access
              </button>
            </div>
          )}

          {cameraStatus === 'ERROR' && (
            <div className="p-6 text-center text-amber-300 font-sans text-xs space-y-3">
              <Camera className="w-10 h-10 text-amber-400 mx-auto" />
              <div className="font-bold text-amber-200 text-sm">Camera Unavailable</div>
              <p className="text-slate-400 text-[11px] max-w-xs mx-auto">{cameraError}</p>
              <button
                onClick={startCamera}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-mono transition cursor-pointer"
              >
                Re-initialize Camera
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
          >
            USE PASSWORD LOGIN
          </button>

          <button
            type="button"
            onClick={handleVerifyFace}
            disabled={verifying || cameraStatus !== 'ACTIVE'}
            className={`flex-1 py-3 rounded-xl font-bold text-xs tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
              livenessState === 'VERIFIED'
                ? 'bg-emerald-600 text-white border border-emerald-400/50'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-400/50 shadow-lg shadow-cyan-500/20'
            }`}
          >
            {verifying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>VERIFYING FACE...</span>
              </>
            ) : livenessState === 'VERIFIED' ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>AUTHENTICATED</span>
              </>
            ) : (
              <>
                <ScanFace className="w-4 h-4" />
                <span>VERIFY & LOGIN</span>
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
