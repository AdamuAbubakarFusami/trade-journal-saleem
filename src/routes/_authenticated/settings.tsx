import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, LogOut } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/use-trades";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SaleemJournal" },
      { name: "description", content: "Manage your profile, timezone and notifications." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(true);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setUsername(profile.username ?? "");
    setTimezone(profile.timezone ?? "UTC");
    setEmailNotifications(profile.email_notifications);
    setWeeklyReport(profile.weekly_report);
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error("Profile not loaded");
      if (username.length > 32) throw new Error("Username must be 32 characters or fewer");
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim().slice(0, 60) || null,
          username: username.trim().slice(0, 32) || null,
          timezone: timezone.trim().slice(0, 60) || "UTC",
          email_notifications: emailNotifications,
          weekly_report: weeklyReport,
        })
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save settings"),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell title="Settings" description="Your profile and journal preferences">
      {isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="surface-card p-6">
            <h2 className="text-sm font-semibold">Profile</h2>
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display_name">Display name</Label>
                <Input
                  id="display_name"
                  maxLength={60}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  maxLength={32}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  maxLength={60}
                  placeholder="Europe/London"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </div>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="surface-card p-6">
              <h2 className="text-sm font-semibold">Notifications</h2>
              <div className="mt-5 space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Email notifications</p>
                    <p className="text-xs text-muted-foreground">
                      Trade reminders and account updates.
                    </p>
                  </div>
                  <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Weekly performance report</p>
                    <p className="text-xs text-muted-foreground">
                      A Monday recap of your stats and psychology trends.
                    </p>
                  </div>
                  <Switch checked={weeklyReport} onCheckedChange={setWeeklyReport} />
                </div>
                <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending}>
                  Save preferences
                </Button>
              </div>
            </div>

            <div className="surface-card p-6">
              <h2 className="text-sm font-semibold">Account</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Sign out of SaleemJournal on this device.
              </p>
              <Button variant="outline" className="mt-4" onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
