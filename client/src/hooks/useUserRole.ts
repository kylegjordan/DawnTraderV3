import { useState, useEffect } from 'react';

export type UserRole = 'owner' | 'editor' | 'viewer';

export function useUserRole() {
  const [role, setRole] = useState<UserRole>('viewer');
  const [isOwner, setIsOwner] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userRole = (user.role || 'viewer') as UserRole;
    
    setRole(userRole);
    setIsOwner(userRole === 'owner');
    setCanEdit(userRole === 'owner' || userRole === 'editor');
  }, []);

  return {
    role,
    isOwner,
    canEdit,
    isViewer: role === 'viewer'
  };
}
