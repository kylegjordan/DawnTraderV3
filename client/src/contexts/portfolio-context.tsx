import { createContext, useContext, ReactNode } from 'react';

export interface PortfolioOverview {
  totalValue: number;
  cash: number;
  crypto: number;
  cashPercent: number;
  cryptoPercent: number;
  unrealizedPL: number;
  realizedPL: number;
  openTradesCount: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  currentExposure: number;
  balanceSource?: string;
  balanceError?: string;
  syncTimestamp?: number;
}

const PortfolioContext = createContext<PortfolioOverview | null>(null);

export function usePortfolioContext() {
  return useContext(PortfolioContext);
}

interface PortfolioProviderProps {
  children: ReactNode;
  value: PortfolioOverview | null;
}

export function PortfolioProvider({ children, value }: PortfolioProviderProps) {
  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}
