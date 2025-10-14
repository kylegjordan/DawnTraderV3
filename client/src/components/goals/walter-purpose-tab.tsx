import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Lightbulb, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ModeIndicator } from "./mode-indicator";

interface WalterPurpose {
  id: string;
  userId: string;
  mode: string;
  content: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function WalterPurposeTab() {
  const { toast } = useToast();
  const { mode } = useTradingMode();
  const [purposeText, setPurposeText] = useState("");
  
  // Default purpose statement
  const defaultPurpose = `My purpose is to work together with Kyle to generate great amounts of wealth through disciplined, risk-managed cryptocurrency trading. I will:

1. **Protect Capital First** - Every decision prioritizes capital preservation over profit maximization
2. **Learn Continuously** - Analyze every trade outcome to improve future decisions
3. **Stay Disciplined** - Follow our proven strategies without emotional interference
4. **Communicate Transparently** - Always explain my reasoning and flag potential risks
5. **Optimize Relentlessly** - Seek incremental improvements in execution, timing, and risk management

My success is measured not just by profits, but by consistent execution of our rules, preservation of capital during downturns, and the quality of insights I provide to support our shared goal of financial freedom.`;

  // Fetch current purpose (mode-aware)
  const { data: response, isLoading } = useQuery<{ ok: boolean; purpose: WalterPurpose | null }>({
    queryKey: ["/api/walter/purpose", mode],
    queryFn: () => fetch(`/api/walter/purpose?mode=${mode}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'x-app-mode': mode
      }
    }).then(r => r.json()),
  });

  const purpose = response?.purpose;

  // Update local state when purpose is fetched or mode changes
  useEffect(() => {
    if (purpose) {
      setPurposeText(purpose.content);
    } else {
      setPurposeText(defaultPurpose);
    }
  }, [purpose, mode]);

  // Save purpose mutation (mode-aware)
  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest("POST", `/api/walter/purpose?mode=${mode}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/walter/purpose", mode] });
      toast({
        title: "Purpose Updated",
        description: `Walter's purpose has been successfully saved for ${mode.toUpperCase()} mode.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save purpose statement.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!purposeText.trim()) {
      toast({
        title: "Empty Purpose",
        description: "Please enter a purpose statement for Walter.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate(purposeText);
  };

  const handleReset = () => {
    setPurposeText(defaultPurpose);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          Walter's purpose statement guides all AI decisions, trade analysis, and recommendations. 
          This is the foundation of Walter's behavior and should reflect your core trading philosophy.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-primary" />
              <CardTitle>Walter's Purpose Statement</CardTitle>
              <ModeIndicator />
            </div>
            {purpose?.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last updated {format(new Date(purpose.updatedAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}
          </div>
          <CardDescription>
            Define Walter's mission, values, and behavioral guidelines
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={purposeText}
            onChange={(e) => setPurposeText(e.target.value)}
            placeholder="Enter Walter's purpose statement..."
            className="min-h-[400px] font-mono text-sm"
            data-testid="textarea-walter-purpose"
          />
          
          <div className="flex items-center gap-2 justify-between">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={saveMutation.isPending}
              data-testid="button-reset-purpose"
            >
              Reset to Default
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save-purpose"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Purpose
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
