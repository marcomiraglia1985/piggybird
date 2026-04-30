import { prisma } from "./prisma";

/**
 * Metadata friendsplit, ora **dinamici da DB**:
 *   - SELF_NAME: Setting "user.name" (l'utente lo configura in Impostazioni → Profilo)
 *   - Members per gruppo: Account.membersJson (impostato al create/edit del conto)
 *
 * Per non rompere import esistenti, esponiamo helpers async:
 *   - getSelfName() → SELF_NAME corrente
 *   - getFriendsplitMembers(accountName) → membri del gruppo
 *   - getFriendsplitMembersById(accountId) → membri del gruppo
 *
 * Fallback se Setting "user.name" non è settato: stringa vuota (l'utente
 * deve configurarlo, mostriamo un avviso).
 */

export type FriendsplitMember = { name: string };

const SELF_FALLBACK = ""; // Vuoto = utente deve configurarsi

export async function getSelfName(): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key: "user.name" } });
  return s?.value?.trim() || SELF_FALLBACK;
}

export async function getFriendsplitMembers(
  accountName: string,
): Promise<FriendsplitMember[]> {
  const acc = await prisma.account.findUnique({
    where: { name: accountName },
    select: { membersJson: true },
  });
  return parseMembers(acc?.membersJson);
}

export async function getFriendsplitMembersById(
  accountId: string,
): Promise<FriendsplitMember[]> {
  const acc = await prisma.account.findUnique({
    where: { id: accountId },
    select: { membersJson: true },
  });
  return parseMembers(acc?.membersJson);
}

export function parseMembers(json: string | null | undefined): FriendsplitMember[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is FriendsplitMember =>
          typeof m === "object" && m !== null && typeof m.name === "string",
      )
      .map((m) => ({ name: m.name.trim() }))
      .filter((m) => m.name.length > 0);
  } catch {
    return [];
  }
}

export function serializeMembers(members: FriendsplitMember[]): string {
  return JSON.stringify(members.map((m) => ({ name: m.name.trim() })));
}
