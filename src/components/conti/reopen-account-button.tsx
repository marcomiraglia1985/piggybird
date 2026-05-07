"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function ReopenAccountButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function reopen() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      if (res.ok) {
        toast({ title: "Conto riaperto", variant: "success" });
        router.refresh();
      } else {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        toast({
          title: "Errore riapertura",
          description: j?.error ?? `HTTP ${res.status}`,
          variant: "error",
        });
      }
    } catch (e) {
      toast({
        title: "Errore riapertura",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={reopen}
      disabled={busy}
      title="Riapri conto: torna tra gli attivi e tornerà visibile nei picker"
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
    >
      <ArchiveRestore className="size-3" />
      {busy ? "Riapro…" : "Riapri"}
    </button>
  );
}
