import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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

    // ✅ 新增（第2/3步会用到）
    setStatusBatch,
    runOnlyBatch,
    clearRunOnly,
    startRunner,
  } = useTasks(apiBase);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [raw, setRaw] = useState<string>("");

  // ✅ 多选集合
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (apiBase && ok) {
      refreshAll().then(({ tasks: list }) => {
        const first = list[0]?.id ?? null;
        setSelectedId((prev) => prev ?? first);
        // 默认把选中的也加入批量集合（体验好一点）
        if (first != null) setSelectedIds(new Set([first]));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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

  const selectedIndex = useMemo(() => {
    if (selectedId == null) return -1;
    return tasksOrdered.findIndex((x) => x.id === selectedId);
  }, [tasksOrdered, selectedId]);

  const onRefresh = async () => {
    const { tasks: list } = await refreshAll();
    const exists = selectedId != null && list.some((t) => t.id === selectedId);
    if (!exists) {
      const first = list[0]?.id ?? null;
      setSelectedId(first);
      setSelectedIds(first != null ? new Set([first]) : new Set());
    }
  };

  const onCreate = async () => {
    const id = await createTask();
    await onRefresh();
    if (id != null) {
      setSelectedId(id);
      setSelectedIds(new Set([id]));
    }
  };

  const onDelete = async () => {
    if (selectedId == null) return;
    const yes = confirm(`Delete task ${String(selectedId).padStart(3, "0")}?`);
    if (!yes) return;
    const okDel = await deleteTask(selectedId);
    if (!okDel) return;

    // 清理多选
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.delete(selectedId);
      return n;
    });

    await onRefresh();
  };

  // ✅ 拖拽后写回 queue（核心）
  const onReorder = async (order: number[]) => {
    await saveQueue(order);
    await refreshAll(); // 保守：确保 UI 与后端一致
  };

  // 兼容你旧 ↑↓（仍可用）
  const onMoveUpDown = async (delta: -1 | 1) => {
    if (selectedId == null) return;
    const idx = selectedIndex;
    if (idx < 0) return;
    const j = idx + delta;
    if (j < 0 || j >= tasksOrdered.length) return;

    const currentOrder = tasksOrdered.map((t) => t.id);
    await moveInQueue(currentOrder, idx, j);
    await refreshAll();
  };

  const onResetStatus = async () => {
    if (selectedId == null) return;
    await resetStatus(selectedId);
    await refreshAll();
  };

  const onRunOnly = async () => {
    if (selectedId == null) return;
    await runOnly(selectedId);
  };

  const onSave = async () => {
    if (selectedId == null) return;
    const obj = taskObj ?? JSON.parse(raw || "{}");
    const okSave = await saveTask(selectedId, obj);
    if (!okSave) return;

    const t = await loadOne(selectedId);
    if (t != null) setRaw(JSON.stringify(t, null, 2));
    await refreshAll();
  };

  // ✅ 多选操作
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectOnly = (id: number) => {
    setSelectedId(id);
    setSelectedIds(new Set([id]));
  };

  // ===== 第2步：批量状态按钮（在 ActionsBar 触发）=====
  const idsArray = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const onMarkDone = async () => {
    if (idsArray.length === 0) return;
    await setStatusBatch(idsArray, "done");
    await refreshAll();
  };

  const onMarkUndone = async () => {
    if (idsArray.length === 0) return;
    // status="" 表示清理该 task 的 state（未完成）
    await setStatusBatch(idsArray, "");
    await refreshAll();
  };

  const onSelectAll = () => {
    setSelectedIds(new Set(tasksOrdered.map((t) => t.id)));
  };

  const onSelectNone = () => {
    setSelectedIds(new Set());
  };

  // ===== 第3步：Run Selected / Run All =====
  const onRunSelected = async () => {
    if (idsArray.length === 0) return;
    // 按 queue 顺序执行：用 tasksOrdered 过滤出选中的
    const orderedSel = tasksOrdered
      .filter((t) => selectedIds.has(t.id))
      .map((t) => t.id);
    await runOnlyBatch(orderedSel);
    await startRunner(); // ✅ 直接启动 runner.py
  };

  const onRunAll = async () => {
    await clearRunOnly();
    await startRunner();
  };

  return (
    <Card>
      <CardContent className="p-4">
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
          // ✅ 批量/运行控制
          selectedCount={selectedIds.size}
          onSelectAll={onSelectAll}
          onSelectNone={onSelectNone}
          onMarkDone={onMarkDone}
          onMarkUndone={onMarkUndone}
          onRunSelected={onRunSelected}
          onRunAll={onRunAll}
        />

        <Separator className="my-4" />

        <div className="grid grid-cols-12 gap-4">
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
            onMoveUpDown={onMoveUpDown}
          />

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
      </CardContent>
    </Card>
  );
}
