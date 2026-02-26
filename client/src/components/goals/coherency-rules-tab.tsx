import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { ModeIndicator } from "./mode-indicator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CoherencyRule {
  id: string;
  name: string;
  description: string;
  severity: "error" | "warning";
  status: "PASS" | "WARN" | "FAIL";
  phase?: string;
}

// Phase 28.E Rationalized Coherency Rules
const coherencyRules: CoherencyRule[] = [
  {
    id: "RULE_001",
    name: "Portfolio Risk vs Kill Switch",
    description: "Portfolio Risk per Trade must be ≤ 50% × Daily Loss Kill Switch",
    severity: "error",
    status: "PASS",
    phase: "Phase 28.E"
  },
  {
    id: "RULE_002",
    name: "Total Exposure Limit",
    description: "Total portfolio exposure must be ≤ 50% of portfolio value",
    severity: "error",
    status: "PASS",
    phase: "Phase 28.E"
  },
  {
    id: "RULE_003",
    name: "Cooldown Minimum",
    description: "Symbol cooldown must be ≥ 0 minutes (allows zero cooldown)",
    severity: "error",
    status: "PASS",
    phase: "Phase 28.E"
  },
  {
    id: "RULE_004",
    name: "Cooldown Maximum",
    description: "Symbol cooldown must be ≤ 120 minutes",
    severity: "warning",
    status: "WARN"
  },
  {
    id: "RULE_005",
    name: "Manual Override Exclusivity",
    description: "Parameters cannot be locked by both user and system simultaneously",
    severity: "error",
    status: "PASS"
  },
  {
    id: "RULE_006",
    name: "Portfolio Risk Range",
    description: "Portfolio risk per trade must be between 0.10% and 5.00%",
    severity: "error",
    status: "PASS"
  },
  {
    id: "RULE_007",
    name: "Kill Switch Maximum",
    description: "Daily loss kill switch must be ≤ 25% of portfolio (expanded from 20%)",
    severity: "error",
    status: "PASS",
    phase: "Phase 28.E"
  },
  {
    id: "RULE_008",
    name: "Max Positions Range",
    description: "Maximum open positions must be between 1 and 20",
    severity: "error",
    status: "PASS"
  },
  {
    id: "RULE_009",
    name: "Mode Isolation",
    description: "Each mode (paper/live) must have exactly one guardrails record",
    severity: "error",
    status: "PASS"
  },
  {
    id: "RULE_010",
    name: "Learning Expansion Safety Caps",
    description: "Learning-adjusted values must not exceed global safety caps (Kill Switch: 25%, Risk: 5%, Cooldown: 90min, Positions: 20)",
    severity: "error",
    status: "PASS",
    phase: "Phase 28.E"
  }
];

