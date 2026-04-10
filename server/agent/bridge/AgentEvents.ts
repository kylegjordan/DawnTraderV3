export interface AgentEvent {
  type: string;
  timestamp: Date;
  payload: unknown;
}

export interface AgentEventHandler {
  on(event: string, handler: (payload: unknown) => void): void;
  emit(event: AgentEvent): void;
}

export class AgentEventBridge implements AgentEventHandler {
  private handlers: Map<string, ((payload: unknown) => void)[]> = new Map();

  on(event: string, handler: (payload: unknown) => void): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
    console.log(`[AgentEvents] Registered handler for ${event}`);
  }

  emit(event: AgentEvent): void {
    const handlers = this.handlers.get(event.type) || [];
    handlers.forEach(handler => handler(event.payload));
    console.log(`[AgentEvents] Emitted ${event.type} - stub placeholder for future agent integration`);
  }
}
