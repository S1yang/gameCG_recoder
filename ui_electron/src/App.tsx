import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Wifi,
  WifiOff,
  LayoutGrid,
  Gamepad2,
  ListTodo,
  Image as ImageIcon,
  ScrollText, // 🟢 Changed icon for Logs
  Settings2,
} from "lucide-react";

import { GamesManager } from "@/tabs/GamesManager";
import { TasksTab } from "@/tabs/TasksTab";
import { TemplatesTab } from "@/tabs/TemplatesTab";
import { LogsTab } from "@/tabs/LogsTab";

export default function App() {
  const [apiBase, setApiBase] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string>("");

  const [tab, setTab] = useState<"games" | "tasks" | "templates" | "logs">(
    "games"
  );

  useEffect(() => {
    let alive = true;
    const init = async () => {
      try {
        // @ts-ignore
        const base = await window.galrec?.getApiBase();
        if (!alive || !base) return;
        setApiBase(base);
        const r = await fetch(`${base}/health`);
        const j = await r.json();
        setOk(Boolean(j.ok));
        setErr("");
      } catch (e: any) {
        if (alive) setErr(e?.message || String(e));
      }
    };
    init();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-sans">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as any)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* --- Header Area --- */}
        <header className="flex-none px-5 py-4 border-b flex items-center justify-between bg-card/80 backdrop-blur-sm z-20 shadow-sm transition-all">
          {/* Logo & Status */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 select-none">
              <div className="bg-primary/10 p-2 rounded-lg">
                <LayoutGrid className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight leading-none text-foreground">
                  GameCG Rec
                </h1>
                <p className="text-xs text-muted-foreground font-medium tracking-wide opacity-80 mt-0.5">
                  半自动CG录制工具
                </p>
              </div>
            </div>
            {/* <div className="h-8 w-px bg-border/60" />
            <div className="flex items-center">
              {ok ? (
                <Badge
                  variant="outline"
                  className="text-emerald-600 border-emerald-200 bg-emerald-50/50 gap-2 px-3 py-1 h-7 shadow-sm"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">API Online</span>
                </Badge>
              ) : (
                <Badge
                  variant="destructive"
                  className="gap-2 px-3 py-1 h-7 shadow-sm"
                >
                  <WifiOff className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">API Offline</span>
                </Badge>
              )}
            </div> */}
          </div>

          {/* Navigation Tabs (字号放大至 text-sm) */}
          <TabsList className="bg-muted/40 border border-border/50 p-1 h-11 shadow-inner rounded-lg">
            <TabsTrigger
              value="games"
              className="h-9 px-4 gap-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
            >
              <Gamepad2 className="w-4 h-4" />
              游戏 & 全局配置{" "}
              <span className="opacity-50 text-xs font-normal">
                / Games & Config
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="tasks"
              className="h-9 px-4 gap-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
            >
              <ListTodo className="w-4 h-4" />
              任务序列{" "}
              <span className="opacity-50 text-xs font-normal">/ Tasks</span>
            </TabsTrigger>

            <TabsTrigger
              value="templates"
              className="h-9 px-4 gap-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
            >
              <ImageIcon className="w-4 h-4" />
              图片库{" "}
              <span className="opacity-50 text-xs font-normal">/ Assets</span>
            </TabsTrigger>

            <TabsTrigger
              value="logs"
              className="h-9 px-4 gap-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-primary transition-all"
            >
              <ScrollText className="w-4 h-4" />
              运行日志{" "}
              <span className="opacity-50 text-xs font-normal">/ Logs</span>
            </TabsTrigger>
          </TabsList>
        </header>

        {/* --- Main Content Area --- */}
        <div className="flex-1 overflow-hidden relative bg-muted/5">
          <ScrollArea className="h-full w-full">
            <div className="p-6 max-w-[1800px] mx-auto min-h-[calc(100vh-120px)] h-full flex flex-col">
              {err && (
                <div className="mb-6 p-4 bg-destructive/5 border border-destructive/20 text-destructive rounded-lg text-sm font-medium flex items-center gap-3 shadow-sm animate-in slide-in-from-top-2">
                  <div className="bg-destructive/10 p-1 rounded-full">
                    <WifiOff className="w-4 h-4" />
                  </div>
                  API Connection Error: {err}
                </div>
              )}

              <div className="flex-1 flex flex-col">
                <TabsContent
                  value="games"
                  className="m-0 border-none p-0 outline-none flex-1 animate-in fade-in-50 slide-in-from-bottom-2 duration-300"
                >
                  <GamesManager apiBase={apiBase} ok={ok} />
                </TabsContent>

                <TabsContent
                  value="tasks"
                  className="m-0 border-none p-0 outline-none flex-1 animate-in fade-in-50 slide-in-from-bottom-2 duration-300"
                >
                  <TasksTab apiBase={apiBase} ok={ok} />
                </TabsContent>

                <TabsContent
                  value="templates"
                  className="m-0 border-none p-0 outline-none flex-1 animate-in fade-in-50 slide-in-from-bottom-2 duration-300"
                >
                  <TemplatesTab apiBase={apiBase} ok={ok} />
                </TabsContent>

                <TabsContent
                  value="logs"
                  className="m-0 border-none p-0 outline-none flex-1 h-[calc(100vh-180px)] animate-in fade-in-50 slide-in-from-bottom-2 duration-300"
                >
                  <LogsTab apiBase={apiBase} ok={ok} />
                </TabsContent>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* --- Footer / Status Bar (字号放大至 text-xs) --- */}
        <div className="flex-none border-t bg-card text-xs text-muted-foreground px-5 py-2 flex justify-between items-center select-none shadow-[0_-1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex gap-6 items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  ok ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                }`}
              />
              <span className="font-mono opacity-80">
                API: {apiBase || "Scanning..."}
              </span>
            </div>
            <div className="w-px h-3 bg-border" />
            <span className="font-mono opacity-80">PID: {"N/A"}</span>
          </div>
          <div className="flex items-center gap-2 opacity-60">
            <Settings2 className="w-3.5 h-3.5" />
            <span className="font-medium">v0.9.0 Beta</span>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
