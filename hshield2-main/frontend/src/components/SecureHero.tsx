import React from 'react';
import { motion } from 'motion/react';
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
    <section className="relative flex flex-col items-center justify-center px-4 z-10 w-full shrink-0">
      <div className="relative z-10 text-center max-w-4xl mx-auto flex flex-col items-center justify-center w-full">
        {/* Cinematic Hero Tagline in Instrument Serif */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ fontFamily: "'Instrument Serif', serif" }}
          className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] leading-tight font-normal tracking-[-0.01em] mb-2 sm:mb-3 bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent"
        >
          See What Happened. <br className="hidden sm:inline" />
          Prove What Happened.
        </motion.h1>

        {/* Secure Gmail + Password Authentication Panel */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
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
