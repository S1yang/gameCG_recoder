import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type Props = { apiBase: string; ok: boolean };

async function apiGet(base: string, path: string) {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function TemplatesTab({ apiBase, ok }: Props) {
  const [err, setErr] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!apiBase) return;
    setBusy(true);
    try {
      setErr("");
      const j = await apiGet(apiBase, "/templates");
      setItems(j.templates || []);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (apiBase && ok) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, ok]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Templates</div>
          <Button variant="secondary" onClick={refresh} disabled={!ok || busy}>
            {busy ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {err && <div className="mt-3 text-sm text-destructive">{err}</div>}

        <Separator className="my-4" />

        <ScrollArea className="h-[560px] rounded-md border">
          <div className="p-2 space-y-2">
            {items.map((name) => (
              <div key={name} className="rounded-md border px-3 py-2 text-sm">
                {name}
              </div>
            ))}
            {items.length === 0 && (
              <div className="text-sm text-muted-foreground p-2">
                No templates.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
