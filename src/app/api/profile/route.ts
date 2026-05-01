import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserProfile, saveUserProfile } from "@/lib/user-profile";

export const runtime = "nodejs";

// Email accetta stringa valida OPPURE vuota (= clear). Stringa vuota =
// "rimuovi/skip"; non c'è validazione di enum sui campi opzionali (l'UI
// mostra comunque solo le option valide).
const PostSchema = z.object({
  name: z.string().trim().optional(),
  email: z
    .union([z.string().trim().email("Email non valida"), z.literal("")])
    .optional(),
  countries: z.array(z.string().trim().min(1)).optional(),
  city: z.string().trim().max(64).optional(),
  birthDate: z
    .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data invalida"), z.literal("")])
    .optional(),
  familyStatus: z.string().trim().max(20).optional(),
  profession: z.string().trim().max(20).optional(),
  trackingExperience: z.string().trim().max(20).optional(),
  goals: z.array(z.string().trim().min(1).max(20)).optional(),
  monthlyIncome: z.string().trim().max(20).optional(),
  childrenCount: z.string().trim().max(5).optional(),
  retirementAge: z.string().trim().max(20).optional(),
  riskTolerance: z.string().trim().max(20).optional(),
  housingType: z.string().trim().max(30).optional(),
});

export async function GET() {
  const profile = await getUserProfile();
  const completed = !!(
    profile.name && profile.email && profile.countries.length > 0
  );
  return NextResponse.json({ profile, completed });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dati non validi" },
      { status: 400 },
    );
  }
  await saveUserProfile(parsed.data);
  const profile = await getUserProfile();
  return NextResponse.json({ profile });
}
