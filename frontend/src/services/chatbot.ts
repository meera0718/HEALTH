export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  answer: string;
  source: 'llm' | 'deterministic';
}

export async function sendChatMessage(message: string, incidentId: string, history: ChatTurn[]): Promise<ChatResponse> {
  const response = await fetch('/api/v1/chatbot/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, incident_id: incidentId, history: history.slice(-10) })
  });

  if (!response.ok) {
    let detail = 'The security assistant is temporarily unavailable.';
    try {
      const payload = await response.json();
      if (typeof payload.detail === 'string') detail = payload.detail;
    } catch {
      // Keep the user-facing error stable when the backend does not return JSON.
    }
    throw new Error(detail);
  }

  const payload = await response.json();
  if (!payload || typeof payload.answer !== 'string') {
    throw new Error('The assistant returned an invalid response.');
  }
  return payload as ChatResponse;
}