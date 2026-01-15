import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TaskItem } from "@/hooks/useTasks";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import type { DragEndEvent } from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function statusBadge(s?: string) {
  const v = (s || "").trim().toLowerCase();
  if (!v) return <Badge variant="secondary">unknown</Badge>;
  if (v === "done") return <Badge variant="outline">done</Badge>;
  if (v === "running") return <Badge>running</Badge>;
  if (v === "failed") return <Badge variant="destructive">failed</Badge>;
  if (v === "aborted") return <Badge variant="secondary">aborted</Badge>;
  return <Badge variant="secondary">{v}</Badge>;
}

type Props = {
  ok: boolean;
  items: TaskItem[];

  selectedId: number | null;
  selectedIndex: number;

  // ✅ 多选
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectOnly: (id: number) => void;

  // ✅ 拖拽排序回传（传回 ids 顺序）
  onReorder: (order: number[]) => void;

  busyMove: boolean;
  busyReset: boolean;
  busyRunOnly: boolean;

  onResetStatus: () => void;
  onRunOnly: () => void;

  // 兼容你原来的 ↑↓
  onMoveUpDown?: (delta: -1 | 1) => void;
};

function SortableRow({
  t,
  isActive,
  isChecked,
  onClickRow,
  onToggle,
}: {
  t: TaskItem;
  isActive: boolean;
  isChecked: boolean;
  onClickRow: () => void;
  onToggle: () => void;
}) {
  const id = String(t.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  } as React.CSSProperties;

  return (
    <div ref={setNodeRef} style={style}>
      <button
        className={[
          "w-full text-left rounded-md border px-3 py-2",
          isActive ? "bg-accent" : "bg-background",
        ].join(" ")}
        onClick={onClickRow}
        // ✅ 整行可拖拽（也可以只让小把手拖；先用整行最省事）
        {...attributes}
        {...listeners}
      >
        <div className="flex items-start gap-2">
          {/* ✅ checkbox：阻止冒泡避免影响行点击 */}
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            onClick={(e) => e.stopPropagation()}
            className="mt-[2px]"
            title="Select for batch actions"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium truncate">
                {t.name ?? `Task #${t.id}`}
              </div>
              <div className="shrink-0">{statusBadge(t.status)}</div>
            </div>

            <div className="text-xs text-muted-foreground mt-1">
              id: {String(t.id).padStart(3, "0")}
              {t.basename ? ` • ${t.basename}` : ""}
            </div>

            {t.error ? (
              <div className="text-xs text-destructive mt-1 truncate">
                {t.error}
              </div>
            ) : null}
          </div>
        </div>
      </button>
    </div>
  );
}

export default function TasksListPanel({
  ok,
  items,
  selectedId,
  selectedIndex,
  selectedIds,
  onToggleSelect,
  onSelectOnly,
  onReorder,
  busyMove,
  busyReset,
  busyRunOnly,
  onResetStatus,
  onRunOnly,
  onMoveUpDown,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const ids = items.map((t) => String(t.id));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    if (active.id === over.id) return;

    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const newItems = arrayMove(items, oldIndex, newIndex);
    onReorder(newItems.map((x) => x.id));
  };

  return (
    <div className="col-span-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Tasks</div>

        {/* 兼容你旧的 ↑↓，也保留 */}
        {onMoveUpDown ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMoveUpDown(-1)}
              disabled={
                !ok || selectedId == null || busyMove || selectedIndex <= 0
              }
              title="Move up (legacy)"
            >
              ↑
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMoveUpDown(1)}
              disabled={
                !ok ||
                selectedId == null ||
                busyMove ||
                selectedIndex < 0 ||
                selectedIndex >= items.length - 1
              }
              title="Move down (legacy)"
            >
              ↓
            </Button>
          </div>
        ) : null}
      </div>

      <ScrollArea className="h-[520px] rounded-md border">
        <div className="p-2 space-y-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {items.map((t) => {
                const active = t.id === selectedId;
                const checked = selectedIds.has(t.id);
                return (
                  <SortableRow
                    key={t.id}
                    t={t}
                    isActive={active}
                    isChecked={checked}
                    onClickRow={() => onSelectOnly(t.id)}
                    onToggle={() => onToggleSelect(t.id)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>

          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground p-2">No tasks.</div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="mt-3 flex items-center gap-2">
        <Button
          className="w-full"
          variant="outline"
          onClick={onResetStatus}
          disabled={!ok || selectedId == null || busyReset}
        >
          {busyReset ? "Resetting..." : "Reset Status"}
        </Button>

        <Button
          className="w-full"
          variant="outline"
          onClick={onRunOnly}
          disabled={!ok || selectedId == null || busyRunOnly}
          title="Write progress.run_only = [id]"
        >
          {busyRunOnly ? "Setting..." : "Run Only"}
        </Button>
      </div>
    </div>
  );
}
