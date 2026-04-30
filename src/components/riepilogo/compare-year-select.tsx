"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

export function CompareYearSelect({
  current,
  available,
  excludeYear,
}: {
  current: number;
  available: number[];
  excludeYear: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const choices = available.filter((y) => y !== excludeYear);
  return (
    <span className="relative inline-flex items-center group cursor-pointer text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors">
      <select
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("cmp", e.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="bg-transparent border-none text-[11px] uppercase tracking-widest font-medium cursor-pointer focus:outline-none p-0 m-0 pr-3.5 leading-none appearance-none"
      >
        {choices.map((y) => (
          <option key={y} value={y} className="bg-[var(--bg-elevated)] text-[var(--fg)] normal-case tracking-normal">
            {y}
          </option>
        ))}
      </select>
      <ChevronDown className="size-3 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity" />
    </span>
  );
}
