import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

  // ✅ batch
  selectedCount: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onMarkDone: () => void;
  onMarkUndone: () => void;

  // ✅ run
  onRunSelected: () => void;
  onRunAll: () => void;
};

export default function TasksActionsBar({
  ok,
  busyRefresh,
  busyCreate,
  busyDelete,
  selectedId,
  err,
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
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {ok ? (
            <Badge variant="outline">API Ready</Badge>
          ) : (
            <Badge variant="secondary">Not ready</Badge>
          )}
          <Badge variant="secondary" title="Selected for batch actions">
            selected: {selectedCount}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button
            variant="secondary"
            onClick={onRefresh}
            disabled={!ok || busyRefresh}
          >
            {busyRefresh ? "Refreshing..." : "Refresh"}
          </Button>

          <Button onClick={onCreate} disabled={!ok || busyCreate}>
            {busyCreate ? "Creating..." : "+ New"}
          </Button>

          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={!ok || selectedId == null || busyDelete}
          >
            {busyDelete ? "Deleting..." : "Delete"}
          </Button>

          <Button variant="outline" onClick={onSelectAll} disabled={!ok}>
            Select All
          </Button>
          <Button variant="outline" onClick={onSelectNone} disabled={!ok}>
            Select None
          </Button>

          <Button
            variant="outline"
            onClick={onMarkDone}
            disabled={!ok || selectedCount === 0}
          >
            Mark Done
          </Button>
          <Button
            variant="outline"
            onClick={onMarkUndone}
            disabled={!ok || selectedCount === 0}
          >
            Mark Undone
          </Button>

          <Button onClick={onRunSelected} disabled={!ok || selectedCount === 0}>
            Run Selected
          </Button>
          <Button variant="secondary" onClick={onRunAll} disabled={!ok}>
            Run All
          </Button>
        </div>
      </div>

      {err ? <div className="mt-3 text-sm text-destructive">{err}</div> : null}
    </div>
  );
}
