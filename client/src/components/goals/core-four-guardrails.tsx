import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Shield, Save, Lock, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Phase 3b: Core Guardrails Component (now 5 guardrails as of REB 8.8.3-G)
 * 
 * Directive 11.8B-B1: Guardrails are now explicitly MANUAL controls.
 * User has direct control over all guardrail parameters.
 * 
 * REB 8.8.3-G: Added maxPositionPercentPct as 5th core guardrail
 */

interface GuardrailsV2 {
  mode: string;
  portfolioRiskPerTradePct: number;
  symbolCooldownMinutes: number;
  maxOpenPositions: number;
  dailyLossKillSwitchPct: number;
  dailyLossWarning1Pct: number; // P19-B6.8: tier-1 daily-loss warning, % OF the kill threshold
  dailyLossWarning2Pct: number; // P19-B6.8: tier-2 daily-loss warning, % OF the kill threshold
  maxPositionPercentPct: number; // REB 8.8.3-G: Max position size as % of portfolio
  maxTotalExposurePct: number; // Phase 8.8.3-B3: Max total portfolio exposure %
  isManualOverride: boolean;
  tunedByLatti: boolean; // FROZEN per 11.8B-B - preserved for future cleanup
  lockedByUser: Record<string, boolean>;
}

interface GuardrailParam {
  key: keyof Pick<GuardrailsV2, 'portfolioRiskPerTradePct' | 'symbolCooldownMinutes' | 'maxOpenPositions' | 'dailyLossKillSwitchPct' | 'dailyLossWarning1Pct' | 'dailyLossWarning2Pct' | 'maxPositionPercentPct' | 'maxTotalExposurePct'>;
  label: string;
  description: string;
  unit: string;
}

// REB 8.8.3-G: Updated descriptions to be user-friendly (for Kyle, not technical)
// Phase 8.8.3-B3: Added maxTotalExposurePct as 6th core guardrail
// Phase 8.8.3-C7-FIX: Guardrails using Current Balance now show it dynamically in their descriptions
const CORE_FOUR_PARAMS_BASE: Omit<GuardrailParam, 'description'>[] = [
  {
    key: 'maxTotalExposurePct',
    label: 'Max Total Portfolio Exposure',
    unit: '%'
  },
  {
    key: 'portfolioRiskPerTradePct',
    label: 'Portfolio Risk per Trade',
    unit: '%'
  },
  {
    key: 'symbolCooldownMinutes',
    label: 'Symbol Cooldown',
    unit: 'minutes'
  },
  {
    key: 'maxOpenPositions',
    label: 'Max Open Positions',
    unit: 'count'
  },
  {
    key: 'dailyLossKillSwitchPct',
    label: 'Daily Loss Kill Switch',
    unit: '%'
  },
  // P19-B6.8: the two daily-loss WARNING tiers — stored as % OF the kill-switch threshold (NOT % of
  // portfolio). They were DB-backed + firing in daily-loss-budget.ts but never user-settable; surfaced here
  // so the user controls the failsafe alert levels (Kyle directive — #323 folded into B6.8). Coherency
  // (RULE_011, enforced per-mode at save + server): 0 < warn1 < warn2 < 100.
  {
    key: 'dailyLossWarning1Pct',
    label: 'Daily Loss Warning 1',
    unit: '% of kill switch'
  },
  {
    key: 'dailyLossWarning2Pct',
    label: 'Daily Loss Warning 2',
    unit: '% of kill switch'
  },
  {
    key: 'maxPositionPercentPct',
    label: 'Max Position Percent',
    unit: '%'
  }
];

// Phase 8.8.3-C7-FIX: Keys that use Current Balance for their calculations
const CURRENT_BALANCE_GUARDRAILS = new Set([
  'maxTotalExposurePct',
  'portfolioRiskPerTradePct',
  'dailyLossKillSwitchPct',
  'maxPositionPercentPct'
]);

// Phase 8.8.3-C7-FIX: Base descriptions for each guardrail
const GUARDRAIL_DESCRIPTIONS: Record<string, string> = {
  maxTotalExposurePct: 'The maximum percentage of your portfolio that can be invested across all open positions at any time.',
  portfolioRiskPerTradePct: 'How much of your portfolio you plan to risk on each individual trade when sizing position and stop distance.',
  symbolCooldownMinutes: 'After a trade closes on a symbol, wait this many minutes before opening another trade on the same symbol.',
  maxOpenPositions: 'The maximum number of simultaneous open positions allowed at once.',
  dailyLossKillSwitchPct: 'If your portfolio loses this percent or more in a single day, trading automatically stops until you resume.',
  dailyLossWarning1Pct: 'First early-warning alert, as a percent of your Daily Loss Kill Switch. e.g. 50 alerts you when the day\'s loss reaches half of your kill-switch limit — well before trading stops. Must be below Warning 2.',
  dailyLossWarning2Pct: 'Second early-warning alert, as a percent of your Daily Loss Kill Switch. e.g. 75 alerts you at three-quarters of your kill-switch limit — the last warning before trading auto-stops at 100%. Must be above Warning 1 and below 100.',
  maxPositionPercentPct: 'The maximum size of any single position as a percent of your total portfolio value. Larger positions will be blocked.'
};

