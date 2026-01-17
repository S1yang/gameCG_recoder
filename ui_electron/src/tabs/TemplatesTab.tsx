import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Trash2, Image as ImageIcon, RefreshCw } from "lucide-react";

type Props = { apiBase: string; ok: boolean };

async function apiGet(base: string, path: string) {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiDelete(base: string, path: string) {
  const r = await fetch(`${base}${path}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function TemplatesTab({ apiBase, ok }: Props) {
  const [err, setErr] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = async () => {
    if (!apiBase) return;
    setBusy(true);
    try {
      setErr("");
      const j = await apiGet(apiBase, "/templates");
      setItems(j.templates || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete template image "${name}"?`)) return;
    setDeleting(name);
    try {
      // 假设后端支持 /templates/<name> 删除接口
      // 如果你的后端 tasks.py/templates.py 里还没有这个 DELETE 路由，
      // 你可能需要去 api/templates.py 加一个 @router.delete("/{name}")
      await apiDelete(apiBase, `/templates/${encodeURIComponent(name)}`);
      await refresh();
    } catch (e: any) {
      alert(`Failed to delete: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (apiBase && ok) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, ok]);

  return (
    <Card className="h-full border-none shadow-none bg-transparent">
      <CardContent className="p-0 flex flex-col h-full gap-4">
        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">Template Library</h3>
            <Badge variant="secondary" className="text-xs font-normal">
              {items.length} images
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={!ok || busy}
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${busy ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {err && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
            Error: {err}
          </div>
        )}

        {/* Gallery Grid */}
        <ScrollArea className="flex-1 border rounded-md bg-muted/10 p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
              <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
              <p>No templates found.</p>
              <p className="text-xs opacity-60 mt-1">
                Use "Capture" in Task Editor to add images.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {items.map((name) => {
                const thumbUrl = `${apiBase}/templates/thumb?name=${encodeURIComponent(
                  name
                )}&w=400&t=${Date.now()}`; // 加时间戳防缓存

                return (
                  <div
                    key={name}
                    className="group relative flex flex-col bg-card border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all hover:ring-2 hover:ring-primary/20"
                  >
                    {/* Image Container */}
                    <div className="aspect-video bg-muted/30 w-full relative flex items-center justify-center overflow-hidden">
                      <img
                        src={thumbUrl}
                        alt={name}
                        className="w-full h-full object-contain p-1"
                        loading="lazy"
                      />

                      {/* Delete Overlay (Show on Hover) */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(name)}
                          disabled={deleting === name}
                          className="h-8 px-3"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    {/* Footer Info */}
                    <div className="p-2 border-t bg-background/50">
                      <div
                        className="text-xs font-medium truncate text-center text-muted-foreground group-hover:text-foreground transition-colors"
                        title={name}
                      >
                        {name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
