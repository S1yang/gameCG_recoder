import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilePlus2, Loader2 } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  nextId: number;
  onCreate: (data: {
    name: string;
    basename: string;
    template: string;
  }) => Promise<void>;
};

export function NewTaskDialog({
  isOpen,
  onClose,
  apiBase,
  nextId,
  onCreate,
}: Props) {
  const [name, setName] = useState("");
  const [basename, setBasename] = useState("");
  const [template, setTemplate] = useState<string>("__none__");
  const [templatesList, setTemplatesList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // 初始化逻辑
  useEffect(() => {
    if (isOpen) {
      const suggest = `CG_${String(nextId).padStart(3, "0")}`;
      setName(suggest);
      setBasename(suggest);
      setTemplate("__none__");

      // Load available templates
      fetch(`${apiBase}/task_templates`)
        .then((r) => r.json())
        .then((j) => setTemplatesList(j.templates || []))
        .catch(() => setTemplatesList([]));
    }
  }, [isOpen, nextId, apiBase]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate({
        name: name.trim(),
        basename: basename.trim(),
        template: template === "__none__" ? "" : template,
      });
      onClose();
    } catch (e) {
      alert("Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="w-5 h-5" />
            Create New Task
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Template Selection */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="ntd-tpl" className="text-right text-xs">
              Template
            </Label>
            <div className="col-span-3">
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger id="ntd-tpl" className="h-8 text-xs">
                  <SelectValue placeholder="None (Blank Task)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (Blank Task)</SelectItem>
                  {templatesList.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Task Name - 🟢 ID changed to 'ntd-name' to avoid collision */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="ntd-name" className="text-right text-xs">
              Task Name
            </Label>
            <Input
              id="ntd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3 h-8"
              autoComplete="off" // Prevent browser autocomplete interference
            />
          </div>

          {/* Basename - 🟢 ID changed to 'ntd-basename' */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="ntd-basename" className="text-right text-xs">
              File Basename
            </Label>
            <Input
              id="ntd-basename"
              value={basename}
              onChange={(e) => setBasename(e.target.value)}
              className="col-span-3 h-8 font-mono"
              autoComplete="off"
            />
          </div>

          <div className="text-[10px] text-muted-foreground text-center px-4">
            {template !== "__none__"
              ? "This will copy all actions and settings from the selected template."
              : "A clean task will be created with default settings."}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
