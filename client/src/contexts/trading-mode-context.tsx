import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  const [mode, setModeState] = useState<TradingMode>(() => {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    return (stored === 'live' || stored === 'paper') ? stored : 'live';
  });

  const setMode = (newMode: TradingMode) => {
    setModeState(newMode);
    localStorage.setItem(MODE_STORAGE_KEY, newMode);
  };

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === MODE_STORAGE_KEY && e.newValue) {
        const newMode = e.newValue as TradingMode;
        if (newMode === 'live' || newMode === 'paper') {
          setModeState(newMode);
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
