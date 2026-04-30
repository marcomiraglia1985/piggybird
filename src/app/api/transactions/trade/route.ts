import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { fxToEur } from "@/lib/yahoo-finance";

export const runtime = "nodejs";

/**
 * Crea una "Trade" — operazione di acquisto/vendita di un asset investimento.
 *
 * Effetti:
 *   1. Crea il transfer pair: uscita dal conto bancario (BUY) o entrata
 *      (SELL) + controparte sull'account "Investimenti".
 *   2. Per asset crypto su platform manuali (Revolut X, ecc.) aggiorna anche
 *      la CryptoPosition e il CryptoCostBasis. Per Binance/Stocks Revolut
 *      il sync dedicato ricalcola tutto.
 */

const TradeSchema = z.object({
  direction: z.enum(["buy", "sell"]),
  assetType: z.enum(["stocks", "crypto", "metals", "altro"]),
  asset: z.string().trim().min(1),
  platform: z.string().trim().optional(),
  quantity: z.number().positive(),
  pricePerUnit: z.number().positive(),
  currency: z.string().trim().default("EUR"),
  date: z.string(),
  accountId: z.string(),
  beneficiary: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const CATEGORY_NAME: Record<string, string> = {
  stocks: "Stocks",
  crypto: "Crypto",
  metals: "Metals",
  altro: "Altro investimenti",
};

function randomGroupId(): string {
  return `trade_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON non valido" }, { status: 400 });
  }
  const parsed = TradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const date = new Date(data.date);
  if (!isFinite(date.getTime())) {
    return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  }

  // 1. Calcola importo in EUR
  const totalNative = data.quantity * data.pricePerUnit;
  const fx = data.currency.toUpperCase() === "EUR" ? 1 : await fxToEur(data.currency.toUpperCase());
  const totalEur = totalNative * fx;
  // signedAmount = uscita per BUY, entrata per SELL (lato bancario)
  const signedAmountBank = data.direction === "buy" ? -totalEur : totalEur;

  // 2. Risolvi accounts e category
  const [bankAcct, investAcct, category] = await Promise.all([
    prisma.account.findUnique({ where: { id: data.accountId } }),
    prisma.account.findUnique({ where: { name: "Investimenti" } }),
    prisma.category.findFirst({
      where: { name: CATEGORY_NAME[data.assetType], group: "investments", active: true },
    }),
  ]);
  if (!bankAcct) return NextResponse.json({ error: "Conto bancario non trovato" }, { status: 404 });
  if (!investAcct) {
    return NextResponse.json({ error: "Account Investimenti non configurato" }, { status: 500 });
  }
  if (!category) {
    return NextResponse.json({ error: `Categoria ${CATEGORY_NAME[data.assetType]} non trovata` }, { status: 500 });
  }

  // 3. Beneficiary auto se non passato
  const benef =
    data.beneficiary?.trim() ||
    `${data.direction === "buy" ? "BUY" : "SELL"} ${data.quantity.toFixed(8).replace(/\.?0+$/, "")} ${data.asset.toUpperCase()}` +
      (data.platform ? ` · ${data.platform}` : "") +
      ` @ ${data.pricePerUnit.toFixed(2)} ${data.currency.toUpperCase()}`;

  // 4. Crea transfer pair atomico
  const groupId = randomGroupId();
  const confirmedAtNow = new Date();
  const [bankTx, investTx] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        date,
        amount: signedAmountBank,
        accountId: bankAcct.id,
        categoryId: category.id,
        beneficiary: benef,
        notes: data.notes?.trim() || null,
        isJoint: bankAcct.type === "joint",
        confirmed: true,
        confirmedAt: confirmedAtNow,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        transferGroupId: groupId,
      },
    }),
    prisma.transaction.create({
      data: {
        date,
        amount: -signedAmountBank,
        accountId: investAcct.id,
        categoryId: category.id,
        beneficiary: benef,
        notes: data.notes?.trim() || null,
        isJoint: false,
        confirmed: true,
        confirmedAt: confirmedAtNow,
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        transferGroupId: groupId,
      },
    }),
  ]);

  // 5. Aggiorna balance account Investimenti
  const sum = await prisma.transaction.aggregate({
    where: { accountId: investAcct.id },
    _sum: { amount: true },
  });
  await prisma.account.update({
    where: { id: investAcct.id },
    data: { currentBalance: sum._sum.amount ?? 0 },
  });

  // 6. Per crypto su platform manuale: aggiorna CryptoPosition + CryptoCostBasis
  let positionUpdate: { asset: string; amountChange: number; costChange: number } | null = null;
  if (data.assetType === "crypto" && data.platform) {
    const platform = data.platform;
    const asset = data.asset.toUpperCase();
    const qtyChange = data.direction === "buy" ? data.quantity : -data.quantity;
    const costChange = data.direction === "buy" ? totalEur : -totalEur;

    // CryptoPosition: somma delta sulla source "manual"
    const existing = await prisma.cryptoPosition.findUnique({
      where: { platform_source_asset: { platform, source: "manual", asset } },
    });
    const newAmount = (existing?.amount ?? 0) + qtyChange;
    if (newAmount > 0.0000001) {
      await prisma.cryptoPosition.upsert({
        where: { platform_source_asset: { platform, source: "manual", asset } },
        create: {
          platform,
          source: "manual",
          asset,
          amount: newAmount,
          eurValue: newAmount * data.pricePerUnit * fx,
          pricedVia: "manual-trade",
        },
        update: {
          amount: newAmount,
          eurValue: newAmount * data.pricePerUnit * fx,
          pricedVia: "manual-trade",
          lastUpdated: new Date(),
        },
      });
    } else if (existing) {
      await prisma.cryptoPosition.delete({ where: { id: existing.id } });
    }

    // CryptoCostBasis: somma il delta (cost basis aggregato)
    const existingCb = await prisma.cryptoCostBasis.findUnique({
      where: { platform_asset: { platform, asset } },
    });
    const newCost = (existingCb?.costEur ?? 0) + costChange;
    if (newCost > 0.01) {
      await prisma.cryptoCostBasis.upsert({
        where: { platform_asset: { platform, asset } },
        create: { platform, asset, costEur: newCost },
        update: { costEur: newCost },
      });
    } else if (existingCb) {
      await prisma.cryptoCostBasis.delete({ where: { id: existingCb.id } });
    }

    // Aggiorna Investment (somma platform)
    const positions = await prisma.cryptoPosition.findMany({ where: { platform } });
    const totalPlat = positions.reduce((s, p) => s + p.eurValue, 0);
    const investmentName = `Crypto ${platform}`;
    if (totalPlat === 0) {
      await prisma.investment.deleteMany({ where: { name: investmentName } });
    } else {
      await prisma.investment.upsert({
        where: { name: investmentName },
        update: { currentValue: totalPlat, lastUpdated: new Date() },
        create: {
          name: investmentName,
          type: "crypto",
          platform,
          currentValue: totalPlat,
          currency: "EUR",
        },
      });
    }
    positionUpdate = { asset, amountChange: qtyChange, costChange };

    // Trade record per chart marker
    await prisma.cryptoTrade.create({
      data: {
        platform,
        asset,
        direction: data.direction,
        quantity: data.quantity,
        pricePerUnit: data.pricePerUnit,
        pricePerUnitEur: data.pricePerUnit * fx,
        currency: data.currency.toUpperCase(),
        totalEur,
        date,
        source: "form",
        notes: data.notes?.trim() || null,
        txId: bankTx.id,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    bankTx,
    investTx,
    totalEur,
    fx,
    positionUpdate,
  });
}
