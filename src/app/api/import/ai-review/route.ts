import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reviewImportRows } from "@/lib/ai/import-review";

export const runtime = "nodejs";

const RowSchema = z.object({
  idx: z.string(),
  date: z.string(),
  amount: z.number(),
  description: z.string(),
  notes: z.string().nullable(),
  accountName: z.string(),
  currentCategoryEmoji: z.string().nullable(),
});

const CategorySchema = z.object({
  id: z.string(),
  emoji: z.string(),
  name: z.string(),
  type: z.string(),
});

const BodySchema = z.object({
  rows: z.array(RowSchema).max(500),
  categories: z.array(CategorySchema),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const result = await reviewImportRows(parsed.data.rows, parsed.data.categories);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore AI review";
    const status = msg.startsWith("Limite chiamate AI") ? 429 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
