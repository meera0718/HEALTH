type RealtimeListener = (data: any) => void;

class RealtimeStreamManager {
  private eventSource: EventSource | null = null;
  private listeners: Set<RealtimeListener> = new Set();
  private status: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' = 'DISCONNECTED';

  public connect() {
    if (this.eventSource) return;

    try {
      this.eventSource = new EventSource('/api/v1/devices/telemetry-stream');

      this.eventSource.onopen = () => {
        this.status = 'CONNECTED';
        this.notifyListeners({ type: 'STATUS_CHANGE', status: 'CONNECTED' });
      };

      this.eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.notifyListeners(parsed);
        } catch (e) {
          // Ignore JSON parse error
        }
      };

      this.eventSource.onerror = () => {
        this.status = 'RECONNECTING';
        this.notifyListeners({ type: 'STATUS_CHANGE', status: 'RECONNECTING' });
      };
    } catch (err) {
      this.status = 'DISCONNECTED';
      this.notifyListeners({ type: 'STATUS_CHANGE', status: 'DISCONNECTED' });
    }
  }

  public subscribe(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    if (!this.eventSource) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
        this.status = 'DISCONNECTED';
      }
    };
  }

  public getStatus() {
    return this.status;
  }

  private notifyListeners(data: any) {
    this.listeners.forEach(fn => {
      try {
        fn(data);
      } catch (err) {
        console.error('[RealtimeStream] Listener error:', err);
      }
    });
  }
}

export const realtimeStream = new RealtimeStreamManager();
