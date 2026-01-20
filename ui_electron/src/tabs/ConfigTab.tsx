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
      {/* --- Header --- */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            Global Settings / 全局配置
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
            Reload
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
            defaultValue={["game", "audio", "obs"]}
            className="w-full space-y-4"
          >
            {/* 1. Game & Window */}
            <AccordionItem value="game" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">
                  1. Target Application / 目标程序
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="grid gap-6">
                  <div>
                    <Field
                      label="Window Title (窗口标题)"
                      value={getIn(cfg, "game_window_title", "")}
                      onChange={(v) => update("game_window_title", v)}
                      placeholder="e.g. Genshin Impact"
                      desc="Runner 将根据此标题查找并激活游戏窗口 (支持模糊匹配)"
                    />
                    {!titleOk && (
                      <div className="text-xs text-destructive mt-1 font-medium">
                        * 此项为必填项 (Required)
                      </div>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 2. Audio & Smart VAD */}
            <AccordionItem value="audio" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm flex items-center gap-2">
                  2. Audio & Smart VAD / 智能语音
                  {getIn(cfg, "audio.enabled", false) ? (
                    <Badge variant="default" className="text-[10px] h-5">
                      ON
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-5">
                      OFF
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="grid gap-4">
                  <BoolField
                    label="Enable Audio Agent (启用音频代理)"
                    checked={Boolean(getIn(cfg, "audio.enabled", false))}
                    onCheckedChange={(v) => update("audio.enabled", v)}
                    desc="启用后将加载 VAD 模型监听游戏语音。关闭则仅使用固定时间轴。"
                  />
                  {/* 这里未来可以添加全局默认的 threshold/silence 配置 */}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 3. OBS */}
            <AccordionItem value="obs" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">3. OBS Connection</span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label="Host IP"
                    value={getIn(cfg, "obs.host", "127.0.0.1")}
                    onChange={(v) => update("obs.host", v)}
                    desc="OBS WebSocket IP (通常为 127.0.0.1)"
                  />
                  <NumField
                    label="Port"
                    value={getIn(cfg, "obs.port", 4455)}
                    onChange={(v) => update("obs.port", v)}
                    step={1}
                    desc="OBS WebSocket Port (默认 4455)"
                  />
                  <Field
                    label="Password"
                    value={getIn(cfg, "obs.password", "")}
                    onChange={(v) => update("obs.password", v)}
                    desc="OBS WebSocket 密码 (如果未设置则留空)"
                    type="password"
                  />
                  <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                    <Field
                      label="Raw Output Dir (录制缓存)"
                      value={getIn(cfg, "obs.output_raw_dir", "")}
                      onChange={(v) => update("obs.output_raw_dir", v)}
                      desc="OBS 原始录像保存路径 (留空则使用 OBS 默认设置)"
                    />
                    <Field
                      label="Final Output Dir (最终成品)"
                      value={getIn(cfg, "obs.output_final_dir", "")}
                      onChange={(v) => update("obs.output_final_dir", v)}
                      desc="重命名后的成品 MKV 保存路径"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 4. Play & Pacing */}
            <AccordionItem value="play" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">
                  4. Automation & Pacing / 自动化参数
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="grid gap-4 md:grid-cols-3">
                  <NumField
                    label="Max Steps (安全熔断)"
                    value={getIn(cfg, "play.max_steps", 2000)}
                    onChange={(v) => update("play.max_steps", v)}
                    step={1}
                    desc="单任务最大执行步数，防止死循环 (默认 2000)"
                  />
                  <NumField
                    label="System Pacing Interval (s)"
                    value={getIn(cfg, "play.pacing_system_sec", 0.35)}
                    onChange={(v) => update("play.pacing_system_sec", v)}
                    step={0.01}
                    desc="[System模式可用] 每次点击的默认间隔时间"
                  />
                  <NumField
                    label="Human Jitter (s)"
                    value={getIn(cfg, "play.jitter_sec", 0.0)}
                    onChange={(v) => update("play.jitter_sec", v)}
                    step={0.01}
                    desc="随机抖动时间 (±秒)，用于模拟真人操作"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 5. End Detection */}
            <AccordionItem value="end" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">
                  5. End Detection / 结束判定
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="grid gap-4 md:grid-cols-2">
                  <NumField
                    label="End Image Confidence"
                    value={getIn(cfg, "end_detection.end_template_thr", 0.86)}
                    onChange={(v) =>
                      update("end_detection.end_template_thr", v)
                    }
                    step={0.01}
                    desc="END 图标的匹配相似度阈值 (0.0 - 1.0)"
                  />
                  <NumField
                    label="Required Consecutive Hits"
                    value={getIn(cfg, "end_detection.end_hits_need", 3)}
                    onChange={(v) => update("end_detection.end_hits_need", v)}
                    step={1}
                    desc="连续检测到多少次 END 图标才停止 (防闪烁)"
                  />
                  <NumField
                    label="Min Play Duration (s)"
                    value={getIn(cfg, "end_detection.min_play_sec", 2.0)}
                    onChange={(v) => update("end_detection.min_play_sec", v)}
                    step={0.1}
                    desc="任务开始后多少秒内不进行结束判定"
                  />
                  <NumField
                    label="Check Frequency (steps)"
                    value={getIn(cfg, "end_detection.check_every_steps", 1)}
                    onChange={(v) =>
                      update("end_detection.check_every_steps", v)
                    }
                    step={1}
                    desc="每隔多少步进行一次图像检测 (性能优化)"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 6. Advanced Vision */}
            <AccordionItem value="advanced" className="border rounded-md px-4">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm">
                  Advanced Vision & UI
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pt-1">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                    Thresholds / 识别阈值
                  </h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    <NumField
                      label="Entry Match %"
                      value={getIn(cfg, "vision.enter_template_thr", 0.8)}
                      onChange={(v) => update("vision.enter_template_thr", v)}
                      step={0.01}
                      desc="入口按钮(回想/画廊)的匹配阈值"
                    />
                    <NumField
                      label="Action Match %"
                      value={getIn(cfg, "vision.action_template_thr", 0.8)}
                      onChange={(v) => update("vision.action_template_thr", v)}
                      step={0.01}
                      desc="分支选项/动作图标的匹配阈值"
                    />
                    <NumField
                      label="Retry Interval (s)"
                      value={getIn(cfg, "vision.retry_sleep_sec", 0.25)}
                      onChange={(v) => update("vision.retry_sleep_sec", v)}
                      step={0.01}
                      desc="找图失败时的重试间隔"
                    />
                  </div>

                  <Separator />

                  <h4 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                    Interaction / 交互保护
                  </h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <NumField
                      label="Min Click Interval (s)"
                      value={getIn(cfg, "ui.click_interval_sec", 0.35)}
                      onChange={(v) => update("ui.click_interval_sec", v)}
                      step={0.01}
                      desc="硬件保护：任意两次点击间的最小物理间隔"
                    />
                    <NumField
                      label="Countdown (s)"
                      value={getIn(cfg, "ui.countdown_sec", 3)}
                      onChange={(v) => update("ui.countdown_sec", v)}
                      step={1}
                      desc="开始运行前的倒计时"
                    />
                    <BoolField
                      label="Entry Double Click"
                      checked={Boolean(
                        getIn(cfg, "ui.enter_double_click", true)
                      )}
                      onCheckedChange={(v) =>
                        update("ui.enter_double_click", v)
                      }
                      desc="点击入口时是否双击 (部分游戏需要)"
                    />
                    <BoolField
                      label="Disable Mouse Failsafe"
                      checked={Boolean(
                        getIn(cfg, "ui.disable_failsafe", false)
                      )}
                      onCheckedChange={(v) => update("ui.disable_failsafe", v)}
                      desc="[危险] 禁用鼠标甩到角落强制停止的功能"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 7. Template Management */}
            <AccordionItem
              value="templates"
              className="border rounded-md px-4 border-dashed bg-muted/10"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="font-semibold text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  Template Defaults / 全局模板
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
                          ? "已存在默认模板文件。"
                          : "暂无默认模板。"}
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
                        Apply Default to this Game
                      </p>
                      <p>
                        Merge (合并): 仅填充缺失项。 Replace (替换):
                        覆盖除窗口标题外的所有设置。
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
                          if (confirm("确定要覆盖当前配置吗？此操作不可撤销。"))
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
