import { useState, useEffect } from 'react';

export type UserRole = 'owner' | 'editor' | 'admin' | 'trader' | 'viewer';
export type Permission = 
  // Trading permissions
  | 'trade_live'
  | 'trade_paper'
  | 'start_live_trading'
  | 'stop_live_trading'
  | 'start_paper_trading'
  | 'stop_paper_trading'
  // Settings permissions
  | 'modify_strategies'
  | 'modify_risk_settings'
  | 'modify_system_settings'
  | 'toggle_kill_switch'
  // Approval permissions
  | 'approve_high_risk'
  | 'approve_medium_risk'
  | 'approve_low_risk'
  // System permissions
  | 'view_system_health'
  | 'trigger_diagnostics'
  | 'access_admin_panel'
  // Data permissions
  | 'view_portfolio'
  | 'view_trade_history'
  | 'view_users';

interface UserData {
  id: string;
  username: string;
  role: UserRole;
  permissions: Permission[];
  isAdmin?: boolean;
}

export function useUserRole() {
  const [role, setRole] = useState<UserRole>('viewer');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    loadUserData();
    
    // Listen for storage changes (when login happens in another tab or after permission updates)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user' || e.key === 'permissions') {
        loadUserData();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const loadUserData = () => {
    const user: UserData = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = (user.role || 'viewer') as UserRole;
    const userPermissions = user.permissions || [];
    
    setRole(userRole);
    setPermissions(userPermissions);
    setIsOwner(userRole === 'owner');
    setCanEdit(userRole === 'owner' || userRole === 'editor');
  };

  /**
   * Check if user has a specific permission
   * Phase 27.3: Unified permission check
   * Phase 27.F.1: Owner and admin roles have all permissions automatically
   */
  const can = (permission: Permission): boolean => {
    // Owner and admin roles have all permissions
    if (role === 'owner' || role === 'admin') {
      return true;
    }
    return permissions.includes(permission);
  };

  /**
   * Check if user has ANY of the specified permissions
   */
  const canAny = (...perms: Permission[]): boolean => {
    return perms.some(p => permissions.includes(p));
  };

  /**
   * Check if user has ALL of the specified permissions
   */
  const canAll = (...perms: Permission[]): boolean => {
    return perms.every(p => permissions.includes(p));
  };

  return {
    role,
    permissions,
    isOwner,
    canEdit,
    isViewer: role === 'viewer',
    isAdmin: role === 'admin',
    isTrader: role === 'trader',
    isEditor: role === 'editor',
    can,
    canAny,
    canAll,
  };
}
