import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Star, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BenchmarkPair {
  symbol: string;
  poolType: 'BENCHMARK' | 'STANDARD';
  volatility: number;
  frictionLabel: string;
  frictionColor: 'green' | 'yellow' | 'orange' | 'red';
  inIdealPool: boolean;
  price?: number;
  volume24h?: number;
}

function getFrictionBadgeClass(color: string): string {
  switch (color) {
    case 'green':
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case 'orange':
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    case 'red':
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  }
}

export default function BenchmarkPool() {
  const { data, isLoading, error, refetch } = useQuery<BenchmarkPair[]>({
    queryKey: ['/api/pairs/ranked', 'benchmark'],
    queryFn: async () => {
      const response = await fetch('/api/pairs/ranked?pool=benchmark&limit=20', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch benchmark pairs');
      return response.json();
    },
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Benchmark Pool
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Benchmark Pool
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500 text-sm">Failed to load benchmark pairs</div>
        </CardContent>
      </Card>
    );
  }

  const pairs = data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Benchmark Pool
            <Badge variant="secondary" className="ml-2">{pairs.length} pairs</Badge>
          </CardTitle>
          <button 
            onClick={() => refetch()}
            className="p-1 hover:bg-muted rounded"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Core benchmark assets (BTC, ETH, SOL, stablecoins) for market reference
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Symbol</th>
                <th className="pb-2 pr-4 font-medium">Pool</th>
                <th className="pb-2 pr-4 font-medium">Volatility</th>
                <th className="pb-2 pr-4 font-medium">Friction</th>
                <th className="pb-2 pr-4 font-medium">In Ideal Pool</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => (
                <tr key={pair.symbol} className="border-b border-muted/50 hover:bg-muted/30">
                  <td className="py-2 pr-4 font-medium">{pair.symbol}</td>
                  <td className="py-2 pr-4">
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
                      Benchmark
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {(pair.volatility * 100).toFixed(2)}%
                  </td>
                  <td className="py-2 pr-4">
                    <Badge className={cn("text-xs", getFrictionBadgeClass(pair.frictionColor))}>
                      {pair.frictionLabel}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">
                    {pair.inIdealPool ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </td>
                </tr>
              ))}
              {pairs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No benchmark pairs available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
