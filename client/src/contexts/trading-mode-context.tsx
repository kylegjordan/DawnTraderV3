import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { setGlobalTradingMode, queryClient } from '@/lib/queryClient';
import { useWebSocket } from '@/hooks/use-websocket';

type TradingMode = 'live' | 'paper';

interface TradingModeContextType {
  mode: TradingMode;
  setMode: (mode: TradingMode) => void;
  isLive: boolean;
  isPaper: boolean;
}

const TradingModeContext = createContext<TradingModeContextType | undefined>(undefined);

const MODE_STORAGE_KEY = 'trading_mode_preference';

export function TradingModeProvider({ children }: { children: ReactNode }) {
  const { messages: wsMessages } = useWebSocket();
  const [mode, setModeState] = useState<TradingMode>(() => {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    const initialMode = (stored === 'live' || stored === 'paper') ? stored : 'live';
    // Sync with global mode on init
    setGlobalTradingMode(initialMode);
    return initialMode;
  });

  // Phase 27.F.24: Wrap setMode in useCallback for stable reference
  // REB 2.8.9: Only invalidate queries when mode ACTUALLY changes to prevent polling disruption
  const setMode = useCallback((newMode: TradingMode) => {
    setModeState((currentMode) => {
      if (currentMode === newMode) {
        return currentMode;
      }
      console.log('[UI] Auto-refresh triggered on mode switch:', currentMode, '->', newMode);
      localStorage.setItem(MODE_STORAGE_KEY, newMode);
      setGlobalTradingMode(newMode);
      queryClient.invalidateQueries();
      console.log('[UI] Mode switch complete - all queries invalidated for:', newMode);
      return newMode;
    });
  }, []);

  // Phase 27.4.2: Listen for trading_state_changed WebSocket events
  useEffect(() => {
    const stateChanges = wsMessages.filter((msg: any) => msg.type === 'trading_state_changed');
    if (stateChanges.length > 0) {
      // Get the latest state change
      const latestChange = stateChanges[stateChanges.length - 1];
      const newMode = latestChange.payload?.mode;
      
      if (newMode && (newMode === 'live' || newMode === 'paper') && newMode !== mode) {
        console.log('[TradingMode] Received trading_state_changed:', newMode);
        setModeState(newMode);
        localStorage.setItem(MODE_STORAGE_KEY, newMode);
        setGlobalTradingMode(newMode);
        // Invalidate all queries to fetch fresh data for the new mode
        queryClient.invalidateQueries();
      }
    }
  }, [wsMessages, mode]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === MODE_STORAGE_KEY && e.newValue) {
        const newMode = e.newValue as TradingMode;
        if (newMode === 'live' || newMode === 'paper') {
          setModeState(newMode);
          // Sync with global mode
          setGlobalTradingMode(newMode);
          // Invalidate all queries to fetch fresh data for the new mode
          queryClient.invalidateQueries();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Phase 27.F.24: Memoize context value to prevent unnecessary re-renders
  // Only recreate value when mode actually changes, not on every WebSocket message
  const value: TradingModeContextType = useMemo(() => {
    console.log('[Phase 27.F.24][TradingModeContext] Creating new context value for mode:', mode);
    return {
      mode,
      setMode,
      isLive: mode === 'live',
      isPaper: mode === 'paper',
    };
  }, [mode, setMode]);

  return (
    <TradingModeContext.Provider value={value}>
      {children}
    </TradingModeContext.Provider>
  );
}

export function useTradingMode() {
  const context = useContext(TradingModeContext);
  if (!context) {
    throw new Error('useTradingMode must be used within TradingModeProvider');
  }
  return context;
}
