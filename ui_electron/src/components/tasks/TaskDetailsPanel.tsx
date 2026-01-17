import TaskEditor from "@/TaskEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MousePointerClick } from "lucide-react";

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
  if (taskId == null) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground select-none">
        <div className="p-6 rounded-full bg-muted/50 mb-4">
          <MousePointerClick className="w-12 h-12 opacity-50" />
        </div>
        <h3 className="text-lg font-medium">No Task Selected</h3>
        <p className="text-sm">Select a task from the list to view details.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-4xl mx-auto">
        <TaskEditor
          apiBase={apiBase}
          taskId={taskId}
          task={task}
          onChange={onChange}
          onSave={onSave}
          saving={saving}
        />
      </div>
    </ScrollArea>
  );
}
