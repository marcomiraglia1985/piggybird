import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSelfName, parseMembers } from "@/lib/friendsplit-meta";

export const runtime = "nodejs";

/**
 * Metadati friendsplit per il client (dialog "+ Aggiungi → Friendsplit"):
 *   - selfName: nome utente da Setting "user.name"
 *   - groups: per ogni account friendsplit, i suoi membri
 */
export async function GET() {
  const [selfName, accounts] = await Promise.all([
    getSelfName(),
    prisma.account.findMany({
      where: { type: "friendsplit", active: true },
      select: { id: true, name: true, emoji: true, membersJson: true },
    }),
  ]);
  const groups = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    members: parseMembers(a.membersJson),
  }));
  return NextResponse.json({ selfName, groups });
}
