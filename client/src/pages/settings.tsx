import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useTrading } from "@/hooks/use-trading";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import { 
  Settings as SettingsIcon, 
  Bell,
  Save,
  RotateCcw,
  Shield,
  Users,
  UserPlus,
  Loader2,
  AlertCircle,
  HelpCircle,
  Key,
  FileJson
} from "lucide-react";
import { timezones } from "@/lib/timezone";
import { ConfigSnapshotViewer } from "@/components/ConfigSnapshotViewer";
import { AuditLogViewer } from "@/components/AuditLogViewer";
import { OverrideFrequencyChart } from "@/components/OverrideFrequencyChart";

const SETTINGS_TAB_KEY = "settings_active_tab";

export default function Settings() {
  const { settings, settingsLoading, updateSettings, isUpdatingSettings } = useTrading();
  const { toast } = useToast();
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  
  // Tab state with localStorage persistence
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem(SETTINGS_TAB_KEY) || "general";
  });

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    localStorage.setItem(SETTINGS_TAB_KEY, value);
  };

  // Help overlay state
  const [showHelp, setShowHelp] = useState(false);

  // General Settings State
  // B-NEW-TZ (2026-05-14): timezone fallback corrected from 'Asia/Dubai' to 'UTC'
  // so a missing saved value is obvious instead of silently rendering Dubai.
  const [generalFormData, setGeneralFormData] = useState({
    emailNotifications: (settings as any)?.emailNotifications ?? true,
    pushNotifications: (settings as any)?.pushNotifications ?? true,
    telegramNotifications: (settings as any)?.telegramNotifications ?? false,
    showSystemAlerts: (settings as any)?.showSystemAlerts !== false, // Default true
    timezone: settings?.timezone || 'UTC',
  });

  useEffect(() => {
    if (settings) {
      setGeneralFormData({
        emailNotifications: (settings as any).emailNotifications ?? true,
        pushNotifications: (settings as any).pushNotifications ?? true,
        telegramNotifications: (settings as any).telegramNotifications ?? false,
        showSystemAlerts: (settings as any).showSystemAlerts !== false,
        timezone: settings.timezone || 'UTC',
      });
    }
  }, [settings]);


  // Users Tab State
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    enabled: currentUser.isAdmin,
    refetchInterval: 30000,
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: { email: string; username: string; password: string; isAdmin: boolean }) => {
      return await apiRequest('POST', '/api/admin/users', userData);
    },
    onSuccess: () => {
      toast({
        title: "User Created",
        description: "New user has been created successfully",
      });
      setNewUserEmail("");
      setNewUserUsername("");
      setNewUserPassword("");
      setNewUserIsAdmin(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to create user",
        variant: "destructive",
      });
    }
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      return await apiRequest('PATCH', `/api/admin/users/${userId}`, { isAdmin });
    },
    onSuccess: () => {
      toast({
        title: "User Updated",
        description: "User admin status has been updated",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update user",
        variant: "destructive",
      });
    }
  });

  // Password Reset State and Mutation
  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      return await apiRequest('POST', `/api/admin/users/${userId}/reset-password`, { password });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Password Reset",
        description: data.message || "Password updated successfully",
      });
      setResetPasswordModalOpen(false);
      setSelectedUserForReset(null);
      setResetPassword("");
      setResetPasswordConfirm("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to reset password",
        variant: "destructive",
      });
    }
  });

  // Handlers
  const handleSaveGeneral = async () => {
    try {
      await updateSettings(generalFormData);
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

  const handleResetGeneral = () => {
    setGeneralFormData({
      emailNotifications: true,
      pushNotifications: true,
      telegramNotifications: false,
      showSystemAlerts: true,
      timezone: 'Asia/Dubai',
    });
    toast({
      title: "Reset Complete",
      description: "Settings have been reset to factory defaults.",
    });
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserUsername || !newUserPassword) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    createUserMutation.mutate({
      email: newUserEmail,
      username: newUserUsername,
      password: newUserPassword,
      isAdmin: newUserIsAdmin
    });
  };

  const handleResetPasswordClick = (user: User) => {
    setSelectedUserForReset(user);
    setResetPasswordModalOpen(true);
  };

  const handleResetPasswordSubmit = () => {
    if (!selectedUserForReset) return;
    
    if (!resetPassword || !resetPasswordConfirm) {
      toast({
        title: "Validation Error",
        description: "Please fill in all password fields",
        variant: "destructive",
      });
      return;
    }

    if (resetPassword !== resetPasswordConfirm) {
      toast({
        title: "Validation Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    resetPasswordMutation.mutate({
      userId: selectedUserForReset.id,
      password: resetPassword
    });
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
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
            <SettingsIcon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">Configure your trading platform preferences</p>
          </div>
        </div>
        
        {/* Help Icon */}
        <TooltipProvider>
          <Tooltip open={showHelp} onOpenChange={setShowHelp}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                data-testid="button-help"
              >
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              <div className="space-y-2">
                <p className="font-semibold">Settings Help</p>
                <ul className="text-sm space-y-1.5">
                  <li><strong>General:</strong> Notifications and regional preferences</li>
                  {currentUser.isAdmin && (
                    <>
                      <li><strong>Users:</strong> System user management (admin only)</li>
                      <li><strong>Developer:</strong> Config snapshot viewer and audit verification (admin only)</li>
                    </>
                  )}
                </ul>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full" style={{ gridTemplateColumns: currentUser.isAdmin ? 'repeat(3, 1fr)' : 'repeat(1, 1fr)' }}>
          <TabsTrigger value="general" data-testid="tab-general">General Settings</TabsTrigger>
          {currentUser.isAdmin && (
            <>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
              <TabsTrigger value="developer" data-testid="tab-developer">
                <FileJson className="h-4 w-4 mr-2" />
                Developer
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general" className="space-y-6">
          <div className="flex justify-end gap-3">
            <Button
              onClick={handleResetGeneral}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-reset-general"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
            <Button
              onClick={handleSaveGeneral}
              disabled={isUpdatingSettings}
              className="flex items-center gap-2"
              data-testid="button-save-general"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bell className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">General Preferences</CardTitle>
                  <CardDescription className="mt-1.5">
                    Manage your notification options and regional settings
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive trade alerts and reports via email
                  </p>
                </div>
                <Switch
                  checked={generalFormData.emailNotifications}
                  onCheckedChange={(checked) => setGeneralFormData({...generalFormData, emailNotifications: checked})}
                  data-testid="switch-email-notifications"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Browser push notifications for trade executions
                  </p>
                </div>
                <Switch
                  checked={generalFormData.pushNotifications}
                  onCheckedChange={(checked) => setGeneralFormData({...generalFormData, pushNotifications: checked})}
                  data-testid="switch-push-notifications"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Telegram Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Send alerts to your Telegram bot
                  </p>
                </div>
                <Switch
                  checked={generalFormData.telegramNotifications}
                  onCheckedChange={(checked) => setGeneralFormData({...generalFormData, telegramNotifications: checked})}
                  data-testid="switch-telegram-notifications"
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">System Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Show informational notifications (critical alerts always visible)
                  </p>
                </div>
                <Switch
                  checked={generalFormData.showSystemAlerts}
                  onCheckedChange={(checked) => setGeneralFormData({...generalFormData, showSystemAlerts: checked})}
                  data-testid="switch-system-alerts"
                />
              </div>

              <Separator className="my-6" />

              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-sm font-medium">
                  Preferred Timezone
                </Label>
                <Select 
                  value={generalFormData.timezone} 
                  onValueChange={(value) => setGeneralFormData({...generalFormData, timezone: value})}
                >
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
                <p className="text-xs text-muted-foreground">
                  All times will be displayed in your selected timezone
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab (Admin Only) */}
        {currentUser.isAdmin && (
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <UserPlus className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">User Management</CardTitle>
                    <CardDescription className="mt-1.5">
                      Add, remove, or modify system users
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="user@example.com"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        required
                        data-testid="input-new-user-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        placeholder="username"
                        value={newUserUsername}
                        onChange={(e) => setNewUserUsername(e.target.value)}
                        required
                        data-testid="input-new-user-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Secure password"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        required
                        data-testid="input-new-user-password"
                      />
                    </div>
                    <div className="flex items-center space-x-2 pt-8">
                      <input
                        type="checkbox"
                        id="isAdmin"
                        checked={newUserIsAdmin}
                        onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300"
                        data-testid="checkbox-new-user-admin"
                      />
                      <Label htmlFor="isAdmin" className="font-normal cursor-pointer">
                        Grant admin privileges
                      </Label>
                    </div>
                  </div>
                  <Button 
                    type="submit" 
                    disabled={createUserMutation.isPending}
                    data-testid="button-create-user"
                  >
                    {createUserMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Create User
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Registered Users
                </CardTitle>
                <CardDescription>Manage existing user accounts</CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                    <p className="text-muted-foreground">Loading users...</p>
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No users found
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Username</TableHead>
                          <TableHead>Display Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                            <TableCell className="font-medium">{user.email}</TableCell>
                            <TableCell>{user.username}</TableCell>
                            <TableCell className="text-muted-foreground">{user.displayName || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={user.isAdmin ? "default" : "secondary"}>
                                {user.isAdmin ? (
                                  <>
                                    <Shield className="w-3 h-3 mr-1" />
                                    Admin
                                  </>
                                ) : (
                                  "User"
                                )}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {user.id !== currentUser.id ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleResetPasswordClick(user)}
                                      data-testid={`button-reset-password-${user.id}`}
                                    >
                                      <Key className="w-3 h-3 mr-1" />
                                      Reset Password
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => toggleAdminMutation.mutate({ 
                                        userId: user.id, 
                                        isAdmin: !user.isAdmin 
                                      })}
                                      disabled={toggleAdminMutation.isPending}
                                      data-testid={`button-toggle-admin-${user.id}`}
                                    >
                                      {user.isAdmin ? "Remove Admin" : "Make Admin"}
                                    </Button>
                                  </>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    Current User
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Developer Tab (Admin Only) */}
        {currentUser.isAdmin && (
          <TabsContent value="developer" className="space-y-6">
            <OverrideFrequencyChart />
            <ConfigSnapshotViewer />
            <AuditLogViewer />
          </TabsContent>
        )}
      </Tabs>

      {/* Password Reset Dialog */}
      <Dialog open={resetPasswordModalOpen} onOpenChange={setResetPasswordModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Reset password for {selectedUserForReset?.username} ({selectedUserForReset?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                data-testid="input-reset-password"
              />
              <p className="text-xs text-muted-foreground">
                Must contain at least 8 characters, one uppercase, one number, and one special character
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm new password"
                value={resetPasswordConfirm}
                onChange={(e) => setResetPasswordConfirm(e.target.value)}
                data-testid="input-confirm-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetPasswordModalOpen(false);
                setSelectedUserForReset(null);
                setResetPassword("");
                setResetPasswordConfirm("");
              }}
              data-testid="button-cancel-reset"
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPasswordSubmit}
              disabled={resetPasswordMutation.isPending}
              data-testid="button-confirm-reset"
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Reset Password
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
