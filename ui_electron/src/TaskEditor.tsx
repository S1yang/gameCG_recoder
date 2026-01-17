// src/TaskEditor.tsx
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  GripVertical,
  MousePointerClick,
  Play,
  StepForward,
  Flag,
  Trash2,
  Image as ImageIcon,
  Camera,
} from "lucide-react";

import { PointPicker } from "@/components/common/PointPicker";
import { MousePointer2 } from "lucide-react";

// --- DnD Imports ---
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 引入新拆分的组件
import { CaptureModal } from "@/components/tasks/CaptureModal";

type Task = any;

// --- API Helpers ---

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

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

// --- Components ---

function StepNavigator({
  step,
  setStep,
}: {
  step: number;
  setStep: (s: any) => void;
}) {
  const steps = [
    { id: 1, label: "Entry", icon: MousePointerClick, desc: "入口识别" },
    { id: 2, label: "Preplay", icon: Play, desc: "前置序列" },
    { id: 3, label: "Play", icon: StepForward, desc: "推进循环" },
    { id: 4, label: "End", icon: Flag, desc: "结束判定" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 bg-muted/30 p-1.5 rounded-lg border w-fit">
      {steps.map((s) => {
        const active = step === s.id;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-md transition-all border border-transparent
              ${
                active
                  ? "bg-background border-border shadow-sm"
                  : "hover:bg-muted/50 text-muted-foreground"
              }
            `}
          >
            {/* 图标圆圈 */}
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
            </div>

            {/* 文字区域：Label + Desc */}
            <div className="flex flex-col items-start text-left leading-tight">
              <span
                className={`text-sm font-semibold ${
                  active ? "text-foreground" : "text-foreground/80"
                }`}
              >
                {s.label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {s.desc}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// 提取出来的 Sortable Item 组件
function SortableActionItem({
  id,
  action,
  idx,
  taskIdStr,
  templates,
  apiBase,
  onUpdate,
  onDelete,
  onCapture,
}: {
  id: string;
  action: any;
  idx: number;
  taskIdStr: string;
  templates: string[];
  apiBase: string;
  onUpdate: (field: string, val: any) => void;
  onDelete: () => void;
  onCapture: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.6 : 1,
  } as React.CSSProperties;

  const thumbSrc = useMemo(() => {
    if (!action?.template) return "";
    const u = new URL(`${apiBase}/templates/thumb`);
    u.searchParams.set("name", action.template);
    u.searchParams.set("w", "200");
    u.searchParams.set("t", String(Date.now()));
    return u.toString();
  }, [apiBase, action?.template]);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-3 transition-colors ${
        isDragging ? "bg-accent border-primary" : ""
      }`}
    >
      <div className="flex gap-3 items-center">
        {/* 1. 左侧：缩略图/占位符 */}
        <div className="shrink-0 w-[100px] h-[70px] bg-muted/20 rounded border flex items-center justify-center overflow-hidden">
          {action?.template ? (
            <img
              src={thumbSrc}
              className="w-full h-full object-contain"
              alt="thumb"
              title={action.template}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ImageIcon className="w-8 h-8 text-muted-foreground/20" />
          )}
        </div>

        {/* 2. 中间：表单区域 (flex-1 占据剩余空间) */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">
                Template
              </div>
              <div className="flex gap-2">
                <Select
                  value={action?.template || ""}
                  onValueChange={(v) =>
                    onUpdate("template", v === "__empty__" ? "" : v)
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select..." />
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

                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 shrink-0 px-2"
                  onClick={onCapture}
                  title="Capture from screen"
                >
                  <Camera className="w-3.5 h-3.5 mr-1.5" />
                  Capture
                </Button>
              </div>
            </div>

            <div className="w-[100px]">
              <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-semibold">
                Delay
              </div>
              <div className="relative">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  className="h-8 pr-6 font-mono text-right"
                  value={action?.delay ?? 0.5}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onUpdate("delay", isNaN(val) ? 0 : val);
                  }}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  s
                </div>
              </div>
            </div>

            <div className="flex items-center pb-[1px]">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                title="Remove action"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* 3. 右侧：拖拽手柄 (移到最后) */}
        <div
          {...attributes}
          {...listeners}
          className="shrink-0 flex items-center justify-center w-8 h-full cursor-grab text-muted-foreground/30 hover:text-foreground/80 active:cursor-grabbing hover:bg-muted rounded self-stretch"
          title="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </div>
      </div>
    </Card>
  );
}

// --- Main Editor ---

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

  // Capture State
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTargetName, setCaptureTargetName] = useState("");
  const [captureCallback, setCaptureCallback] = useState<
    (name: string) => void
  >(() => {});

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Mouse pick State
  const [pickerOpen, setPickerOpen] = useState(false);

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
  const taskIdStr = taskId == null ? "000" : pad3(taskId);

  const apply = (mut: (draft: any) => void) => {
    if (!t) return;
    const d = deepClone(t);
    mut(d);
    onChange(d);
  };

  const refreshTemplates = async () => {
    try {
      const j = await apiGet(apiBase, "/templates");
      setTemplates((j.templates || []) as string[]);
    } catch {
      // ignore
    }
  };

  const startCapture = (
    suggestedName: string,
    onFinish: (name: string) => void
  ) => {
    setCaptureTargetName(suggestedName);
    setCaptureCallback(() => async (savedName: string) => {
      await refreshTemplates();
      onFinish(savedName);
    });
    setCaptureOpen(true);
  };

  // --- Helpers ---

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
      <SelectTrigger className="w-full">
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

  const fileUrl = (name: string) => {
    const u = new URL(`${apiBase}/templates/file`);
    u.searchParams.set("name", name);
    u.searchParams.set("t", String(Date.now()));
    return u.toString();
  };

  // Step 2 DnD Handler
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = parseInt(String(active.id));
    const newIndex = parseInt(String(over.id));
    if (isNaN(oldIndex) || isNaN(newIndex)) return;

    apply((d) => {
      const arr = getByPath(d, ["preplay", "actions"], []) as any[];
      const next = arrayMove(arr, oldIndex, newIndex);
      setByPath(d, ["preplay", "actions"], next);
    });
  };

  // Step 3 DnD Handler
  const handleDragEndStep3 = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = parseInt(String(active.id));
    const newIndex = parseInt(String(over.id));
    if (isNaN(oldIndex) || isNaN(newIndex)) return;

    apply((d) => {
      const arr = getByPath(d, ["play", "branches"], []) as any[];
      const next = arrayMove(arr, oldIndex, newIndex);
      setByPath(d, ["play", "branches"], next);
    });
  };

  // Helper to get branches safely
  const branches: any[] = t ? getByPath(t, ["play", "branches"], []) : [];

  // --- Render (Form View 逻辑直接嵌入) ---

  if (!t && mode === "form") {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a task to edit
      </div>
    );
  }

  // Extract data for form
  const name = t ? getByPath(t, ["name"], "") : "";
  const basename = t ? getByPath(t, ["record", "basename"], "") : "";
  const entryMode = t ? getByPath(t, ["entry", "mode"], "gallery") : "gallery";
  const entryTpl = t ? getByPath(t, ["entry", "template"], "") : "";
  const actions: any[] = t ? getByPath(t, ["preplay", "actions"], []) : [];
  const advMethod = t
    ? getByPath(t, ["play", "advance_method"], "mouse_left")
    : "mouse_left";
  const pacing = t ? getByPath(t, ["play", "pacing"], "system") : "system";
  const endTpl = t ? getByPath(t, ["end", "template"], "") : "";

  return (
    <>
      <div className="space-y-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-3">
            <div className="text-lg font-bold tracking-tight">Task Editor</div>
            {taskId != null && (
              <Badge variant="secondary" className="font-mono">
                #{pad3(taskId)}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode(mode === "form" ? "raw" : "form")}
              disabled={!t}
              className="text-xs"
            >
              {mode === "form" ? "</> Raw JSON" : "Form View"}
            </Button>
            <Button size="sm" onClick={onSave} disabled={!t || !!saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Content */}
        {mode === "form" ? (
          <div className="space-y-6">
            <StepNavigator step={step} setStep={setStep} />

            {/* Meta Info Section */}
            <div className="grid grid-cols-12 gap-4 p-4 bg-muted/20 rounded-lg border">
              <div className="col-span-6">
                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                  Task Name
                </div>
                <Input
                  value={name}
                  className="h-8 bg-background"
                  onChange={(e) =>
                    apply((d) => {
                      setByPath(d, ["name"], e.target.value);
                      const b = getByPath(d, ["record", "basename"], "");
                      if (!b)
                        setByPath(d, ["record", "basename"], e.target.value);
                    })
                  }
                  placeholder="CG_001"
                />
              </div>
              <div className="col-span-6">
                <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                  File Basename
                </div>
                <Input
                  value={basename}
                  className="h-8 bg-background font-mono"
                  onChange={(e) =>
                    apply((d) =>
                      setByPath(d, ["record", "basename"], e.target.value)
                    )
                  }
                  placeholder="CG_001"
                />
              </div>
            </div>

            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Entry Configuration</h3>
                </div>
                <Card className="p-4 space-y-4">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-4">
                      <div className="text-xs font-medium mb-1.5">
                        Entry Mode
                      </div>
                      <Select
                        value={entryMode}
                        onValueChange={(v) =>
                          apply((d) => setByPath(d, ["entry", "mode"], v))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gallery">Gallery Mode</SelectItem>
                          <SelectItem value="roam">Roam Mode</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-8">
                      <div className="text-xs font-medium mb-1.5">
                        Target Template
                      </div>
                      <div className="flex gap-2">
                        <TemplateSelect
                          value={entryTpl}
                          onPick={(v) =>
                            apply((d) => setByPath(d, ["entry", "template"], v))
                          }
                          placeholder="Select entry button image..."
                        />
                        <Button
                          onClick={() =>
                            startCapture(`${taskIdStr}_entry.png`, (name) =>
                              apply((d) =>
                                setByPath(d, ["entry", "template"], name)
                              )
                            )
                          }
                        >
                          Capture
                        </Button>
                      </div>
                    </div>
                  </div>

                  {entryTpl && (
                    <div className="bg-muted/50 rounded-md p-2 flex justify-center border border-dashed">
                      <img
                        src={fileUrl(entryTpl)}
                        className="max-h-[300px] object-contain rounded shadow-sm"
                        alt="entry preview"
                      />
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Pre-play Sequence</h3>
                  <Button
                    size="sm"
                    onClick={() =>
                      apply((d) => {
                        const arr = getByPath(d, ["preplay", "actions"], []);
                        const next = Array.isArray(arr) ? arr.slice() : [];
                        next.push({ template: "", delay: 0.5 });
                        setByPath(d, ["preplay", "actions"], next);
                      })
                    }
                  >
                    + Add Action
                  </Button>
                </div>

                {/* DnD List */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={actions.map((_, i) => String(i))}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {actions.length === 0 && (
                        <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
                          No pre-play actions defined.
                          <br />
                          Click "+ Add Action" to start.
                        </div>
                      )}
                      {actions.map((a, idx) => (
                        <SortableActionItem
                          key={idx}
                          id={String(idx)}
                          idx={idx}
                          action={a}
                          taskIdStr={taskIdStr}
                          templates={templates}
                          apiBase={apiBase} // 传入 API Base
                          onUpdate={(field, val) =>
                            apply((d) => {
                              const next = getByPath(
                                d,
                                ["preplay", "actions"],
                                []
                              ).slice();
                              next[idx] = {
                                ...(next[idx] || {}),
                                [field]: val,
                              };
                              setByPath(d, ["preplay", "actions"], next);
                            })
                          }
                          onDelete={() =>
                            apply((d) => {
                              const next = getByPath(
                                d,
                                ["preplay", "actions"],
                                []
                              ).slice();
                              next.splice(idx, 1);
                              setByPath(d, ["preplay", "actions"], next);
                            })
                          }
                          onCapture={() => {
                            const currentVal = a?.template;
                            const defaultName = `${taskIdStr}_pre_${String(
                              idx + 1
                            ).padStart(2, "0")}.png`;
                            const suggest =
                              currentVal && currentVal.length > 0
                                ? currentVal
                                : defaultName;
                            startCapture(suggest, (name) =>
                              apply((d) => {
                                const next = getByPath(
                                  d,
                                  ["preplay", "actions"],
                                  []
                                ).slice();
                                next[idx] = {
                                  ...(next[idx] || {}),
                                  template: name,
                                };
                                setByPath(d, ["preplay", "actions"], next);
                              })
                            );
                          }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* Step 3 */}
            {/* Step 3 */}
            {step === 3 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <div className="font-medium">Step 3 — Play (C)</div>
                </div>

                {/* Grid Configuration: Method, Pacing, Target */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-4">
                    <div className="text-xs text-muted-foreground mb-1">
                      Method
                    </div>
                    <Select
                      value={advMethod}
                      onValueChange={(v) =>
                        apply((d) =>
                          setByPath(d, ["play", "advance_method"], v)
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mouse_left">mouse_left</SelectItem>
                        <SelectItem value="enter">enter key</SelectItem>
                        <SelectItem value="space">space key</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-4">
                    <div className="text-xs text-muted-foreground mb-1">
                      Pacing
                    </div>
                    <Select
                      value={pacing}
                      onValueChange={(v) =>
                        apply((d) => setByPath(d, ["play", "pacing"], v))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">system</SelectItem>
                        <SelectItem value="audio" disabled>
                          audio (todo)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 👇 Target Coordinates (仅 mouse_left 显示) */}
                  {advMethod === "mouse_left" && (
                    <div className="col-span-4 space-y-1">
                      {/* Label Row with Pick Button */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          Target (X, Y)
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 px-1 text-[10px] text-primary hover:bg-primary/10"
                          onClick={() => setPickerOpen(true)}
                          title="Pick from game window"
                        >
                          <MousePointer2 className="w-3 h-3 mr-1" />
                          Pick
                        </Button>
                      </div>

                      {/* Inputs Row */}
                      <div className="flex gap-2">
                        <Input
                          placeholder="Global X"
                          value={getByPath(t, ["play", "target", 0], "")}
                          onChange={(e) => {
                            const val = e.target.value;
                            apply((d) => {
                              const oldY = getByPath(
                                d,
                                ["play", "target", 1],
                                ""
                              );
                              if (!val && !oldY) {
                                if (d.play) delete d.play.target;
                              } else {
                                setByPath(
                                  d,
                                  ["play", "target"],
                                  [val, oldY || ""]
                                );
                              }
                            });
                          }}
                          className="font-mono text-xs h-8"
                        />
                        <Input
                          placeholder="Global Y"
                          value={getByPath(t, ["play", "target", 1], "")}
                          onChange={(e) => {
                            const val = e.target.value;
                            apply((d) => {
                              const oldX = getByPath(
                                d,
                                ["play", "target", 0],
                                ""
                              );
                              if (!val && !oldX) {
                                if (d.play) delete d.play.target;
                              } else {
                                setByPath(
                                  d,
                                  ["play", "target"],
                                  [oldX || "", val]
                                );
                              }
                            });
                          }}
                          className="font-mono text-xs h-8"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {advMethod === "mouse_left" && (
                  <div className="text-[10px] text-muted-foreground">
                    * Target X/Y: 0.0 - 1.0 (relative to window). Leave empty to
                    use Global Config.
                  </div>
                )}

                {/* 👇👇👇 新增：分支列表区域 👇👇👇 */}
                <div className="pt-4 border-t mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-col">
                      <h3 className="text-sm font-semibold">
                        Branching / Choices
                      </h3>
                      <span className="text-[10px] text-muted-foreground">
                        Auto-click specific options when they appear.
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        apply((d) => {
                          const arr = getByPath(d, ["play", "branches"], []);
                          const next = Array.isArray(arr) ? arr.slice() : [];
                          next.push({ template: "", delay: 1.0 });
                          setByPath(d, ["play", "branches"], next);
                        })
                      }
                    >
                      + Add Branch
                    </Button>
                  </div>

                  {/* 这里使用了 handleDragEndStep3 和 branches 变量 */}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEndStep3}
                  >
                    <SortableContext
                      items={branches.map((_, i) => String(i))}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {branches.length === 0 && (
                          <div className="text-center py-6 border-2 border-dashed rounded-lg bg-muted/20 text-muted-foreground text-xs">
                            No branches defined. Standard loop only.
                          </div>
                        )}
                        {branches.map((b, idx) => (
                          <SortableActionItem
                            key={idx}
                            id={String(idx)}
                            idx={idx}
                            action={b}
                            taskIdStr={taskIdStr}
                            templates={templates}
                            apiBase={apiBase}
                            onUpdate={(field, val) =>
                              apply((d) => {
                                const next = getByPath(
                                  d,
                                  ["play", "branches"],
                                  []
                                ).slice();
                                next[idx] = {
                                  ...(next[idx] || {}),
                                  [field]: val,
                                };
                                setByPath(d, ["play", "branches"], next);
                              })
                            }
                            onDelete={() =>
                              apply((d) => {
                                const next = getByPath(
                                  d,
                                  ["play", "branches"],
                                  []
                                ).slice();
                                next.splice(idx, 1);
                                setByPath(d, ["play", "branches"], next);
                              })
                            }
                            onCapture={() => {
                              const currentVal = b?.template;
                              const defaultName = `${taskIdStr}_br_${String(
                                idx + 1
                              ).padStart(2, "0")}.png`;
                              const suggest =
                                currentVal && currentVal.length > 0
                                  ? currentVal
                                  : defaultName;

                              startCapture(suggest, (name) =>
                                apply((d) => {
                                  const next = getByPath(
                                    d,
                                    ["play", "branches"],
                                    []
                                  ).slice();
                                  next[idx] = {
                                    ...(next[idx] || {}),
                                    template: name,
                                  };
                                  setByPath(d, ["play", "branches"], next);
                                })
                              );
                            }}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
                {/* 👆👆👆 新增结束 👆👆👆 */}
              </div>
            )}

            {/* Step 4 */}
            {step === 4 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">End Detection</h3>
                </div>
                <Card className="p-4 space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-medium">End Template</div>
                    <div className="flex gap-2">
                      <TemplateSelect
                        value={endTpl}
                        onPick={(v) =>
                          apply((d) => setByPath(d, ["end", "template"], v))
                        }
                      />
                      <Button
                        onClick={() =>
                          startCapture(`${taskIdStr}_end.png`, (name) =>
                            apply((d) =>
                              setByPath(d, ["end", "template"], name)
                            )
                          )
                        }
                      >
                        Capture
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Recording stops when this image is found.
                    </p>
                  </div>

                  {endTpl && (
                    <div className="bg-muted/50 rounded-md p-2 flex justify-center border border-dashed">
                      <img
                        src={fileUrl(endTpl)}
                        className="max-h-[300px] object-contain rounded shadow-sm"
                        alt="end preview"
                      />
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        ) : (
          /* Raw View */
          <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
            <Textarea
              className="h-[600px] font-mono text-xs leading-relaxed"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              spellCheck={false}
            />
            <div className="flex justify-between items-center bg-muted/30 p-2 rounded">
              <span className="text-xs text-muted-foreground">
                JSON Mode allows direct config manipulation.
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  try {
                    onChange(JSON.parse(raw));
                  } catch {
                    alert("Invalid JSON syntax");
                  }
                }}
                disabled={!t}
              >
                Validate & Apply
              </Button>
            </div>
          </div>
        )}
      </div>

      <CaptureModal
        isOpen={captureOpen}
        onClose={() => setCaptureOpen(false)}
        apiBase={apiBase}
        suggestedName={captureTargetName}
        onSaved={captureCallback}
      />
      <PointPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        apiBase={apiBase}
        // 从当前配置或全局配置里拿 window_title
        // 这里需要传递一个有效的 window_title 给后端截图
        // 假设我们在 ConfigTab 里配过，或者 TaskEditor 也有 context
        // 简单起见，我们暂且认为 user 需要在 Config 里配好。
        // 或者我们可以传一个默认值/让后端自己去 Config 查。
        // 建议：直接让 PointPicker 传空 windowTitle，由后端默认去 Active Game Config 查。
        windowTitle=""
        onPick={(x, y) => {
          // 保留4位小数即可
          const sx = x.toFixed(4);
          const sy = y.toFixed(4);
          apply((d) => setByPath(d, ["play", "target"], [sx, sy]));
        }}
      />
    </>
  );
}
