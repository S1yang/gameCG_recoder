import { useEffect, useMemo, useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import TasksActionsBar from "@/components/tasks/TasksActionsBar";
import TasksListPanel from "@/components/tasks/TasksListPanel";
import TaskDetailsPanel from "@/components/tasks/TaskDetailsPanel";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";

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

type Props = { apiBase: string; ok: boolean };

export function TasksTab({ apiBase, ok }: Props) {
  const {
    err,
    tasks,
    queue,
    taskObj,
    setTaskObj,
    busyRefresh,
    busySave,
    busyCreate,
    busyDelete,
    busyMove,
    busyReset,
    busyRunOnly,
    refreshAll,
    loadOne,
    deleteTask,
    saveTask,
    saveQueue,
    resetStatus,
    runOnly,
    setStatusBatch,
    runOnlyBatch,
    clearRunOnly,
    startRunner,
  } = useTasks(apiBase);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [raw, setRaw] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Dialog: Create Task
  const [createOpen, setCreateOpen] = useState(false);

  // Dialog: Delete Selected
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);

  // --- 自动刷新 ---
  useEffect(() => {
    const onFocus = () => {
      if (apiBase && ok) refreshAll();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [apiBase, ok, refreshAll]);

  // --- 初始化加载 ---
  useEffect(() => {
    if (!apiBase || !ok) return;
    refreshAll().then(({ tasks: list }) => {
      const first = list[0]?.id ?? null;
      if (selectedId === null && first != null) {
        setSelectedId(first);
        setSelectedIds(new Set([first]));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, ok]);

  // --- 右侧详情加载 ---
  useEffect(() => {
    if (selectedId == null) return;
    loadOne(selectedId).then((t) => {
      if (t != null) setRaw(JSON.stringify(t, null, 2));
    });
  }, [selectedId, loadOne]);

  // --- 排序与展示 ---
  const tasksOrdered = useMemo(() => {
    const map = new Map(tasks.map((t) => [t.id, t]));
    const ordered: typeof tasks = [];
    for (const id of queue) {
      const t = map.get(id);
      if (t) ordered.push(t);
    }
    for (const t of tasks) {
      if (!queue.includes(t.id)) ordered.push(t);
    }
    return ordered;
  }, [tasks, queue]);

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      const g = (t.group || "").trim();
      if (g) set.add(g);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const selectedIndex = useMemo(
    () => tasksOrdered.findIndex((x) => x.id === selectedId),
    [tasksOrdered, selectedId]
  );

  const nextId = useMemo(() => {
    if (tasks.length === 0) return 1;
    const maxId = Math.max(...tasks.map((t) => t.id));
    return maxId + 1;
  }, [tasks]);

  const idsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const allIdsOrdered = useMemo(
    () => tasksOrdered.map((t) => t.id),
    [tasksOrdered]
  );
  const allSelected = useMemo(() => {
    if (allIdsOrdered.length === 0) return false;
    return allIdsOrdered.every((id) => selectedIds.has(id));
  }, [allIdsOrdered, selectedIds]);

  // --- 基础操作 ---
  const onRefresh = async () => {
    await refreshAll();
  };

  const onReorder = async (order: number[]) => {
    await saveQueue(order);
    await refreshAll();
  };

  const onCreate = async () => setCreateOpen(true);

  const handleCreateSubmit = async (data: {
    name: string;
    basename: string;
    template: string;
  }) => {
    const res = await fetch(`${apiBase}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        basename: data.basename,
        template_name: data.template || undefined,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const j = await res.json();

    await refreshAll();
    if (j.id) {
      setSelectedId(j.id);
      setSelectedIds(new Set([j.id]));
    }
  };

  const onSave = async () => {
    if (selectedId == null) return;
    const ok = await saveTask(selectedId, taskObj);
    if (ok) refreshAll();
  };

  // --- 选择逻辑 ---
  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectOnly = (id: number) => {
    setSelectedId(id);
    setSelectedIds(new Set([id]));
  };

  // ✅ 全选/全不选（合一按钮）
  const onToggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIdsOrdered));
  };

  // --- 状态相关 ---
  const onMarkDone = async () => {
    if (idsArray.length === 0) return;
    await setStatusBatch(idsArray, "done");
    await refreshAll();
  };

  // ✅ 复用 resetStatus（你说已验证可用）：批量 reset
  const onResetStatusBatch = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    for (const id of ids) {
      await resetStatus(id);
    }
    await refreshAll();
  };

  // --- 运行相关（别丢！） ---
  const onRunSelected = async () => {
    const orderedSel = tasksOrdered
      .filter((t) => selectedIds.has(t.id))
      .map((t) => t.id);
    if (orderedSel.length === 0) return;
    await runOnlyBatch(orderedSel);
    await startRunner();
  };

  const onRunAll = async () => {
    await clearRunOnly();
    await startRunner();
  };

  const onRunOnly = async () => {
    if (selectedId != null) await runOnly(selectedId);
  };

  const onResetStatusOne = async () => {
    if (selectedId == null) return;
    await resetStatus(selectedId);
    await refreshAll();
  };

  // --- 批量删除（顶端 Delete 绑定 selectedIds） ---
  const onDeleteSelectedConfirm = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // 逐个删
    for (const id of ids) {
      await deleteTask(id);
    }

    // 清理 selection（尽量选一个还存在的）
    setSelectedIds(new Set());
    setSelectedId(null);

    await refreshAll();
    setDeleteSelectedOpen(false);
  };

  // --- 批量删除文件夹内 ---
  const onDeleteSelectedInFolder = async (_groupKey: string, ids: number[]) => {
    for (const id of ids) await deleteTask(id);
    await refreshAll();
  };

  // --- 批量复制：从选择的任务中创建一批任务 ---
  const onDuplicateSelected = async (suffix: string) => {
    const suf = (suffix || "").trim() || "_copy";

    const srcIds = tasksOrdered
      .filter((t) => selectedIds.has(t.id))
      .map((t) => t.id);
    if (srcIds.length === 0) return;

    const createdIds: number[] = [];

    for (const sid of srcIds) {
      const src = await loadOne(sid);
      if (!src) continue;

      const res = await fetch(`${apiBase}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "", basename: "" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      const newId = Number(j?.id);
      if (!Number.isFinite(newId)) continue;

      const cloned = structuredClone(src);
      cloned.id = newId;

      const srcName = String((src as any).name || `Task_${sid}`);
      const srcBase = String(
        (src as any)?.record?.basename || (src as any)?.basename || srcName
      );

      cloned.name = `${srcName}${suf}`;
      (cloned as any).record = (cloned as any).record || {};
      (cloned as any).record.basename = `${srcBase}${suf}`;
      (cloned as any).basename = `${srcBase}${suf}`; // 兼容你两种结构

      cloned.group = (src as any).group || "";

      await saveTask(newId, cloned);
      createdIds.push(newId);
    }

    await refreshAll();

    if (createdIds.length > 0) {
      setSelectedId(createdIds[0]);
      setSelectedIds(new Set(createdIds));
    }
  };

  // --- 批量移动（由 ActionsBar 触发，传入 folderName） ---
  const onMoveSelectedToFolder = async (folderName: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const g = (folderName || "").trim(); // 空 => Ungrouped
    for (const id of ids) {
      const obj = await loadOne(id);
      if (!obj) continue;
      obj.group = g;
      await saveTask(id, obj);
    }
    await refreshAll();
  };

  // --- 文件夹动作 ---
  const createTaskInGroup = async (groupKey: string) => {
    if (!apiBase) return;
    const g = groupKey === "__UNGROUPED__" ? "" : groupKey;

    const res = await fetch(`${apiBase}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", basename: "" }),
    });
    if (!res.ok) throw new Error(await res.text());
    const j = await res.json();
    const id = Number(j?.id);
    if (!Number.isFinite(id)) return;

    const obj = await loadOne(id);
    if (obj) {
      obj.group = g;
      await saveTask(id, obj);
    }

    await refreshAll();
    setSelectedId(id);
    setSelectedIds(new Set([id]));
  };

  const onCreateFolder = async (folderName: string) => {
    const folder = (folderName || "").trim();
    if (!folder) return;
    await createTaskInGroup(folder);
  };

  const assignTaskToGroup = async (taskId: number, groupKey: string) => {
    const obj = await loadOne(taskId);
    if (!obj) return;
    obj.group = groupKey === "__UNGROUPED__" ? "" : groupKey;
    await saveTask(taskId, obj);
    await refreshAll();
  };

  const renameGroup = async (oldGroup: string, newGroup: string) => {
    const oldG = (oldGroup || "").trim();
    const newG = (newGroup || "").trim();
    if (!oldG) return;

    const ids = tasks
      .filter((t) => (t.group || "").trim() === oldG)
      .map((t) => t.id);

    for (const id of ids) {
      const obj = await loadOne(id);
      if (!obj) continue;
      obj.group = newG; // 为空 => Ungrouped
      await saveTask(id, obj);
    }
    await refreshAll();
  };

  const deleteGroup = async (groupKey: string) => {
    const g = groupKey === "__UNGROUPED__" ? "" : groupKey;

    const ids = tasks
      .filter((t) => (t.group || "").trim() === g)
      .map((t) => t.id);

    if (ids.length === 0) return;

    for (const id of ids) {
      await deleteTask(id);
    }

    setSelectedIds((prev) => {
      const n = new Set(prev);
      for (const id of ids) n.delete(id);
      return n;
    });
    if (selectedId != null && ids.includes(selectedId)) setSelectedId(null);

    await refreshAll();
  };

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-140px)] min-h-[600px]">
      <div className="flex-none">
        {/* ✅ 顶栏：把 RunAll/RunSelected 传进去（别丢） */}
        <TasksActionsBar
          ok={ok}
          err={err}
          busyRefresh={busyRefresh}
          busyCreate={busyCreate}
          busyDelete={busyDelete}
          busyRunOnly={busyRunOnly}
          busyReset={busyReset}
          selectedCount={selectedIds.size}
          allSelected={allSelected}
          onRefresh={onRefresh}
          onCreate={onCreate}
          onToggleSelectAll={onToggleSelectAll}
          onMarkDone={onMarkDone}
          onResetStatusBatch={onResetStatusBatch}
          onDuplicateSelected={onDuplicateSelected}
          onMoveSelectedToFolder={onMoveSelectedToFolder}
          groupOptions={groupOptions}
          onRunSelected={onRunSelected}
          onRunAll={onRunAll}
          onDeleteSelected={onDeleteSelectedConfirm}
        />
      </div>

      <div className="flex-1 flex overflow-hidden border rounded-md bg-background shadow-sm">
        <div className="w-[300px] flex-none border-r flex flex-col">
          <TasksListPanel
            ok={ok}
            items={tasksOrdered}
            selectedId={selectedId}
            selectedIndex={selectedIndex}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectOnly={selectOnly}
            onReorder={onReorder}
            busyMove={busyMove}
            busyReset={busyReset}
            busyRunOnly={busyRunOnly}
            onResetStatus={onResetStatusOne}
            onRunOnly={onRunOnly}
            onAssignTaskToGroup={assignTaskToGroup}
            onRenameGroup={renameGroup}
            onCreateTaskInGroup={createTaskInGroup}
            onDeleteGroup={deleteGroup}
            onCreateFolder={onCreateFolder}
            onDeleteSelectedInFolder={onDeleteSelectedInFolder}
          />
        </div>

        <div className="flex-1 min-w-0 bg-card/50">
          <TaskDetailsPanel
            apiBase={apiBase}
            taskId={selectedId}
            task={taskObj}
            saving={busySave}
            onChange={(next) => {
              setTaskObj(next);
              setRaw(JSON.stringify(next, null, 2));
            }}
            onSave={onSave}
          />
        </div>
      </div>

      <NewTaskDialog
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        apiBase={apiBase}
        nextId={nextId}
        onCreate={handleCreateSubmit}
      />
    </div>
  );
}
