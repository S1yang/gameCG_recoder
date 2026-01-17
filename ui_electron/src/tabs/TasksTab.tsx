import { useEffect, useMemo, useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import TasksActionsBar from "@/components/tasks/TasksActionsBar";
import TasksListPanel from "@/components/tasks/TasksListPanel";
import TaskDetailsPanel from "@/components/tasks/TaskDetailsPanel";

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
    createTask,
    deleteTask,
    saveTask,
    saveQueue,
    moveInQueue,
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

  // --- 👇 新增：自动刷新逻辑 👇 ---
  // 当窗口重新获得焦点（例如 runner 跑完自动切回来，或用户手动切回来）时，自动刷新列表
  useEffect(() => {
    const onFocus = () => {
      if (apiBase && ok) {
        refreshAll();
      }
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [apiBase, ok, refreshAll]);
  // --- 👆 新增结束 👆 ---

  // ... (初始化逻辑保持不变)
  useEffect(() => {
    if (apiBase && ok) {
      refreshAll().then(({ tasks: list }) => {
        const first = list[0]?.id ?? null;
        if (selectedId === null && first != null) {
          setSelectedId(first);
          setSelectedIds(new Set([first]));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, ok]);

  useEffect(() => {
    if (selectedId != null) {
      loadOne(selectedId).then((t) => {
        if (t != null) setRaw(JSON.stringify(t, null, 2));
      });
    }
  }, [selectedId]);

  // ... (逻辑函数保持不变) ...
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

  const selectedIndex = useMemo(
    () => tasksOrdered.findIndex((x) => x.id === selectedId),
    [tasksOrdered, selectedId]
  );

  const onRefresh = async () => {
    await refreshAll();
  };
  const onCreate = async () => {
    const id = await createTask();
    await onRefresh();
    if (id) {
      setSelectedId(id);
      setSelectedIds(new Set([id]));
    }
  };
  const onDelete = async () => {
    if (!selectedId) return;
    if (!confirm(`Delete task ${selectedId}?`)) return;
    await deleteTask(selectedId);
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.delete(selectedId);
      return n;
    });
    await onRefresh();
  };
  const onReorder = async (order: number[]) => {
    await saveQueue(order);
    await refreshAll();
  };
  const onResetStatus = async () => {
    if (selectedId) {
      await resetStatus(selectedId);
      await refreshAll();
    }
  };
  const onRunOnly = async () => {
    if (selectedId) await runOnly(selectedId);
  };
  const onSave = async () => {
    if (selectedId) {
      const ok = await saveTask(selectedId, taskObj);
      if (ok) refreshAll();
    }
  };

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

  const idsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const onMarkDone = async () => {
    await setStatusBatch(idsArray, "done");
    await refreshAll();
  };
  const onMarkUndone = async () => {
    await setStatusBatch(idsArray, "");
    await refreshAll();
  };
  const onSelectAll = () =>
    setSelectedIds(new Set(tasksOrdered.map((t) => t.id)));
  const onSelectNone = () => setSelectedIds(new Set());
  const onRunSelected = async () => {
    const orderedSel = tasksOrdered
      .filter((t) => selectedIds.has(t.id))
      .map((t) => t.id);
    await runOnlyBatch(orderedSel);
    await startRunner();
  };
  const onRunAll = async () => {
    await clearRunOnly();
    await startRunner();
  };

  // --- 🔥 新的布局结构 ---
  return (
    // 使用固定高度容器，配合 Flex 布局实现左右独立滚动
    <div className="flex flex-col gap-2 h-[calc(100vh-140px)] min-h-[600px]">
      {/* 顶部工具栏 */}
      <div className="flex-none">
        <TasksActionsBar
          ok={ok}
          err={err}
          busyRefresh={busyRefresh}
          busyCreate={busyCreate}
          busyDelete={busyDelete}
          selectedId={selectedId}
          onRefresh={onRefresh}
          onCreate={onCreate}
          onDelete={onDelete}
          selectedCount={selectedIds.size}
          onSelectAll={onSelectAll}
          onSelectNone={onSelectNone}
          onMarkDone={onMarkDone}
          onMarkUndone={onMarkUndone}
          onRunSelected={onRunSelected}
          onRunAll={onRunAll}
        />
      </div>

      {/* 主体：左右分栏 */}
      <div className="flex-1 flex overflow-hidden border rounded-md bg-background shadow-sm">
        {/* 左侧：任务列表 (300px 固定宽) */}
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
            onResetStatus={onResetStatus}
            onRunOnly={onRunOnly}
          />
        </div>

        {/* 右侧：编辑器 (自适应宽度) */}
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
    </div>
  );
}
