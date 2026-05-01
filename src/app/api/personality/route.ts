import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPersonalityProfile,
  savePersonalityResult,
  resetPersonality,
} from "@/lib/personality";

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
  return NextResponse.json({ ok: true, archetype });
}

export async function DELETE() {
  await resetPersonality();
  return NextResponse.json({ ok: true });
}
