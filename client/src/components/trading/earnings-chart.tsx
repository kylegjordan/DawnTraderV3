import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, Beaker } from 'lucide-react';
import { useTradingMode } from '@/contexts/trading-mode-context';
import { cn } from '@/lib/utils';

type TimePeriod = '7D' | '30D' | 'ALL';

interface EarningsDataPoint {
  date: string;
  earnings: number;
  timestamp: number;
}

export default function EarningsChart() {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('30D');
  const { mode, isPaper } = useTradingMode();

  const dayMapping = {
    '7D': 7,
    '30D': 30,
    'ALL': 365
  };

  const endpoint = isPaper ? '/api/paper/metrics/earnings-chart' : '/api/portfolio/earnings-chart';
  
  const { data: chartData, isLoading } = useQuery<EarningsDataPoint[]>({
    queryKey: [`${endpoint}?days=${dayMapping[selectedPeriod]}`],
  });

  const periods: TimePeriod[] = ['7D', '30D', 'ALL'];

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    if (selectedPeriod === '7D') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatCurrency = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const earnings = data.earnings;
      const isPositive = earnings >= 0;
      
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm text-muted-foreground">{data.date}</p>
          <p className={`text-lg font-bold mt-1 ${isPositive ? 'text-success' : 'text-destructive'}`}>
            {formatCurrency(earnings)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const maxEarnings = chartData && chartData.length > 0 
    ? Math.max(...chartData.map(d => Math.abs(d.earnings)))
    : 100;
  const domain = [-maxEarnings * 1.1, maxEarnings * 1.1];

  const getLineColor = (dataPoint: EarningsDataPoint) => {
    return dataPoint.earnings >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
  };

  return (
    <Card className={cn("mt-4", isPaper && "border-blue-500/30 bg-blue-500/5")} data-testid="card-earnings-chart">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <CardTitle className="text-base sm:text-lg">Earnings Over Time</CardTitle>
            {isPaper && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                <Beaker className="w-3 h-3 mr-1" />
                SIMULATED
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {periods.map((period) => (
              <Button
                key={period}
                variant={selectedPeriod === period ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPeriod(period)}
                data-testid={`button-earnings-period-${period}`}
                className="h-8 px-3"
              >
                {period}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={formatDate}
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                domain={domain}
                tickFormatter={(value) => {
                  const sign = value >= 0 ? '+' : '';
                  return `${sign}$${Math.abs(value).toFixed(0)}`;
                }}
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <Line 
                type="monotone" 
                dataKey="earnings" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx, cy, payload, index } = props;
                  const color = payload.earnings >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
                  return (
                    <circle 
                      key={`dot-${index}`}
                      cx={cx} 
                      cy={cy} 
                      r={3} 
                      fill={color} 
                      stroke={color}
                    />
                  );
                }}
                activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-muted-foreground">No earnings data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
