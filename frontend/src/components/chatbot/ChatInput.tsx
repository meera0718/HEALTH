import React from 'react';
import type { RefObject } from 'react';
import { Send } from 'lucide-react';
import { QuickPrompts } from './QuickPrompts';

interface ChatInputProps {
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  isPromptsOpen: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onTogglePrompts: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ value, inputRef, isLoading, isPromptsOpen, onChange, onSubmit, onTogglePrompts, onSelectPrompt }) => (
  <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="border-t border-[#1e293b] bg-[#0a111b] p-3">
    <div className="flex items-end gap-2">
      <QuickPrompts isOpen={isPromptsOpen} onToggle={onTogglePrompts} onSelect={onSelectPrompt} />
      <input ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} disabled={isLoading} placeholder="Ask about threats, evidence, impact, or next steps..." className="min-w-0 flex-1 rounded-md border border-[#26384c] bg-[#111c29] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400" />
      <button type="submit" disabled={isLoading || !value.trim()} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-500 text-[#061018] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">
        <Send className="h-4 w-4" />
      </button>
    </div>
    <div className="mt-2 text-[11px] text-slate-500">Enter to send. Quick prompts stay editable until you send them.</div>
  </form>
);