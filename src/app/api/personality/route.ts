import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPersonalityProfile,
  savePersonalityResult,
  resetPersonality,
} from "@/lib/personality";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getPersonalityProfile();
  return NextResponse.json(profile);
}

const PostSchema = z.object({
  answers: z.record(z.string(), z.number()),
  axes: z.object({
    planning: z.number().min(1).max(10),
    risk: z.number().min(1).max(10),
    time: z.number().min(1).max(10),
    value: z.number().min(1).max(10),
    social: z.number().min(1).max(10),
  }),
  summary: z.string().trim().max(2000).default(""),
  testVersion: z.number().int().min(1).max(9999),
  // v4 layers — opzionali, assenti per client v3
  moneyScripts: z
    .object({
      avoidance: z.number().min(1).max(10),
      worship: z.number().min(1).max(10),
      status: z.number().min(1).max(10),
      vigilance: z.number().min(1).max(10),
    })
    .optional(),
  literacyScore: z.number().int().min(0).max(3).optional(),
  behavioral: z
    .object({
      lossAversion: z.number().min(1).max(10),
      composure: z.number().min(1).max(10),
    })
    .optional(),
  vision: z.string().trim().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  const { answers, axes, summary, testVersion, moneyScripts, literacyScore, behavioral, vision } =
    parsed.data;
  const archetype = await savePersonalityResult(answers, axes, summary, testVersion, {
    moneyScripts,
    literacyScore,
    behavioral,
    vision,
  });
  // Invalida cache di feature AI che attingono ai personality layers: il
  // nuovo profilo modula l'interpretazione, le edizioni cachate restano
  // basate sull'archetype vecchio.
  await invalidatePersonalityDependentCaches();
  return NextResponse.json({ ok: true, archetype });
}

export async function DELETE() {
  await resetPersonality();
  await invalidatePersonalityDependentCaches();
  return NextResponse.json({ ok: true });
}

async function invalidatePersonalityDependentCaches(): Promise<void> {
  // Setting che usano personalityLayers nel prompt AI → vanno rigenerati
  // per riflettere il nuovo profilo. Caller lo vedrà come "ancora in bozza".
  await prisma.setting.deleteMany({
    where: {
      OR: [
        { key: { startsWith: "insights.networth." } },
        { key: { equals: "investments.commentary" } },
      ],
    },
  });
}
