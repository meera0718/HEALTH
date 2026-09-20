import React from 'react';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';

const promptGroups = [
  { label: 'Security & Detection', prompts: ['What is the current security status?', 'What threats have been detected?', 'Why was this activity classified as a threat?', 'What is the severity of the incident?'] },
  { label: 'Incident & Investigation', prompts: ['What happened during this incident?', 'What is the likely source of the attack?', 'Which system was targeted?', 'How did the attack progress through the system?'] },
  { label: 'Evidence & Forensics', prompts: ['What evidence supports the attack analysis?', 'What is the current FEC score?', 'What evidence is still missing?'] },
  { label: 'Attack & Impact', prompts: ['What is the identified attack path?', 'Which assets could the attacker reach?', 'What is the potential blast radius?'] },
  { label: 'Patient Impact', prompts: ['Could this incident affect patients?', 'Could patient data have been exposed?', 'What is the potential patient-safety impact?'] },
  { label: 'Recommendations', prompts: ['What should we do first to contain the threat?', 'What should the SOC team investigate next?', 'What should we monitor after containment?'] }
];

interface QuickPromptsProps {
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (prompt: string) => void;
}

export const QuickPrompts: React.FC<QuickPromptsProps> = ({ isOpen, onToggle, onSelect }) => (
  <div className="relative">
    <button type="button" onClick={onToggle} className="flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20" aria-expanded={isOpen}>
      <Zap className="h-3.5 w-3.5" /> Quick Prompts {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
    </button>
    {isOpen && (
      <div className="absolute bottom-11 left-0 z-30 max-h-[min(60vh,420px)] w-[min(340px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-cyan-400/25 bg-[#0b1420] p-2 shadow-2xl shadow-black/50">
        {promptGroups.map((group) => (
          <div key={group.label} className="mb-2 last:mb-0">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-pink-300/80">{group.label}</div>
            {group.prompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => onSelect(prompt)} className="block w-full rounded px-2 py-1.5 text-left text-xs text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-100">{prompt}</button>
            ))}
          </div>
        ))}
      </div>
    )}
  </div>
);