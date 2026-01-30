import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  Copy,
  FolderInput,
  RefreshCw,
  CheckSquare,
  Square,
  Play,
  Layers,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

type Props = {
  ok: boolean;
  err: string | null;

  busyRefresh: boolean;
  busyCreate: boolean;
  busyDelete: boolean;
  busyRunOnly?: boolean;
  busyReset?: boolean;

  selectedCount: number;

  // ✅ 合一按钮需要知道当前是否“全选”
  allSelected: boolean;
  onToggleSelectAll: () => void;

  onRefresh: () => void;
  onCreate: () => void;

  // ✅ 批量状态
  onMarkDone: () => void;
  onResetStatusBatch: () => void;

  // ✅ 批量操作
  onDeleteSelected: () => Promise<void>;
  onDuplicateSelected: (suffix: string) => Promise<void>;
  onMoveSelectedToFolder: (folderName: string) => Promise<void>;

  // ✅ 运行
  onRunSelected: () => Promise<void>;
  onRunAll: () => Promise<void>;

  groupOptions: string[];
};

export default function TasksActionsBar({
  ok,
  err,
  busyRefresh,
  busyCreate,
  busyDelete,
  busyRunOnly,
  busyReset,
  selectedCount,
  allSelected,
  onToggleSelectAll,
  onRefresh,
  onCreate,
  onMarkDone,
  onResetStatusBatch,
  onDeleteSelected,
  onDuplicateSelected,
  onMoveSelectedToFolder,
  onRunSelected,
  onRunAll,
  groupOptions,
}: Props) {
  const disabled = !ok;
  const canBatch = selectedCount > 0;

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveName, setMoveName] = useState("");

  const defaultMoveName = useMemo(() => {
    if (groupOptions.length > 0) return groupOptions[0];
    return "";
  }, [groupOptions]);

  const [dupSuffix, setDupSuffix] = useState("_copy");

  return (
    <div className="flex items-center justify-between gap-2 p-2 border rounded-md bg-background">
      {/* left */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={disabled || busyRefresh}
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onCreate}
          disabled={disabled || busyCreate}
          title="New task"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Task
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* ✅ Select all/none 合一 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSelectAll}
          disabled={disabled}
          title={allSelected ? "Select none" : "Select all"}
        >
          {allSelected ? (
            <>
              <Square className="w-4 h-4 mr-1" />
              None
            </>
          ) : (
            <>
              <CheckSquare className="w-4 h-4 mr-1" />
              All
            </>
          )}
        </Button>

        {/* ✅ 批量状态（删掉 MarkUndone，只保留 ResetStatus 作为“清状态/撤销完成”） */}
        <Button
          variant="outline"
          size="sm"
          onClick={onMarkDone}
          disabled={disabled || !canBatch}
          title="Mark Done"
        >
          Mark Done
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onResetStatusBatch}
          disabled={disabled || !canBatch || !!busyReset}
          title="Reset Status"
        >
          Reset Status
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* ✅ Delete Selected */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || busyDelete || !canBatch}
              className="text-destructive hover:text-destructive"
              title="Delete selected tasks"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
              {canBatch && (
                <Badge variant="secondary" className="ml-2 h-5">
                  {selectedCount}
                </Badge>
              )}
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete selected tasks?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete <b>{selectedCount}</b> task(s).
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onDeleteSelected()}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ✅ Duplicate (with suffix) */}
        <AlertDialog
          onOpenChange={(open) => {
            // 打开时给个默认值，避免上次输入残留（你也可以删掉这段）
            if (open) setDupSuffix((s) => (s.trim() ? s : "_copy"));
          }}
        >
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || !canBatch}
              title="Duplicate selected tasks"
            >
              <Copy className="w-4 h-4 mr-1" />
              Duplicate
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Duplicate selected tasks</AlertDialogTitle>
              <AlertDialogDescription>
                This will create <b>{selectedCount}</b> new task(s). You can
                customize the suffix.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1">Suffix</div>
              <Input
                placeholder="_copy"
                value={dupSuffix}
                onChange={(e) => setDupSuffix(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const s = dupSuffix.trim() || "_copy";
                    onDuplicateSelected(s);
                  }
                }}
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                Example: name + suffix, basename + suffix
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const s = dupSuffix.trim() || "_copy";
                  onDuplicateSelected(s);
                }}
              >
                Create
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ✅ Move */}
        <AlertDialog open={moveOpen} onOpenChange={setMoveOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || !canBatch}
              title="Move selected tasks to folder"
              onClick={() => {
                setMoveName(defaultMoveName);
                setMoveOpen(true);
              }}
            >
              <FolderInput className="w-4 h-4 mr-1" />
              Move
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Move selected tasks</AlertDialogTitle>
              <AlertDialogDescription>
                Type a folder name (empty = Ungrouped).
              </AlertDialogDescription>
            </AlertDialogHeader>

            <Input
              placeholder="Folder name"
              value={moveName}
              onChange={(e) => setMoveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onMoveSelectedToFolder(moveName.trim());
                }
              }}
            />

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onMoveSelectedToFolder(moveName.trim())}
              >
                Move
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* right */}
      <div className="flex items-center gap-2">
        {/* ✅ Run Selected / Run All 这里必须回来 */}
        <Button
          size="sm"
          variant="default"
          disabled={disabled || !canBatch || !!busyRunOnly}
          onClick={() => onRunSelected()}
          title="Run selected"
        >
          <Play className="w-4 h-4 mr-1" />
          Run Selected
        </Button>

        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !!busyRunOnly}
          onClick={() => onRunAll()}
          title="Run all"
        >
          <Layers className="w-4 h-4 mr-1" />
          Run All
        </Button>

        <div className="ml-2 text-xs text-muted-foreground whitespace-nowrap">
          {!ok && <span>API not connected</span>}
          {err && <span className="text-destructive">{err}</span>}
        </div>
      </div>
    </div>
  );
}
