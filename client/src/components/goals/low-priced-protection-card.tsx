import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Shield, Save, Lock, Unlock, Info, Sparkles, AlertTriangle } from "lucide-react";
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
 * REB 8.8.3-H: Low-Priced Coin Protection (LPCP) Card
 * 
 * Displays the three LPCP guardrails with LATTi/Manual override controls.
 * Placed below Core Guardrails on the Goals → Guardrails tab.
 */

interface LPCPSettings {
  lowPriceMinStopAtrMult: number;
  lowPriceMinPositionNotional: number;
  lowPriceThreshold: number;
  isManualOverride: boolean;
  tunedByLatti: boolean;
  lockedByUser: Record<string, boolean>;
}

interface LPCPParam {
  key: keyof Pick<LPCPSettings, 'lowPriceMinStopAtrMult' | 'lowPriceMinPositionNotional' | 'lowPriceThreshold'>;
  label: string;
  description: string;
  unit: string;
  step: string;
}

const LPCP_PARAMS: LPCPParam[] = [
  {
    key: 'lowPriceThreshold',
    label: 'Low-Price Threshold',
    description: 'Coins with price at or below this value activate the low-priced protection rules.',
    unit: 'USD',
    step: '0.01'
  },
  {
    key: 'lowPriceMinStopAtrMult',
    label: 'Minimum Stop Distance (ATR-Multiple)',
    description: 'For low-priced coins, the stop-loss distance will never be smaller than this ATR multiple. Prevents ultra-tight stops caused by tiny price values.',
    unit: '× ATR',
    step: '0.1'
  },
  {
    key: 'lowPriceMinPositionNotional',
    label: 'Minimum Trade Notional',
    description: 'The minimum USD value allowed for a low-priced coin trade. Smaller trades will be rejected to avoid noise and micro-positions.',
    unit: 'USD',
    step: '1'
  }
];

export function LowPricedProtectionCard() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  const [hasChanges, setHasChanges] = useState(false);
  const [editedValues, setEditedValues] = useState<Partial<LPCPSettings>>({});
  
  useOverrideState();

  const { data: guardrails, isLoading } = useQuery<{ok: boolean; data: any}>({
    queryKey: ['/api/guardrails-v2', mode],
    queryFn: async () => {
      const response = await fetch(`/api/guardrails-v2?mode=${mode}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch LPCP settings');
      }
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<LPCPSettings>) => {
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
        throw new Error(data.detail || data.error || 'Failed to update LPCP settings');
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/guardrails-v2', mode],
        refetchType: 'all'
      });
      toast({
        title: "LPCP Settings updated",
        description: `Low-priced coin protection settings have been saved for ${mode} mode.`,
      });
      setHasChanges(false);
      setEditedValues({});
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update LPCP settings",
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
    
    try {
      await updateMutation.mutateAsync(updates);
      toast({
        title: "Saved",
        description: `${LPCP_PARAMS.find(p => p.key === paramKey)?.label} is now ${newLockedState ? 'manually controlled' : 'managed by LATTi'}`,
      });
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Failed to save LPCP override",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    updateMutation.mutate(editedValues);
  };

  if (isLoading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Low-Priced Coin Protection (LPCP)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!guardrails?.data) {
    return null;
  }

  const data = guardrails.data;

  return (
    <Card className="mt-6 border-2 border-amber-200 dark:border-amber-900">
      <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              Low-Priced Coin Protection (LPCP)
              <ModeIndicator />
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Protects against erratic position sizing for coins with very low prices (e.g., below $0.50).
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data.tunedByLatti && !data.isManualOverride && (
              <Badge variant="default" className="bg-green-600" data-testid="badge-lpcp-latti">
                <Sparkles className="w-3 h-3 mr-1" />
                Auto-tuned by LATTi
              </Badge>
            )}
            {data.isManualOverride && (
              <Badge variant="secondary" data-testid="badge-lpcp-manual">
                <Lock className="w-3 h-3 mr-1" />
                Manual Override Active
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="mt-6">
        <div className="space-y-6">
          {LPCP_PARAMS.map((param) => {
            const isLocked = data.lockedByUser?.[param.key] || false;
            const currentValue = editedValues[param.key] ?? data[param.key] ?? 
              (param.key === 'lowPriceThreshold' ? 0.50 : 
               param.key === 'lowPriceMinStopAtrMult' ? 3.0 : 25.00);
            
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
                    step={param.step}
                    value={currentValue}
                    onChange={(e) => handleValueChange(param.key, e.target.value)}
                    disabled={!isLocked}
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
              data-testid="button-save-lpcp"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}

        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-sm text-amber-900 dark:text-amber-100">
              <p className="font-semibold mb-1">Why Low-Priced Coin Protection?</p>
              <p className="text-amber-700 dark:text-amber-200/80">
                Coins priced below $0.50 often have tiny ATR values, leading to ultra-tight stops and 
                outsized position calculations. LPCP ensures stop distances stay reasonable and trade 
                notionals meet a minimum threshold to reduce noise.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
