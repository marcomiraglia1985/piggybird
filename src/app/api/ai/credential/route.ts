import { NextRequest, NextResponse } from "next/server";
import {
  deleteAnthropicCredential,
  hasAnthropicCredential,
  saveAnthropicCredential,
  testAnthropicCredential,
} from "@/lib/claude-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const cred = await prisma.apiCredential.findUnique({
    where: { provider: "anthropic" },
    select: { hint: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({
    configured: cred != null,
    hint: cred?.hint ?? null,
    updatedAt: cred?.updatedAt ?? null,
  });
}

/**
 * POST: salva (o aggiorna) la API key Anthropic.
 * Body: { apiKey: string }
 * Validazione: chiamata di test prima di salvare. Se la key non funziona,
 * NON la salviamo (errore 400).
 */
export async function POST(req: NextRequest) {
  let body: { apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalido" }, { status: 400 });
  }
  const apiKey = (body.apiKey ?? "").trim();
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return NextResponse.json(
      { error: "API key invalida (deve iniziare con 'sk-')" },
      { status: 400 },
    );
  }

  const test = await testAnthropicCredential(apiKey);
  if (!test.ok) {
    return NextResponse.json(
      { error: test.error ?? "Test API key fallito" },
      { status: 400 },
    );
  }

  await saveAnthropicCredential(apiKey);
  const configured = await hasAnthropicCredential();
  return NextResponse.json({ ok: true, configured });
}

export async function DELETE() {
  await deleteAnthropicCredential();
  return NextResponse.json({ ok: true });
}
