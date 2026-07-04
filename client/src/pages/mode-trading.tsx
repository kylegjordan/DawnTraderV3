/**
 * P19-B8.1 — ModeTradingPage: the single parameterized shell behind the three
 * mode pages (Live Trading / Paper Trading / Virtual Simulations).
 *
 * ONE shell + per-mode TAB MANIFESTS, not three page trees (Langston Q2 ruling:
 * divergent per-mode copies are how sim-to-live parity rots). Each manifest
 * entry names a shared tab component and, implicitly through it, the pinned
 * data-source endpoints (pre-audit §2 contract) — the mode axis lives HERE,
 * not in component-local checks.
 */
import { useState, Component, type ErrorInfo, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import MaintenanceBanner from "@/components/maintenance/maintenance-banner";
import ModeBanner from "@/components/mode-banner";

export type TradingModePage = 'live' | 'paper' | 'vts';

export interface ModeTabDef {
  key: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  render: () => ReactNode;
}

export interface ModeTradingPageConfig {
  mode: TradingModePage;
  title: string;
  subtitle: string;
  tabs: ModeTabDef[];
  defaultTab: string;
  /** Optional per-page control block (paper/live start-stop). VTS passes none. */
  controls?: ReactNode;
}

interface ErrorBoundaryState { hasError: boolean; error: Error | null }

class ModePageErrorBoundary extends Component<{ children: ReactNode; title: string }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; title: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`${this.props.title} page error:`, error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 space-y-4">
          <Card className="border-destructive">
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <CardTitle>Error Loading {this.props.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <Button onClick={() => window.location.reload()}>Reload Page</Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ModeTradingPage({ config }: { config: ModeTradingPageConfig }) {
  const [activeTab, setActiveTab] = useState(config.defaultTab);
  const cols = config.tabs.length;

  return (
    <ModePageErrorBoundary title={config.title}>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid={`${config.mode}-trading-page`}>
        <MaintenanceBanner />
        {config.mode !== 'vts' && <ModeBanner />}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{config.title}</h1>
            <p className="text-muted-foreground">{config.subtitle}</p>
          </div>
          {config.controls}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList
            className="grid w-full"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            data-testid={`${config.mode}-trading-tabs`}
          >
            {config.tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
                data-testid={`tab-${config.mode}-${tab.key}`}
              >
                <tab.icon className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">{tab.label}</span>
                <span className="xs:hidden">{tab.shortLabel}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {config.tabs.map((tab) => (
            <TabsContent key={tab.key} value={tab.key} className="mt-6">
              {activeTab === tab.key ? tab.render() : null}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ModePageErrorBoundary>
  );
}
