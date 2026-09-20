import React from 'react';
import { Bot, UserRound } from 'lucide-react';
import type { ChatTurn } from '../../services/chatbot';

export const ChatMessage: React.FC<{ message: ChatTurn }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div className={`max-w-[82%] whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm leading-relaxed ${isUser
        ? 'border-pink-400/25 bg-pink-400/10 text-slate-100'
        : 'border-cyan-400/20 bg-[#101d2b] text-slate-200'}`}>
        {message.content}
      </div>
      {isUser && (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-pink-400/30 bg-pink-400/10 text-pink-300">
          <UserRound className="h-4 w-4" />
        </div>
      )}
    </div>
  );
};