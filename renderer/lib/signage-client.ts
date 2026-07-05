interface FontAsset {
  id: string;
  family: string;
  ext: string;
}

export interface SignageState {
  slides: unknown[];
  fonts?: FontAsset[];
  templates?: unknown[];
  transitionMs: number;
  updatedAt: number;
}

export async function fetchSignageState(): Promise<SignageState> {
  if (window.electronAPI) {
    return window.electronAPI.getSignageState();
  }
  const res = await fetch("/api/state");
  if (!res.ok) {
    throw new Error(`Failed to load signage state: ${res.status}`);
  }
  return res.json() as Promise<SignageState>;
}

export function subscribeSignageChanged(callback: (state: SignageState) => void): () => void {
  if (window.electronAPI) {
    return window.electronAPI.onSignageChanged(callback);
  }

  const es = new EventSource("/api/events");
  es.onmessage = (event) => {
    try {
      callback(JSON.parse(event.data) as SignageState);
    } catch (err) {
      console.error("[signage-client] Invalid SSE payload", err);
    }
  };
  return () => es.close();
}
