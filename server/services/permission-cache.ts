/**
 * Phase 27.3 - Permission Cache Service
 * In-memory cache for fast permission lookups
 */

import { UserRole, Permission, getPermissionsForRole, PERMISSION_MATRIX } from '../config/permissions';

interface UserPermissions {
  userId: string;
  role: UserRole;
  permissions: Permission[];
  cachedAt: Date;
}

class PermissionCacheService {
  private cache: Map<string, UserPermissions> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Initialize cache at startup
   */
  async initialize(): Promise<void> {
    console.log('[PermissionCache] Initializing permission cache...');
    console.log('[PermissionCache] Loaded permission matrix:');
    
    for (const [role, config] of Object.entries(PERMISSION_MATRIX)) {
      console.log(`  - ${role}: ${config.permissions.length} permissions`);
    }
    
    console.log('[PermissionCache] ✅ Permission cache initialized');
  }

  /**
   * Get permissions for a user
   */
  async getUserPermissions(userId: string, role: UserRole): Promise<Permission[]> {
    const cached = this.cache.get(userId);
    
    // Return cached if valid and role matches
    if (cached && cached.role === role && !this.isCacheExpired(cached.cachedAt)) {
      return cached.permissions;
    }
    
    // Refresh cache
    const permissions = getPermissionsForRole(role);
    this.cache.set(userId, {
      userId,
      role,
      permissions,
      cachedAt: new Date(),
    });
    
    console.log(`[PermissionCache] Synced permissions for user ${userId} (${role}): ${permissions.length} permissions`);
    
    return permissions;
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(userId: string, role: UserRole, permission: Permission): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, role);
    return permissions.includes(permission);
  }

  /**
   * Check if user can perform an action
   */
  async canPerformAction(userId: string, role: UserRole, requiredPermission: Permission): Promise<boolean> {
    return await this.hasPermission(userId, role, requiredPermission);
  }

  /**
   * Invalidate cache for a user (e.g., after role change)
   */
  invalidateUser(userId: string): void {
    this.cache.delete(userId);
    console.log(`[PermissionCache] Invalidated cache for user ${userId}`);
  }

  /**
   * Invalidate all cache (e.g., after permission matrix update)
   */
  invalidateAll(): void {
    this.cache.clear();
    console.log('[PermissionCache] Invalidated all cached permissions');
  }

  /**
   * Check if cache entry is expired
   */
  private isCacheExpired(cachedAt: Date): boolean {
    return Date.now() - cachedAt.getTime() > this.CACHE_TTL;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.size,
      users: Array.from(this.cache.values()).map(u => ({
        userId: u.userId,
        role: u.role,
        permissionCount: u.permissions.length,
        cachedAt: u.cachedAt,
      })),
    };
  }
}

// Export singleton instance
export const permissionCache = new PermissionCacheService();