export default function CoherencyRulesTab() {
  const activeRules = coherencyRules.filter(r => r.status === "PASS");
  const warningRules = coherencyRules.filter(r => r.status === "WARN");
  const failedRules = coherencyRules.filter(r => r.status === "FAIL");

  return (
    <div className="space-y-6" data-testid="coherency-rules-tab">
      {/* Mode Indicator */}
      <ModeIndicator />

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">Coherency Rules</CardTitle>
              <CardDescription className="mt-1.5">
                Phase 28.E rationalized fail-safe rules that prevent catastrophic configuration errors
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Active Rules</p>
                <p className="text-2xl font-bold">{activeRules.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Warning Rules</p>
                <p className="text-2xl font-bold">{warningRules.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">Failed Rules</p>
                <p className="text-2xl font-bold">{failedRules.length}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Phase 28.E Update:</strong> Coherency rules have been rationalized to act as extreme fail-safes only. 
          Key changes include: Risk ≤ 50% × Kill Switch (was 10%), Total Exposure ≤ 50% (was 100%), 
          Zero cooldown allowed (was ≥1 min), Kill Switch cap increased to 25% (was 20%).
        </AlertDescription>
      </Alert>

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Coherency Rules (v2.2-phase28efinal)</CardTitle>
          <CardDescription>
            These rules validate guardrail configurations to ensure safe trading parameters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Rule ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden lg:table-cell">Description</TableHead>
                  <TableHead className="w-[100px]">Severity</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[120px] hidden md:table-cell">Phase</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coherencyRules.map((rule) => (
                  <TableRow key={rule.id} data-testid={`rule-row-${rule.id}`}>
                    <TableCell className="font-mono text-xs">
                      {rule.id}
                    </TableCell>
                    <TableCell className="font-medium">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{rule.name}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs lg:hidden">
                            <p className="text-sm">{rule.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                      {rule.description}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={rule.severity === "error" ? "destructive" : "default"}
                        className="capitalize"
                      >
                        {rule.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {rule.status === "PASS" && (
                        <Badge variant="outline" className="border-green-500 text-green-500 bg-green-50 dark:bg-green-950">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          PASS
                        </Badge>
                      )}
                      {rule.status === "WARN" && (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          WARN
                        </Badge>
                      )}
                      {rule.status === "FAIL" && (
                        <Badge variant="outline" className="border-red-500 text-red-500 bg-red-50 dark:bg-red-950">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          FAIL
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                      {rule.phase || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Additional Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Implementation Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground mb-1">Validation Timing:</p>
            <p>Rules are validated during guardrail updates via the GuardrailPolicy Service</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Enforcement:</p>
            <p>Error-level violations block configuration changes; warning-level violations log alerts but allow changes</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Database Tracking:</p>
            <p>Rule status and validation history stored in <code className="px-1 py-0.5 bg-muted rounded">coherency_rule_status</code> table</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Telemetry:</p>
            <p>Startup logs display coherency policy status: <code className="px-1 py-0.5 bg-muted rounded">[Audit] CoherencyPolicy | activeRules=X | warningRules=Y | disabledRules=Z | version=v2.2-phase28efinal</code></p>
          </div>
        </CardContent>
      </Card>

      {/* Control Modes Reference */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Control Modes Reference</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-muted-foreground cursor-help" data-testid="info-control-modes" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">Full rule specifications in audit/coherency_rules.yaml</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <CardDescription>
            How system and manual control modes work together (Phase 28.E Final)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Guardrails & Filters supports flexible control over each Core Four parameter. 
            You can manually configure each parameter independently.
          </p>
          
          <div className="space-y-3">
            <div className="border-l-2 border-primary pl-4">
              <p className="font-medium text-foreground mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  System Controlled
                </span>
              </p>
              <p className="text-muted-foreground">
                System dynamically adjusts this value during trading based on performance metrics and learning algorithms. 
                User can view but not edit the value.
              </p>
            </div>

            <div className="border-l-2 border-orange-500 pl-4">
              <p className="font-medium text-foreground mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                  Manual Control
                </span>
              </p>
              <p className="text-muted-foreground">
                User sets the value manually through the UI. System cannot override it. 
                The parameter is locked from autonomous adjustments.
              </p>
            </div>

            <div className="border-l-2 border-purple-500 pl-4">
              <p className="font-medium text-foreground mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  Mixed Custom Mode
                </span>
              </p>
              <p className="text-muted-foreground">
                Combination of Manual + System controls across different parameters. 
                Only system-managed fields are adjusted by the learning engine.
              </p>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="font-medium text-foreground text-xs uppercase tracking-wide">Behavior Rules</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Switching from Manual to System:</strong> Retains the user's last manual value as the system's new baseline for future adjustments</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Switching from System to Manual:</strong> Locks the current system value until the user explicitly edits it</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Changing Core Four Values:</strong> Any manual edit to a Core Four parameter changes the active preset to "Custom"</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Control Mode Toggle Only:</strong> Switching control mode without changing the value keeps the current preset active</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Presets:</strong> Remain active unless a Core Four value is changed; then automatically switch to "Custom"</span>
              </li>
              <li className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span><strong className="text-foreground">Paper vs Live Independence:</strong> Each mode maintains completely independent configuration states. Paper tests never affect Live trading parameters</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
