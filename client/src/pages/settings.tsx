import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/hooks/use-trading";
import { 
  Settings as SettingsIcon, 
  Bell,
  Save,
  RotateCcw
} from "lucide-react";
import { timezones } from "@/lib/timezone";

export default function Settings() {
  const { settings, settingsLoading, updateSettings, isUpdatingSettings } = useTrading();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    // Notification Settings
    emailNotifications: true,
    pushNotifications: true,
    telegramNotifications: false,
    
    // Display Settings
    timezone: 'Asia/Dubai',
    timeFormat: '12hr' as '12hr' | '24hr'
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        emailNotifications: true,
        pushNotifications: true,
        telegramNotifications: false,
        timezone: settings.timezone || 'Asia/Dubai',
        timeFormat: (settings.timeFormat as '12hr' | '24hr') || '12hr'
      });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings(formData);
      
      toast({
        title: "Settings Saved",
        description: "Your notification settings have been updated successfully.",
      });
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
        emailNotifications: true,
        pushNotifications: true,
        telegramNotifications: false,
        timezone: settings.timezone || 'Asia/Dubai',
        timeFormat: (settings.timeFormat as '12hr' | '24hr') || '12hr'
      });
      
      toast({
        title: "Reset Complete",
        description: "Settings have been reset to last saved values.",
      });
    }
  };

  if (settingsLoading) {
    return (
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <Skeleton className="h-12 w-64 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <SettingsIcon className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground mt-1">Configure your notification preferences</p>
            </div>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleReset}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-reset"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={isUpdatingSettings}
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="button-save"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Notification Settings</CardTitle>
              <CardDescription className="mt-1.5">
                Configure how you want to receive trade alerts and system notifications
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive trade alerts and reports via email
              </p>
            </div>
            <Switch
              checked={formData.emailNotifications}
              onCheckedChange={(checked) => setFormData({...formData, emailNotifications: checked})}
              data-testid="switch-email-notifications"
            />
          </div>

          <Separator />

          {/* Push Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Push Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Browser push notifications for trade executions
              </p>
            </div>
            <Switch
              checked={formData.pushNotifications}
              onCheckedChange={(checked) => setFormData({...formData, pushNotifications: checked})}
              data-testid="switch-push-notifications"
            />
          </div>

          <Separator />

          {/* Telegram Notifications */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Telegram Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Send alerts to your Telegram bot
              </p>
            </div>
            <Switch
              checked={formData.telegramNotifications}
              onCheckedChange={(checked) => setFormData({...formData, telegramNotifications: checked})}
              data-testid="switch-telegram-notifications"
            />
          </div>

          <Separator className="my-8" />

          {/* Display Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Display Settings</h3>
            
            {/* Timezone */}
            <div className="space-y-2 mb-4">
              <Label htmlFor="timezone" className="text-sm font-medium">
                Timezone
              </Label>
              <Select value={formData.timezone} onValueChange={(value) => setFormData({...formData, timezone: value})}>
                <SelectTrigger data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {timezones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Format */}
            <div className="space-y-2">
              <Label htmlFor="timeFormat" className="text-sm font-medium">
                Time Format
              </Label>
              <Select value={formData.timeFormat} onValueChange={(value: '12hr' | '24hr') => setFormData({...formData, timeFormat: value})}>
                <SelectTrigger data-testid="select-time-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12hr">12-hour (2:30 PM)</SelectItem>
                  <SelectItem value="24hr">24-hour (14:30)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
