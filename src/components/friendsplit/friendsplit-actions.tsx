"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, AlertTriangle, Handshake } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { formatEUR, cn } from "@/lib/utils";

/* ============================================================================
 * "Nuovo friendsplit" button + dialog
 * ============================================================================ */
export function NewFriendsplitButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selfName, setSelfName] = useState("");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🤝");
  const [members, setMembers] = useState<string[]>([]);
  const [memberDraft, setMemberDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const sn = d.settings?.["user.name"] ?? "";
        setSelfName(sn);
        setMembers(sn ? [sn] : []);
      })
      .catch(() => {});
  }, [open]);

  function addMember() {
    const v = memberDraft.trim();
    if (!v) return;
    if (members.includes(v)) return;
    setMembers([...members, v]);
    setMemberDraft("");
  }

  function removeMember(name: string) {
    if (name === selfName) return; // self non rimovibile
    setMembers(members.filter((m) => m !== name));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (!name.trim()) throw new Error("Inserisci il nome del gruppo");
      if (members.length < 2) throw new Error("Servono almeno 2 membri");
      if (!selfName)
        throw new Error(
          "Imposta prima il tuo nome in Impostazioni → Profilo",
        );
      // Prefix "Friendsplit " automatico se l'utente non l'ha messo
      const fullName = name.trim().startsWith("Friendsplit ")
        ? name.trim()
        : `Friendsplit ${name.trim()}`;
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          type: "friendsplit",
          currency: "EUR",
          emoji,
          members: members.map((m) => ({ name: m })),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Errore creazione");
      toast({
        title: "Friendsplit creato",
        description: fullName,
        variant: "success",
      });
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setOpen(false);
    setName("");
    setEmoji("🤝");
    setMembers([]);
    setMemberDraft("");
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-shadow"
      >
        <Plus className="size-4" />
        Nuovo friendsplit
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={close}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md surface p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold inline-flex items-center gap-2">
                  <Handshake className="size-5 text-violet-400" />
                  Nuovo friendsplit
                </h2>
                <button
                  onClick={close}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
                >
                  <X className="size-4" />
                </button>
              </div>

              {!selfName && (
                <div className="text-sm text-amber-400 inline-flex items-start gap-1.5 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    Prima imposta il tuo nome in <strong>Impostazioni → Profilo</strong>.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-[80px_1fr] gap-3">
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                    Emoji
                  </label>
                  <input
                    type="text"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    maxLength={4}
                    className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-lg text-center focus:outline-none focus:border-violet-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                    Nome gruppo
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Es. Coinquilini, Vacanza Sicilia…"
                    className="w-full h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-widest text-[var(--fg-muted)]">
                  Membri ({members.length})
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const isSelf = m === selfName;
                    return (
                      <span
                        key={m}
                        className={cn(
                          "inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs border",
                          isSelf
                            ? "bg-violet-500/15 border-violet-500/40 text-violet-200"
                            : "bg-[var(--surface-2)] border-[var(--border)]",
                        )}
                      >
                        {m}
                        {isSelf && <span className="text-[10px]">(io)</span>}
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => removeMember(m)}
                            className="hover:text-rose-300"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={memberDraft}
                    onChange={(e) => setMemberDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addMember();
                      }
                    }}
                    placeholder="Es. Davide Caselli"
                    className="flex-1 h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 text-sm focus:outline-none focus:border-violet-500/50"
                  />
                  <button
                    type="button"
                    onClick={addMember}
                    disabled={!memberDraft.trim()}
                    className="h-9 px-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm hover:border-[var(--border-strong)] disabled:opacity-50"
                  >
                    Aggiungi
                  </button>
                </div>
                <p className="text-[11px] text-[var(--fg-subtle)]">
                  Servono almeno 2 membri (te incluso). Tu sei il primo,
                  evidenziato in viola.
                </p>
              </div>

              {error && (
                <div className="text-sm text-rose-400 inline-flex items-center gap-1.5">
                  <AlertTriangle className="size-4" /> {error}
                </div>
              )}

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={close}
                  disabled={saving}
                  className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={save}
                  disabled={
                    saving || !name.trim() || members.length < 2 || !selfName
                  }
                  className="h-9 px-4 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium disabled:opacity-50"
                >
                  {saving ? "Creo…" : "Crea"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ============================================================================
 * "Elimina friendsplit" button + confirm dialog
 * ============================================================================ */
export function DeleteFriendsplitButton({
  accountId,
  accountName,
  balance,
  txCount,
}: {
  accountId: string;
  accountName: string;
  balance: number;
  txCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmDoubleNonZero, setConfirmDoubleNonZero] = useState(false);
  const [busy, setBusy] = useState(false);
  const settled = Math.abs(balance) < 0.01;

  async function execute() {
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Errore");
      toast({
        title: `Friendsplit eliminato`,
        description: `${accountName} · ${j.txCascaded ?? 0} tx friendsplit cancellate. Le uscite/entrate sui conti principali restano nei movimenti.`,
        variant: "success",
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast({
        title: "Errore eliminazione",
        description: e instanceof Error ? e.message : String(e),
        variant: "error",
      });
    } finally {
      setBusy(false);
      setConfirmDoubleNonZero(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        title="Elimina friendsplit"
        className="size-7 inline-flex items-center justify-center rounded-md text-[var(--fg-subtle)] hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
      >
        <Trash2 className="size-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !busy && setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md surface p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold inline-flex items-center gap-2 text-rose-300">
                  <Trash2 className="size-5" />
                  Elimina friendsplit
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="size-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="text-sm text-[var(--fg-muted)] space-y-2">
                <p>
                  Stai per eliminare <strong className="text-[var(--fg)]">{accountName}</strong>.
                </p>
                <div className="rounded-md bg-[var(--surface-2)]/50 border border-[var(--border)] p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span>Saldo attuale</span>
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        settled
                          ? ""
                          : balance > 0
                            ? "text-emerald-400"
                            : "text-rose-400",
                      )}
                    >
                      {balance > 0 ? "+" : ""}
                      {formatEUR(balance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[var(--fg-subtle)]">
                    <span>Tx friendsplit</span>
                    <span className="tabular-nums">{txCount}</span>
                  </div>
                </div>

                {!settled && !confirmDoubleNonZero && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-xs space-y-1">
                    <p className="text-amber-300 font-medium inline-flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5" />
                      Saldo NON in pari
                    </p>
                    <p>
                      Eliminando ora perdi il record di chi deve cosa.
                      Normalmente conviene prima saldare con un&apos;ultima tx
                      (entrata/uscita) che azzera il saldo, poi eliminare.
                    </p>
                  </div>
                )}

                <div className="text-xs space-y-1">
                  <p>
                    <strong className="text-emerald-300">Cosa NON cambia:</strong>{" "}
                    le tx sui tuoi conti principali (Revolut, Cointestato, ecc.)
                    generate dalle spese friendsplit dove avevi pagato tu — sono
                    uscite/entrate reali e restano nei movimenti.
                  </p>
                  <p>
                    <strong className="text-rose-300">Cosa viene cancellato:</strong>{" "}
                    le {txCount} tx interne al friendsplit (i record di
                    debito/credito). Persi per sempre.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end pt-2">
                <button
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="h-9 px-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm"
                >
                  Annulla
                </button>
                {!settled && !confirmDoubleNonZero ? (
                  <button
                    onClick={() => setConfirmDoubleNonZero(true)}
                    disabled={busy}
                    className="h-9 px-4 rounded-lg bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
                  >
                    Sì, capisco — procedi
                  </button>
                ) : (
                  <button
                    onClick={execute}
                    disabled={busy}
                    className="h-9 px-4 rounded-lg bg-rose-500 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" />
                    {busy ? "Elimino…" : "Elimina definitivamente"}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
