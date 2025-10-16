import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { setRequestTraceCallback } from '@/lib/queryClient';

export interface RequestTrace {
  id: string;
  timestamp: Date;
  method: string;
  endpoint: string;
  status: number | 'pending' | 'error';
  duration: number | null;
  mode: 'live' | 'paper';
  error?: string;
}

interface RequestTraceContextType {
  traces: RequestTrace[];
  addTrace: (trace: Omit<RequestTrace, 'id' | 'timestamp'>) => void;
  updateTrace: (id: string, updates: Partial<RequestTrace>) => void;
  clearTraces: () => void;
}

const RequestTraceContext = createContext<RequestTraceContextType | undefined>(undefined);

export function RequestTraceProvider({ children }: { children: ReactNode }) {
  const [traces, setTraces] = useState<RequestTrace[]>([]);

  const addTrace = useCallback((trace: Omit<RequestTrace, 'id' | 'timestamp'>) => {
    const newTrace: RequestTrace = {
      ...trace,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };
    setTraces((prev) => [newTrace, ...prev.slice(0, 99)]); // Keep last 100
  }, []);

  const updateTrace = useCallback((id: string, updates: Partial<RequestTrace>) => {
    setTraces((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  const clearTraces = useCallback(() => {
    setTraces([]);
  }, []);

  // Phase 8.5 Addendum K: Register trace callback with global system
  useEffect(() => {
    setRequestTraceCallback(addTrace);
    return () => setRequestTraceCallback(null);
  }, [addTrace]);

  return (
    <RequestTraceContext.Provider value={{ traces, addTrace, updateTrace, clearTraces }}>
      {children}
    </RequestTraceContext.Provider>
  );
}

export function useRequestTrace() {
  const context = useContext(RequestTraceContext);
  if (!context) {
    throw new Error('useRequestTrace must be used within RequestTraceProvider');
  }
  return context;
}
