import { NextRequest, NextResponse } from "next/server";
import { saveCredential, getCredentialStatus, deleteCredential } from "@/lib/credentials";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const status = await getCredentialStatus("revolut-x");
  return NextResponse.json({ connected: !!status, status });
}

const PostSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, "API Key troppo corta (la chiave Revolut X è di 64 caratteri)"),
  privateKeyPem: z
    .string()
    .trim()
    .refine(
      (s) =>
        s.includes("-----BEGIN PRIVATE KEY-----") &&
        s.includes("-----END PRIVATE KEY-----"),
      "Private key non valida: deve essere in formato PEM (-----BEGIN PRIVATE KEY-----…)",
    ),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON non valido" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => i.message).join(", ");
    return NextResponse.json({ error: issues || "Credenziali non valide" }, { status: 400 });
  }
  await saveCredential("revolut-x", parsed.data.apiKey, parsed.data.privateKeyPem);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await deleteCredential("revolut-x");
  return NextResponse.json({ ok: true });
}
