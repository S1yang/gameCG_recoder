import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Crosshair, AlertCircle } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  windowTitle: string;
  onPick: (x: number, y: number) => void;
};

export function PointPicker({
  isOpen,
  onClose,
  apiBase,
  windowTitle,
  onPick,
}: Props) {
  const [imgUrl, setImgUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (isOpen) {
      setBusy(true);
      setErr("");
      setImgUrl("");

      // 这里的 windowTitle 可能是空字符串，这在我们的设计中是允许的（后端会自动推断）
      const targetUrl = `${apiBase}/capture/preview_raw?window_title=${encodeURIComponent(
        windowTitle || ""
      )}`;
      console.log("Fetching capture from:", targetUrl);

      fetch(targetUrl)
        .then(async (r) => {
          if (!r.ok) {
            const text = await r.text();
            // 尝试解析 JSON 错误信息
            try {
              const j = JSON.parse(text);
              throw new Error(j.detail || text);
            } catch {
              throw new Error(text || `HTTP ${r.status}`);
            }
          }
          return r.json();
        })
        .then((j) => {
          if (j.url) {
            setImgUrl(`${apiBase}${j.url}`);
          } else {
            throw new Error("API returned OK but no URL?");
          }
        })
        .catch((e) => {
          console.error("Pick error:", e);
          setErr(e.message);
        })
        .finally(() => setBusy(false));
    }
  }, [isOpen, windowTitle, apiBase]);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // 限制在 0.0 ~ 1.0
    const safeX = Math.max(0, Math.min(1, x));
    const safeY = Math.max(0, Math.min(1, y));

    onPick(safeX, safeY);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      {/* aria-describedby 是为了消除控制台那个 Warning */}
      <DialogContent
        aria-describedby={undefined}
        className="max-w-[95vw] max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden outline-none"
      >
        <DialogHeader className="p-3 border-b bg-background z-10 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Crosshair className="w-4 h-4" />
            Click on image to Pick Coordinates
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 bg-black/10 flex items-center justify-center p-4 overflow-auto relative min-h-[300px]">
          {busy && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">
                Capturing game screen...
              </span>
            </div>
          )}

          {err && (
            <div className="flex flex-col items-center gap-2 max-w-md text-center p-4 bg-destructive/10 border border-destructive/20 rounded text-destructive">
              <AlertCircle className="w-6 h-6" />
              <div className="font-semibold text-sm">Capture Failed</div>
              <div className="text-xs font-mono break-all">{err}</div>
              <div className="text-xs mt-2 opacity-80">
                Possible fixes:
                <br />
                1. Check if game is running and "Active" in Games tab.
                <br />
                2. Check if Config has correct "game_window_title".
              </div>
            </div>
          )}

          {!busy && !err && imgUrl && (
            <div className="relative shadow-xl border-2 border-primary/20 rounded overflow-hidden cursor-crosshair inline-block">
              <img
                src={imgUrl}
                alt="Game Preview"
                // object-contain 确保完整显示，max-h 限制高度不超屏
                className="block max-w-full max-h-[80vh] object-contain select-none"
                draggable={false}
                onClick={handleImageClick}
              />
            </div>
          )}
        </div>

        <div className="p-2 border-t bg-muted/20 text-center shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
