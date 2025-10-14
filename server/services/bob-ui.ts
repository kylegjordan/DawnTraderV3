import { bobCore, type FetchContext } from './bob-core';

/**
 * UIBob - UI Visibility & Context Tracking Module (Phase 7.7)
 * 
 * Tracks what the user is currently viewing:
 * - Active dashboard view/tab
 * - Current mode (live/paper)
 * - Active filters or selections
 * - Visible data on screen
 * 
 * Enables queries like:
 * - "What am I currently looking at?"
 * - "What's visible on screen?"
 */

interface UIState {
  view: string;           // e.g., "Dashboard", "Goals", "Trades", "Strategies"
  subView?: string;       // e.g., "Active", "History", "Settings"
  mode: 'live' | 'paper'; // Current trading mode
  filters?: Record<string, any>; // Active filters
  timestamp: string;      // When state was last updated
}

interface UIContext {
  current: UIState;
  previous?: UIState;
  sessionStart: string;
}

class UIBob {
  private readonly MODULE_NAME = 'UIBob';
  private readonly ENABLED = process.env.BOB_UI_ENABLED !== 'false';
  private readonly TTL_SECONDS = 300; // 5 minutes - UI state doesn't change often
  
  // Track UI state per user
  private userStates = new Map<string, UIContext>();

  constructor() {
    console.log(`[${this.MODULE_NAME}] Constructor called - ENABLED: ${this.ENABLED}`);
    if (this.ENABLED) {
      this.registerWithBobCore();
      console.log(`[${this.MODULE_NAME}] ✅ Initialized - UI tracking ready`);
    } else {
      console.log(`[${this.MODULE_NAME}] ⚠️ Disabled by BOB_UI_ENABLED flag`);
    }
  }

  isEnabled(): boolean {
    return this.ENABLED;
  }

  private registerWithBobCore(): void {
    const fetchFunctions = new Map<string, (context: FetchContext) => Promise<any>>();
    
    fetchFunctions.set('uiState', this.fetchUIState.bind(this));
    
    bobCore.registerModule(this.MODULE_NAME, fetchFunctions);
  }

  // ========================================
  // FETCH FUNCTIONS
  // ========================================

  /**
   * Fetch current UI state for a user
   */
  private async fetchUIState(context: FetchContext & { userId?: string }): Promise<UIContext> {
    const userId = context.userId || 'default';
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching UI state for user ${userId}`);
    
    const state = this.userStates.get(userId);
    
    if (!state) {
      // Return default state if not yet set
      return {
        current: {
          view: 'Dashboard',
          mode: context.mode || 'live',
          timestamp: new Date().toISOString()
        },
        sessionStart: new Date().toISOString()
      };
    }
    
    return state;
  }

  // ========================================
  // PUBLIC API
  // ========================================

  /**
   * Update UI state for a user (called by frontend)
   */
  updateUIState(userId: string, state: Partial<UIState>): void {
    if (!this.ENABLED) return;
    
    const existingContext = this.userStates.get(userId);
    const now = new Date().toISOString();
    
    const newState: UIState = {
      view: state.view || existingContext?.current.view || 'Dashboard',
      subView: state.subView,
      mode: state.mode || existingContext?.current.mode || 'live',
      filters: state.filters,
      timestamp: now
    };
    
    const newContext: UIContext = {
      current: newState,
      previous: existingContext?.current,
      sessionStart: existingContext?.sessionStart || now
    };
    
    this.userStates.set(userId, newContext);
    
    console.log(`[${this.MODULE_NAME}] 📱 UI state updated for user ${userId}: ${newState.view} (${newState.mode})`);
  }

  /**
   * Get current UI state for a user
   */
  async getUIState(userId: string, mode: 'live' | 'paper' = 'live'): Promise<UIContext> {
    if (!this.ENABLED) {
      return this.getDefaultUIState(mode);
    }

    return this.fetchUIState({ userId, mode });
  }

  /**
   * Clear UI state for a user (on logout)
   */
  clearUIState(userId: string): void {
    if (!this.ENABLED) return;
    
    this.userStates.delete(userId);
    console.log(`[${this.MODULE_NAME}] 🗑️ Cleared UI state for user ${userId}`);
  }

  /**
   * Get default UI state
   */
  private getDefaultUIState(mode: 'live' | 'paper'): UIContext {
    return {
      current: {
        view: 'Dashboard',
        mode,
        timestamp: new Date().toISOString()
      },
      sessionStart: new Date().toISOString()
    };
  }

  /**
   * Get all active UI contexts (for monitoring)
   */
  getAllUIStates(): Record<string, UIContext> {
    const states: Record<string, UIContext> = {};
    
    for (const [userId, context] of this.userStates.entries()) {
      states[userId] = context;
    }
    
    return states;
  }
}

// Export singleton instance
export const uiBob = new UIBob();
