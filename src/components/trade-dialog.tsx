import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DIRECTIONS, EMOTIONS, MARKETS, SESSIONS, TIMEFRAMES, type Trade } from "@/lib/trades";

type FormState = Record<string, string | number>;

const empty: FormState = {
  asset: "",
  market: "forex",
  direction: "long",
  entry_price: "",
  exit_price: "",
  stop_loss: "",
  take_profit: "",
  position_size: "",
  risk_percent: "",
  profit_loss: "",
  rr_ratio: "",
  strategy: "",
  setup_type: "",
  session: "london",
  timeframe: "1h",
  confidence_level: 5,
  emotional_state: "calm",
  fear_level: 3,
  greed_level: 3,
  discipline_level: 7,
  patience_level: 7,
  psychology_before: "",
  psychology_after: "",
  notes: "",
  screenshot_url: "",
  opened_at: "",
};

function toLocalInput(value?: string | null) {
  const d = value ? new Date(value) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

const num = (v: string | number) => (v === "" || v === null || v === undefined ? null : Number(v));

export function TradeDialog({
  open,
  onOpenChange,
  trade,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trade?: Trade | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);

  useEffect(() => {
    if (!open) return;
    if (trade) {
      const next: FormState = { ...empty };
      for (const key of Object.keys(empty)) {
        const v = (trade as unknown as Record<string, unknown>)[key];
        if (v !== null && v !== undefined) next[key] = v as string | number;
      }
      next.opened_at = toLocalInput(trade.opened_at);
      setForm(next);
    } else {
      setForm({ ...empty, opened_at: toLocalInput() });
    }
  }, [open, trade]);

  const set = (key: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      const asset = String(form.asset).trim();
      if (!asset) throw new Error("Asset is required");
      if (asset.length > 40) throw new Error("Asset name is too long");

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("You are signed out");

      const payload = {
        user_id: userData.user.id,
        asset,
        market: String(form.market),
        direction: String(form.direction),
        entry_price: num(form.entry_price),
        exit_price: num(form.exit_price),
        stop_loss: num(form.stop_loss),
        take_profit: num(form.take_profit),
        position_size: num(form.position_size),
        risk_percent: num(form.risk_percent),
        profit_loss: Number(form.profit_loss || 0),
        rr_ratio: num(form.rr_ratio),
        strategy: String(form.strategy).trim().slice(0, 80) || null,
        setup_type: String(form.setup_type).trim().slice(0, 80) || null,
        session: String(form.session),
        timeframe: String(form.timeframe),
        confidence_level: Number(form.confidence_level),
        emotional_state: String(form.emotional_state),
        fear_level: Number(form.fear_level),
        greed_level: Number(form.greed_level),
        discipline_level: Number(form.discipline_level),
        patience_level: Number(form.patience_level),
        psychology_before: String(form.psychology_before).slice(0, 1000) || null,
        psychology_after: String(form.psychology_after).slice(0, 1000) || null,
        notes: String(form.notes).slice(0, 2000) || null,
        screenshot_url: String(form.screenshot_url).trim().slice(0, 500) || null,
        opened_at: new Date(String(form.opened_at)).toISOString(),
      };

      if (trade) {
        const { error } = await supabase.from("trades").update(payload).eq("id", trade.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("trades").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      toast.success(trade ? "Trade updated" : "Trade logged");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save trade"),
  });

  const numberField = (key: string, label: string, step = "any") => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        step={step}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  );

  const scale = (key: string, label: string) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="num text-sm text-muted-foreground">{form[key]}/10</span>
      </div>
      <Slider
        value={[Number(form[key])]}
        min={1}
        max={10}
        step={1}
        onValueChange={([v]) => set(key, v)}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="safe-b flex max-h-[92dvh] flex-col gap-4 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 px-4 pt-5 text-left sm:px-6">
          <DialogTitle>{trade ? "Edit trade" : "Log a trade"}</DialogTitle>
          <DialogDescription>Capture the execution and the mindset behind it.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="execution" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-2 sm:px-6">
          <TabsList className="grid w-full grid-cols-3 text-xs sm:text-sm">
            <TabsTrigger value="execution">Execution</TabsTrigger>
            <TabsTrigger value="context">Context</TabsTrigger>
            <TabsTrigger value="psychology">Psychology</TabsTrigger>
          </TabsList>

          <TabsContent value="execution" className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="asset">Asset</Label>
              <Input
                id="asset"
                maxLength={40}
                placeholder="EURUSD"
                value={form.asset as string}
                onChange={(e) => set("asset", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Market</Label>
              <Select value={String(form.market)} onValueChange={(v) => set("market", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={String(form.direction)} onValueChange={(v) => set("direction", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="opened_at">Date & time</Label>
              <Input
                id="opened_at"
                type="datetime-local"
                value={form.opened_at as string}
                onChange={(e) => set("opened_at", e.target.value)}
              />
            </div>
            {numberField("entry_price", "Entry price")}
            {numberField("exit_price", "Exit price")}
            {numberField("stop_loss", "Stop loss")}
            {numberField("take_profit", "Take profit")}
            {numberField("position_size", "Position size")}
            {numberField("risk_percent", "Risk %")}
            {numberField("profit_loss", "Profit / Loss ($)")}
            {numberField("rr_ratio", "RR ratio")}
          </TabsContent>

          <TabsContent value="context" className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <Input
                id="strategy"
                maxLength={80}
                placeholder="Breakout continuation"
                value={form.strategy as string}
                onChange={(e) => set("strategy", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup_type">Setup type</Label>
              <Input
                id="setup_type"
                maxLength={80}
                placeholder="Liquidity sweep"
                value={form.setup_type as string}
                onChange={(e) => set("setup_type", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Session</Label>
              <Select value={String(form.session)} onValueChange={(v) => set("session", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timeframe</Label>
              <Select value={String(form.timeframe)} onValueChange={(v) => set("timeframe", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEFRAMES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">{scale("confidence_level", "Confidence level")}</div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="screenshot_url">Screenshot URL</Label>
              <Input
                id="screenshot_url"
                maxLength={500}
                placeholder="https://..."
                value={form.screenshot_url as string}
                onChange={(e) => set("screenshot_url", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">Trade notes</Label>
              <Textarea
                id="notes"
                rows={4}
                maxLength={2000}
                value={form.notes as string}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </TabsContent>

          <TabsContent value="psychology" className="mt-4 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Emotional state</Label>
              <Select
                value={String(form.emotional_state)}
                onValueChange={(v) => set("emotional_state", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMOTIONS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scale("fear_level", "Fear")}
            {scale("greed_level", "Greed")}
            {scale("discipline_level", "Discipline")}
            {scale("patience_level", "Patience")}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="psychology_before">Psychology before the trade</Label>
              <Textarea
                id="psychology_before"
                rows={3}
                maxLength={1000}
                value={form.psychology_before as string}
                onChange={(e) => set("psychology_before", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="psychology_after">Psychology after the trade</Label>
              <Textarea
                id="psychology_after"
                rows={3}
                maxLength={1000}
                value={form.psychology_after as string}
                onChange={(e) => set("psychology_after", e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-4 py-3 sm:px-6">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {trade ? "Save changes" : "Log trade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
