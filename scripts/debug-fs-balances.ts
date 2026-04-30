import { prisma } from "../src/lib/prisma";
import { getSelfName, parseMembers } from "../src/lib/friendsplit-meta";

async function main() {
  const SELF_NAME = await getSelfName();
  const accounts = await prisma.account.findMany({
    where: { type: "friendsplit" },
  });
  for (const acc of accounts) {
    const members = parseMembers(acc.membersJson);
    if (members.length === 0) continue;
    const txs = await prisma.transaction.findMany({
      where: { accountId: acc.id },
    });
    const memberNames = members.map((m) => m.name);

    // Strategia A: NO dedup, ogni tx è una spesa indipendente con il suo payer
    const balancesA = new Map<string, number>();
    for (const m of memberNames) balancesA.set(m, 0);
    for (const t of txs) {
      const notes = t.notes ?? "";
      const payerMatch = notes.match(/Anticipato da:\s*([^·]+)/);
      const payer = payerMatch ? payerMatch[1].trim() : null;
      const totMatch = notes.match(/Tot\.\s*([\d.]+)/);
      const partsMatch = notes.match(/Per:\s*([^·]+)/);
      const explicitParts = partsMatch
        ? partsMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const participants = explicitParts ?? memberNames;
      if (!payer || !totMatch || participants.length === 0) continue;
      const tot = parseFloat(totMatch[1]);
      if (!isFinite(tot) || tot <= 0) continue;
      if (!balancesA.has(payer)) continue;
      balancesA.set(payer, (balancesA.get(payer) ?? 0) + tot);
      const share = tot / participants.length;
      for (const p of participants) {
        if (!balancesA.has(p)) continue;
        balancesA.set(p, (balancesA.get(p) ?? 0) - share);
      }
    }
    console.log(`\n=== ${acc.name} — Strategia A (no dedup) ===`);
    let sumA = 0;
    for (const [name, val] of balancesA) {
      const isSelf = name === SELF_NAME;
      console.log(
        `  ${name.padEnd(20)} ${isSelf ? "(io)" : "    "}  ${val.toFixed(2).padStart(12)} €`,
      );
      sumA += val;
    }
    console.log(`  → sum: ${sumA.toFixed(2)}`);

    // Strategia B: dedup tieni solo (1/N), il payer di (1/N) è il "vero" payer
    const balancesB = new Map<string, number>();
    for (const m of memberNames) balancesB.set(m, 0);
    for (const t of txs) {
      const benef = (t.beneficiary ?? "").trim();
      const splitMatch = benef.match(/^(.+?)\s*\((\d+)\/(\d+)\)$/);
      if (splitMatch && parseInt(splitMatch[2], 10) !== 1) continue;
      const notes = t.notes ?? "";
      const payerMatch = notes.match(/Anticipato da:\s*([^·]+)/);
      const payer = payerMatch ? payerMatch[1].trim() : null;
      const totMatch = notes.match(/Tot\.\s*([\d.]+)/);
      const partsMatch = notes.match(/Per:\s*([^·]+)/);
      const explicitParts = partsMatch
        ? partsMatch[1].split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const participants = explicitParts ?? memberNames;
      if (!payer || !totMatch || participants.length === 0) continue;
      const tot = parseFloat(totMatch[1]);
      if (!isFinite(tot) || tot <= 0) continue;
      if (!balancesB.has(payer)) continue;
      balancesB.set(payer, (balancesB.get(payer) ?? 0) + tot);
      const share = tot / participants.length;
      for (const p of participants) {
        if (!balancesB.has(p)) continue;
        balancesB.set(p, (balancesB.get(p) ?? 0) - share);
      }
    }
    console.log(`\n=== ${acc.name} — Strategia B (solo 1/N) ===`);
    let sumB = 0;
    for (const [name, val] of balancesB) {
      const isSelf = name === SELF_NAME;
      console.log(
        `  ${name.padEnd(20)} ${isSelf ? "(io)" : "    "}  ${val.toFixed(2).padStart(12)} €`,
      );
      sumB += val;
    }
    console.log(`  → sum: ${sumB.toFixed(2)}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
