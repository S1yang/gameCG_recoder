import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  apiBase: string;
  ok: boolean;
  onGoConfig?: () => void;
};

type GameItem = {
  key: string;
  root: string;
  title?: string;
  window_title?: string;
  is_active?: boolean;
};

type ImportCandidate = {
  folder: string;
  root: string;
  has_config: boolean;
  has_sequences: boolean;
  has_templates: boolean;
  suggest?: {
    key?: string;
    title?: string;
    window_title?: string;
  };
};

async function apiGet(base: string, path: string) {
  const r = await fetch(`${base}${path}`);
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

async function apiDelete(base: string, path: string) {
  const r = await fetch(`${base}${path}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function GamesTab({ apiBase, ok, onGoConfig }: Props) {
  const [err, setErr] = useState("");

  const [busyRefresh, setBusyRefresh] = useState(false);
  const [busyActive, setBusyActive] = useState(false);
  const [busyOpen, setBusyOpen] = useState(false);

  const [busyUpsert, setBusyUpsert] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const [busyScan, setBusyScan] = useState(false);
  const [busyImport, setBusyImport] = useState<string>(""); // folder

  const [games, setGames] = useState<GameItem[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return games.find((g) => g.key === selectedKey) || null;
  }, [games, selectedKey]);

  // -------- Create/Update form (registry) --------
  const [fKey, setFKey] = useState("");
  const [fRoot, setFRoot] = useState(""); // relative, optional
  const [fTitle, setFTitle] = useState("");
  const [fWindowTitle, setFWindowTitle] = useState("");

  const [fCreateDirs, setFCreateDirs] = useState(true);
  const [fSetActive, setFSetActive] = useState(true);

  // -------- Delete options --------
  const [purge, setPurge] = useState(false);

  // -------- Import --------
  const [cands, setCands] = useState<ImportCandidate[]>([]);
  const [importSetActive, setImportSetActive] = useState(false);

  const refresh = async () => {
    if (!apiBase) return;
    setBusyRefresh(true);
    try {
      setErr("");
      const j = await apiGet(apiBase, "/games");
      const list: GameItem[] = j.games || [];
      setGames(list);
      setActiveKey(j.active || "");

      const keys = new Set(list.map((x) => x.key));
      const nextSelected =
        (selectedKey && keys.has(selectedKey) && selectedKey) ||
        (j.active && keys.has(j.active) && j.active) ||
        (list[0]?.key ?? null);

      setSelectedKey(nextSelected);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyRefresh(false);
    }
  };

  // 选中变更时：把 details 填回表单（方便“更新”）
  useEffect(() => {
    if (!selected) return;
    setFKey(selected.key || "");
    setFRoot(selected.root || "");
    setFTitle(selected.title || "");
    setFWindowTitle(selected.window_title || "");
    // 不自动改 fCreateDirs / fSetActive（它们是动作开关）
  }, [selected?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (apiBase && ok) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, ok]);

  const onSetActive = async () => {
    if (!apiBase || !selected) return;
    setBusyActive(true);
    try {
      setErr("");
      await apiPost(apiBase, "/games/active", { key: selected.key });
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyActive(false);
    }
  };

  const onOpenFolder = async () => {
    if (!apiBase || !selected) return;
    setBusyOpen(true);
    try {
      setErr("");
      await apiPost(apiBase, "/games/open", {
        key: selected.key,
        reveal: false,
      });
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyOpen(false);
    }
  };

  const onUpsert = async () => {
    if (!apiBase) return;
    setBusyUpsert(true);
    try {
      setErr("");

      const key = fKey.trim();
      if (!key) throw new Error("key 不能为空");

      await apiPost(apiBase, "/games", {
        key,
        root: fRoot.trim() ? fRoot.trim() : undefined,
        title: fTitle ?? "",
        window_title: fWindowTitle ?? "",
        create_dirs: fCreateDirs,
        set_active: fSetActive,
      });

      await refresh();
      setSelectedKey(key);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyUpsert(false);
    }
  };

  const onDelete = async () => {
    if (!apiBase || !selected) return;

    const msg = purge
      ? `⚠️ 物理删除：将删除 registry 记录 + 删除磁盘目录 games/...。\n确认删除 ${selected.key} ?`
      : `软删除：只删除 registry 记录（目录保留，可 Import 恢复）。\n确认删除 ${selected.key} ?`;

    if (!confirm(msg)) return;

    setBusyDelete(true);
    try {
      setErr("");
      await apiDelete(
        apiBase,
        `/games/${encodeURIComponent(selected.key)}?purge=${
          purge ? "true" : "false"
        }`
      );
      await refresh();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyDelete(false);
    }
  };

  const scanCandidates = async () => {
    if (!apiBase) return;
    setBusyScan(true);
    try {
      setErr("");
      const j = await apiGet(apiBase, "/games/import/candidates");
      setCands(j.candidates || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyScan(false);
    }
  };

  const doImport = async (c: ImportCandidate) => {
    if (!apiBase) return;
    setBusyImport(c.folder);
    try {
      setErr("");
      const key = (c?.suggest?.key || c.folder || "").trim() || c.folder;
      await apiPost(apiBase, "/games/import", {
        folder: c.folder,
        key,
        title: (c?.suggest?.title || "").trim(),
        window_title: (c?.suggest?.window_title || "").trim(),
        set_active: importSetActive,
      });
      await refresh();
      setSelectedKey(key);
      // 重新扫一遍，让它从候选里消失
      await scanCandidates();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyImport("");
    }
  };

  const missingHints = useMemo(() => {
    if (!selected) return [];
    const hints: { level: "warn" | "danger"; text: string }[] = [];
    const wt = (selected.window_title || "").trim();
    if (!wt)
      hints.push({
        level: "danger",
        text: "window_title 为空：激活窗口/截图/ROI 会失败",
      });
    if (!selected.root?.trim())
      hints.push({ level: "danger", text: "root 为空：该 game 目录无法解析" });
    return hints;
  }, [selected]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {ok ? (
              <Badge variant="outline">API Ready</Badge>
            ) : (
              <Badge variant="secondary">Not ready</Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={refresh}
              disabled={!ok || busyRefresh}
            >
              {busyRefresh ? "Refreshing..." : "Refresh"}
            </Button>

            <Button
              onClick={onSetActive}
              disabled={
                !ok ||
                !selected ||
                busyActive ||
                (selected && selected.key === activeKey)
              }
              title="Set selected game as active"
            >
              {busyActive ? "Setting..." : "Set Active"}
            </Button>

            <Button
              variant="outline"
              onClick={onOpenFolder}
              disabled={!ok || !selected || busyOpen}
              title="Open game folder"
            >
              {busyOpen ? "Opening..." : "Open Folder"}
            </Button>
          </div>
        </div>

        {err && <div className="mt-3 text-sm text-destructive">{err}</div>}
        <Separator className="my-4" />

        <div className="grid grid-cols-12 gap-4">
          {/* Left: list */}
          <div className="col-span-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Games</div>
              {activeKey ? (
                <Badge variant="outline" title="Current active game key">
                  active: {activeKey}
                </Badge>
              ) : (
                <Badge variant="secondary">no active</Badge>
              )}
            </div>

            <ScrollArea className="h-[520px] rounded-md border">
              <div className="p-2 space-y-2">
                {games.map((g) => {
                  const isSel = g.key === selectedKey;
                  const isAct = g.key === activeKey || g.is_active;
                  const title = (g.title || "").trim() || g.key;

                  return (
                    <button
                      key={g.key}
                      className={[
                        "w-full text-left rounded-md border px-3 py-2",
                        isSel ? "bg-accent" : "bg-background",
                      ].join(" ")}
                      onClick={() => setSelectedKey(g.key)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">{title}</div>
                        <div className="shrink-0">
                          {isAct ? (
                            <Badge>ACTIVE</Badge>
                          ) : (
                            <Badge variant="secondary">idle</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        key: {g.key} • root: {g.root}
                      </div>
                      {!(g.window_title || "").trim() ? (
                        <div className="text-xs text-destructive mt-1 truncate">
                          missing: window_title
                        </div>
                      ) : null}
                    </button>
                  );
                })}

                {games.length === 0 && (
                  <div className="text-sm text-muted-foreground p-2">
                    No games in registry.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: details + actions */}
          <div className="col-span-8">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Details / Manage</div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={onGoConfig}
                  disabled={!onGoConfig}
                  title="Go to Config tab"
                >
                  Go Config
                </Button>
              </div>
            </div>

            {/* Selected info */}
            <div className="rounded-md border p-3">
              {!selected ? (
                <div className="text-sm text-muted-foreground">
                  Select a game on the left.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold">
                      {(selected.title || "").trim() || selected.key}
                    </div>
                    {selected.key === activeKey || selected.is_active ? (
                      <Badge>ACTIVE</Badge>
                    ) : null}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">key:</span>{" "}
                      {selected.key}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">root:</span>{" "}
                      {selected.root}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">
                        window_title:
                      </span>{" "}
                      {(selected.window_title || "").trim() ? (
                        <span>{selected.window_title}</span>
                      ) : (
                        <span className="text-destructive">(empty)</span>
                      )}
                    </div>
                  </div>

                  {missingHints.length > 0 ? (
                    <div className="rounded-md border p-3">
                      <div className="text-sm font-medium mb-2">Checks</div>
                      <div className="space-y-2">
                        {missingHints.map((h, i) => (
                          <div
                            key={i}
                            className={
                              h.level === "danger"
                                ? "text-sm text-destructive"
                                : "text-sm text-yellow-600"
                            }
                          >
                            • {h.text}
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        建议：先去 ConfigTab 把 window_title
                        填好，再做截图/任务录制。
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Looks good. You can switch to Tasks/Config to continue.
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator className="my-4" />

            {/* Upsert form */}
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium mb-3">
                Create / Update Registry
              </div>

              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-6">
                  <div className="text-xs text-muted-foreground mb-1">
                    key (registry id)
                  </div>
                  <Input
                    value={fKey}
                    onChange={(e) => setFKey(e.target.value)}
                    placeholder="e.g. onmyoji"
                  />
                </div>

                <div className="col-span-6">
                  <div className="text-xs text-muted-foreground mb-1">
                    root (relative, optional)
                  </div>
                  <Input
                    value={fRoot}
                    onChange={(e) => setFRoot(e.target.value)}
                    placeholder="e.g. games/onmyoji"
                  />
                </div>

                <div className="col-span-6">
                  <div className="text-xs text-muted-foreground mb-1">
                    title
                  </div>
                  <Input
                    value={fTitle}
                    onChange={(e) => setFTitle(e.target.value)}
                    placeholder="display name"
                  />
                </div>

                <div className="col-span-6">
                  <div className="text-xs text-muted-foreground mb-1">
                    window_title
                  </div>
                  <Input
                    value={fWindowTitle}
                    onChange={(e) => setFWindowTitle(e.target.value)}
                    placeholder="用于激活窗口/截图 (强烈建议填)"
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={fCreateDirs}
                    onCheckedChange={(v) => setFCreateDirs(Boolean(v))}
                  />
                  create dirs (sequences/templates)
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={fSetActive}
                    onCheckedChange={(v) => setFSetActive(Boolean(v))}
                  />
                  set active
                </label>

                <div className="flex-1" />

                <Button onClick={onUpsert} disabled={!ok || busyUpsert}>
                  {busyUpsert ? "Saving..." : "Save / Upsert"}
                </Button>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                说明：root 为空时，后端会默认使用 <code>games/&lt;key&gt;</code>
                。
              </div>
            </div>

            <Separator className="my-4" />

            {/* Delete */}
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium mb-2">Delete</div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={purge}
                    onCheckedChange={(v) => setPurge(Boolean(v))}
                  />
                  purge (delete folder on disk)
                </label>

                <div className="flex-1" />

                <Button
                  variant="destructive"
                  onClick={onDelete}
                  disabled={!ok || !selected || busyDelete}
                  title="Delete registry record. If purge=true also delete folder."
                >
                  {busyDelete ? "Deleting..." : "Delete Selected"}
                </Button>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                purge=false：只删 registry 记录，目录保留（可通过 Import
                恢复）； purge=true：会把 games 下目录一起删掉（危险，谨慎）。
              </div>
            </div>

            <Separator className="my-4" />

            {/* Import / Restore */}
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">
                  Import / Restore (from folders)
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={importSetActive}
                      onCheckedChange={(v) => setImportSetActive(Boolean(v))}
                    />
                    set active after import
                  </label>

                  <Button
                    variant="secondary"
                    onClick={scanCandidates}
                    disabled={!ok || busyScan}
                  >
                    {busyScan ? "Scanning..." : "Scan"}
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[220px] rounded-md border">
                <div className="p-2 space-y-2">
                  {cands.map((c) => (
                    <div key={c.folder} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium truncate">
                          folder: {c.folder}
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            • root: {c.root}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => doImport(c)}
                          disabled={!ok || busyImport === c.folder}
                          title="Import this folder and recreate registry record"
                        >
                          {busyImport === c.folder ? "Importing..." : "Import"}
                        </Button>
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        flags:{" "}
                        {c.has_config ? (
                          <Badge variant="outline">config</Badge>
                        ) : (
                          <Badge variant="secondary">no-config</Badge>
                        )}{" "}
                        {c.has_sequences ? (
                          <Badge variant="outline">sequences</Badge>
                        ) : (
                          <Badge variant="secondary">no-seq</Badge>
                        )}{" "}
                        {c.has_templates ? (
                          <Badge variant="outline">templates</Badge>
                        ) : (
                          <Badge variant="secondary">no-tpl</Badge>
                        )}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        suggest: key={c.suggest?.key || c.folder}, title=
                        {c.suggest?.title || c.folder}, window_title=
                        {c.suggest?.window_title || "(empty)"}
                      </div>
                    </div>
                  ))}

                  {cands.length === 0 && (
                    <div className="text-sm text-muted-foreground p-2">
                      No import candidates. （提示：只有 games/ 下存在目录，但
                      registry 里没有记录的，才会出现在这里）
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="mt-2 text-xs text-muted-foreground">
                用途：你“软删除”后，目录还在。以后只要 Scan + Import 就能恢复
                registry 记录。
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
