import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  const setMode = (newMode: TradingMode) => {
    setModeState(newMode);
    localStorage.setItem(MODE_STORAGE_KEY, newMode);
    // Sync with global mode for API requests
    setGlobalTradingMode(newMode);
    // Invalidate all queries to fetch fresh data for the new mode
    queryClient.invalidateQueries();
  };

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

  const value: TradingModeContextType = {
    mode,
    setMode,
    isLive: mode === 'live',
    isPaper: mode === 'paper',
  };

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
