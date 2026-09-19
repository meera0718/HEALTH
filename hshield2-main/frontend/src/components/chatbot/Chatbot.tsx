import React, { useEffect, useRef, useState } from 'react';
import { Bot, CircleAlert, Loader2, MessageSquare, X } from 'lucide-react';
import { sendChatMessage, type ChatTurn } from '../../services/chatbot';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';

interface ChatbotProps {
  incidentId: string;
  fullPage?: boolean;
}

export const Chatbot: React.FC<ChatbotProps> = ({ incidentId, fullPage = false }) => {
  const [isOpen, setIsOpen] = useState(fullPage);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPromptsOpen, setIsPromptsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const selectPrompt = (prompt: string) => {
    setInput(prompt);
    setIsPromptsOpen(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prompt.length, prompt.length);
    });
  };

  const submit = async () => {
    const message = input.trim();
    if (!message || isLoading) return;
    const nextMessages = [...messages, { role: 'user' as const, content: message }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setIsLoading(true);
    try {
      const response = await sendChatMessage(message, incidentId, messages);
      setMessages([...nextMessages, { role: 'assistant', content: response.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not process that request.');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {!fullPage && !isOpen && <button type="button" onClick={() => setIsOpen(true)} className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-[#0b1724] px-4 py-3 text-sm font-semibold text-cyan-100 shadow-xl shadow-black/40 transition hover:border-cyan-300 hover:bg-[#102438]" title="Open HealthShield-X AI Assistant"><MessageSquare className="h-4 w-4 text-cyan-300" /> AI Assistant</button>}
      {isOpen && (
        <section className={fullPage
          ? 'flex h-full min-h-[560px] w-full flex-col overflow-hidden rounded-xl border border-cyan-400/25 bg-[#09111b]/95 shadow-2xl shadow-black/60 backdrop-blur'
          : 'fixed bottom-4 right-4 z-30 flex h-[min(680px,calc(100vh-32px))] w-[min(460px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-cyan-400/25 bg-[#09111b]/95 shadow-2xl shadow-black/60 backdrop-blur'} aria-label="HealthShield-X AI Assistant">
          <header className="flex items-center justify-between border-b border-[#1e293b] bg-[#0d1825] px-4 py-3">
            <div className="flex items-center gap-2.5"><div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"><Bot className="h-4 w-4" /></div><div><div className="text-sm font-bold text-slate-100">HealthShield-X AI Assistant</div><div className="text-[11px] uppercase tracking-wider text-cyan-300/70">Security Intelligence Assistant</div></div></div>
            {!fullPage && <button type="button" onClick={() => setIsOpen(false)} className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label="Close assistant"><X className="h-4 w-4" /></button>}
          </header>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && <div className="flex h-full min-h-48 flex-col items-center justify-center px-8 text-center"><Bot className="mb-3 h-8 w-8 text-cyan-400/70" /><p className="text-sm font-semibold text-slate-200">Security context at your fingertips</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Ask about the current threat, evidence, attack impact, or the next SOC action. Answers are grounded in available HealthShield-X data.</p></div>}
            {messages.map((message, index) => <ChatMessage key={`${message.role}-${index}`} message={message} />)}
            {isLoading && <div className="flex items-center gap-2 text-xs text-cyan-300"><Loader2 className="h-4 w-4 animate-spin" /> Reviewing current security context...</div>}
            {error && <div className="flex items-start gap-2 rounded-md border border-rose-400/25 bg-rose-400/10 p-2.5 text-xs text-rose-200"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span></div>}
          </div>
          <ChatInput value={input} inputRef={inputRef} isLoading={isLoading} isPromptsOpen={isPromptsOpen} onChange={setInput} onSubmit={submit} onTogglePrompts={() => setIsPromptsOpen((open) => !open)} onSelectPrompt={selectPrompt} />
        </section>
      )}
    </>
  );
};