import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { ensureValidToken } from "./auth";
import { apiFetch } from "./api";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Global trading mode accessor - updated by TradingModeContext
// Default to 'live' to match TradingModeContext default
let currentTradingMode: 'live' | 'paper' = 'live';

export function setGlobalTradingMode(mode: 'live' | 'paper') {
  currentTradingMode = mode;
}

export function getGlobalTradingMode(): 'live' | 'paper' {
  return currentTradingMode;
}

// Phase 8.5 Addendum K: Global request trace recorder
type TraceCallback = (trace: {
  method: string;
  endpoint: string;
  status: number | 'pending' | 'error';
  duration: number | null;
  mode: 'live' | 'paper';
  error?: string;
}) => void;

let globalTraceCallback: TraceCallback | null = null;

export function setRequestTraceCallback(callback: TraceCallback | null) {
  globalTraceCallback = callback;
}

function recordTrace(trace: Parameters<TraceCallback>[0]) {
  if (globalTraceCallback && import.meta.env.DEV) {
    globalTraceCallback(trace);
  }
}

export async function apiRequest<T = any>(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<T> {
  const startTime = Date.now();
  const token = await ensureValidToken();
  
  const headers: Record<string, string> = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    "x-app-mode": currentTradingMode
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    const duration = Date.now() - startTime;

    await throwIfResNotOk(res);
    
    // Phase 8.5 Addendum K: Record successful trace
    recordTrace({
      method,
      endpoint: url,
      status: res.status,
      duration,
      mode: currentTradingMode,
    });
    
    // For DELETE requests or 204 responses, return empty object
    if (method === 'DELETE' || res.status === 204) {
      return {} as T;
    }
    
    return await res.json();
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Phase 8.5 Addendum K: Record error trace
    recordTrace({
      method,
      endpoint: url,
      status: 'error',
      duration,
      mode: currentTradingMode,
      error: error instanceof Error ? error.message : String(error),
    });
    
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = await ensureValidToken();
    
    const headers: Record<string, string> = {
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      "x-app-mode": currentTradingMode
    };
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Phase 33.C: Updated QueryClient with apiFetch as default fetcher
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Use apiFetch as default fetcher - automatically includes credentials and timeout
      queryFn: ({ queryKey }) => apiFetch(queryKey[0] as string),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 15000, // Phase 33.C: 15 second stale time
      retry: 1, // Phase 33.C: Retry once on failure
      gcTime: Infinity,
    },
    mutations: {
      retry: false,
    },
  },
});
