import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type Props = { apiBase: string; ok: boolean };

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
    <div className="grid gap-2">
      <Label className="text-sm">{label}</Label>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
      />
      {desc ? (
        <div className="text-xs text-muted-foreground">{desc}</div>
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
    <div className="grid gap-2">
      <Label className="text-sm">{label}</Label>
      <Input
        value={String(value ?? "")}
        onChange={(e) => onChange(num(e.target.value, 0))}
        type="number"
        step={step ?? 0.01}
        min={min}
        max={max}
      />
      {desc ? (
        <div className="text-xs text-muted-foreground">{desc}</div>
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
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="grid gap-1">
        <div className="text-sm font-medium">{label}</div>
        {desc ? (
          <div className="text-xs text-muted-foreground">{desc}</div>
        ) : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function ConfigTab({ apiBase, ok }: Props) {
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
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyApply("");
    }
  };

  if (!ok) {
    return (
      <Card>
        <CardContent className="p-4">
          <Badge variant="secondary">Not ready</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Runner-aligned Config</Badge>
            {cfgPath ? (
              <Badge variant="secondary" className="truncate max-w-[520px]">
                {cfgPath}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={reload} disabled={busy}>
              {busy ? "Reloading..." : "Reload"}
            </Button>
            <Button onClick={onSave} disabled={busySave || !cfg}>
              {busySave ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        {err ? (
          <div className="mt-3 text-sm text-destructive">{err}</div>
        ) : null}

        <Separator className="my-4" />

        {!cfg ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : (
          <>
            {/* Top quick actions */}
            <div className="grid gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="grid gap-1">
                  <div className="text-sm font-medium">Default template</div>
                  <div className="text-xs text-muted-foreground">
                    {defaultExists ? "Exists" : "Not set"}{" "}
                    {defaultPath ? `• ${defaultPath}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={onSetDefault}
                    disabled={busyDefault || !cfg}
                    title="Save current config as project-level default (strip game-specific fields)"
                  >
                    {busyDefault ? "Saving..." : "Set as Default"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => onApplyDefault("merge")}
                    disabled={busyApply !== "" || !defaultExists}
                    title="Merge default template into this game's config (keeps your game_window_title)"
                  >
                    {busyApply === "merge"
                      ? "Applying..."
                      : "Apply Default (merge)"}
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() => {
                      const yes = confirm(
                        "Replace this game's config with default template?\n(We will still keep existing game_window_title if it is non-empty.)"
                      );
                      if (yes) onApplyDefault("replace");
                    }}
                    disabled={busyApply !== "" || !defaultExists}
                    title="Replace with default template"
                  >
                    {busyApply === "replace"
                      ? "Applying..."
                      : "Apply Default (replace)"}
                  </Button>
                </div>
              </div>

              {!titleOk ? (
                <div className="text-xs text-destructive">
                  game_window_title is required by runner (不能为空)。
                </div>
              ) : null}
            </div>

            <Separator className="my-4" />

            <Accordion type="multiple" defaultValue={["game", "obs"]}>
              <AccordionItem value="game">
                <AccordionTrigger>Game (required)</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="game_window_title"
                      value={getIn(cfg, "game_window_title", "")}
                      onChange={(v) => update("game_window_title", v)}
                      placeholder="窗口标题关键字（用于 find_window_rect / activate_window）"
                      desc="runner 必须有该字段，否则直接报错。填游戏窗口标题的一部分即可。"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="obs">
                <AccordionTrigger>OBS</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="obs.host"
                      value={getIn(cfg, "obs.host", "127.0.0.1")}
                      onChange={(v) => update("obs.host", v)}
                      desc="OBS WebSocket host（通常 127.0.0.1）"
                    />
                    <NumField
                      label="obs.port"
                      value={getIn(cfg, "obs.port", 4455)}
                      onChange={(v) => update("obs.port", v)}
                      step={1}
                      desc="OBS WebSocket port（默认 4455）"
                    />
                    <Field
                      label="obs.password"
                      value={getIn(cfg, "obs.password", "")}
                      onChange={(v) => update("obs.password", v)}
                      desc="可为空；也可用环境变量 OBS_PASSWORD 覆盖"
                    />
                    <Field
                      label="obs.output_raw_dir"
                      value={getIn(cfg, "obs.output_raw_dir", "")}
                      onChange={(v) => update("obs.output_raw_dir", v)}
                      desc="可选：录制原始输出目录（为空则 OBS 默认目录）"
                    />
                    <Field
                      label="obs.output_final_dir"
                      value={getIn(cfg, "obs.output_final_dir", "")}
                      onChange={(v) => update("obs.output_final_dir", v)}
                      desc="可选：rename 后的最终输出目录（为空则与 raw 同目录）"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="play">
                <AccordionTrigger>Play (phase C)</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <NumField
                      label="play.max_steps"
                      value={getIn(cfg, "play.max_steps", 2000)}
                      onChange={(v) => update("play.max_steps", v)}
                      step={1}
                      desc="最大推进步数（防止死循环）"
                    />
                    <NumField
                      label="play.pacing_system_sec"
                      value={getIn(cfg, "play.pacing_system_sec", 0.35)}
                      onChange={(v) => update("play.pacing_system_sec", v)}
                      step={0.01}
                      desc="系统节奏推进间隔（优先于 ui.click_interval_sec）"
                    />
                    <NumField
                      label="play.jitter_sec"
                      value={getIn(cfg, "play.jitter_sec", 0.0)}
                      onChange={(v) => update("play.jitter_sec", v)}
                      step={0.01}
                      desc="每步推进的随机抖动（模拟人类，0=关闭）"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="end">
                <AccordionTrigger>End Detection (phase D)</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <NumField
                      label="end_detection.end_template_thr"
                      value={getIn(cfg, "end_detection.end_template_thr", 0.86)}
                      onChange={(v) =>
                        update("end_detection.end_template_thr", v)
                      }
                      step={0.01}
                      desc="结束模板匹配阈值（越大越严格）"
                    />
                    <NumField
                      label="end_detection.end_hits_need"
                      value={getIn(cfg, "end_detection.end_hits_need", 3)}
                      onChange={(v) => update("end_detection.end_hits_need", v)}
                      step={1}
                      desc="连续命中次数达到该值才判定结束"
                    />
                    <NumField
                      label="end_detection.return_diff_thr"
                      value={getIn(cfg, "end_detection.return_diff_thr", 6.0)}
                      onChange={(v) =>
                        update("end_detection.return_diff_thr", v)
                      }
                      step={0.1}
                      desc="回到画廊的画面差异阈值（fallback）"
                    />
                    <NumField
                      label="end_detection.return_hits_need"
                      value={getIn(cfg, "end_detection.return_hits_need", 6)}
                      onChange={(v) =>
                        update("end_detection.return_hits_need", v)
                      }
                      step={1}
                      desc="fallback 连续命中次数"
                    />
                    <NumField
                      label="end_detection.min_play_sec"
                      value={getIn(cfg, "end_detection.min_play_sec", 2.0)}
                      onChange={(v) => update("end_detection.min_play_sec", v)}
                      step={0.1}
                      desc="最短播放秒数（避免刚开始就误判结束）"
                    />
                    <NumField
                      label="end_detection.check_every_steps"
                      value={getIn(cfg, "end_detection.check_every_steps", 1)}
                      onChange={(v) =>
                        update("end_detection.check_every_steps", v)
                      }
                      step={1}
                      desc="每 N 步检查一次结束条件（>=1）"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="vision">
                <AccordionTrigger>Vision (phase A/B)</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <NumField
                      label="vision.enter_template_thr"
                      value={getIn(cfg, "vision.enter_template_thr", 0.8)}
                      onChange={(v) => update("vision.enter_template_thr", v)}
                      step={0.01}
                      desc="入口按钮模板匹配阈值"
                    />
                    <NumField
                      label="vision.action_template_thr"
                      value={getIn(cfg, "vision.action_template_thr", 0.8)}
                      onChange={(v) => update("vision.action_template_thr", v)}
                      step={0.01}
                      desc="预动作按钮模板匹配阈值"
                    />
                    <NumField
                      label="vision.enter_retries"
                      value={getIn(cfg, "vision.enter_retries", 10)}
                      onChange={(v) => update("vision.enter_retries", v)}
                      step={1}
                      desc="入口模板匹配重试次数"
                    />
                    <NumField
                      label="vision.action_retries"
                      value={getIn(cfg, "vision.action_retries", 10)}
                      onChange={(v) => update("vision.action_retries", v)}
                      step={1}
                      desc="预动作模板匹配重试次数"
                    />
                    <NumField
                      label="vision.retry_sleep_sec"
                      value={getIn(cfg, "vision.retry_sleep_sec", 0.25)}
                      onChange={(v) => update("vision.retry_sleep_sec", v)}
                      step={0.01}
                      desc="每次重试间隔（秒）"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="ui">
                <AccordionTrigger>UI / Timing</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <NumField
                      label="ui.click_interval_sec"
                      value={getIn(cfg, "ui.click_interval_sec", 0.35)}
                      onChange={(v) => update("ui.click_interval_sec", v)}
                      step={0.01}
                      desc="通用点击间隔（作为 play.pacing_system_sec 的兜底）"
                    />
                    <NumField
                      label="ui.countdown_sec"
                      value={getIn(cfg, "ui.countdown_sec", 3)}
                      onChange={(v) => update("ui.countdown_sec", v)}
                      step={1}
                      desc="开始前倒计时（给你切回游戏窗口时间）"
                    />

                    <NumField
                      label="ui.advance_click_rel_x"
                      value={getIn(cfg, "ui.advance_click_rel_x", 0.5)}
                      onChange={(v) => update("ui.advance_click_rel_x", v)}
                      step={0.01}
                      min={0}
                      max={1}
                      desc="推进点击点（窗口宽度的相对比例 0~1）"
                    />
                    <NumField
                      label="ui.advance_click_rel_y"
                      value={getIn(cfg, "ui.advance_click_rel_y", 0.9)}
                      onChange={(v) => update("ui.advance_click_rel_y", v)}
                      step={0.01}
                      min={0}
                      max={1}
                      desc="推进点击点（窗口高度的相对比例 0~1）"
                    />

                    <NumField
                      label="ui.step_delay_sec"
                      value={getIn(cfg, "ui.step_delay_sec", 0.0)}
                      onChange={(v) => update("ui.step_delay_sec", v)}
                      step={0.01}
                      desc="阶段间基础停顿（调试用）"
                    />
                    <NumField
                      label="ui.step_delay_entry_after_click"
                      value={getIn(cfg, "ui.step_delay_entry_after_click", 0.0)}
                      onChange={(v) =>
                        update("ui.step_delay_entry_after_click", v)
                      }
                      step={0.01}
                      desc="进入后额外等待（秒）"
                    />
                    <NumField
                      label="ui.step_delay_after_preplay"
                      value={getIn(cfg, "ui.step_delay_after_preplay", 0.0)}
                      onChange={(v) => update("ui.step_delay_after_preplay", v)}
                      step={0.01}
                      desc="预动作结束后、开始录制前等待（秒）"
                    />

                    <NumField
                      label="ui.enter_scene_change_diff_thr"
                      value={getIn(cfg, "ui.enter_scene_change_diff_thr", 10.0)}
                      onChange={(v) =>
                        update("ui.enter_scene_change_diff_thr", v)
                      }
                      step={0.1}
                      desc="入口点击后画面变化阈值（用于验证已进入）"
                    />
                    <NumField
                      label="ui.enter_scene_change_hits"
                      value={getIn(cfg, "ui.enter_scene_change_hits", 3)}
                      onChange={(v) => update("ui.enter_scene_change_hits", v)}
                      step={1}
                      desc="连续命中次数"
                    />
                    <NumField
                      label="ui.enter_scene_change_timeout_sec"
                      value={getIn(
                        cfg,
                        "ui.enter_scene_change_timeout_sec",
                        2.0
                      )}
                      onChange={(v) =>
                        update("ui.enter_scene_change_timeout_sec", v)
                      }
                      step={0.1}
                      desc="验证超时时间（秒）"
                    />

                    <BoolField
                      label="ui.enter_double_click"
                      checked={Boolean(
                        getIn(cfg, "ui.enter_double_click", true)
                      )}
                      onCheckedChange={(v) =>
                        update("ui.enter_double_click", v)
                      }
                      desc="入口按钮是否双击（某些游戏单击不灵）"
                    />
                    <BoolField
                      label="ui.disable_failsafe"
                      checked={Boolean(
                        getIn(cfg, "ui.disable_failsafe", false)
                      )}
                      onCheckedChange={(v) => update("ui.disable_failsafe", v)}
                      desc="关闭 PyAutoGUI failsafe（谨慎：鼠标挪到左上角不再强制停）"
                    />
                    <BoolField
                      label="ui.stop_on_fail"
                      checked={Boolean(getIn(cfg, "ui.stop_on_fail", false))}
                      onCheckedChange={(v) => update("ui.stop_on_fail", v)}
                      desc="遇到失败就停止整个批次（否则跳过失败任务继续）"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="audio">
                <AccordionTrigger>Audio (experimental)</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <BoolField
                      label="audio.enabled"
                      checked={Boolean(getIn(cfg, "audio.enabled", false))}
                      onCheckedChange={(v) => update("audio.enabled", v)}
                      desc="启用音频节奏（若你实现了 audio-driven pacing 才会生效）"
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  );
}
