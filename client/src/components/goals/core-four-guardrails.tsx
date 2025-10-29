import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Shield, Save, Lock, Unlock, Info, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useOverrideState } from "@/hooks/use-override-state";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ModeIndicator } from "./mode-indicator";

/**
 * Phase 3b: Core Four Guardrails Component
 * 
 * Displays the modernized Core Four guardrails with Lottie/Manual override controls.
 * Integrates with guardrails_v2 backend and provides real-time WebSocket sync.
 */

interface GuardrailsV2 {
  mode: string;
  portfolioRiskPerTradePct: number;
  symbolCooldownMinutes: number;
  maxOpenPositions: number;
  dailyLossKillSwitchPct: number;
  isManualOverride: boolean;
  tunedByLatti: boolean;
  lockedByUser: Record<string, boolean>;
}

interface GuardrailParam {
  key: keyof Pick<GuardrailsV2, 'portfolioRiskPerTradePct' | 'symbolCooldownMinutes' | 'maxOpenPositions' | 'dailyLossKillSwitchPct'>;
  label: string;
  description: string;
  unit: string;
}

const CORE_FOUR_PARAMS: GuardrailParam[] = [
  {
    key: 'portfolioRiskPerTradePct',
    label: 'Portfolio Risk per Trade',
    description: 'Percentage of portfolio value at risk per trade',
    unit: '%'
  },
  {
    key: 'symbolCooldownMinutes',
    label: 'Symbol Cooldown',
    description: 'Minimum time between trades on the same symbol',
    unit: 'minutes'
  },
  {
    key: 'maxOpenPositions',
    label: 'Max Open Positions',
    description: 'Maximum concurrent open positions',
    unit: 'count'
  },
  {
    key: 'dailyLossKillSwitchPct',
    label: 'Daily Loss Kill Switch',
    description: 'Portfolio loss threshold that triggers emergency shutdown',
    unit: '%'
  }
];

export function CoreFourGuardrails() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  const [hasChanges, setHasChanges] = useState(false);
  const [editedValues, setEditedValues] = useState<Partial<GuardrailsV2>>({});
  
  // Phase 3b: WebSocket integration for real-time sync
  useOverrideState();

  // Fetch Core Four Guardrails from guardrails_v2 endpoint
  const { data: guardrails, isLoading } = useQuery<{ok: boolean; data: GuardrailsV2}>({
    queryKey: ['/api/guardrails-v2', mode],
    queryFn: async () => {
      const response = await fetch(`/api/guardrails-v2?mode=${mode}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch Core Four guardrails');
      }
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<GuardrailsV2>) => {
      const response = await fetch(`/api/guardrails-v2?mode=${mode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      
      if (!response.ok || data.ok === false) {
        throw new Error(data.detail || data.error || 'Failed to update guardrails');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/guardrails-v2', mode],
        refetchType: 'all'
      });
      toast({
        title: "Core Four Guardrails updated",
        description: `Risk parameters have been saved successfully for ${mode} mode.`,
      });
      setHasChanges(false);
      setEditedValues({});
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update guardrails",
        variant: "destructive",
      });
    },
  });

  const handleValueChange = (key: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setEditedValues(prev => ({ ...prev, [key]: numValue }));
    setHasChanges(true);
  };

  const handleToggleLock = async (paramKey: string, currentLocked: boolean) => {
    const newLockedState = !currentLocked;
    const currentLockedByUser = guardrails?.data?.lockedByUser || {};
    
    const updates = {
      lockedByUser: {
        ...currentLockedByUser,
        [paramKey]: newLockedState
      }
    };
    
    console.log('[CoreFourGuardrails] Toggle lock:', { paramKey, currentLocked, newLockedState, updates });
    
    try {
      console.log('[CoreFourGuardrails] Calling mutation...', updates);
      await updateMutation.mutateAsync(updates);
      console.log('[CoreFourGuardrails] Mutation succeeded');
      toast({
        title: newLockedState ? "Saved ✅" : "Saved ✅",
        description: `${CORE_FOUR_PARAMS.find(p => p.key === paramKey)?.label} is now ${newLockedState ? 'manually controlled' : 'managed by LATTi'}`,
      });
    } catch (error: any) {
      console.error('[CoreFourGuardrails] Mutation failed:', error);
      toast({
        title: "Save failed ❌",
        description: error?.message || "Failed to save guardrail override",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    updateMutation.mutate(editedValues);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Core Four Guardrails (LATTi-Managed)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!guardrails?.data) {
    return null;
  }

  const data = guardrails.data;

  return (
    <Card className="border-2 border-blue-200 dark:border-blue-900">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Core Four Guardrails (LATTi-Managed)
              <ModeIndicator />
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Autonomous risk parameters optimized by LATTi. Toggle to manual control when needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data.tunedByLatti && !data.isManualOverride && (
              <Badge variant="default" className="bg-green-600" data-testid="badge-latti-managed">
                <Sparkles className="w-3 h-3 mr-1" />
                Auto-tuned by LATTi
              </Badge>
            )}
            {data.isManualOverride && (
              <Badge variant="secondary" data-testid="badge-manual-override">
                <Lock className="w-3 h-3 mr-1" />
                Manual Override Active
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="mt-6">
        <div className="space-y-6">
          {CORE_FOUR_PARAMS.map((param) => {
            const isLocked = data.lockedByUser?.[param.key] || false;
            const currentValue = editedValues[param.key] ?? data[param.key];
            
            return (
              <div key={param.key} className="p-4 border rounded-lg bg-muted/30">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor={param.key} className="text-base font-semibold">
                        {param.label}
                      </Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-4 h-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">{param.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {param.description}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {isLocked ? 'Manual' : 'LATTi'}
                            </span>
                            <Switch
                              checked={isLocked}
                              onCheckedChange={() => handleToggleLock(param.key, isLocked)}
                              data-testid={`switch-lock-${param.key}`}
                            />
                            {isLocked ? (
                              <Unlock className="w-4 h-4 text-amber-600" />
                            ) : (
                              <Lock className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">
                            {isLocked 
                              ? 'Switch to LATTi autotuning for this parameter'
                              : 'Switch to manual override for this parameter'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Input
                    id={param.key}
                    type="number"
                    step="0.1"
                    value={currentValue}
                    onChange={(e) => handleValueChange(param.key, e.target.value)}
                    disabled={!isLocked && !hasChanges}
                    className={isLocked ? 'bg-white dark:bg-slate-950' : 'bg-muted'}
                    data-testid={`input-${param.key}`}
                  />
                  <span className="text-sm text-muted-foreground min-w-[80px]">
                    {param.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {hasChanges && (
          <div className="mt-6 flex justify-end">
            <Button 
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-core-four"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-100">
              <p className="font-semibold mb-1">About LATTi Autonomous Optimization</p>
              <p className="text-blue-700 dark:text-blue-200/80">
                When parameters are managed by LATTi (toggle off), they are automatically optimized based on market conditions and performance data. 
                Enable manual override (toggle on) to take direct control of specific parameters.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
