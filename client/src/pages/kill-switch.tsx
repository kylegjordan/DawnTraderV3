import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  AlertTriangle, 
  Zap, 
  TrendingDown,
  DollarSign,
  Activity,
  MessageSquare,
  RotateCw,
  Clock,
  ArrowLeft
} from "lucide-react";
import { formatTimestampWithTZ } from "@/lib/timezone";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface KillSwitchStatus {
  killSwitchTripped: boolean;
  dailyLossKillSwitch: number;
  current24hPL?: {
    lossPercent: number;
    totalPL: number;
  };
  latestEvent?: any;
}

export default function KillSwitchScreen() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [notes, setNotes] = useState("");
  
  // Fetch kill switch status
  const { data: status, isLoading } = useQuery<KillSwitchStatus>({
    queryKey: ['/api/kill-switch/status'],
    refetchInterval: 5000 // Refresh every 5 seconds
  });
  
  // Fetch kill switch events
  const { data: events = [] } = useQuery({
    queryKey: ['/api/kill-switch/events'],
    queryFn: async () => {
      const response = await fetch('/api/kill-switch/events?limit=10', {
        headers: { 'user-id': 'default-user' }
      });
      return response.json();
    }
  });

  // REB 8.8.3-KS-B: Resume trading mutation (starts trading, auto-clears kill switch)
  const resumeTradingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/trading/start', { mode: 'paper' });
    },
    onSuccess: () => {
      toast({
        title: "Trading Resumed",
        description: "Kill switch cleared. Trading has been resumed.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/kill-switch/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trading-status'] });
      setLocation('/');
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Resume Trading",
        description: error.message || "Failed to resume trading",
        variant: "destructive",
      });
    }
  });

  // ChatGPT Analysis mutation
  const chatMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/kill-switch/create-analysis-chat', {});
    },
    onSuccess: (data: any) => {
      if (data.conversationId) {
        setLocation(`/analysis?conversation=${data.conversationId}`);
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to Create Analysis",
        description: error.message || "Could not create AI analysis conversation"
      });
    }
  });

  const handleChatGPTAnalysis = () => {
    chatMutation.mutate();
  };

  // REB 8.8.3-KS-B: Redirect if kill switch not tripped
  useEffect(() => {
    if (status && !status.killSwitchTripped) {
      setLocation('/');
    }
  }, [status, setLocation]);

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <div className="text-muted-foreground">Loading...</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!status?.killSwitchTripped) {
    return null;
  }

  const latestEvent = status.latestEvent || events[0];
  const pl24h = status.current24hPL;
  
  // Safely parse closed trades
  let closedTrades: any[] = [];
  if (latestEvent?.tradesClosed) {
    try {
      const parsed = JSON.parse(latestEvent.tradesClosed);
      closedTrades = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse tradesClosed:', error);
      closedTrades = [];
    }
  }

  return (
    <div className="p-8 min-h-screen bg-background">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Kill Switch Activated</h1>
              <p className="text-muted-foreground">Trading has been automatically suspended</p>
            </div>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Current Status Card */}
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <div className="flex items-start gap-3">
              <Zap className="w-6 h-6 text-destructive" />
              <div className="flex-1">
                <CardTitle className="text-destructive">24-Hour Loss Limit Exceeded</CardTitle>
                <CardDescription className="mt-1">
                  Your portfolio has lost {pl24h?.lossPercent?.toFixed(2)}% in the last 24 hours, 
                  exceeding your kill switch threshold of {status.dailyLossKillSwitch}%.
                  All open trades have been closed to prevent further losses.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">24h Portfolio Loss</div>
                <div className="text-2xl font-bold text-destructive">
                  -{pl24h?.lossPercent?.toFixed(2)}%
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Loss Amount</div>
                <div className="text-2xl font-bold text-destructive">
                  -${Math.abs(pl24h?.totalPL || 0).toFixed(2)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Kill Switch Limit</div>
                <div className="text-2xl font-bold">
                  {status.dailyLossKillSwitch}%
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Status</div>
                <Badge variant="destructive" className="text-sm">
                  Suspended
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Latest Event Details */}
        {latestEvent && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Event Details
              </CardTitle>
              <CardDescription>
                Triggered at {formatTimestampWithTZ(latestEvent.triggeredAt, 'Asia/Dubai', '12hr')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Portfolio Values */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Portfolio Before</div>
                  <div className="text-xl font-semibold">
                    ${parseFloat(latestEvent.portfolioValueBefore).toFixed(2)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Portfolio After</div>
                  <div className="text-xl font-semibold text-destructive">
                    ${parseFloat(latestEvent.portfolioValueAfter).toFixed(2)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Total Loss</div>
                  <div className="text-xl font-semibold text-destructive">
                    -${parseFloat(latestEvent.lossAmount).toFixed(2)}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Closed Trades */}
              {closedTrades.length > 0 && (
                <>
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Trades Closed by Kill Switch
                    </h3>
                    <div className="space-y-2">
                      {closedTrades.map((trade: any, index: number) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{trade.symbol}</Badge>
                            <span className="text-sm text-muted-foreground">{trade.strategy}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">{trade.pnl}</div>
                            <div className="text-xs text-muted-foreground">
                              Entry: ${parseFloat(trade.entryPrice).toFixed(4)} → 
                              Exit: ${parseFloat(trade.exitPrice).toFixed(4)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions Card - REB 8.8.3-KS-B */}
        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
            <CardDescription>
              You can analyze what went wrong with AI assistance, or resume trading when ready.
              The kill switch will automatically clear when you start trading.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* ChatGPT Analysis Button */}
            <Button 
              variant="outline" 
              size="lg" 
              className="w-full"
              data-testid="button-chatgpt-analysis"
              onClick={handleChatGPTAnalysis}
              disabled={chatMutation.isPending}
            >
              <MessageSquare className="w-5 h-5 mr-2" />
              {chatMutation.isPending ? 'Creating Analysis...' : 'Analyze with ChatGPT'}
            </Button>

            <Separator />

            {/* REB 8.8.3-KS-B: Resume Trading Section */}
            <div className="space-y-3">
              <div>
                <h3 className="font-semibold mb-1">Resume Trading</h3>
                <p className="text-sm text-muted-foreground">
                  When you're ready, click below to resume trading. The kill switch will be
                  automatically cleared and a fresh 24-hour loss window will start.
                </p>
              </div>
              
              <Textarea
                placeholder="E.g., Reviewed trades, adjusted settings, ready to resume... (optional notes)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[100px]"
                data-testid="input-resume-notes"
              />

              <Button
                onClick={() => resumeTradingMutation.mutate()}
                disabled={resumeTradingMutation.isPending}
                size="lg"
                className="w-full"
                data-testid="button-resume-trading"
              >
                <RotateCw className="w-5 h-5 mr-2" />
                {resumeTradingMutation.isPending ? 'Resuming...' : 'Resume Trading'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Event History */}
        {events.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Previous Kill Switch Events</CardTitle>
              <CardDescription>
                History of past kill switch activations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events.slice(1).map((event: any) => (
                  <div 
                    key={event.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        {formatTimestampWithTZ(event.triggeredAt, 'Asia/Dubai', '12hr')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Loss: -{parseFloat(event.lossPercent).toFixed(2)}% 
                        (${parseFloat(event.lossAmount).toFixed(2)})
                      </div>
                    </div>
                    <Badge variant={event.resolved ? "outline" : "destructive"}>
                      {event.resolved ? 'Resolved' : 'Active'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
