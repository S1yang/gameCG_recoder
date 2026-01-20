import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Image as ImageIcon,
  RefreshCw,
  Upload,
  Crop,
  CheckCircle2,
  Circle,
} from "lucide-react";

// 引入 CaptureModal 组件
import { CaptureModal } from "@/components/tasks/CaptureModal";

type Props = { apiBase: string; ok: boolean };

// --- API Helpers ---

async function apiGet(base: string, path: string) {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiDelete(base: string, name: string) {
  const r = await fetch(`${base}/templates/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiUpload(base: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const r = await fetch(`${base}/templates/upload`, {
    method: "POST",
    body: formData,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function TemplatesTab({ apiBase, ok }: Props) {
  const [err, setErr] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Capture Modal State
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureName, setCaptureName] = useState("");

  const refresh = async () => {
    if (!apiBase) return;
    setBusy(true);
    try {
      setErr("");
      const j = await apiGet(apiBase, "/templates");
      setItems(j.templates || []);

      // Sync selection
      setSelected((prev) => {
        const next = new Set<string>();
        const currentItems = new Set(j.templates || []);
        prev.forEach((p) => {
          if (currentItems.has(p)) next.add(p);
        });
        return next;
      });
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (apiBase && ok) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, ok]);

  // --- Handlers ---

  const handleOpenCaptureModal = () => {
    const name = `tpl_${Math.floor(Date.now() / 1000)}.png`;
    setCaptureName(name);
    setCaptureOpen(true);
  };

  const handleCaptureSaved = async (savedName: string) => {
    await refresh();
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setBusy(true);
    try {
      const files = Array.from(e.target.files);
      for (const f of files) {
        await apiUpload(apiBase, f);
      }
      await refresh();
    } catch (e: any) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleSelect = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  const handleBatchDelete = async () => {
    const targets = Array.from(selected);
    if (targets.length === 0) return;
    if (!confirm(`Permanently delete ${targets.length} images?`)) return;

    setBusy(true);
    try {
      for (const name of targets) {
        await apiDelete(apiBase, name);
      }
      setSelected(new Set());
      await refresh();
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleSingleDelete = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete template image "${name}"?`)) return;
    try {
      await apiDelete(apiBase, name);
      await refresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <Card className="h-full border-none shadow-none bg-transparent">
      <CardContent className="p-0 flex flex-col h-full gap-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          {/* Left: Title & Selection Status */}
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-lg">Templates</h3>
            <Badge variant="secondary" className="text-xs font-normal">
              {items.length}
            </Badge>
            {selected.size > 0 && (
              <>
                <div className="h-4 w-px bg-border" />
                <Badge variant="default" className="text-xs">
                  {selected.size} selected
                </Badge>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBatchDelete}
                  disabled={busy}
                  className="h-7 text-xs px-2"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Delete Selected
                </Button>
              </>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="image/png,image/jpeg,image/bmp,image/webp"
              onChange={handleFileChange}
            />

            {/* Add New Group */}
            <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-md border border-border/50">
              <span className="text-[10px] uppercase font-bold text-muted-foreground px-2">
                Add New
              </span>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleUploadClick}
                disabled={busy}
                title="Upload images from disk"
                className="h-8"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload Image
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={handleOpenCaptureModal}
                disabled={busy}
                title="Capture a region from the game window"
                className="h-8"
              >
                <Crop className="w-3.5 h-3.5 mr-1.5" />
                Capture Region
              </Button>
            </div>

            <div className="w-px h-6 bg-border mx-1" />

            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              disabled={!ok || busy}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {err && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-md text-sm">
            {err}
          </div>
        )}

        {/* Grid */}
        <ScrollArea className="flex-1 border rounded-md bg-muted/10 p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
              <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
              <p>No templates found.</p>
              <p className="text-xs opacity-60 mt-1">
                Upload images or use "Capture Region" to add templates.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {items.map((name) => {
                const isSelected = selected.has(name);
                const thumbUrl = `${apiBase}/templates/thumb?name=${encodeURIComponent(
                  name
                )}&w=400&t=${Date.now()}`;

                return (
                  <div
                    key={name}
                    onClick={() => toggleSelect(name)}
                    className={`
                      group relative flex flex-col bg-card border rounded-lg overflow-hidden shadow-sm transition-all cursor-pointer select-none
                      ${
                        isSelected
                          ? "ring-2 ring-primary border-primary bg-primary/5"
                          : "hover:ring-2 hover:ring-primary/20 hover:border-primary/30"
                      }
                    `}
                  >
                    {/* Selection Indicator */}
                    <div className="absolute top-2 right-2 z-20 transition-all duration-200">
                      {isSelected ? (
                        // 选中状态：实心醒目对勾
                        <div className="bg-primary text-primary-foreground rounded-full shadow-md">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      ) : (
                        // 未选中状态：悬停显示空心圆提示
                        <div className="text-muted-foreground/50 opacity-0 group-hover:opacity-100 bg-background/80 rounded-full backdrop-blur-sm">
                          <Circle className="w-5 h-5" />
                        </div>
                      )}
                    </div>

                    {/* Image Area */}
                    <div className="aspect-video w-full relative flex items-center justify-center overflow-hidden bg-muted/30">
                      {/* 选中时的遮罩，增加辨识度 */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/10 z-10 pointer-events-none" />
                      )}

                      <img
                        src={thumbUrl}
                        alt={name}
                        className={`w-full h-full object-contain p-1 transition-transform duration-300 ${
                          isSelected ? "scale-90" : "group-hover:scale-105"
                        }`}
                        loading="lazy"
                      />

                      {/* Hover Actions (Delete) */}
                      {/* 只有在非选中模式下悬停才显示单删，避免视觉杂乱，或保持常驻 */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px] z-10">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => handleSingleDelete(name, e)}
                          className="h-8 px-3 shadow-lg"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>

                    {/* Footer Info */}
                    <div
                      className={`
                      p-2 border-t text-xs font-medium truncate text-center transition-colors 
                      ${
                        isSelected
                          ? "bg-primary text-primary-foreground font-bold"
                          : "bg-background/50 text-muted-foreground group-hover:text-foreground"
                      }
                    `}
                    >
                      <div title={name}>{name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <CaptureModal
        isOpen={captureOpen}
        onClose={() => setCaptureOpen(false)}
        apiBase={apiBase}
        suggestedName={captureName}
        onSaved={handleCaptureSaved}
      />
    </Card>
  );
}
