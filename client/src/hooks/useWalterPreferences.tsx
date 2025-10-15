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
      return await apiRequest('PUT', '/api/walter/preferences', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/walter/preferences'] });
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
