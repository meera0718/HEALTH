export interface UnauthorizedAccessPayload {
  event_type: 'UNAUTHORIZED_ACCESS_ATTEMPT';
  source: 'SECURE_GATEWAY';
  timestamp: string;
  path: string;
  user_agent: string;
}

export interface SecurityAlertResult {
  recorded: boolean;
  reference_id: string;
}

export async function recordUnauthorizedAccessAttempt(path: string = '/'): Promise<SecurityAlertResult> {
  const reference_id = `HSX-${Math.floor(100000 + Math.random() * 900000)}`;
  
  const payload: UnauthorizedAccessPayload = {
    event_type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
    source: 'SECURE_GATEWAY',
    timestamp: new Date().toISOString(),
    path,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
  };

  try {
    const res = await fetch('/api/v1/security/access-attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      return { recorded: true, reference_id: data.reference_id || reference_id };
    }
  } catch (err) {
    console.warn('Backend security audit endpoint unreachable, logged locally.', err);
  }

  return { recorded: true, reference_id };
}
