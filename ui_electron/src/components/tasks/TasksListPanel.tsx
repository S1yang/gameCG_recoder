import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TaskItem } from "@/hooks/useTasks";
import { GripVertical } from "lucide-react";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 状态颜色映射
function getStatusColor(s?: string) {
  const v = (s || "").trim().toLowerCase();
  switch (v) {
    case "done":
      return "bg-green-500";
    case "failed":
      return "bg-red-500";
    case "running":
      return "bg-blue-500 animate-pulse";
    case "aborted":
      return "bg-orange-400";
    default:
      return "bg-slate-300"; // unknown/idle
  }
}

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
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.8 : 1,
  } as React.CSSProperties;

  const statusColor = getStatusColor(t.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-center mb-1 rounded-md border text-sm transition-colors overflow-hidden ${
        isActive
          ? "bg-accent border-primary/20 shadow-sm"
          : "bg-card hover:bg-accent/50"
      }`}
    >
      {/* 1. 状态指示条 (最左侧) */}
      <div className={`w-1.5 self-stretch ${statusColor}`} />

      {/* 2. 复选框 (移到左边) */}
      <div
        className="pl-3 pr-2 flex items-center justify-center self-stretch cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => {}} // 这里的点击由父级 div 接管，防止太难点
          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
        />
      </div>

      {/* 3. 内容区域 (中间，点击选中) */}
      <div
        className="flex-1 py-2 pr-2 cursor-pointer select-none"
        onClick={onClickRow}
      >
        <div className="flex items-center justify-between">
          <span className={`font-medium ${isActive ? "text-primary" : ""}`}>
            {t.name || `Task #${t.id}`}
          </span>
          {t.status === "failed" && (
            <Badge variant="destructive" className="text-[10px] h-4 px-1">
              failed
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
          <span>{String(t.id).padStart(3, "0")}</span>
          <span className="truncate max-w-[120px]">{t.basename}</span>
        </div>
      </div>

      {/* 4. 拖拽手柄 (移到最右侧，并加大尺寸) */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground/20 hover:text-foreground/80 hover:bg-accent active:cursor-grabbing self-stretch flex items-center justify-center px-3 border-l border-transparent hover:border-border/50 transition-all"
        title="Drag to reorder"
      >
        <GripVertical className="w-5 h-5" />
      </div>
    </div>
  );
}

// ... Props 定义保持不变 ...
type Props = {
  ok: boolean;
  items: TaskItem[];
  selectedId: number | null;
  selectedIndex: number;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectOnly: (id: number) => void;
  onReorder: (order: number[]) => void;
  busyMove: boolean;
  busyReset: boolean;
  busyRunOnly: boolean;
  onResetStatus: () => void;
  onRunOnly: () => void;
  onMoveUpDown?: (delta: -1 | 1) => void;
};

export default function TasksListPanel({
  items,
  selectedId,
  selectedIds,
  onToggleSelect,
  onSelectOnly,
  onReorder,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const ids = items.map((t) => String(t.id));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const newItems = arrayMove(items, oldIndex, newIndex);
    onReorder(newItems.map((x) => x.id));
  };

  return (
    /** * 修改点 1: 确保父容器 h-full 且 overflow-hidden。
     * 这样可以防止整个面板把页面撑长，而是把压力给到内部的 ScrollArea。
     */
    <div className="h-full flex flex-col bg-muted/10 overflow-hidden border-r">
      {/* 头部固定，不参与滚动 */}
      <div className="flex-none p-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
        Queue ({items.length})
      </div>

      <ScrollArea className="flex-1 min-h-0 w-full">
        <div className="p-2 space-y-1">
          {" "}
          {/* 增加 space-y-1 优化间距 */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {items.map((t) => (
                <SortableRow
                  key={t.id}
                  t={t}
                  isActive={t.id === selectedId}
                  isChecked={selectedIds.has(t.id)}
                  onClickRow={() => onSelectOnly(t.id)}
                  onToggle={() => onToggleSelect(t.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {items.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No tasks created.
            </div>
          )}
          {/* 增加一点底部留白，防止滚动到底部时最后一个任务贴边 */}
          <div className="h-4" />
        </div>
      </ScrollArea>
    </div>
  );
}
