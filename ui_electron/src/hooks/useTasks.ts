import { useCallback, useState } from "react";

async function apiGet(base: string, path: string) {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPost(base: string, path: string, body?: any) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiPut(base: string, path: string, body?: any) {
  const r = await fetch(`${base}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function apiDelete(base: string, path: string) {
  const r = await fetch(`${base}${path}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type TaskItem = {
  id: number;
  name?: string;
  status?: string;
  basename?: string;
  out?: string;
  error?: string;
  group?: string;
};

export function useTasks(apiBase: string) {
  const [err, setErr] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [queue, setQueue] = useState<number[]>([]);
  const [taskObj, setTaskObj] = useState<any>(null);

  const [busyRefresh, setBusyRefresh] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [busyMove, setBusyMove] = useState(false);
  const [busyReset, setBusyReset] = useState(false);
  const [busyRunOnly, setBusyRunOnly] = useState(false);

  const refreshAll = useCallback(async () => {
    if (!apiBase) return { tasks: [] as TaskItem[], queue: [] as number[] };
    setBusyRefresh(true);
    try {
      setErr("");
      const [tj, qj] = await Promise.all([
        apiGet(apiBase, "/tasks"),
        apiGet(apiBase, "/queue").catch(() => ({ order: [] as number[] })),
      ]);

      const list: TaskItem[] = tj.tasks || [];
      setTasks(list);

      const order: number[] =
        (qj?.order && Array.isArray(qj.order) && qj.order.length > 0
          ? qj.order
          : list.map((t) => t.id)) || [];

      setQueue(order);

      return { tasks: list, queue: order };
    } catch (e: any) {
      setErr(e?.message || String(e));
      return { tasks: [] as TaskItem[], queue: [] as number[] };
    } finally {
      setBusyRefresh(false);
    }
  }, [apiBase]);

  const loadOne = useCallback(
    async (id: number) => {
      if (!apiBase) return null;
      try {
        setErr("");
        const j = await apiGet(apiBase, `/tasks/${id}`);
        const t = j.task ?? j;
        setTaskObj(t);
        return t;
      } catch (e: any) {
        setErr(e?.message || String(e));
        return null;
      }
    },
    [apiBase]
  );

  const createTask = useCallback(async () => {
    if (!apiBase) return null;
    setBusyCreate(true);
    try {
      setErr("");
      const j = await apiPost(apiBase, "/tasks", { name: "" });
      const id = Number(j?.id);
      return Number.isFinite(id) ? id : null;
    } catch (e: any) {
      setErr(e?.message || String(e));
      return null;
    } finally {
      setBusyCreate(false);
    }
  }, [apiBase]);

  const deleteTask = useCallback(
    async (id: number) => {
      if (!apiBase) return false;
      setBusyDelete(true);
      try {
        setErr("");
        await apiDelete(apiBase, `/tasks/${id}`);
        return true;
      } catch (e: any) {
        setErr(e?.message || String(e));
        return false;
      } finally {
        setBusyDelete(false);
      }
    },
    [apiBase]
  );

  const saveTask = useCallback(
    async (id: number, obj: any) => {
      if (!apiBase) return false;
      setBusySave(true);
      try {
        setErr("");
        await apiPut(apiBase, `/tasks/${id}`, obj);
        return true;
      } catch (e: any) {
        setErr(e?.message || String(e));
        return false;
      } finally {
        setBusySave(false);
      }
    },
    [apiBase]
  );

  const saveQueue = useCallback(
    async (order: number[]) => {
      if (!apiBase) return false;
      try {
        setErr("");
        await apiPut(apiBase, "/queue", { order });
        setQueue(order);
        return true;
      } catch (e: any) {
        setErr(e?.message || String(e));
        return false;
      }
    },
    [apiBase]
  );

  const moveInQueue = useCallback(
    async (order: number[], fromIdx: number, toIdx: number) => {
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= order.length ||
        toIdx >= order.length
      ) {
        return order;
      }
      setBusyMove(true);
      try {
        setErr("");
        const next = order.slice();
        const tmp = next[fromIdx];
        next[fromIdx] = next[toIdx];
        next[toIdx] = tmp;

        // 乐观更新
        setQueue(next);
        await apiPut(apiBase, "/queue", { order: next });
        return next;
      } catch (e: any) {
        setErr(e?.message || String(e));
        // 回滚：由外层 refreshAll 兜底
        return order;
      } finally {
        setBusyMove(false);
      }
    },
    [apiBase]
  );

  const resetStatus = useCallback(
    async (id: number) => {
      if (!apiBase) return false;
      setBusyReset(true);
      try {
        setErr("");
        await apiPost(apiBase, `/progress/reset/${id}`, {});
        return true;
      } catch (e: any) {
        setErr(e?.message || String(e));
        return false;
      } finally {
        setBusyReset(false);
      }
    },
    [apiBase]
  );

  const runOnly = useCallback(
    async (id: number) => {
      if (!apiBase) return false;
      setBusyRunOnly(true);
      try {
        setErr("");
        await apiPost(apiBase, `/progress/run_only/${id}`, {});
        return true;
      } catch (e: any) {
        setErr(e?.message || String(e));
        return false;
      } finally {
        setBusyRunOnly(false);
      }
    },
    [apiBase]
  );

  const setStatusBatch = useCallback(
    async (ids: number[], status: string) => {
      if (!apiBase) return false;
      try {
        setErr("");
        await apiPost(apiBase, `/progress/set_status_batch`, { ids, status });
        return true;
      } catch (e: any) {
        setErr(e?.message || String(e));
        return false;
      }
    },
    [apiBase]
  );

  const runOnlyBatch = useCallback(
    async (ids: number[]) => {
      if (!apiBase) return false;
      try {
        setErr("");
        await apiPost(apiBase, `/progress/run_only_batch`, { ids });
        return true;
      } catch (e: any) {
        setErr(e?.message || String(e));
        return false;
      }
    },
    [apiBase]
  );

  const clearRunOnly = useCallback(async () => {
    if (!apiBase) return false;
    try {
      setErr("");
      await apiPost(apiBase, `/progress/clear_run_only`, {});
      return true;
    } catch (e: any) {
      setErr(e?.message || String(e));
      return false;
    }
  }, [apiBase]);

  const startRunner = useCallback(async () => {
    if (!apiBase) return false;
    try {
      setErr("");
      await apiPost(apiBase, `/runner/start`, { show_console: true });
      return true;
    } catch (e: any) {
      setErr(e?.message || String(e));
      return false;
    }
  }, [apiBase]);

  return {
    // state
    err,
    tasks,
    queue,
    taskObj,
    setTaskObj,

    // busy flags
    busyRefresh,
    busySave,
    busyCreate,
    busyDelete,
    busyMove,
    busyReset,
    busyRunOnly,

    // actions
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
  };
}
