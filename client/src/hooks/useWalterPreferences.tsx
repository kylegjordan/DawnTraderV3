import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

export interface WalterPreferences {
  viewMode: 'compact' | 'expanded';
  theme: 'light' | 'dark' | 'system';
  tone: 'professional' | 'analytical' | 'warm' | 'concise';
  sendKeyPreference: 'enter' | 'shift_enter';
  sidebarCollapsed: boolean;
}

export function useWalterPreferences() {
  const { data, isLoading } = useQuery<{ ok: boolean; preferences: WalterPreferences }>({
    queryKey: ['/api/walter/preferences'],
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (updates: Partial<WalterPreferences>) => {
      console.log('[useWalterPreferences] Updating preferences:', updates);
      const result = await apiRequest('PUT', '/api/walter/preferences', updates);
      console.log('[useWalterPreferences] Update successful:', result);
      return result;
    },
    onSuccess: () => {
      console.log('[useWalterPreferences] Invalidating query cache');
      queryClient.invalidateQueries({ queryKey: ['/api/walter/preferences'] });
    },
    onError: (error) => {
      console.error('[useWalterPreferences] Update failed:', error);
    },
  });

  return {
    preferences: data?.preferences || {
      viewMode: 'compact',
      theme: 'system',
      tone: 'professional',
      sendKeyPreference: 'enter',
      sidebarCollapsed: false,
    },
    isLoading,
    updatePreferences: updatePreferencesMutation.mutate,
    isUpdating: updatePreferencesMutation.isPending,
  };
}
