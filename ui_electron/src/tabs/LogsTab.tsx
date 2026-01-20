import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Eraser,
  Pause,
  Play,
  RefreshCw,
  Terminal,
  ZoomIn,
  ZoomOut,
  Palette, // 🟢 Added Icon
} from "lucide-react";

type Props = { apiBase: string; ok: boolean };

// 🟢 定义主题配置
const THEMES = {
  scifi: {
    label: "Sci-Fi",
    bg: "bg-[#0c0c0c]",
    text: "text-green-400",
    border: "border-green-900/30",
    scroll: "dark", // 指示滚动条风格(逻辑上)
  },
  dark: {
    label: "Dark (VSCode)",
    bg: "bg-zinc-950",
    text: "text-zinc-300",
    border: "border-zinc-800",
    scroll: "dark",
  },
  light: {
    label: "Light (Paper)",
    bg: "bg-white",
    text: "text-zinc-800",
    border: "border-zinc-200",
    scroll: "light",
  },
  ocean: {
    label: "Ocean",
    bg: "bg-slate-900",
    text: "text-cyan-400",
    border: "border-cyan-900/30",
    scroll: "dark",
  },
};

type ThemeKey = keyof typeof THEMES;

export function LogsTab({ apiBase, ok }: Props) {
  const [logs, setLogs] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [polling, setPolling] = useState(true);

  // 🟢 状态：字号 & 主题
  const [fontSize, setFontSize] = useState(15);
  const [themeKey, setThemeKey] = useState<ThemeKey>("scifi");

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/logs?n=1000`);
      if (res.ok) {
        const text = await res.text();
        setLogs(text);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const clearLogs = async () => {
    if (!apiBase) return;
    if (!confirm("Clear runner.log?")) return;
    await fetch(`${apiBase}/logs`, { method: "DELETE" });
    setLogs("");
  };

  // 轮询逻辑
  useEffect(() => {
    fetchLogs();
    if (!polling || !ok) return;
    const timer = setInterval(fetchLogs, 1000);
    return () => clearInterval(timer);
  }, [apiBase, ok, polling]);

  // 自动滚动
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const curTheme = THEMES[themeKey];

  return (
    <Card className="h-full flex flex-col border-none shadow-none bg-transparent gap-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1 flex-none flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-lg">Runner Logs</h3>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* 🟢 Theme Selector */}
          <div className="flex items-center gap-1 mr-2">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <Select
              value={themeKey}
              onValueChange={(v) => setThemeKey(v as ThemeKey)}
            >
              <SelectTrigger className="h-7 w-[130px] text-xs bg-muted/30 border-border">
                <SelectValue placeholder="Theme" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(THEMES).map(([k, v]) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Font Size Controls */}
          <div className="flex items-center bg-muted/30 rounded-md border p-0.5 mr-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setFontSize((s) => Math.max(10, s - 1))}
              disabled={fontSize <= 10}
              title="Decrease Font Size"
            >
              <ZoomOut className="w-3 h-3" />
            </Button>
            <span className="text-[10px] font-mono w-8 text-center text-muted-foreground select-none">
              {fontSize}px
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setFontSize((s) => Math.min(24, s + 1))}
              disabled={fontSize >= 24}
              title="Increase Font Size"
            >
              <ZoomIn className="w-3 h-3" />
            </Button>
          </div>

          <div className="flex items-center gap-2 mr-2">
            <Switch
              id="auto-scroll"
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
            />
            <Label
              htmlFor="auto-scroll"
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Auto-scroll
            </Label>
          </div>

          <div className="w-px h-4 bg-border mx-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPolling(!polling)}
            title={polling ? "Auto-refreshing every 1s" : "Polling paused"}
            className={
              polling
                ? "border-green-500/30 text-green-600 bg-green-500/5"
                : "text-muted-foreground"
            }
          >
            {polling ? (
              <Pause className="w-4 h-4 mr-2" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            {polling ? "Live" : "Paused"}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={fetchLogs}
            title="Refresh manually"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={clearLogs}
            className="ml-2"
          >
            <Eraser className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {/* Console Area - 🟢 Dynamic Classes */}
      <div
        className={`flex-1 min-h-0 border rounded-md font-mono shadow-inner relative overflow-hidden transition-colors duration-300 ${curTheme.bg} ${curTheme.text} ${curTheme.border}`}
      >
        <ScrollArea className="h-full w-full" ref={scrollRef}>
          <div className="p-4 min-h-full">
            <pre
              style={{ fontSize: fontSize }}
              className="whitespace-pre-wrap break-all leading-relaxed transition-all duration-100"
            >
              {logs || (
                <span className="opacity-50 italic">
                  // Waiting for logs...
                </span>
              )}
            </pre>
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}