// Phase 8.8.3-C7-FIX: Format currency for display
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// Phase 8.8.3-C7-FIX: Generate descriptions with Current Balance for applicable guardrails
function getGuardrailDescription(key: string, currentBalance: number | null): string {
  const baseDescription = GUARDRAIL_DESCRIPTIONS[key] || '';
  if (CURRENT_BALANCE_GUARDRAILS.has(key) && currentBalance !== null) {
    return `${baseDescription} Current Balance = ${formatCurrency(currentBalance)}.`;
  }
  return baseDescription;
}

// Phase 8.8.3-C7-FIX: Portfolio summary response type (matches endpoint response structure)
interface PortfolioSummaryResponse {
  ok: boolean;
  startingBalance: number;
  cashBalance: number;
  currentBalance: number;
  totalPositionValue: number;
  portfolioValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  netPnl: number;
  netPnlPercent: number;
}

// P19-B6.8a: this tab is PINNED to a single mode via a required `mode` prop —
// NOT the ambient global trading-mode toggle. Paper active trading, live active
// trading, and VTS now run as separate concurrent systems (Kyle 2026-06-30), so
// each mode gets its OWN dedicated guardrails tab ("Paper Guardrails" now; a
// "Live Guardrails" tab renders <CoreFourGuardrails mode="live" /> when added).
// Pinning makes the big "PAPER MODE" header always truthful — without it, the
// ambient toggle (which defaults to 'live') would mislabel live risk-limits as paper.
export function CoreFourGuardrails({ mode }: { mode: 'paper' | 'live' }) {
  const { toast } = useToast();
  const [hasChanges, setHasChanges] = useState(false);
  const [editedValues, setEditedValues] = useState<Partial<GuardrailsV2>>({});
  
  // Phase 8.8.3-C7-FIX: Fetch portfolio summary to get Current Balance (same source as guardrail calculations)
  const { data: portfolioData } = useQuery<PortfolioSummaryResponse>({
    queryKey: ['/api/active-engine/portfolio-summary'],
    queryFn: async () => {
      const response = await fetch('/api/active-engine/portfolio-summary', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio summary');
      }
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds for live updates
  });
  
  // Phase 8.8.3-C7-FIX: Extract cashBalance (Current Balance = Starting + Realized P/L)
  // Note: endpoint returns cashBalance directly at root level, not inside a 'data' object
  const currentBalance = portfolioData?.cashBalance ?? null;

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
        throw new Error('Failed to fetch Core Guardrails');
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
        title: "Core Guardrails updated",
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

  const handleSave = () => {
    // P19-B6.8: per-mode daily-loss warning-tier coherency (RULE_011) — validated against THIS mode's
    // effective row (edited values merged over the loaded mode row), so paper and live never cross-bleed.
    // The tiers are % OF the kill-switch threshold, so 0 < warn1 < warn2 < 100 guarantees BOTH warnings
    // fire strictly before this same mode's hard kill (warn2 < 100% of kill). Server re-validates (defense).
    const eff = { ...(guardrails?.data ?? {}), ...editedValues } as Partial<GuardrailsV2>;
    const w1 = Number(eff.dailyLossWarning1Pct);
    const w2 = Number(eff.dailyLossWarning2Pct);
    if (!(Number.isFinite(w1) && Number.isFinite(w2) && w1 > 0 && w1 < w2 && w2 < 100)) {
      toast({
        title: "Invalid daily-loss warning tiers",
        description: `Warning levels must satisfy 0 < Warning 1 (${w1}) < Warning 2 (${w2}) < 100 — each is a percent of the kill switch, for ${mode} mode.`,
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(editedValues);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Core Guardrails</CardTitle>
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
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl sm:text-2xl">
              <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <span>Core Guardrails</span>
              <span className="text-muted-foreground font-semibold">—</span>
              <span
                className={
                  mode === 'live'
                    ? "font-extrabold uppercase tracking-wide text-blue-600 dark:text-blue-400"
                    : "font-extrabold uppercase tracking-wide text-purple-600 dark:text-purple-400"
                }
                data-testid={`guardrails-mode-header-${mode}`}
              >
                {mode === 'live' ? 'Live' : 'Paper'} Mode
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Risk tolerance settings you control. These parameters govern position sizing and risk limits.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" data-testid="badge-manual-control">
              <Lock className="w-3 h-3 mr-1" />
              Manual Control
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="mt-6">
        <div className="space-y-6">
          {CORE_FOUR_PARAMS_BASE.map((param) => {
            const currentValue = editedValues[param.key] ?? data[param.key];
            // Phase 8.8.3-C7-FIX: Get dynamic description with Current Balance for applicable guardrails
            const description = getGuardrailDescription(param.key, currentBalance);
            
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
                            <p className="max-w-xs">{description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <Lock className="w-3 h-3 mr-1" />
                      Manual
                    </Badge>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Input
                    id={param.key}
                    type="number"
                    step="0.1"
                    value={currentValue}
                    onChange={(e) => handleValueChange(param.key, e.target.value)}
                    className="bg-white dark:bg-slate-950"
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
              <p className="font-semibold mb-1">About Core Guardrails</p>
              <p className="text-blue-700 dark:text-blue-200/80">
                These are your risk tolerance settings. Adjust these parameters to control position sizing, 
                exposure limits, and daily loss protection based on your trading preferences.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
