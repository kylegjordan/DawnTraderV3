import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Home,
  Eye,
  BarChart3,
  Settings,
  TrendingUp,
  User,
  FileText,
  Shield,
  LogOut,
  Activity,
  Newspaper,
  Sparkles,
  Brain
} from "lucide-react";
import { useTrading } from "@/hooks/use-trading";
import { Button } from "@/components/ui/button";
import { clearTokens } from "@/lib/auth";
import { useUserRole } from "@/hooks/useUserRole";
import { queryClient } from "@/lib/queryClient";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Trading", href: "/active-trades", icon: BarChart3 },
  { name: "Guardrails & Filters", href: "/goals-engine", icon: Shield },
  { name: "Analytics & Diagnostics", href: "/analytics", icon: Activity },
  { name: "Machine Learning", href: "/machine-learning", icon: Brain },
  // Directive 12.2.3: Walter nav item removed (Batch 6)
  { name: "Briefings", href: "/briefings", icon: Newspaper },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "AI Transparency", href: "/ai-transparency", icon: Sparkles },
  { name: "System Monitoring", href: "/systems", icon: Activity },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar({ isOpen, onClose, className }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { activeTrades } = useTrading();
  const { can } = useUserRole();
  
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  
  const handleLogout = () => {
    clearTokens();
    // Clear all React Query cache to ensure fresh data on next login
    queryClient.clear();
    setLocation("/login");
  };

  return (
    <>
      <aside 
        className={cn(
          "sidebar sidebar-transition w-64 bg-card border-r border-border flex-shrink-0 overflow-y-auto scrollbar-thin",
          !isOpen && "lg:translate-x-0 -translate-x-full",
          isOpen && "translate-x-0 open",
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
              <h1 className="text-lg font-bold text-foreground">The Dawn Trader</h1>
              <p className="text-xs text-muted-foreground">Pro Platform</p>
            </div>
          </div>
          
          {/* Navigation */}
          <nav className="space-y-1">
            {navigation.map((item) => {
              // Phase 27.3: Permission-based navigation visibility
              // Hide admin-only items from non-admin users
              if ((item as any).adminOnly && !user.isAdmin) {
                return null;
              }
              
              // Hide permission-gated items if user lacks the permission
              if ((item as any).requiresPermission && !can((item as any).requiresPermission)) {
                return null;
              }
              
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
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => onClose()}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                  {item.name === "Trading" && activeTrades.length > 0 && (
                    <span className="ml-auto bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full">
                      {activeTrades.length}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          
          {/* Account Info */}
          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.username || "Trader"}
                </p>
                <p className="text-xs text-muted-foreground">Trading Account</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
