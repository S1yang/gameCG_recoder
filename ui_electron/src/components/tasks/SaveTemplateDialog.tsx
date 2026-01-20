import { useState } from "react";
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
import { Save, Loader2 } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  taskContent: any;
};

export function SaveTemplateDialog({
  isOpen,
  onClose,
  apiBase,
  taskContent,
}: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/task_templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          content: taskContent,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onClose();
      alert(`Template "${name}" saved successfully!`);
    } catch (e: any) {
      alert(`Failed to save template: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5" />
            Save as Template
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tplName" className="text-right text-xs">
              Template Name
            </Label>
            <Input
              id="tplName"
              placeholder="e.g. Generic_VisualNovel"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3 h-8"
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            The current task configuration will be saved as a reusable template.
          </p>
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
          <Button size="sm" onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
