import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import type { SparklineData } from '@/lib/earnings-utils';

interface EarningsSparklineProps {
  data: SparklineData[];
  className?: string;
}

export default function EarningsSparkline({ data, className }: EarningsSparklineProps) {
  if (!data || data.length < 3) {
    return (
      <div className={cn("text-xs text-muted-foreground italic", className)}>
        Insufficient data for trend visualization
      </div>
    );
  }

  const latestEarnings = data[data.length - 1]?.earnings ?? 0;
  const lineColor = latestEarnings >= 0 
    ? 'hsl(var(--success))' 
    : 'hsl(var(--destructive))';

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const earnings = dataPoint.earnings;
      const date = new Date(dataPoint.timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      
      return (
        <div className="bg-popover border border-border rounded px-2 py-1 shadow-lg">
          <p className="text-xs text-muted-foreground">{date}</p>
          <p className={cn(
            "text-sm font-bold",
            earnings >= 0 ? 'text-success' : 'text-destructive'
          )}>
            {earnings >= 0 ? '+' : ''}${earnings.toFixed(2)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn("h-8", className)} data-testid="sparkline-earnings-trend">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="earnings"
            stroke={lineColor}
            strokeWidth={1.5}
            dot={false}
            animationDuration={300}
          />
          <Tooltip content={<CustomTooltip />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
