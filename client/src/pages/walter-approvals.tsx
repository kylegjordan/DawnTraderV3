import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Shield,
  Lock,
  Save,
  RotateCcw
} from "lucide-react";

export default function WalterApprovals() {
  const { toast } = useToast();
  
  // Fetch user profile to get approval matrix
  const { data: userProfile, isLoading } = useQuery({
    queryKey: ['/api/user/profile'],
  });
  
  const [approvalMatrix, setApprovalMatrix] = useState({
    startLiveTrading: true,
    adjustGoals: true,
    modifyGuardrails: true,
    updateFilters: false,
    changeStrategyVariables: true,
    riskThresholdAdjustments: true,
    paperTradingActivation: false,
    killSwitchOverride: true
  });

  useEffect(() => {
    if (userProfile?.approvalMatrix) {
      // Always enforce kill switch hard-lock regardless of stored value
      setApprovalMatrix({
        ...userProfile.approvalMatrix,
        killSwitchOverride: true
      });
    }
  }, [userProfile]);

  const updateApprovalMatrixMutation = useMutation({
    mutationFn: async (matrix: any) => {
      const response = await apiRequest('PATCH', '/api/user/approval-matrix', {
        approvalMatrix: matrix
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/profile'] });
      
      toast({
        title: "Approval Rules Saved",
        description: "Walter's approval requirements have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update approval rules. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSave = async () => {
    // Always enforce kill switch hard-lock before saving
    const matrixToSave = {
      ...approvalMatrix,
      killSwitchOverride: true
    };
    updateApprovalMatrixMutation.mutate(matrixToSave);
  };

  const handleReset = () => {
    if (userProfile?.approvalMatrix) {
      // Always enforce kill switch hard-lock on reset
      setApprovalMatrix({
        ...userProfile.approvalMatrix,
        killSwitchOverride: true
      });
      
      toast({
        title: "Reset Complete",
        description: "Approval rules have been reset to last saved values.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <Skeleton className="h-12 w-64 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Walter Approval Rules</h1>
              <p className="text-sm text-muted-foreground mt-1">Configure which actions require your approval before Walter can execute them</p>
            </div>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-reset"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateApprovalMatrixMutation.isPending}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-save"
          >
            <Save className="w-4 h-4" />
            {updateApprovalMatrixMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Approval Matrix</CardTitle>
              <CardDescription className="mt-1.5">
                Toggle which actions Walter (AI SysAdmin) can perform without your explicit approval
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Start Live Trading */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Start Live Trading</Label>
              <p className="text-sm text-muted-foreground">
                Requires approval to activate live trading with real funds
              </p>
            </div>
            <Switch
              checked={approvalMatrix.startLiveTrading}
              onCheckedChange={(checked) => setApprovalMatrix({...approvalMatrix, startLiveTrading: checked})}
              data-testid="switch-approve-live-trading"
            />
          </div>

          <Separator />

          {/* Adjust Goals */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Adjust Goals</Label>
              <p className="text-sm text-muted-foreground">
                Requires approval to modify trading goals and targets
              </p>
            </div>
            <Switch
              checked={approvalMatrix.adjustGoals}
              onCheckedChange={(checked) => setApprovalMatrix({...approvalMatrix, adjustGoals: checked})}
              data-testid="switch-approve-goals"
            />
          </div>

          <Separator />

          {/* Modify Guardrails */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Modify Guardrails</Label>
              <p className="text-sm text-muted-foreground">
                Requires approval to change risk parameters and limits
              </p>
            </div>
            <Switch
              checked={approvalMatrix.modifyGuardrails}
              onCheckedChange={(checked) => setApprovalMatrix({...approvalMatrix, modifyGuardrails: checked})}
              data-testid="switch-approve-guardrails"
            />
          </div>

          <Separator />

          {/* Update Filters */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Update Filters</Label>
              <p className="text-sm text-muted-foreground">
                Requires approval to adjust market screening filters
              </p>
            </div>
            <Switch
              checked={approvalMatrix.updateFilters}
              onCheckedChange={(checked) => setApprovalMatrix({...approvalMatrix, updateFilters: checked})}
              data-testid="switch-approve-filters"
            />
          </div>

          <Separator />

          {/* Change Strategy Variables */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Change Strategy Variables</Label>
              <p className="text-sm text-muted-foreground">
                Requires approval to modify trading strategy parameters
              </p>
            </div>
            <Switch
              checked={approvalMatrix.changeStrategyVariables}
              onCheckedChange={(checked) => setApprovalMatrix({...approvalMatrix, changeStrategyVariables: checked})}
              data-testid="switch-approve-strategy"
            />
          </div>

          <Separator />

          {/* Risk Threshold Adjustments */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Risk Threshold Adjustments</Label>
              <p className="text-sm text-muted-foreground">
                Requires approval to change stop loss and risk thresholds
              </p>
            </div>
            <Switch
              checked={approvalMatrix.riskThresholdAdjustments}
              onCheckedChange={(checked) => setApprovalMatrix({...approvalMatrix, riskThresholdAdjustments: checked})}
              data-testid="switch-approve-risk"
            />
          </div>

          <Separator />

          {/* Paper Trading Activation */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Paper Trading Activation</Label>
              <p className="text-sm text-muted-foreground">
                Requires approval to start paper trading simulation
              </p>
            </div>
            <Switch
              checked={approvalMatrix.paperTradingActivation}
              onCheckedChange={(checked) => setApprovalMatrix({...approvalMatrix, paperTradingActivation: checked})}
              data-testid="switch-approve-paper"
            />
          </div>

          <Separator />

          {/* Kill Switch Override */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <Label className="text-sm font-medium flex items-center gap-2">
                Kill Switch Override
                <Lock className="w-4 h-4 text-destructive" />
              </Label>
              <p className="text-sm text-muted-foreground">
                Admin only - Always requires approval (cannot be disabled)
              </p>
            </div>
            <Switch
              checked={true}
              disabled={true}
              data-testid="switch-approve-killswitch"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
