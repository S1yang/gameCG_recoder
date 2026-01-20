import { useEffect, useMemo, useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import TasksActionsBar from "@/components/tasks/TasksActionsBar";
import TasksListPanel from "@/components/tasks/TasksListPanel";
import TaskDetailsPanel from "@/components/tasks/TaskDetailsPanel";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";

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

  // 🟢 Dialog State
  const [createOpen, setCreateOpen] = useState(false);

  // --- 自动刷新 ---
  useEffect(() => {
    const onFocus = () => {
      if (apiBase && ok) {
        refreshAll();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [apiBase, ok, refreshAll]);

  // --- 初始化加载 ---
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

  // --- 排序与筛选 ---
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

  // 🟢 计算建议ID
  const nextId = useMemo(() => {
    if (tasks.length === 0) return 1;
    const maxId = Math.max(...tasks.map((t) => t.id));
    return maxId + 1;
  }, [tasks]);

  // --- 动作处理 ---
  const onRefresh = async () => {
    await refreshAll();
  };

  // 🟢 改为打开对话框
  const onCreate = async () => {
    setCreateOpen(true);
  };

  // 🟢 实际创建请求
  const handleCreateSubmit = async (data: {
    name: string;
    basename: string;
    template: string;
  }) => {
    try {
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

      await onRefresh();
      if (j.id) {
        setSelectedId(j.id);
        setSelectedIds(new Set([j.id]));
      }
    } catch (e: any) {
      console.error(e);
      throw e;
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

  // ... 其他 handler 保持不变 ...
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

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-140px)] min-h-[600px]">
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
            onResetStatus={onResetStatus}
            onRunOnly={onRunOnly}
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

      {/* 🟢 Dialog */}
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
