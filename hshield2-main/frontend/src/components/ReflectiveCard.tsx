import React, { useEffect, useRef } from 'react';
import './ReflectiveCard.css';
import { Fingerprint, Activity, Lock, ShieldCheck } from 'lucide-react';

export interface ReflectiveCardProps {
  userName?: string;
  userRole?: string;
  idNumber?: string;
  email?: string;
  clearanceLevel?: string;
  blurStrength?: number;
  color?: string;
  metalness?: number;
  roughness?: number;
  overlayColor?: string;
  displacementStrength?: number;
  noiseScale?: number;
  specularConstant?: number;
  grayscale?: number;
  glassDistortion?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ReflectiveCard: React.FC<ReflectiveCardProps> = ({
  userName = 'ALEXANDER DOE',
  userRole = 'SENIOR INVESTIGATOR',
  idNumber = '8901-2345-6789',
  email = 'investigator@gmail.com',
  clearanceLevel = 'LEVEL-5 TOP SECRET',
  blurStrength = 12,
  color = 'white',
  metalness = 1,
  roughness = 0.4,
  overlayColor = 'rgba(0, 0, 0, 0.25)',
  displacementStrength = 20,
  noiseScale = 1,
  specularConstant = 1.2,
  grayscale = 1,
  glassDistortion = 0,
  className = '',
  style = {}
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startWebcam = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user'
            }
          });

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        }
      } catch (err) {
        console.warn('Webcam stream unavailable for reflective badge, fallback reflection active.', err);
      }
    };

    startWebcam();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const baseFrequency = 0.03 / Math.max(0.1, noiseScale);
  const saturation = 1 - Math.max(0, Math.min(1, grayscale));

  const cssVariables = {
    '--blur-strength': `${blurStrength}px`,
    '--metalness': metalness,
    '--roughness': roughness,
    '--overlay-color': overlayColor,
    '--text-color': color,
    '--saturation': saturation
  } as React.CSSProperties;

  return (
    <div className={`reflective-card-container ${className}`} style={{ ...style, ...cssVariables }}>
      <svg className="reflective-svg-filters" aria-hidden="true">
        <defs>
          <filter id="metallic-displacement" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="turbulence" baseFrequency={baseFrequency} numOctaves="2" result="noise" />
            <feColorMatrix in="noise" type="luminanceToAlpha" result="noiseAlpha" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={displacementStrength}
              xChannelSelector="R"
              yChannelSelector="G"
              result="rippled"
            />
            <feSpecularLighting
              in="noiseAlpha"
              surfaceScale={displacementStrength}
              specularConstant={specularConstant}
              specularExponent="20"
              lightingColor="#ffffff"
              result="light"
            >
              <fePointLight x="0" y="0" z="300" />
            </feSpecularLighting>
            <feComposite in="light" in2="rippled" operator="in" result="light-effect" />
            <feBlend in="light-effect" in2="rippled" mode="screen" result="metallic-result" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="solidAlpha"
            />
            <feMorphology in="solidAlpha" operator="erode" radius="45" result="erodedAlpha" />
            <feGaussianBlur in="erodedAlpha" stdDeviation="10" result="blurredMap" />
            <feComponentTransfer in="blurredMap" result="glassMap">
              <feFuncA type="linear" slope="0.5" intercept="0" />
            </feComponentTransfer>
            <feDisplacementMap
              in="metallic-result"
              in2="glassMap"
              scale={glassDistortion}
              xChannelSelector="A"
              yChannelSelector="A"
              result="final"
            />
          </filter>
        </defs>
      </svg>

      <video ref={videoRef} autoPlay playsInline muted className="reflective-video" />

      <div className="reflective-noise" />
      <div className="reflective-sheen" />
      <div className="reflective-border" />

      <div className="reflective-content">
        <div className="card-header">
          <div className="security-badge">
            <Lock size={12} className="security-icon text-indigo-400" />
            <span className="text-[10px] text-slate-100 font-mono font-bold">SECURE ACCESS</span>
          </div>
          <Activity className="status-icon text-emerald-400 animate-pulse" size={18} />
        </div>

        <div className="card-body">
          <div className="flex flex-col items-center space-y-1">
            <div className="p-3 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 mb-2">
              <ShieldCheck size={32} />
            </div>
            <h2 className="user-name text-white font-mono">{userName}</h2>
            <p className="user-role text-indigo-300 font-mono font-bold text-[11px] tracking-widest">{userRole}</p>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              {clearanceLevel}
            </span>
            <span className="text-[10px] font-mono text-slate-300 pt-1">
              {email}
            </span>
          </div>
        </div>

        <div className="card-footer">
          <div className="id-section">
            <span className="label text-slate-400">CLEARANCE ID NUMBER</span>
            <span className="value text-indigo-300">{idNumber}</span>
          </div>
          <div className="fingerprint-section">
            <Fingerprint size={32} className="fingerprint-icon text-indigo-400" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReflectiveCard;
