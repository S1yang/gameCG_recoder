import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { GamesTab } from "./tabs/GamesTab";
import { TasksTab } from "./tabs/TasksTab";
import { TemplatesTab } from "./tabs/TemplatesTab";
import { ConfigTab } from "./tabs/ConfigTab";

export default function App() {
  const [apiBase, setApiBase] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string>("");

  const [tab, setTab] = useState<"games" | "tasks" | "templates" | "config">(
    "games"
  );

  useEffect(() => {
    let alive = true;

    const init = async () => {
      try {
        const base = await window.galrec.getApiBase();
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
    <div className="min-h-screen p-6 bg-background text-foreground">
      <h1 className="text-2xl font-semibold mb-4">GalRec Project Manager</h1>

      {err && <div className="mb-3 text-sm text-destructive">Error: {err}</div>}

      <Tabs
        value={tab}
        onValueChange={(v) =>
          setTab(v as "games" | "tasks" | "templates" | "config")
        }
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="games">Games</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="games">
          {/* ✅ 传入跳转函数 */}
          <GamesTab
            apiBase={apiBase}
            ok={ok}
            onGoConfig={() => setTab("config")}
          />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksTab apiBase={apiBase} ok={ok} />
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesTab apiBase={apiBase} ok={ok} />
        </TabsContent>

        <TabsContent value="config">
          <ConfigTab apiBase={apiBase} ok={ok} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
