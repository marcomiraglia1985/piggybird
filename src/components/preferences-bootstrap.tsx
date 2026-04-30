import { prisma } from "@/lib/prisma";
import { PreferencesProvider } from "@/lib/preferences";

export async function PreferencesBootstrap({ children }: { children: React.ReactNode }) {
  const rows = await prisma.setting.findMany();
  const initial: Record<string, string> = {};
  for (const r of rows) initial[r.key] = r.value;
  return <PreferencesProvider initial={initial as never}>{children}</PreferencesProvider>;
}
