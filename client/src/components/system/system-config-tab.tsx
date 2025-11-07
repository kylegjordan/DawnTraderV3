import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, RefreshCw } from "lucide-react";

interface ConfigEntry {
  id: string;
  key: string;
  value: any;
  type: string;
  updatedAt: string;
  updatedBy?: string;
}

function NumberConfigRow({ 
  config, 
  saving, 
  onUpdate 
}: { 
  config: ConfigEntry; 
  saving: string | null; 
  onUpdate: (key: string, value: number) => void;
}) {
  const [editValue, setEditValue] = useState(String(config.value));

  // Sync editValue when config.value changes (after reload)
  useEffect(() => {
    setEditValue(String(config.value));
  }, [config.value]);

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
      <div className="flex-1">
        <Label htmlFor={config.key} className="text-base font-medium">
          {config.key}
        </Label>
        <p className="text-sm text-muted-foreground mt-1">
          Last updated: {new Date(config.updatedAt).toLocaleString()}
          {config.updatedBy && ` by ${config.updatedBy}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={config.key}
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="w-32"
          disabled={saving === config.key}
        />
        <Button
          size="sm"
          onClick={() => onUpdate(config.key, parseFloat(editValue))}
          disabled={saving === config.key || editValue === String(config.value)}
        >
          {saving === config.key ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

function StringConfigRow({ 
  config, 
  saving, 
  onUpdate 
}: { 
  config: ConfigEntry; 
  saving: string | null; 
  onUpdate: (key: string, value: string) => void;
}) {
  const [editValue, setEditValue] = useState(String(config.value));

  // Sync editValue when config.value changes (after reload)
  useEffect(() => {
    setEditValue(String(config.value));
  }, [config.value]);

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
      <div className="flex-1">
        <Label htmlFor={config.key} className="text-base font-medium">
          {config.key}
        </Label>
        <p className="text-sm text-muted-foreground mt-1">
          Type: {config.type} | Last updated: {new Date(config.updatedAt).toLocaleString()}
          {config.updatedBy && ` by ${config.updatedBy}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={config.key}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="w-64"
          disabled={saving === config.key}
        />
        <Button
          size="sm"
          onClick={() => onUpdate(config.key, editValue)}
          disabled={saving === config.key || editValue === String(config.value)}
        >
          {saving === config.key ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default function SystemConfigTab() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  async function loadConfigs() {
    try {
      setLoading(true);
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("Failed to load configs");
      const data = await res.json();
      setConfigs(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load configuration",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function updateConfig(key: string, value: any, type: string) {
    try {
      setSaving(key);
      const token = localStorage.getItem('token');
      
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ key, value, type }),
      });

      if (!res.ok) throw new Error("Failed to update config");

      toast({
        title: "Success",
        description: `${key} updated successfully`,
      });

      await loadConfigs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  function handleBooleanChange(key: string, value: boolean) {
    updateConfig(key, value, "boolean");
  }

  function handleNumberChange(key: string, value: number) {
    updateConfig(key, value, "number");
  }

  function handleStringChange(key: string, value: string) {
    updateConfig(key, value, "string");
  }

  useEffect(() => {
    loadConfigs();
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    );
  }

  const booleanConfigs = configs.filter((c) => c.type === "boolean");
  const numberConfigs = configs.filter((c) => c.type === "number");
  const otherConfigs = configs.filter((c) => c.type !== "boolean" && c.type !== "number");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold tracking-tight">Runtime Configuration</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage feature flags and system parameters without code deployments
          </p>
        </div>
        <Button onClick={loadConfigs} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Boolean Configs (Feature Flags) */}
      {booleanConfigs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Feature Flags</CardTitle>
            <CardDescription>Enable or disable system features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {booleanConfigs.map((config) => (
              <div
                key={config.key}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex-1">
                  <Label htmlFor={config.key} className="text-base font-medium">
                    {config.key}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Last updated: {new Date(config.updatedAt).toLocaleString()}
                    {config.updatedBy && ` by ${config.updatedBy}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={config.key}
                    checked={config.value === true}
                    onCheckedChange={(checked) => handleBooleanChange(config.key, checked)}
                    disabled={saving === config.key}
                  />
                  {saving === config.key && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Number Configs (Limits & Thresholds) */}
      {numberConfigs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Limits & Thresholds</CardTitle>
            <CardDescription>Configure numeric parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {numberConfigs.map((config) => (
              <NumberConfigRow
                key={config.key}
                config={config}
                saving={saving}
                onUpdate={handleNumberChange}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Other Configs */}
      {otherConfigs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Other Configuration</CardTitle>
            <CardDescription>Additional system settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {otherConfigs.map((config) => (
              <StringConfigRow
                key={config.key}
                config={config}
                saving={saving}
                onUpdate={handleStringChange}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>• Total configurations: {configs.length}</p>
            <p>• Boolean flags: {booleanConfigs.length}</p>
            <p>• Numeric parameters: {numberConfigs.length}</p>
            <p>• All changes are logged and auditable</p>
            <p>• Changes take effect immediately</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
