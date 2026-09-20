import React from 'react';
import MoltenMetal from './MoltenMetal';

export const MoltenMetalBackground: React.FC = () => {
  return (
    <div
      className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none select-none z-0"
      aria-hidden="true"
    >
      <MoltenMetal
        color1="#2e05d3"
        color2="#7ff9e7"
        color3="#ffffff"
        speed={0.35}
        scale={4}
        detail={3}
        glow={1.6}
        coreSize={0.1}
        swirl={1}
        fold={-0.2}
        blackPoint={0.05}
        brightness={1.3}
        colorMode="molten"
        grain={true}
        grainIntensity={0.05}
        mouseInteraction={false}
        mouseStrength={0.3}
        opacity={1.0}
      />
    </div>
  );
};

export default MoltenMetalBackground;
