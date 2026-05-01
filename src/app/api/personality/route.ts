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
    risk: z.number().min(1).max(10),
    time: z.number().min(1).max(10),
    value: z.number().min(1).max(10),
    social: z.number().min(1).max(10),
  }),
  summary: z.string().trim().max(2000).default(""),
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
  const { answers, axes, summary } = parsed.data;
  const archetype = await savePersonalityResult(answers, axes, summary);
  return NextResponse.json({ ok: true, archetype });
}

export async function DELETE() {
  await resetPersonality();
  return NextResponse.json({ ok: true });
}
