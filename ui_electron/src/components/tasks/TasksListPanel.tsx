import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TaskItem } from "@/hooks/useTasks";
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Folder,
  Pencil,
} from "lucide-react";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { Plus, Trash2 } from "lucide-react";

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

function groupKeyOf(t: TaskItem) {
  const g = (t.group || "").trim();
  return g ? g : "__UNGROUPED__";
}

function displayGroupName(gk: string) {
  return gk === "__UNGROUPED__" ? "Ungrouped" : gk;
}

function makeTaskDragId(id: number) {
  return `task:${id}`;
}

function parseTaskDragId(dndId: string): number | null {
  if (!dndId.startsWith("task:")) return null;
  const n = Number(dndId.slice("task:".length));
  return Number.isFinite(n) ? n : null;
}

function makeFolderDropId(gk: string) {
  return `folder:${gk}`;
}

function parseFolderDropId(dndId: string): string | null {
  if (!dndId.startsWith("folder:")) return null;
  return dndId.slice("folder:".length);
}

function SortableTaskRow({
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
  const id = makeTaskDragId(t.id);
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
      {/* 状态条 */}
      <div className={`w-1.5 self-stretch ${statusColor}`} />

      {/* 复选框 */}
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
          onChange={() => {}}
          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
        />
      </div>

      {/* 内容 */}
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

      {/* 拖拽手柄 */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground/20 hover:text-foreground/80 hover:bg-accent active:cursor-grabbing self-stretch flex items-center justify-center px-3 border-l border-transparent hover:border-border/50 transition-all"
        title="Drag to reorder / move to folder"
      >
        <GripVertical className="w-5 h-5" />
      </div>
    </div>
  );
}

function FolderRow({
  groupKey,
  count,
  collapsed,
  onToggleCollapse,
  onStartRename,
  isEditing,
  editingName,
  setEditingName,
  onCommitRename,
  onCancelRename,
  onCreateTaskInGroup,

  // ✅ 新增：Folder 内 ids 与选中 ids
  idsInFolder,
  selectedIdsInFolder,

  // ✅ 删除两种路径：全选删整个 folder；部分选中删 selectedIdsInFolder
  onDeleteGroup,
  onDeleteSelectedInFolder,

  folderChecked,
  folderIndeterminate,
  onToggleFolderSelect,
}: {
  groupKey: string;
  count: number;
  collapsed: boolean;
  onToggleCollapse: () => void;

  onStartRename: () => void;
  isEditing: boolean;
  editingName: string;
  setEditingName: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onCreateTaskInGroup: (groupKey: string) => void;

  idsInFolder: number[];
  selectedIdsInFolder: number[];

  onDeleteGroup: (groupKey: string) => void;
  onDeleteSelectedInFolder: (groupKey: string, ids: number[]) => void;

  folderChecked: boolean;
  folderIndeterminate: boolean;
  onToggleFolderSelect: () => void;
}) {
  const dropId = makeFolderDropId(groupKey);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  const hasSelectionInFolder = selectedIdsInFolder.length > 0;
  const willDeleteFolder = folderChecked; // ✅ 全选 => 走 deleteGroup

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-between rounded-md border px-2 py-2 mb-2 text-sm select-none ${
        isOver ? "bg-accent border-primary/30" : "bg-muted/30 hover:bg-muted/40"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          className="p-1 rounded hover:bg-accent"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand folder" : "Collapse folder"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        <input
          type="checkbox"
          checked={folderChecked}
          ref={(el) => {
            if (el) el.indeterminate = folderIndeterminate;
          }}
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFolderSelect();
          }}
          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
        />

        <Folder className="w-4 h-4 text-muted-foreground" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {!isEditing ? (
              <>
                <span className="font-medium truncate">
                  {displayGroupName(groupKey)}
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {count}
                </Badge>
              </>
            ) : (
              <div className="flex items-center gap-2 w-full">
                <input
                  className="h-7 w-full rounded-md border bg-background px-2 text-xs"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCommitRename();
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelRename();
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="text-[10px] text-muted-foreground truncate">
              Drop tasks here
            </div>
          )}
        </div>
      </div>

      {!isEditing && (
        <div className="flex items-center gap-1">
          {/* ✅ 在此文件夹新建任务 */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={(e) => {
              e.stopPropagation();
              onCreateTaskInGroup(groupKey);
            }}
            title="New task in this folder"
          >
            <Plus className="w-4 h-4" />
          </Button>

          {/* ✅ 重命名：Ungrouped 不允许 */}
          {groupKey !== "__UNGROUPED__" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={(e) => {
                e.stopPropagation();
                onStartRename();
              }}
              title="Rename folder"
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}

          {/* ✅ 删除：按“当前 folder 内的选择状态”决定行为 */}
          {groupKey !== "__UNGROUPED__" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  onClick={(e) => e.stopPropagation()}
                  disabled={!hasSelectionInFolder}
                  title={
                    !hasSelectionInFolder
                      ? "No selected tasks in this folder"
                      : willDeleteFolder
                      ? "Delete folder (all tasks selected)"
                      : "Delete selected tasks in this folder"
                  }
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                <AlertDialogHeader>
                  {willDeleteFolder ? (
                    <>
                      <AlertDialogTitle>
                        Delete folder “{displayGroupName(groupKey)}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        All <b>{idsInFolder.length}</b> tasks in this folder are
                        selected. Deleting now will remove <b>all tasks</b> and
                        the folder will disappear. This action cannot be undone.
                      </AlertDialogDescription>
                    </>
                  ) : (
                    <>
                      <AlertDialogTitle>
                        Delete selected tasks in “{displayGroupName(groupKey)}”?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete{" "}
                        <b>{selectedIdsInFolder.length}</b> selected task(s) in
                        this folder. Other folders are not affected.
                      </AlertDialogDescription>
                    </>
                  )}
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      if (willDeleteFolder) onDeleteGroup(groupKey);
                      else
                        onDeleteSelectedInFolder(groupKey, selectedIdsInFolder);
                    }}
                  >
                    {willDeleteFolder ? "Delete Folder" : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}

// Props
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

  onAssignTaskToGroup: (taskId: number, groupKey: string) => void;
  onRenameGroup: (oldGroup: string, newGroup: string) => void;

  onCreateTaskInGroup: (groupKey: string) => void;
  onDeleteGroup: (groupKey: string) => void;

  // ✅ 新增：只删“某个 folder 内被选中的任务”
  onDeleteSelectedInFolder: (groupKey: string, ids: number[]) => void;

  onCreateFolder: (folderName: string) => void;

  onSelectGroup: (groupKey: string) => void;
  onUnselectGroup: (groupKey: string) => void;
};

export default function TasksListPanel({
  items,
  selectedId,
  selectedIds,
  onToggleSelect,
  onSelectOnly,
  onReorder,
  onAssignTaskToGroup,
  onRenameGroup,
  onCreateTaskInGroup,
  onDeleteGroup,
  onDeleteSelectedInFolder,
  onCreateFolder,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const grouped = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, TaskItem[]>();

    for (const t of items) {
      const gk = groupKeyOf(t);
      if (!map.has(gk)) {
        map.set(gk, []);
        order.push(gk);
      }
      map.get(gk)!.push(t);
    }

    const finalOrder = [
      ...order.filter((x) => x === "__UNGROUPED__"),
      ...order.filter((x) => x !== "__UNGROUPED__"),
    ];

    return { order: finalOrder, map };
  }, [items]);

  const flatTaskIds = useMemo(() => {
    const out: number[] = [];
    for (const gk of grouped.order) {
      const collapsed = !!collapsedMap[gk];
      if (collapsed) continue;
      const arr = grouped.map.get(gk) || [];
      for (const t of arr) out.push(t.id);
    }
    return out;
  }, [grouped, collapsedMap]);

  const collisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;

    const rectHits = rectIntersection(args);
    if (rectHits.length > 0) return rectHits;

    return closestCenter(args);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const taskId = parseTaskDragId(activeId);
    if (taskId == null) return;

    const folderKey = parseFolderDropId(overId);
    if (folderKey != null) {
      onAssignTaskToGroup(taskId, folderKey);
      return;
    }

    const overTaskId = parseTaskDragId(overId);
    if (overTaskId == null || overTaskId === taskId) return;

    const ids = flatTaskIds.slice();
    const oldIndex = ids.indexOf(taskId);
    const newIndex = ids.indexOf(overTaskId);
    if (oldIndex < 0 || newIndex < 0) return;

    const newFlat = arrayMove(ids, oldIndex, newIndex);
    onReorder(newFlat);
  };

  return (
    <div className="h-full flex flex-col bg-muted/10 overflow-hidden border-r">
      <div className="flex-none p-2 border-b">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Queue ({items.length})
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => {
              setCreatingFolder((v) => !v);
              setNewFolderName("");
            }}
            title="Create folder"
          >
            <Plus className="w-4 h-4 mr-1" />
            Folder
          </Button>
        </div>

        {creatingFolder && (
          <div className="mt-2 flex items-center gap-2">
            <input
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const name = newFolderName.trim();
                  if (name) {
                    onCreateFolder(name);
                    setCreatingFolder(false);
                    setNewFolderName("");
                  }
                }
                if (e.key === "Escape") {
                  setCreatingFolder(false);
                  setNewFolderName("");
                }
              }}
            />

            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3"
              onClick={() => {
                const name = newFolderName.trim();
                if (!name) return;
                onCreateFolder(name);
                setCreatingFolder(false);
                setNewFolderName("");
              }}
            >
              Save
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3"
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName("");
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0 w-full">
        <div className="p-2">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={flatTaskIds.map((id) => makeTaskDragId(id))}
              strategy={verticalListSortingStrategy}
            >
              {grouped.order.map((gk) => {
                const arr = grouped.map.get(gk) || [];
                const collapsed = !!collapsedMap[gk];

                const idsInFolder = arr.map((t) => t.id);
                const selectedIdsInFolder = idsInFolder.filter((id) =>
                  selectedIds.has(id)
                );

                const folderChecked =
                  idsInFolder.length > 0 &&
                  selectedIdsInFolder.length === idsInFolder.length;
                const folderIndeterminate =
                  selectedIdsInFolder.length > 0 &&
                  selectedIdsInFolder.length < idsInFolder.length;

                const onToggleFolderSelect = () => {
                  const shouldSelectAll = !folderChecked;
                  for (const id of idsInFolder) {
                    const isSel = selectedIds.has(id);
                    if (shouldSelectAll && !isSel) onToggleSelect(id);
                    if (!shouldSelectAll && isSel) onToggleSelect(id);
                  }
                };

                return (
                  <div key={gk} className="mb-2">
                    <FolderRow
                      groupKey={gk}
                      count={arr.length}
                      collapsed={collapsed}
                      onToggleCollapse={() =>
                        setCollapsedMap((m) => ({ ...m, [gk]: !m[gk] }))
                      }
                      isEditing={editingGroupKey === gk}
                      editingName={editingName}
                      setEditingName={setEditingName}
                      onStartRename={() => {
                        setEditingGroupKey(gk);
                        setEditingName(gk);
                      }}
                      onCommitRename={() => {
                        const oldName = gk;
                        const newName = editingName.trim();
                        setEditingGroupKey(null);
                        onRenameGroup(oldName, newName);
                      }}
                      onCancelRename={() => {
                        setEditingGroupKey(null);
                        setEditingName("");
                      }}
                      onCreateTaskInGroup={onCreateTaskInGroup}
                      idsInFolder={idsInFolder}
                      selectedIdsInFolder={selectedIdsInFolder}
                      onDeleteGroup={onDeleteGroup}
                      onDeleteSelectedInFolder={onDeleteSelectedInFolder}
                      folderChecked={folderChecked}
                      folderIndeterminate={folderIndeterminate}
                      onToggleFolderSelect={onToggleFolderSelect}
                    />

                    {!collapsed && (
                      <div className="pl-2">
                        {arr.map((t) => (
                          <SortableTaskRow
                            key={t.id}
                            t={t}
                            isActive={t.id === selectedId}
                            isChecked={selectedIds.has(t.id)}
                            onClickRow={() => onSelectOnly(t.id)}
                            onToggle={() => onToggleSelect(t.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {items.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No tasks created.
                </div>
              )}

              <div className="h-4" />
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>
    </div>
  );
}
