// src/TaskEditor.tsx
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Task = any;

async function apiGet(base: string, path: string) {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x ?? null));
}

function setByPath(obj: any, path: string[], value: any) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[path[path.length - 1]] = value;
}

function getByPath(obj: any, path: string[], fallback: any) {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return fallback;
    cur = cur[k];
  }
  return cur == null ? fallback : cur;
}

type Props = {
  apiBase: string;
  taskId: number | null;
  task: Task | null;
  onChange: (nextTask: Task) => void;
  onSave: () => Promise<void>;
  saving?: boolean;
};

export default function TaskEditor({
  apiBase,
  taskId,
  task,
  onChange,
  onSave,
  saving,
}: Props) {
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [templates, setTemplates] = useState<string[]>([]);
  const [raw, setRaw] = useState("");

  useEffect(() => {
    if (!apiBase) return;
    (async () => {
      try {
        const j = await apiGet(apiBase, "/templates");
        setTemplates((j.templates || []) as string[]);
      } catch {
        setTemplates([]);
      }
    })();
  }, [apiBase]);

  useEffect(() => {
    if (!task) {
      setRaw("");
      return;
    }
    setRaw(JSON.stringify(task, null, 2));
  }, [task]);

  const t = task ?? null;

  const header = useMemo(() => {
    if (taskId == null) return "Editor";
    return `Editor #${String(taskId).padStart(3, "0")}`;
  }, [taskId]);

  const apply = (mut: (draft: any) => void) => {
    if (!t) return;
    const d = deepClone(t);
    mut(d);
    onChange(d);
  };

  const StepTabs = () => (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4].map((s) => (
        <Button
          key={s}
          size="sm"
          variant={step === s ? "default" : "outline"}
          onClick={() => setStep(s as any)}
          disabled={!t}
        >
          {s}
        </Button>
      ))}
      <div className="text-xs text-muted-foreground ml-2">
        1 Entry · 2 Preplay · 3 Play · 4 End
      </div>
    </div>
  );

  const TemplateSelect = ({
    value,
    onPick,
    placeholder,
  }: {
    value: string;
    onPick: (v: string) => void;
    placeholder?: string;
  }) => (
    <Select
      value={value || ""}
      onValueChange={(v) => onPick(v === "__empty__" ? "" : v)}
    >
      <SelectTrigger className="w-[360px]">
        <SelectValue placeholder={placeholder ?? "Select template..."} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__empty__">(none)</SelectItem>
        {templates.map((bn) => (
          <SelectItem key={bn} value={bn}>
            {bn}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const FormView = () => {
    if (!t) {
      return (
        <div className="text-sm text-muted-foreground">Select a task…</div>
      );
    }

    const name = getByPath(t, ["name"], "");
    const basename = getByPath(t, ["record", "basename"], "");

    const entryMode = getByPath(t, ["entry", "mode"], "gallery");
    const entryTpl = getByPath(t, ["entry", "template"], "");

    const actions: any[] = getByPath(t, ["preplay", "actions"], []);
    const advMethod = getByPath(t, ["play", "advance_method"], "mouse_left");
    const pacing = getByPath(t, ["play", "pacing"], "system");

    const endTpl = getByPath(t, ["end", "template"], "");

    return (
      <div className="space-y-4">
        {/* Basic */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6">
            <div className="text-xs text-muted-foreground mb-1">Task name</div>
            <Input
              value={name}
              onChange={(e) =>
                apply((d) => {
                  setByPath(d, ["name"], e.target.value);
                  // 若 basename 为空，就跟随 name（和旧 editor 一致的体验）
                  const b = getByPath(d, ["record", "basename"], "");
                  if (!b) setByPath(d, ["record", "basename"], e.target.value);
                })
              }
              placeholder="CG_001"
            />
          </div>
          <div className="col-span-6">
            <div className="text-xs text-muted-foreground mb-1">
              Output basename
            </div>
            <Input
              value={basename}
              onChange={(e) =>
                apply((d) =>
                  setByPath(d, ["record", "basename"], e.target.value)
                )
              }
              placeholder="CG_001"
            />
          </div>
        </div>

        <Separator />

        {/* Step specific */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Step 1 — Entry (A)</div>
              <Badge variant="secondary">识别入口模板并点击</Badge>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <div className="text-xs text-muted-foreground mb-1">
                  Entry mode
                </div>
                <Select
                  value={entryMode}
                  onValueChange={(v) =>
                    apply((d) => setByPath(d, ["entry", "mode"], v))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="gallery" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gallery">gallery</SelectItem>
                    <SelectItem value="roam">roam</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-8">
                <div className="text-xs text-muted-foreground mb-1">
                  Entry template
                </div>
                <TemplateSelect
                  value={entryTpl}
                  onPick={(v) =>
                    apply((d) => setByPath(d, ["entry", "template"], v))
                  }
                  placeholder="Choose entry template (e.g. 001_entry.png)"
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              备注：截图/ROI 捕获我们下一步接入（现在先从 Templates 里选）。
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Step 2 — Preplay (B)</div>
              <Badge variant="secondary">顺序执行：模板点击 + delay</Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() =>
                  apply((d) => {
                    const arr = getByPath(d, ["preplay", "actions"], []);
                    if (!Array.isArray(arr))
                      setByPath(d, ["preplay", "actions"], []);
                    const next = Array.isArray(arr) ? arr.slice() : [];
                    next.push({ template: "", delay: 0.5 });
                    setByPath(d, ["preplay", "actions"], next);
                  })
                }
              >
                + Add action
              </Button>
              <div className="text-xs text-muted-foreground">
                每个 action = template + delay(s)
              </div>
            </div>

            <div className="space-y-2">
              {actions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No actions.</div>
              ) : (
                actions.map((a, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-7">
                        <div className="text-xs text-muted-foreground mb-1">
                          Action {idx + 1} template
                        </div>
                        <TemplateSelect
                          value={String(a?.template ?? "")}
                          onPick={(v) =>
                            apply((d) => {
                              const arr2 = getByPath(
                                d,
                                ["preplay", "actions"],
                                []
                              );
                              const next = Array.isArray(arr2)
                                ? arr2.slice()
                                : [];
                              next[idx] = { ...(next[idx] || {}), template: v };
                              setByPath(d, ["preplay", "actions"], next);
                            })
                          }
                          placeholder="e.g. 001_pre_01.png"
                        />
                      </div>

                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">
                          Delay (sec)
                        </div>
                        <Input
                          value={String(a?.delay ?? 0.5)}
                          onChange={(e) =>
                            apply((d) => {
                              const v = Number(e.target.value);
                              const arr2 = getByPath(
                                d,
                                ["preplay", "actions"],
                                []
                              );
                              const next = Array.isArray(arr2)
                                ? arr2.slice()
                                : [];
                              next[idx] = {
                                ...(next[idx] || {}),
                                delay: Number.isFinite(v) ? v : 0.5,
                              };
                              setByPath(d, ["preplay", "actions"], next);
                            })
                          }
                        />
                      </div>

                      <div className="col-span-3 flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            apply((d) => {
                              const arr2 = getByPath(
                                d,
                                ["preplay", "actions"],
                                []
                              );
                              const next = Array.isArray(arr2)
                                ? arr2.slice()
                                : [];
                              if (idx > 0) {
                                const tmp = next[idx - 1];
                                next[idx - 1] = next[idx];
                                next[idx] = tmp;
                                setByPath(d, ["preplay", "actions"], next);
                              }
                            })
                          }
                          disabled={idx === 0}
                        >
                          ↑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            apply((d) => {
                              const arr2 = getByPath(
                                d,
                                ["preplay", "actions"],
                                []
                              );
                              const next = Array.isArray(arr2)
                                ? arr2.slice()
                                : [];
                              if (idx < next.length - 1) {
                                const tmp = next[idx + 1];
                                next[idx + 1] = next[idx];
                                next[idx] = tmp;
                                setByPath(d, ["preplay", "actions"], next);
                              }
                            })
                          }
                          disabled={idx === actions.length - 1}
                        >
                          ↓
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            apply((d) => {
                              const arr2 = getByPath(
                                d,
                                ["preplay", "actions"],
                                []
                              );
                              const next = Array.isArray(arr2)
                                ? arr2.slice()
                                : [];
                              next.splice(idx, 1);
                              setByPath(d, ["preplay", "actions"], next);
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Step 3 — Play (C)</div>
              <Badge variant="secondary">推进方式与节奏</Badge>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-6">
                <div className="text-xs text-muted-foreground mb-1">
                  advance_method
                </div>
                <Select
                  value={advMethod}
                  onValueChange={(v) =>
                    apply((d) => setByPath(d, ["play", "advance_method"], v))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="mouse_left" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mouse_left">mouse_left</SelectItem>
                    <SelectItem value="enter">enter</SelectItem>
                    <SelectItem value="space">space</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground mt-1">
                  enter/space 等键位最终由 game config 决定（runner 读
                  config.yaml）。
                </div>
              </div>

              <div className="col-span-6">
                <div className="text-xs text-muted-foreground mb-1">pacing</div>
                <Select
                  value={pacing}
                  onValueChange={(v) =>
                    apply((d) => setByPath(d, ["play", "pacing"], v))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="system" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">system</SelectItem>
                    <SelectItem value="audio">audio (future)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">Step 4 — End (D)</div>
              <Badge variant="secondary">结束画面模板</Badge>
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12">
                <div className="text-xs text-muted-foreground mb-1">
                  End template
                </div>
                <TemplateSelect
                  value={endTpl}
                  onPick={(v) =>
                    apply((d) => setByPath(d, ["end", "template"], v))
                  }
                  placeholder="Choose end template (e.g. 001_end.png)"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  建议截取回到 Gallery 后稳定存在的小区域（更稳）。
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const RawView = () => (
    <div className="space-y-2">
      <Textarea
        className="h-[520px] font-mono text-xs"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Raw JSON..."
      />
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Raw 模式是保底。切回 Form 后会以当前 task 为准（建议 Save 后再切）。
        </div>
        <Button
          variant="outline"
          onClick={() => {
            try {
              const obj = JSON.parse(raw);
              onChange(obj);
            } catch (e: any) {
              alert(e?.message || "Invalid JSON");
            }
          }}
          disabled={!t}
        >
          Apply raw → form
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{header}</div>
        <div className="flex items-center gap-2">
          <StepTabs />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode(mode === "form" ? "raw" : "form")}
            disabled={!t}
          >
            {mode === "form" ? "Raw" : "Form"}
          </Button>
          <Button onClick={onSave} disabled={!t || !!saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {mode === "form" ? <FormView /> : <RawView />}
    </div>
  );
}
