import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import WebThreads from './WebThreads';

const HLS_URL = 'https://stream.mux.com/kimF2ha9zLrX64H00UgLGPflCzNtl1T0215MlAmeOztv8.m3u8';

export const BackgroundVideo: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hlsInstance: Hls | null = null;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = HLS_URL;
      video.play().catch((err) => console.log('Autoplay prevented:', err));
    } else if (Hls.isSupported()) {
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });

      hlsInstance.loadSource(HLS_URL);
      hlsInstance.attachMedia(video);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch((err) => console.log('Autoplay prevented:', err));
      });

      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hlsInstance?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hlsInstance?.recoverMediaError();
              break;
            default:
              hlsInstance?.destroy();
              break;
          }
        }
      });
    }

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Mux HLS Video Stream */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className="w-full h-full object-cover opacity-30 filter brightness-90 contrast-110"
      />

      {/* React Bits WebThreads Glowing Weaving Cyber Strand Overlay */}
      <div className="absolute inset-0 z-1 opacity-70 pointer-events-auto">
        <WebThreads
          color1="#4F46E5"
          color2="#38BDF8"
          color3="#FFFFFF"
          speed={0.25}
          threadCount={6}
          frequency={4.5}
          spread={0.16}
          taper={1.1}
          position={0.5}
          fanMode="center"
          glow={0.025}
          falloff={0.65}
          thickness={1.2}
          brightness={0.65}
          opacity={0.85}
          mirror={true}
          shimmer={false}
          grain={true}
          grainIntensity={0.04}
          mouseInteraction={true}
          mouseStrength={0.35}
        />
      </div>

      {/* Dark Cinematic Overlays */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] z-2 pointer-events-none" />
      
      {/* Radial Vignette & Glow Overlay */}
      <div 
        className="absolute inset-0 z-3 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(11, 15, 25, 0.1) 0%, rgba(0, 0, 0, 0.85) 75%, rgba(0, 0, 0, 0.95) 100%)'
        }}
      />

      {/* Subtle Scan Lines Grid Effect */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none z-4"
        style={{
          backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />
    </div>
  );
};
