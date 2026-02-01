// src/components/tasks/CaptureModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Crop, X } from "lucide-react";
import { createPortal } from "react-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

// 简单的 API 辅助函数（为了保持组件独立，这里保留一份）
async function apiPost(base: string, path: string, body: any) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail || "request failed");
  return j;
}

interface CaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  suggestedName: string;
  onSaved: (finalName: string) => void;
}

function sanitizeFilename(input: string) {
  // Windows 不允许: \ / : * ? " < > |
  // 同时去掉控制字符 & 末尾空格/点
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "";
  const replaced = trimmed
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, ""); // 末尾点或空格在 Windows 也不行
  return replaced;
}

function ensurePngExt(name: string) {
  if (!name) return name;
  // 如果用户自己写了扩展名就尊重；否则补 .png
  if (/\.[a-zA-Z0-9]{1,6}$/.test(name)) return name;
  return `${name}.png`;
}

export function CaptureModal({
  isOpen,
  onClose,
  apiBase,
  suggestedName,
  onSaved,
}: CaptureModalProps) {
  const [step, setStep] = useState<"loading" | "cropping" | "saving">(
    "loading"
  );
  const [frameId, setFrameId] = useState("");
  const [imgSrc, setImgSrc] = useState("");
  const [error, setError] = useState("");

  // 命名对话框状态
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [pendingName, setPendingName] = useState("");

  // 裁剪区域状态 (Image Coordinates)
  const [roi, setRoi] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // 鼠标拖拽状态 (Display Coordinates)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [dragCurrent, setDragCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultName = useMemo(() => {
    // 外部传入 suggestedName 作为默认名
    return suggestedName || `tpl_${Math.floor(Date.now() / 1000)}.png`;
  }, [suggestedName]);

  // 1. 初始化：请求截图
  useEffect(() => {
    if (!isOpen) return;

    setStep("loading");
    setError("");
    setFrameId("");
    setImgSrc("");
    setRoi(null);
    setDragStart(null);
    setDragCurrent(null);

    // 初始化 pendingName 为默认名（打开就有值）
    setPendingName(defaultName);

    (async () => {
      try {
        // 请求后端截图 (Frame Mode)
        const res = await apiPost(apiBase, "/templates/frame", {
          bring_to_front: true,
          sleep_ms: 250,
          restore_app_title: document.title || "GalRec",
        });
        setFrameId(res.frame_id);
        setImgSrc(res.image_b64);
        setStep("cropping");
        window.focus();
      } catch (e: any) {
        setError(e.message || "Failed to capture frame");
        window.focus();
      }
    })();
  }, [isOpen, apiBase, defaultName]);

  // 2. 真正保存逻辑（带 finalName）
  const doSave = async (finalNameRaw: string) => {
    if (!roi || !frameId) return;

    // 允许用户清空：则回退默认名
    let name = sanitizeFilename(finalNameRaw);
    if (!name) name = sanitizeFilename(defaultName) || defaultName;
    name = ensurePngExt(name);

    setStep("saving");
    setError("");

    try {
      const res = await apiPost(apiBase, "/templates/crop_save", {
        frame_id: frameId,
        name,
        x: roi.x,
        y: roi.y,
        w: roi.w,
        h: roi.h,
      });
      onSaved(res.name);
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save crop");
      setStep("cropping");
    }
  };

  // 点击 Save：先弹出命名对话框
  const handleSaveClick = () => {
    if (!roi || !frameId) return;
    setPendingName(defaultName);
    setNameDialogOpen(true);

    // 下一帧聚焦输入框
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  // --- Mouse Handlers for Cropping ---
  const getImgCoords = (e: React.MouseEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (step !== "cropping") return;
    e.preventDefault(); // 防止拖拽图片本身
    const coords = getImgCoords(e);
    setDragStart(coords);
    setDragCurrent(coords);
    setRoi(null); // 重置选区
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart) return;
    const coords = getImgCoords(e);
    setDragCurrent(coords);
  };

  const handleMouseUp = () => {
    if (!dragStart || !dragCurrent || !imgRef.current) return;

    // 计算最终的 ROI (基于显示尺寸)
    const x1 = Math.min(dragStart.x, dragCurrent.x);
    const y1 = Math.min(dragStart.y, dragCurrent.y);
    const w_disp = Math.abs(dragCurrent.x - dragStart.x);
    const h_disp = Math.abs(dragCurrent.y - dragStart.y);

    if (w_disp < 5 || h_disp < 5) {
      setDragStart(null);
      setDragCurrent(null);
      return; // 太小了忽略
    }

    // 转换为真实图片尺寸 (Natural Dimensions)
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

    setRoi({
      x: Math.round(x1 * scaleX),
      y: Math.round(y1 * scaleY),
      w: Math.round(w_disp * scaleX),
      h: Math.round(h_disp * scaleY),
    });

    setDragStart(null);
    setDragCurrent(null);
  };

  if (!isOpen) return null;

  // 计算当前拖拽的遮罩样式
  let dragStyle: any = {};
  if (dragStart && dragCurrent) {
    const left = Math.min(dragStart.x, dragCurrent.x);
    const top = Math.min(dragStart.y, dragCurrent.y);
    const width = Math.abs(dragCurrent.x - dragStart.x);
    const height = Math.abs(dragCurrent.y - dragStart.y);
    dragStyle = { left, top, width, height };
  } else if (roi && imgRef.current) {
    // 回显已选区域
    const scaleX = imgRef.current.width / imgRef.current.naturalWidth;
    const scaleY = imgRef.current.height / imgRef.current.naturalHeight;
    dragStyle = {
      left: roi.x * scaleX,
      top: roi.y * scaleY,
      width: roi.w * scaleX,
      height: roi.h * scaleY,
    };
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative flex flex-col w-[90vw] h-[90vh] bg-background rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium flex items-center gap-2">
            <Crop className="w-4 h-4" />
            Capture & Crop
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={step === "saving"}
            >
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>

            <Button
              size="sm"
              onClick={handleSaveClick}
              disabled={!roi || step === "saving"}
              title={
                !roi ? "Drag to select a region first" : "Save cropped region"
              }
            >
              {step === "saving" && (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              )}
              Save
            </Button>
          </div>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-auto bg-neutral-900 flex items-center justify-center p-4 select-none"
          ref={containerRef}
        >
          {step === "loading" && (
            <div className="text-white flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p>Capturing game window...</p>
            </div>
          )}

          {error && (
            <div className="text-destructive bg-destructive/10 p-4 rounded border border-destructive">
              Error: {error}
            </div>
          )}

          {step === "cropping" && imgSrc && (
            <div className="relative shadow-2xl border border-white/20 inline-block">
              <img
                ref={imgRef}
                src={imgSrc}
                className="max-w-full max-h-[calc(90vh-100px)] object-contain cursor-crosshair block"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                draggable={false}
                alt="Game Frame"
              />

              {(dragStart || roi) && (
                <>
                  <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                  <div
                    className="absolute border-2 border-primary bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] pointer-events-none"
                    style={dragStyle}
                  >
                    <div className="absolute top-0 left-0 bg-primary text-primary-foreground text-[10px] px-1">
                      {roi ? `${roi.w}x${roi.h}` : "Drag to crop"}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 命名对话框：Save 时弹出 */}
        <AlertDialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
          <AlertDialogContent className="z-[10050]">
            <AlertDialogHeader>
              <AlertDialogTitle>Save capture as</AlertDialogTitle>
              <AlertDialogDescription>
                你可以自定义文件名；留空将使用默认名称。
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <Input
                ref={inputRef}
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                placeholder={defaultName}
                disabled={step === "saving"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setNameDialogOpen(false);
                    doSave(pendingName);
                  }
                }}
              />
              <div className="text-xs text-muted-foreground">
                默认：<span className="font-mono">{defaultName}</span>
                <span className="ml-2 opacity-70">
                  （自动补 .png，非法字符会替换为 _）
                </span>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={step === "saving"}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={step === "saving"}
                onClick={() => {
                  setNameDialogOpen(false);
                  doSave(pendingName);
                }}
              >
                Save
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>,
    document.body
  );
}
