export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

export const MAX_HONEYPOT_LIMIT = 500;
export const MIN_HONEYPOT_LIMIT = 1;

export function sanitizeHoneypotLimit(limit: number | string): number {
  const parsed = typeof limit === 'number' ? limit : parseInt(String(limit), 10);
  if (isNaN(parsed) || parsed < MIN_HONEYPOT_LIMIT) return MIN_HONEYPOT_LIMIT;
  return Math.min(parsed, MAX_HONEYPOT_LIMIT);
}

export function sanitizeUrlLimit(url: string): string {
  if (!url.includes('limit=')) return url;
  return url.replace(/([?&]limit=)(\d+)/g, (_match, prefix, valStr) => {
    const safe = sanitizeHoneypotLimit(valStr);
    return `${prefix}${safe}`;
  });
}

const pendingRequests = new Map<string, Promise<any>>();

export async function apiRequest<T = any>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { timeoutMs = 5000, ...customConfig } = options;
  const rawUrl = endpoint.startsWith('/') ? endpoint : `/api/v1/${endpoint}`;
  const url = sanitizeUrlLimit(rawUrl);
  
  // Deduplicate GET requests to prevent request chaos
  const requestKey = `${customConfig.method || 'GET'}:${url}`;
  if ((!customConfig.method || customConfig.method === 'GET') && pendingRequests.has(requestKey)) {
    return pendingRequests.get(requestKey) as Promise<T>;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const requestPromise = (async () => {
    try {
      const response = await fetch(url, {
        ...customConfig,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(customConfig.headers || {})
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errData = await response.json();
          if (errData.detail) errMessage = errData.detail;
        } catch (e) {
          // Fallback to HTTP status text
        }
        throw new Error(errMessage);
      }

      return (await response.json()) as T;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout (${timeoutMs}ms) for ${url}`);
      }
      throw error;
    } finally {
      pendingRequests.delete(requestKey);
    }
  })();

  if (!customConfig.method || customConfig.method === 'GET') {
    pendingRequests.set(requestKey, requestPromise);
  }

  return requestPromise;
}
