import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, LayoutGrid } from "lucide-react";

// 👇 Updated Imports
import { GamesManager } from "@/tabs/GamesManager";
import { TasksTab } from "@/tabs/TasksTab";
import { TemplatesTab } from "@/tabs/TemplatesTab";
// ConfigTab removed (integrated into GamesManager)

export default function App() {
  const [apiBase, setApiBase] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string>("");

  const [tab, setTab] = useState<"games" | "tasks" | "templates">("games");

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
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as any)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <header className="flex-none px-4 py-3 border-b flex items-center justify-between bg-card z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold tracking-tight">
                GalRec Manager
              </h1>
            </div>
            <div className="flex items-center">
              {ok ? (
                <Badge
                  variant="outline"
                  className="text-green-600 border-green-200 bg-green-50 gap-1 px-2 py-0.5 h-6"
                >
                  <Wifi className="w-3 h-3" />{" "}
                  <span className="text-xs">Online</span>
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1 px-2 py-0.5 h-6">
                  <WifiOff className="w-3 h-3" />{" "}
                  <span className="text-xs">Offline</span>
                </Badge>
              )}
            </div>
          </div>

          <TabsList className="bg-muted/50">
            <TabsTrigger value="games" className="px-4">
              Games & Config
            </TabsTrigger>
            <TabsTrigger value="tasks" className="px-4">
              Tasks
            </TabsTrigger>
            <TabsTrigger value="templates" className="px-4">
              Templates
            </TabsTrigger>
          </TabsList>
        </header>

        <div className="flex-1 overflow-hidden relative">
          <ScrollArea className="h-full w-full">
            <div className="p-6 max-w-[1600px] mx-auto min-h-[calc(100vh-120px)]">
              {err && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm font-medium">
                  ⚠️ Error: {err}
                </div>
              )}

              <TabsContent
                value="games"
                className="m-0 border-none p-0 outline-none animate-in fade-in-50 duration-300"
              >
                <GamesManager apiBase={apiBase} ok={ok} />
              </TabsContent>

              <TabsContent
                value="tasks"
                className="m-0 border-none p-0 outline-none animate-in fade-in-50 duration-300"
              >
                <TasksTab apiBase={apiBase} ok={ok} />
              </TabsContent>

              <TabsContent
                value="templates"
                className="m-0 border-none p-0 outline-none animate-in fade-in-50 duration-300"
              >
                <TemplatesTab apiBase={apiBase} ok={ok} />
              </TabsContent>
            </div>
          </ScrollArea>
        </div>

        <div className="flex-none border-t bg-muted/20 text-[10px] text-muted-foreground px-4 py-1 flex justify-between items-center select-none">
          <div className="flex gap-4">
            <span>API: {apiBase || "Scanning..."}</span>
            <span>PID: {window.process?.pid || "N/A"}</span>
          </div>
          <span>v0.1.0 Alpha</span>
        </div>
      </Tabs>
    </div>
  );
}
