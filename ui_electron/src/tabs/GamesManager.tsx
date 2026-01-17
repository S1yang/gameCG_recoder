import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, Power, Trash2, Settings, FileText } from "lucide-react";

// 必须分开引用组件(默认)和类型(named)
import GamesListPanel from "@/components/games/GamesListPanel";
import type { GameItem } from "@/components/games/GamesListPanel";

import GameRegistryForm from "@/components/games/GameRegistryForm";
import { ConfigTab } from "@/tabs/ConfigTab";

export function GamesManager({
  apiBase,
  ok,
}: {
  apiBase: string;
  ok: boolean;
}) {
  // Data
  const [games, setGames] = useState<GameItem[]>([]);
  const [activeKey, setActiveKey] = useState("");

  // UI State
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "create">("view"); // 右侧显示模式
  const [rightTab, setRightTab] = useState("registry"); // view模式下的子tab

  const [busy, setBusy] = useState(false);

  // 1. Refresh
  const refresh = async () => {
    if (!apiBase) return;
    try {
      const r = await fetch(`${apiBase}/games`);
      const j = await r.json();
      setGames(j.games || []);
      setActiveKey(j.active || "");

      // 自动修正选中项
      if (selectedKey && !j.games.find((g: any) => g.key === selectedKey)) {
        setSelectedKey(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (apiBase && ok) {
      refresh();
    }
  }, [apiBase, ok]);

  // 2. Computed
  const selectedGame = useMemo(
    () => games.find((g) => g.key === selectedKey),
    [games, selectedKey]
  );

  const isActiveSelected = selectedGame?.key === activeKey;

  // 3. Actions
  const handleSetActive = async () => {
    if (!selectedKey) return;
    setBusy(true);
    await fetch(`${apiBase}/games/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: selectedKey }),
    });
    await refresh();
    setBusy(false);
  };

  const handleDelete = async () => {
    if (
      !selectedKey ||
      !confirm(`Delete ${selectedKey}? Registry record will be removed.`)
    )
      return;
    await fetch(`${apiBase}/games/${selectedKey}?purge=false`, {
      method: "DELETE",
    });
    await refresh();
    setSelectedKey(null);
  };

  const handleOpenFolder = async () => {
    if (!selectedKey) return;
    await fetch(`${apiBase}/games/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: selectedKey, reveal: true }),
    });
  };

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-140px)] min-h-[600px]">
      {/* Container */}
      <div className="flex-1 flex overflow-hidden border rounded-md bg-background shadow-sm">
        {/* Left: List (300px) */}
        <div className="w-[300px] flex-none border-r flex flex-col">
          <GamesListPanel
            games={games}
            activeKey={activeKey}
            selectedKey={selectedKey}
            onSelect={(k) => {
              setSelectedKey(k);
              setMode("view");
            }}
            onAdd={() => {
              setSelectedKey(null);
              setMode("create");
            }}
          />
        </div>

        {/* Right: Content */}
        <div className="flex-1 min-w-0 bg-card flex flex-col">
          {/* Create Mode */}
          {mode === "create" && (
            <div className="flex-1 overflow-auto bg-muted/5">
              <GameRegistryForm
                apiBase={apiBase}
                onSuccess={(k) => {
                  refresh();
                  setSelectedKey(k);
                  setMode("view");
                }}
              />
            </div>
          )}

          {/* View Mode */}
          {mode === "view" && !selectedGame && (
            <div className="h-full flex items-center justify-center text-muted-foreground select-none">
              Select a game to manage
            </div>
          )}

          {mode === "view" && selectedGame && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex-none p-4 border-b bg-background flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">
                      {selectedGame.title || selectedGame.key}
                    </h2>
                    {isActiveSelected && <Badge>Active</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                    {selectedGame.root}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isActiveSelected && (
                    <Button size="sm" onClick={handleSetActive} disabled={busy}>
                      <Power className="w-4 h-4 mr-1" /> Set Active
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenFolder}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={handleDelete}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <Tabs
                value={rightTab}
                onValueChange={setRightTab}
                className="flex-1 flex flex-col min-h-0"
              >
                <div className="px-4 border-b bg-muted/10">
                  <TabsList className="bg-transparent h-10 p-0 space-x-4">
                    <TabsTrigger
                      value="registry"
                      className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-1"
                    >
                      <Settings className="w-3.5 h-3.5 mr-2" /> Registry
                      Settings
                    </TabsTrigger>
                    <TabsTrigger
                      value="config"
                      className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-1"
                    >
                      <FileText className="w-3.5 h-3.5 mr-2" /> Engine Config
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent
                  value="registry"
                  className="flex-1 overflow-auto m-0 p-0"
                >
                  <div className="p-4">
                    <GameRegistryForm
                      apiBase={apiBase}
                      targetGame={selectedGame}
                      onSuccess={() => refresh()}
                    />
                  </div>
                </TabsContent>

                <TabsContent
                  value="config"
                  className="flex-1 overflow-auto m-0 p-0 bg-muted/5"
                >
                  {isActiveSelected ? (
                    <div className="p-4">
                      {/* ✅ 传入 onSaved 回调，触发整个列表刷新 */}
                      <ConfigTab
                        apiBase={apiBase}
                        ok={ok}
                        onSaved={() => refresh()}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                      <FileText className="w-12 h-12 opacity-20" />
                      <div className="text-center">
                        <p className="font-medium">
                          Configuration requires activation
                        </p>
                        <p className="text-sm opacity-70">
                          Please click "Set Active" in the top right corner{" "}
                          <br />
                          to edit <code>config.yaml</code> for this game.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleSetActive}
                        disabled={busy}
                      >
                        Activate {selectedGame.key}
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
