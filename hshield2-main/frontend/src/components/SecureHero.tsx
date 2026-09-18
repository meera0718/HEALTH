import React from 'react';
import { motion } from 'motion/react';
import { SecurityStatus } from './SecurityStatus';
import { LoginPanel } from './LoginPanel';
import type { GatewayState } from './AccessButton';

interface SecureHeroProps {
  gatewayState: GatewayState;
  onLoginSubmit: (email: string, pass: string) => Promise<void>;
  errorMessage: string | null;
  setErrorMessage: (msg: string | null) => void;
  onOpenFaceLogin?: () => void;
  onOpenFaceRegister?: () => void;
}

export const SecureHero: React.FC<SecureHeroProps> = ({
  gatewayState,
  onLoginSubmit,
  errorMessage,
  setErrorMessage,
  onOpenFaceLogin,
  onOpenFaceRegister
}) => {
  return (
    <section className="relative flex-1 flex flex-col items-center justify-center px-6 z-10 py-4">
      <div className="relative z-10 text-center max-w-5xl mx-auto flex flex-col items-center justify-center w-full">
        {/* Top Security Status Indicator */}
        <SecurityStatus />

        {/* Cinematic Hero Heading in Instrument Serif */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontFamily: "'Instrument Serif', serif" }}
          className="text-2xl sm:text-4xl md:text-[64px] leading-[1.1] sm:leading-[1.05] font-normal tracking-[-0.02em] mb-3 bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent max-w-4xl"
        >
          See What Happened. <br className="hidden md:block" />
          Prove What Happened.
        </motion.h1>

        {/* Supporting Copy */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-white/55 text-xs md:text-sm max-w-[560px] mb-6 font-normal leading-relaxed"
        >
          Investigation, forensic evidence analysis, and defense validation in one controlled environment.
        </motion.p>

        {/* Secure Gmail + Password Authentication Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="w-full flex justify-center"
        >
          <LoginPanel
            gatewayState={gatewayState}
            onSubmit={onLoginSubmit}
            errorMessage={errorMessage}
            setErrorMessage={setErrorMessage}
            onOpenFaceLogin={onOpenFaceLogin}
            onOpenFaceRegister={onOpenFaceRegister}
          />
        </motion.div>
      </div>
    </section>
  );
};
