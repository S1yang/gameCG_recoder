import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import {
  Save,
  RotateCcw,
  FileCode,
  Cpu,
  Layers,
  AlertCircle,
} from "lucide-react";

type Props = {
  apiBase: string;
  ok: boolean;
  onSaved?: () => void;
};

// --- API Helpers ---
async function apiGet(base: string, path: string) {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPut(base: string, path: string, body?: any) {
  const r = await fetch(`${base}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPost(base: string, path: string, body?: any) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// --- Utils & Types ---
type Cfg = Record<string, any>;

function num(v: any, fallback: number) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function getIn(obj: any, path: string, fallback?: any) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return fallback;
    cur = cur[p];
  }
  return cur === undefined ? fallback : cur;
}
function setIn(obj: any, path: string, value: any) {
  const parts = path.split(".");
  const out = { ...(obj || {}) };
  let cur: any = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const next = cur[k];
    cur[k] = typeof next === "object" && next != null ? { ...next } : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return out;
}

// --- UI Components ---
function Field({
  label,
  desc,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  desc?: string;
  value: any;
  onChange: (v: any) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="bg-background"
      />
      {desc ? (
        <div className="text-[11px] text-muted-foreground leading-tight">
          {desc}
        </div>
      ) : null}
    </div>
  );
}

function NumField({
  label,
  desc,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  desc?: string;
  value: any;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Input
        value={String(value ?? "")}
        onChange={(e) => onChange(num(e.target.value, 0))}
        type="number"
        step={step ?? 0.01}
        min={min}
        max={max}
        className="font-mono bg-background"
      />
      {desc ? (
        <div className="text-[11px] text-muted-foreground leading-tight">
          {desc}
        </div>
      ) : null}
    </div>
  );
}

function BoolField({
  label,
  desc,
  checked,
  onCheckedChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3 bg-background/50">
      <div className="grid gap-1">
        <div className="text-sm font-medium">{label}</div>
        {desc ? (
          <div className="text-[11px] text-muted-foreground">{desc}</div>
        ) : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// --- Main Component ---
export function ConfigTab({ apiBase, ok, onSaved }: Props) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busyDefault, setBusyDefault] = useState(false);
  const [busyApply, setBusyApply] = useState<"" | "merge" | "replace">("");

  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [cfgPath, setCfgPath] = useState<string>("");
  const [defaultPath, setDefaultPath] = useState<string>("");
  const [defaultExists, setDefaultExists] = useState<boolean>(false);

  const titleOk = useMemo(() => {
    const t = (cfg?.game_window_title || "").trim();
    return t.length > 0;
  }, [cfg]);

  const reload = async () => {
    if (!apiBase) return;
    setBusy(true);
    try {
      setErr("");
      const j = await apiGet(apiBase, "/config");
      setCfg(j.config || {});
      setCfgPath(j.config_path || "");

      const dj = await apiGet(apiBase, "/config/default_template").catch(
        () => null
      );
      if (dj) {
        setDefaultPath(dj.path || "");
        setDefaultExists(Boolean(dj.exists));
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (apiBase && ok) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, ok]);

  const update = (path: string, value: any) => {
    setCfg((prev) => setIn(prev || {}, path, value));
  };

  const onSave = async () => {
    if (!apiBase || !cfg) return;
    setBusySave(true);
    try {
      setErr("");
      const j = await apiPut(apiBase, "/config", { config: cfg });
      setCfg(j.config || cfg);
      if (onSaved) onSaved();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusySave(false);
    }
  };

  const onSetDefault = async () => {
    if (!apiBase || !cfg) return;
    setBusyDefault(true);
    try {
      setErr("");
      const j = await apiPut(apiBase, "/config/default_template", {
        config: cfg,
        strip_game_specific: true,
      });
      setDefaultPath(j.path || "");
      setDefaultExists(true);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyDefault(false);
    }
  };

  const onApplyDefault = async (mode: "merge" | "replace") => {
    if (!apiBase) return;
    setBusyApply(mode);
    try {
      setErr("");
      const j = await apiPost(apiBase, "/config/apply_default", { mode });
      setCfg(j.config || cfg);
      if (onSaved) onSaved();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyApply("");
    }
  };

  if (!ok) {
    return (
      <div className="p-8 text-center text-muted-foreground">API Not Ready</div>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden border-none shadow-sm">
      {/* --- New Header --- */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            Engine Configuration
          </h2>
          <div
            className="flex items-center gap-2 text-xs text-muted-foreground font-mono"
            title={cfgPath}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span className="truncate max-w-[500px]">
              {cfgPath || "No config loaded"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={reload}
            disabled={busy}
            title="Discard changes & Reload"
          >
            <RotateCcw
              className={`w-4 h-4 mr-2 ${busy ? "animate-spin" : ""}`}
            />
            Discard / Reload
          </Button>
          <Button
            onClick={onSave}
            disabled={busySave || !cfg}
            className="min-w-[120px] shadow-sm"
          >
            <Save className="w-4 h-4 mr-2" />
            {busySave ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* --- Body --- */}
      <div className="p-6">
        {err && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {err}
          </div>
        )}

        {!cfg ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading Configuration...
          </div>
        ) : (
          <Accordion
            type="multiple"
            defaultValue={["game", "obs"]}
            className="w-full space-y-4"
          >
            {/* 1. Game & Window (Most Important) */}
            <AccordionItem value="game" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">
                  Game Window Settings
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="grid gap-6">
                  <div>
                    <Field
                      label="game_window_title"
                      value={getIn(cfg, "game_window_title", "")}
                      onChange={(v) => update("game_window_title", v)}
                      placeholder="e.g. Genshin Impact"
                      desc="Exact or partial window title used to find and activate the game window. (Required)"
                    />
                    {!titleOk && (
                      <div className="text-xs text-destructive mt-1 font-medium">
                        * This field is required by the runner.
                      </div>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 2. OBS */}
            <AccordionItem value="obs" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">OBS Connection</span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="obs.host"
                    value={getIn(cfg, "obs.host", "127.0.0.1")}
                    onChange={(v) => update("obs.host", v)}
                    desc="OBS WebSocket IP (Default: 127.0.0.1)"
                  />
                  <NumField
                    label="obs.port"
                    value={getIn(cfg, "obs.port", 4455)}
                    onChange={(v) => update("obs.port", v)}
                    step={1}
                    desc="OBS WebSocket Port (Default: 4455)"
                  />
                  <Field
                    label="obs.password"
                    value={getIn(cfg, "obs.password", "")}
                    onChange={(v) => update("obs.password", v)}
                    desc="WebSocket Password (Optional if disabled in OBS)"
                    type="password"
                  />
                  <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                    <Field
                      label="obs.output_raw_dir"
                      value={getIn(cfg, "obs.output_raw_dir", "")}
                      onChange={(v) => update("obs.output_raw_dir", v)}
                      desc="Directory for raw recordings (Leave empty for OBS default)"
                    />
                    <Field
                      label="obs.output_final_dir"
                      value={getIn(cfg, "obs.output_final_dir", "")}
                      onChange={(v) => update("obs.output_final_dir", v)}
                      desc="Directory for renamed/processed files (Optional)"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 3. Play & Pacing */}
            <AccordionItem value="play" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">
                  Play Loop & Pacing
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="grid gap-4 md:grid-cols-3">
                  <NumField
                    label="play.max_steps"
                    value={getIn(cfg, "play.max_steps", 2000)}
                    onChange={(v) => update("play.max_steps", v)}
                    step={1}
                    desc="Safety limit for max steps per task"
                  />
                  <NumField
                    label="play.pacing_system_sec"
                    value={getIn(cfg, "play.pacing_system_sec", 0.35)}
                    onChange={(v) => update("play.pacing_system_sec", v)}
                    step={0.01}
                    desc="Base interval for system pacing (seconds)"
                  />
                  <NumField
                    label="play.jitter_sec"
                    value={getIn(cfg, "play.jitter_sec", 0.0)}
                    onChange={(v) => update("play.jitter_sec", v)}
                    step={0.01}
                    desc="Random jitter added to each step (humanization)"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 4. End Detection */}
            <AccordionItem value="end" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">
                  End Condition Detection
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="grid gap-4 md:grid-cols-2">
                  <NumField
                    label="end_detection.end_template_thr"
                    value={getIn(cfg, "end_detection.end_template_thr", 0.86)}
                    onChange={(v) =>
                      update("end_detection.end_template_thr", v)
                    }
                    step={0.01}
                    desc="Confidence threshold for end image match (0.0 - 1.0)"
                  />
                  <NumField
                    label="end_detection.end_hits_need"
                    value={getIn(cfg, "end_detection.end_hits_need", 3)}
                    onChange={(v) => update("end_detection.end_hits_need", v)}
                    step={1}
                    desc="Consecutive matches required to stop"
                  />
                  <NumField
                    label="end_detection.min_play_sec"
                    value={getIn(cfg, "end_detection.min_play_sec", 2.0)}
                    onChange={(v) => update("end_detection.min_play_sec", v)}
                    step={0.1}
                    desc="Minimum duration before checking end condition"
                  />
                  <NumField
                    label="end_detection.check_every_steps"
                    value={getIn(cfg, "end_detection.check_every_steps", 1)}
                    onChange={(v) =>
                      update("end_detection.check_every_steps", v)
                    }
                    step={1}
                    desc="Check frequency (steps)"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 5. Advanced UI/Vision Settings */}
            <AccordionItem value="advanced" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">
                  Advanced Vision & UI
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                    Vision Thresholds
                  </h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    <NumField
                      label="vision.enter_template_thr"
                      value={getIn(cfg, "vision.enter_template_thr", 0.8)}
                      onChange={(v) => update("vision.enter_template_thr", v)}
                      step={0.01}
                      desc="Threshold for Entry button"
                    />
                    <NumField
                      label="vision.action_template_thr"
                      value={getIn(cfg, "vision.action_template_thr", 0.8)}
                      onChange={(v) => update("vision.action_template_thr", v)}
                      step={0.01}
                      desc="Threshold for Preplay actions"
                    />
                    <NumField
                      label="vision.retry_sleep_sec"
                      value={getIn(cfg, "vision.retry_sleep_sec", 0.25)}
                      onChange={(v) => update("vision.retry_sleep_sec", v)}
                      step={0.01}
                      desc="Wait time between retries"
                    />
                  </div>

                  <Separator />

                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                    UI Interaction
                  </h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <NumField
                      label="ui.click_interval_sec"
                      value={getIn(cfg, "ui.click_interval_sec", 0.35)}
                      onChange={(v) => update("ui.click_interval_sec", v)}
                      step={0.01}
                      desc="Global minimum click interval"
                    />
                    <NumField
                      label="ui.countdown_sec"
                      value={getIn(cfg, "ui.countdown_sec", 3)}
                      onChange={(v) => update("ui.countdown_sec", v)}
                      step={1}
                      desc="Countdown before starting"
                    />
                    <BoolField
                      label="ui.enter_double_click"
                      checked={Boolean(
                        getIn(cfg, "ui.enter_double_click", true)
                      )}
                      onCheckedChange={(v) =>
                        update("ui.enter_double_click", v)
                      }
                      desc="Double click on entry button?"
                    />
                    <BoolField
                      label="ui.disable_failsafe"
                      checked={Boolean(
                        getIn(cfg, "ui.disable_failsafe", false)
                      )}
                      onCheckedChange={(v) => update("ui.disable_failsafe", v)}
                      desc="Disable mouse corner fail-safe (Dangerous)"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 6. Template Management (Replaced the top banner) */}
            <AccordionItem
              value="templates"
              className="border rounded-md px-4 border-dashed bg-muted/10"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Template Management (Advanced)
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">
                        Project Default Template
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {defaultExists
                          ? "Template file exists."
                          : "No template set yet."}
                        {defaultPath && (
                          <span className="font-mono ml-1 opacity-70">
                            ({defaultPath})
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onSetDefault}
                      disabled={busyDefault || !cfg}
                    >
                      {busyDefault
                        ? "Saving..."
                        : "Save Current Config as Default"}
                    </Button>
                  </div>

                  <Separator className="bg-border/50" />

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium mb-1">
                        Apply Default Template to this Game
                      </p>
                      <p>
                        Merge fills missing fields. Replace overwrites
                        everything (except window title).
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onApplyDefault("merge")}
                        disabled={!defaultExists}
                      >
                        Apply (Merge)
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (
                            confirm(
                              "This will overwrite your current configuration. Continue?"
                            )
                          )
                            onApplyDefault("replace");
                        }}
                        disabled={!defaultExists}
                      >
                        Apply (Replace)
                      </Button>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </Card>
  );
}
