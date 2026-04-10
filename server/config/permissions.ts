/**
 * Phase 27.3 - Central Permission Matrix
 * Single source of truth for role-based permissions
 */

export type UserRole = 'owner' | 'editor' | 'admin' | 'trader' | 'viewer';

export type Permission =
  // Trading permissions
  | 'trade_live'
  | 'trade_paper'
  | 'start_trading'
  | 'stop_trading'
  | 'modify_strategies'
  
  // Settings permissions
  | 'modify_risk_settings'
  | 'modify_goals'
  | 'modify_filters'
  | 'modify_guardrails'
  
  // Approval permissions
  | 'approve_actions'
  | 'bypass_approval'

  // System permissions
  | 'view_reports'
  | 'view_analytics'
  | 'manage_users'
  | 'manage_system'
  
  // Data permissions
  | 'view_portfolio'
  | 'view_trades'
  | 'export_data';

export interface RolePermissions {
  role: UserRole;
  permissions: Permission[];
  description: string;
}

/**
 * Central Permission Matrix
 * Defines all permissions for each role
 */
export const PERMISSION_MATRIX: Record<UserRole, RolePermissions> = {
  owner: {
    role: 'owner',
    description: 'Full system control - live trading, paper trading, approvals, all settings',
    permissions: [
      // All trading permissions
      'trade_live',
      'trade_paper',
      'start_trading',
      'stop_trading',
      'modify_strategies',
      
      // All settings permissions
      'modify_risk_settings',
      'modify_goals',
      'modify_filters',
      'modify_guardrails',
      
      // All approval permissions
      'approve_actions',
      'bypass_approval',

      // All system permissions
      'view_reports',
      'view_analytics',
      'manage_users',
      'manage_system',

      // All data permissions
      'view_portfolio',
      'view_trades',
      'export_data',
    ],
  },

  // Editor: Same as owner for backward compatibility
  editor: {
    role: 'editor',
    description: 'Full editing control - same as owner',
    permissions: [
      // All trading permissions
      'trade_live',
      'trade_paper',
      'start_trading',
      'stop_trading',
      'modify_strategies',

      // All settings permissions
      'modify_risk_settings',
      'modify_goals',
      'modify_filters',
      'modify_guardrails',

      // All approval permissions
      'approve_actions',
      'bypass_approval',

      // All system permissions
      'view_reports',
      'view_analytics',
      'manage_users',
      'manage_system',
      
      // All data permissions
      'view_portfolio',
      'view_trades',
      'export_data',
    ],
  },
  
  admin: {
    role: 'admin',
    description: 'Paper trading, approvals, report viewing, but no live trading',
    permissions: [
      // Paper trading only
      'trade_paper',
      'start_trading',
      'stop_trading',
      'modify_strategies',
      
      // Limited settings
      'modify_risk_settings',
      'modify_goals',
      'modify_filters',
      
      // Approval permissions
      'approve_actions',

      // System viewing
      'view_reports',
      'view_analytics',
      
      // Data access
      'view_portfolio',
      'view_trades',
      'export_data',
    ],
  },
  
  trader: {
    role: 'trader',
    description: 'Paper trading only - no live trading or system management',
    permissions: [
      // Paper trading only
      'trade_paper',
      'start_trading',
      'stop_trading',
      
      // Basic settings
      'modify_goals',
      'modify_filters',
      
      // Basic system access
      'view_reports',
      'view_analytics',
      
      // Data viewing
      'view_portfolio',
      'view_trades',
    ],
  },
  
  viewer: {
    role: 'viewer',
    description: 'Read-only access - no trading or modifications',
    permissions: [
      // View-only permissions
      'view_reports',
      'view_analytics',
      'view_portfolio',
      'view_trades',
    ],
  },
};

/**
 * Get permissions for a given role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return PERMISSION_MATRIX[role]?.permissions || [];
}

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  const rolePerms = PERMISSION_MATRIX[role];
  return rolePerms ? rolePerms.permissions.includes(permission) : false;
}

/**
 * Get required permission for an action
 */
export function getRequiredPermission(action: string): Permission | null {
  const actionMap: Record<string, Permission> = {
    'start_live_trading': 'trade_live',
    'stop_live_trading': 'trade_live',
    'start_paper_simulation': 'trade_paper',
    'stop_paper_simulation': 'trade_paper',
    'update_risk_per_trade': 'modify_risk_settings',
    'update_max_drawdown': 'modify_risk_settings',
    'update_max_daily_loss': 'modify_risk_settings',
    'update_trading_goal': 'modify_goals',
  };
  
  return actionMap[action] || null;
}
