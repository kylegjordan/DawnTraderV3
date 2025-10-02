import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/hooks/use-trading";
import { 
  Settings as SettingsIcon, 
  Shield, 
  Brain, 
  Bell, 
  Key, 
  DollarSign,
  Target,
  TrendingUp,
  AlertTriangle,
  Save,
  RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { settings, settingsLoading, updateSettings, isUpdatingSettings } = useTrading();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    // Risk & Exposure
    riskPerTrade: '',
    maxExposurePercent: '',
    maxOpenTrades: 3,
    
    // Strategy Parameters
    stopBufferPercent: '',
    smaLength: 20,
    minVolume: '',
    minDailyRange: '',
    slippageToleranceMajors: '',
    slippageToleranceMidcaps: '',
    slippageToleranceSmall: '',
    
    // AI Settings
    aiCapitalAllocation: false,
    
    // API Credentials (placeholder - would be handled securely)
    krakenApiKey: '',
    krakenApiSecret: '',
    
    // Notification Settings
    emailNotifications: true,
    pushNotifications: true,
    telegramNotifications: false,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00'
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        riskPerTrade: settings.riskPerTrade,
        maxExposurePercent: settings.maxExposurePercent,
        maxOpenTrades: settings.maxOpenTrades,
        stopBufferPercent: settings.stopBufferPercent,
        smaLength: settings.smaLength,
        minVolume: settings.minVolume,
        minDailyRange: settings.minDailyRange,
        slippageToleranceMajors: settings.slippageToleranceMajors,
        slippageToleranceMidcaps: settings.slippageToleranceMidcaps,
        slippageToleranceSmall: settings.slippageToleranceSmall,
        aiCapitalAllocation: settings.aiCapitalAllocation,
        
        // These would come from user settings in a real app
        krakenApiKey: '',
        krakenApiSecret: '',
        emailNotifications: true,
        pushNotifications: true,
        telegramNotifications: false,
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00'
      });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      const settingsUpdate = {
        riskPerTrade: formData.riskPerTrade,
        maxExposurePercent: formData.maxExposurePercent,
        maxOpenTrades: formData.maxOpenTrades,
        stopBufferPercent: formData.stopBufferPercent,
        smaLength: formData.smaLength,
        minVolume: formData.minVolume,
        minDailyRange: formData.minDailyRange,
        slippageToleranceMajors: formData.slippageToleranceMajors,
        slippageToleranceMidcaps: formData.slippageToleranceMidcaps,
        slippageToleranceSmall: formData.slippageToleranceSmall,
        aiCapitalAllocation: formData.aiCapitalAllocation,
        krakenApiKey: formData.krakenApiKey,
        krakenApiSecret: formData.krakenApiSecret
      };

      await updateSettings(settingsUpdate);
      
      toast({
        title: "Settings Saved",
        description: "Your trading settings and API credentials have been updated successfully.",
      });
      
      // Clear the credential fields after successful save for security
      setFormData(prev => ({
        ...prev,
        krakenApiKey: '',
        krakenApiSecret: ''
      }));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    if (settings) {
      setFormData({
        riskPerTrade: settings.riskPerTrade,
        maxExposurePercent: settings.maxExposurePercent,
        maxOpenTrades: settings.maxOpenTrades,
        stopBufferPercent: settings.stopBufferPercent,
        smaLength: settings.smaLength,
        minVolume: settings.minVolume,
        minDailyRange: settings.minDailyRange,
        slippageToleranceMajors: settings.slippageToleranceMajors,
        slippageToleranceMidcaps: settings.slippageToleranceMidcaps,
        slippageToleranceSmall: settings.slippageToleranceSmall,
        aiCapitalAllocation: settings.aiCapitalAllocation,
        krakenApiKey: '',
        krakenApiSecret: '',
        emailNotifications: true,
        pushNotifications: true,
        telegramNotifications: false,
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00'
      });
    }
  };

  if (settingsLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="settings-page">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-12 h-12 rounded-lg" />
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="settings-page">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          <SettingsIcon className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground">Configure your trading parameters and preferences</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleSave}
          disabled={isUpdatingSettings}
          className="flex items-center gap-2"
          data-testid="button-save-settings"
        >
          <Save className="w-4 h-4" />
          {isUpdatingSettings ? 'Saving...' : 'Save Changes'}
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          className="flex items-center gap-2"
          data-testid="button-reset-settings"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </Button>
      </div>

      <Tabs defaultValue="risk" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="risk" data-testid="tab-risk">Risk & Exposure</TabsTrigger>
          <TabsTrigger value="strategies" data-testid="tab-strategies">Strategy Params</TabsTrigger>
          <TabsTrigger value="ai" data-testid="tab-ai">AI Settings</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* Risk & Exposure Tab */}
        <TabsContent value="risk" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-destructive" />
                Risk Management
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure position sizing and exposure limits to protect your capital
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="risk-per-trade" className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Risk Per Trade ($)
                  </Label>
                  <Input
                    id="risk-per-trade"
                    type="number"
                    step="0.01"
                    min="1"
                    max="10000"
                    value={formData.riskPerTrade}
                    onChange={(e) => setFormData(prev => ({ ...prev, riskPerTrade: e.target.value }))}
                    data-testid="input-risk-per-trade"
                  />
                  <p className="text-xs text-muted-foreground">
                    Amount you're willing to risk per trade
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-exposure" className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Max Exposure (%)
                  </Label>
                  <Input
                    id="max-exposure"
                    type="number"
                    step="0.1"
                    min="1"
                    max="100"
                    value={formData.maxExposurePercent}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxExposurePercent: e.target.value }))}
                    data-testid="input-max-exposure"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum portfolio exposure across all trades
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-trades">Max Open Trades</Label>
                  <Select
                    value={formData.maxOpenTrades.toString()}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, maxOpenTrades: parseInt(value) }))}
                  >
                    <SelectTrigger data-testid="select-max-trades">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Trade</SelectItem>
                      <SelectItem value="2">2 Trades</SelectItem>
                      <SelectItem value="3">3 Trades</SelectItem>
                      <SelectItem value="5">5 Trades</SelectItem>
                      <SelectItem value="10">10 Trades</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Maximum number of concurrent positions
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stop-buffer">Stop Buffer (%)</Label>
                  <Input
                    id="stop-buffer"
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="5"
                    value={formData.stopBufferPercent}
                    onChange={(e) => setFormData(prev => ({ ...prev, stopBufferPercent: e.target.value }))}
                    data-testid="input-stop-buffer"
                  />
                  <p className="text-xs text-muted-foreground">
                    Additional buffer beyond calculated stop levels
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Strategy Parameters Tab */}
        <TabsContent value="strategies" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-chart-2" />
                Strategy Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="sma-length">SMA Length (periods)</Label>
                  <Input
                    id="sma-length"
                    type="number"
                    min="5"
                    max="200"
                    value={formData.smaLength}
                    onChange={(e) => setFormData(prev => ({ ...prev, smaLength: parseInt(e.target.value) || 20 }))}
                    data-testid="input-sma-length"
                  />
                  <p className="text-xs text-muted-foreground">
                    Simple Moving Average period for SMA Trend Ride strategy
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="min-volume">Min 24h Volume ($)</Label>
                  <Input
                    id="min-volume"
                    type="number"
                    step="1000000"
                    min="1000000"
                    value={formData.minVolume}
                    onChange={(e) => setFormData(prev => ({ ...prev, minVolume: e.target.value }))}
                    data-testid="input-min-volume"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum 24-hour trading volume for screening
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="min-range">Min Daily Range (%)</Label>
                  <Input
                    id="min-range"
                    type="number"
                    step="0.1"
                    min="1"
                    max="50"
                    value={formData.minDailyRange}
                    onChange={(e) => setFormData(prev => ({ ...prev, minDailyRange: e.target.value }))}
                    data-testid="input-min-range"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum daily price range for volatility screening
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Slippage Tolerance
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Badge variant="default" className="text-xs">Major Pairs</Badge>
                      Majors (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="5"
                      value={formData.slippageToleranceMajors}
                      onChange={(e) => setFormData(prev => ({ ...prev, slippageToleranceMajors: e.target.value }))}
                      data-testid="input-slippage-majors"
                    />
                    <p className="text-xs text-muted-foreground">BTC, ETH, top-20 coins</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">Mid-caps</Badge>
                      Mid-caps (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="10"
                      value={formData.slippageToleranceMidcaps}
                      onChange={(e) => setFormData(prev => ({ ...prev, slippageToleranceMidcaps: e.target.value }))}
                      data-testid="input-slippage-midcaps"
                    />
                    <p className="text-xs text-muted-foreground">Mid-cap cryptocurrencies</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Small/Meme</Badge>
                      Small (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.1"
                      max="20"
                      value={formData.slippageToleranceSmall}
                      onChange={(e) => setFormData(prev => ({ ...prev, slippageToleranceSmall: e.target.value }))}
                      data-testid="input-slippage-small"
                    />
                    <p className="text-xs text-muted-foreground">Small-cap and meme coins</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-chart-3" />
                AI Configuration
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure AI-powered features and capital allocation
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="ai-allocation" className="text-sm font-medium">
                    AI Capital Allocation
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Allow AI to recommend capital distribution across signals
                  </p>
                </div>
                <Switch
                  id="ai-allocation"
                  checked={formData.aiCapitalAllocation}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, aiCapitalAllocation: checked }))}
                  data-testid="switch-ai-allocation"
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-foreground">Report Preferences</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium">Daily Reports</Label>
                      <Switch defaultChecked data-testid="switch-daily-reports" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Receive daily trading performance analysis
                    </p>
                  </div>

                  <div className="p-4 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium">Weekly Reports</Label>
                      <Switch defaultChecked data-testid="switch-weekly-reports" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Get weekly strategy performance summaries
                    </p>
                  </div>

                  <div className="p-4 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium">Monthly Reports</Label>
                      <Switch defaultChecked data-testid="switch-monthly-reports" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Comprehensive monthly performance analysis
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-chart-4" />
                Notification Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive trade alerts and reports via email
                    </p>
                  </div>
                  <Switch
                    checked={formData.emailNotifications}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, emailNotifications: checked }))}
                    data-testid="switch-email-notifications"
                  />
                </div>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Push Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Browser push notifications for trade executions
                    </p>
                  </div>
                  <Switch
                    checked={formData.pushNotifications}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, pushNotifications: checked }))}
                    data-testid="switch-push-notifications"
                  />
                </div>

                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Telegram Notifications</Label>
                    <p className="text-xs text-muted-foreground">
                      Send alerts to your Telegram bot
                    </p>
                  </div>
                  <Switch
                    checked={formData.telegramNotifications}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, telegramNotifications: checked }))}
                    data-testid="switch-telegram-notifications"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Quiet Hours</Label>
                    <p className="text-xs text-muted-foreground">
                      Disable notifications during specified hours
                    </p>
                  </div>
                  <Switch
                    checked={formData.quietHoursEnabled}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, quietHoursEnabled: checked }))}
                    data-testid="switch-quiet-hours"
                  />
                </div>

                {formData.quietHoursEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/20 rounded-lg">
                    <div className="space-y-2">
                      <Label htmlFor="quiet-start">Start Time</Label>
                      <Input
                        id="quiet-start"
                        type="time"
                        value={formData.quietHoursStart}
                        onChange={(e) => setFormData(prev => ({ ...prev, quietHoursStart: e.target.value }))}
                        data-testid="input-quiet-start"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quiet-end">End Time</Label>
                      <Input
                        id="quiet-end"
                        type="time"
                        value={formData.quietHoursEnd}
                        onChange={(e) => setFormData(prev => ({ ...prev, quietHoursEnd: e.target.value }))}
                        data-testid="input-quiet-end"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* API Credentials */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                API Credentials
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure your exchange API credentials for live trading
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status indicators */}
              {(settings as any)?.krakenApiKeySet && (
                <div className="flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-sm text-success font-medium">API credentials are configured</span>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="kraken-key">Kraken API Key</Label>
                <Input
                  id="kraken-key"
                  type="password"
                  placeholder={(settings as any)?.krakenApiKeySet ? "••••••••••••••••" : "Enter your Kraken API key"}
                  value={formData.krakenApiKey}
                  onChange={(e) => setFormData(prev => ({ ...prev, krakenApiKey: e.target.value }))}
                  data-testid="input-kraken-key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kraken-secret">Kraken API Secret</Label>
                <Input
                  id="kraken-secret"
                  type="password"
                  placeholder={(settings as any)?.krakenApiSecretSet ? "••••••••••••••••" : "Enter your Kraken API secret"}
                  value={formData.krakenApiSecret}
                  onChange={(e) => setFormData(prev => ({ ...prev, krakenApiSecret: e.target.value }))}
                  data-testid="input-kraken-secret"
                />
              </div>
              
              <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg space-y-2">
                <p className="text-sm text-warning font-medium">Security Options</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Option 1 (Database):</strong> Store credentials in the database (saved when you click Save Settings). ⚠️ Stored in plaintext - not encrypted.</p>
                  <p><strong>Option 2 (Recommended):</strong> Use environment secrets KRAKEN_API_KEY and KRAKEN_API_SECRET in the Secrets panel. ✓ More secure.</p>
                  <p className="mt-2"><strong>Priority:</strong> Environment secrets → Database → None</p>
                  <p className="text-warning">Never share your API keys. To clear stored database credentials, save with empty fields.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
