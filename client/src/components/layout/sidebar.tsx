import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Home,
  Eye,
  BarChart3,
  Clock,
  Brain,
  Settings,
  TrendingUp,
  User,
  FileText
} from "lucide-react";
import { useTrading } from "@/hooks/use-trading";
import { Checkbox } from "@/components/ui/checkbox";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Watchlist", href: "/watchlist", icon: Eye },
  { name: "Active Trades", href: "/active-trades", icon: BarChart3 },
  { name: "Trade History", href: "/history", icon: Clock },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "AI Analysis", href: "/analysis", icon: Brain },
  { name: "Settings", href: "/settings", icon: Settings },
];

const strategies = [
  { name: "VWAP Pullback", key: "vwap_pullback" },
  { name: "ABCD Long", key: "abcd_long" },
  { name: "SMA Trend Ride", key: "sma_trend_ride" },
];

export default function Sidebar({ isOpen, onClose, className }: SidebarProps) {
  const [location] = useLocation();
  const { activeTrades } = useTrading();

  return (
    <>
      <aside 
        className={cn(
          "sidebar sidebar-transition w-64 bg-card border-r border-border flex-shrink-0 overflow-y-auto scrollbar-thin",
          !isOpen && "lg:translate-x-0 -translate-x-full",
          isOpen && "translate-x-0",
          className
        )}
        data-testid="sidebar"
      >
        <div className="p-6">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">CryptoTrader</h1>
              <p className="text-xs text-muted-foreground">Pro Platform</p>
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive = location === item.href || (item.href === '/dashboard' && location === '/');
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                  onClick={() => onClose()}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                  {item.name === "Active Trades" && activeTrades.length > 0 && (
                    <span className="ml-auto bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full">
                      {activeTrades.length}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          
          {/* Strategy Filter */}
          <div className="mt-8 pt-6 border-t border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Strategies
            </h3>
            <div className="space-y-2">
              {strategies.map((strategy) => (
                <label 
                  key={strategy.key}
                  className="flex items-center gap-2 cursor-pointer group"
                  data-testid={`strategy-${strategy.key}`}
                >
                  <Checkbox 
                    defaultChecked 
                    className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary focus:ring-offset-0"
                  />
                  <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                    {strategy.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
          
          {/* Account Info */}
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Trader_Pro</p>
                <p className="text-xs text-muted-foreground">Kraken Account</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
