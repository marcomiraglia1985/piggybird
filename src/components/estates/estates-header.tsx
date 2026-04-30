"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AddEstateDialog, type AccountOption } from "./add-estate-dialog";

export function EstatesHeader({ accounts }: { accounts: AccountOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 transition-shadow"
      >
        <Plus className="size-4" />
        Nuovo immobile
      </button>
      <AddEstateDialog open={open} onClose={() => setOpen(false)} accounts={accounts} />
    </>
  );
}
