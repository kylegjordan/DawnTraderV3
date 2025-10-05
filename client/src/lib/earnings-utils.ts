interface DailyBrief {
  date: string;
  metrics: {
    realized_pl?: number;
    num_trades?: number;
  } | null;
  trades: {
    closed?: any[];
    open?: any[];
  } | null;
}

export interface AverageDailyEarningsResult {
  value: number | null;
  activeDays: number;
  totalDays: number;
  insufficientData: boolean;
}

export interface SparklineData {
  date: string;
  earnings: number;
  timestamp: number;
}

export function calculateAverageDailyEarnings(briefs: DailyBrief[]): AverageDailyEarningsResult {
  if (!briefs || briefs.length === 0) {
    return { value: null, activeDays: 0, totalDays: 0, insufficientData: true };
  }

  const activeDays: { date: string; earnings: number }[] = [];

  briefs.forEach(brief => {
    const hasTrades = (brief.trades?.closed && brief.trades.closed.length > 0) || 
                     (brief.trades?.open && brief.trades.open.length > 0) ||
                     (brief.metrics?.num_trades && brief.metrics.num_trades > 0);
    
    if (hasTrades) {
      const earnings = brief.metrics?.realized_pl ?? 0;
      activeDays.push({ date: brief.date, earnings });
    }
  });

  if (activeDays.length < 5) {
    return { 
      value: null, 
      activeDays: activeDays.length, 
      totalDays: briefs.length, 
      insufficientData: true 
    };
  }

  const totalEarnings = activeDays.reduce((sum, day) => sum + day.earnings, 0);
  const averageDaily = totalEarnings / activeDays.length;

  return {
    value: averageDaily,
    activeDays: activeDays.length,
    totalDays: briefs.length,
    insufficientData: false
  };
}

export function getSparklineData(briefs: DailyBrief[], days: number = 7): SparklineData[] {
  if (!briefs || briefs.length === 0) {
    return [];
  }

  const sortedBriefs = [...briefs]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, days);

  return sortedBriefs
    .map(brief => ({
      date: brief.date,
      earnings: brief.metrics?.realized_pl ?? 0,
      timestamp: new Date(brief.date).getTime()
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function formatADE(value: number | null): string {
  if (value == null) {
    return 'N/A';
  }

  if (Math.abs(value) < 10) {
    const formatted = value.toFixed(2);
    return `${value >= 0 ? '+' : ''}$${Math.abs(parseFloat(formatted))}`;
  }

  const rounded = Math.round(value);
  return `${value >= 0 ? '+' : ''}$${Math.abs(rounded).toLocaleString('en-US')}`;
}
