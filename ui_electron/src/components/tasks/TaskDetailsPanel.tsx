import TaskEditor from "@/TaskEditor";

type Props = {
  apiBase: string;
  taskId: number | null;
  task: any;
  saving: boolean;
  onChange: (next: any) => void;
  onSave: () => void;
};

export default function TaskDetailsPanel({
  apiBase,
  taskId,
  task,
  saving,
  onChange,
  onSave,
}: Props) {
  return (
    <div className="col-span-8 min-w-0">
      <TaskEditor
        apiBase={apiBase}
        taskId={taskId}
        task={task}
        onChange={onChange}
        onSave={onSave}
        saving={saving}
      />
    </div>
  );
}
