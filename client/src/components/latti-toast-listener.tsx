import { useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface WebSocketMessage {
  type: string;
  data?: any;
  payload?: any;
}

interface ConfigUpdatePayload {
  mode: 'paper' | 'live';
  source: string;
  configType: string;
  adjustments: Array<{
    parameter: string;
    oldValue: number;
    newValue: number;
    reason: string;
  }>;
  timestamp: string;
}

/**
 * LATTI Toast Listener
 * Phase 27.F.14.B Task 9: Real-time LATTI toast notifications
 * 
 * Listens for LATTI adjustment events via WebSocket and displays
 * toast notifications showing what parameters were changed and why.
 */
export function LATTIToastListener() {
  const { messages: wsMessages } = useWebSocket();
  const { toast } = useToast();
  const lastProcessedTimestamp = useRef<string>('');

  useEffect(() => {
    if (!wsMessages || wsMessages.length === 0) return;

    // Get the most recent message
    const latestMessage = wsMessages[wsMessages.length - 1] as WebSocketMessage;
    
    // Check if it's a config_update event from LATTI
    if (latestMessage.type !== 'config_update') return;
    
    const payload = (latestMessage.payload || latestMessage.data) as ConfigUpdatePayload;
    if (!payload || payload.source !== 'heuristic_trader') return;

    // Avoid processing the same event multiple times
    if (payload.timestamp === lastProcessedTimestamp.current) return;
    lastProcessedTimestamp.current = payload.timestamp;

    const { mode, adjustments } = payload;
    
    // Show a toast for each adjustment
    adjustments.forEach((adj, index) => {
      // Determine icon and title based on parameter type
      const isIncrease = adj.newValue > adj.oldValue;
      const Icon = isIncrease ? TrendingUp : TrendingDown;
      const changePercent = ((adj.newValue - adj.oldValue) / adj.oldValue * 100).toFixed(1);
      const changeDirection = isIncrease ? 'increased' : 'decreased';
      
      // Format parameter name for display
      const paramDisplay = adj.parameter
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();

      // Delay toasts slightly if multiple adjustments
      setTimeout(() => {
        toast({
          title: `🤖 LATTI ${mode.toUpperCase()} Adjustment`,
          description: (
            <div className="space-y-2 mt-2">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${isIncrease ? 'text-green-500' : 'text-orange-500'}`} />
                <span className="font-semibold">{paramDisplay}</span>
                <span className={`text-sm ${isIncrease ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                  {changeDirection} by {Math.abs(Number(changePercent))}%
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {adj.oldValue.toFixed(2)} → {adj.newValue.toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground italic">
                {adj.reason}
              </div>
            </div>
          ),
          duration: 8000, // 8 seconds
        });
      }, index * 500); // Stagger toasts by 500ms each
    });

    // Also show a summary toast if multiple adjustments
    if (adjustments.length > 1) {
      setTimeout(() => {
        toast({
          title: `🤖 LATTI ${mode.toUpperCase()} Summary`,
          description: `Made ${adjustments.length} parameter adjustments to optimize trading performance.`,
          duration: 5000,
        });
      }, adjustments.length * 500 + 200);
    }
  }, [wsMessages, toast]);

  // This component doesn't render anything
  return null;
}
