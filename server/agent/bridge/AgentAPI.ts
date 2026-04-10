export interface AgentAPI {
  planStrategy(mode: "paper" | "live"): Promise<void>;
  rebalance(): Promise<void>;
  adjustRisk(level: number): Promise<void>;
}

export class AgentAPIStub implements AgentAPI {
  async planStrategy(mode: "paper" | "live"): Promise<void> {
    console.log(`[AgentAPI] planStrategy(${mode}) - stub placeholder for future agent integration`);
  }

  async rebalance(): Promise<void> {
    console.log(`[AgentAPI] rebalance() - stub placeholder for future agent integration`);
  }

  async adjustRisk(level: number): Promise<void> {
    console.log(`[AgentAPI] adjustRisk(${level}) - stub placeholder for future agent integration`);
  }
}
