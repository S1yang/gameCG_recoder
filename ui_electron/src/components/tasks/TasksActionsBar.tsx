import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Trash2,
  RefreshCw,
  CheckSquare,
  Square,
  Play,
  Layers,
} from "lucide-react";

type Props = {
  ok: boolean;
  busyRefresh: boolean;
  busyCreate: boolean;
  busyDelete: boolean;
  selectedId: number | null;
  err?: string;

  onRefresh: () => void;
  onCreate: () => void;
  onDelete: () => void;

  selectedCount: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onMarkDone: () => void;
  onMarkUndone: () => void;

  onRunSelected: () => void;
  onRunAll: () => void;
};

export default function TasksActionsBar({
  ok,
  busyRefresh,
  busyCreate,
  busyDelete,
  selectedId,
  onRefresh,
  onCreate,
  onDelete,

  selectedCount,
  onSelectAll,
  onSelectNone,
  onMarkDone,
  onMarkUndone,

  onRunSelected,
  onRunAll,
}: Props) {
  return (
    <div className="flex items-center justify-between p-1 bg-muted/40 rounded-lg border">
      {/* 左侧：基础管理 */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={!ok || busyRefresh}
          title="Refresh List"
        >
          <RefreshCw
            className={`w-4 h-4 ${busyRefresh ? "animate-spin" : ""}`}
          />
        </Button>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreate}
          disabled={!ok || busyCreate}
        >
          <Plus className="w-4 h-4 mr-1" /> New
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={!ok || selectedId == null || busyDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4 mr-1" /> Delete
        </Button>
      </div>

      {/* 中间：批量选择与状态 */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 bg-background rounded border px-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onSelectAll}
            disabled={!ok}
            title="Select All"
          >
            <CheckSquare className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onSelectNone}
            disabled={!ok}
            title="Select None"
          >
            <Square className="w-4 h-4" />
          </Button>
        </div>

        {selectedCount > 0 && (
          <>
            <span className="text-xs text-muted-foreground mx-2">
              {selectedCount} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkDone}
              disabled={!ok}
              className="h-7 text-xs"
            >
              Mark Done
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkUndone}
              disabled={!ok}
              className="h-7 text-xs"
            >
              Reset Status
            </Button>
          </>
        )}
      </div>

      {/* 右侧：运行控制 */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onRunSelected}
          disabled={!ok || selectedCount === 0}
          className={selectedCount > 0 ? "animate-pulse" : ""}
        >
          <Play className="w-3 h-3 mr-1" /> Run Selected
        </Button>
        <Button size="sm" variant="secondary" onClick={onRunAll} disabled={!ok}>
          <Layers className="w-3 h-3 mr-1" /> Run All
        </Button>
      </div>
    </div>
  );
}
