export interface GuardrailConfig {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  allowedSymbols: string[];
}

export interface GuardrailAdapter {
  validateTrade(symbol: string, quantity: number, price: number): Promise<boolean>;
  checkDailyLoss(): Promise<boolean>;
  getConfig(): GuardrailConfig;
}

export class GuardrailAdapterStub implements GuardrailAdapter {
  private config: GuardrailConfig = {
    maxPositionSize: 10000,
    maxDailyLoss: 1000,
    maxDrawdown: 0.1,
    allowedSymbols: ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"]
  };

  async validateTrade(symbol: string, quantity: number, price: number): Promise<boolean> {
    console.log(`[GuardrailAdapter] validateTrade(${symbol}, ${quantity}, ${price}) - stub placeholder`);
    return true;
  }

  async checkDailyLoss(): Promise<boolean> {
    console.log(`[GuardrailAdapter] checkDailyLoss() - stub placeholder`);
    return true;
  }

  getConfig(): GuardrailConfig {
    return this.config;
  }
}
