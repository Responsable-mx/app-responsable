import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { labelPromptVersion, type PromptKey } from "@/lib/ai/prompts";
import {
  PromptKeySchema,
  PromptVersionLabelSchema,
} from "@/lib/validation";

type Ctx = { params: Promise<{ key: string; versionId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { key: raw, versionId } = await params;
  const keyParsed = PromptKeySchema.safeParse(decodeURIComponent(raw));
  if (!keyParsed.success) {
    return NextResponse.json({ error: "key inválida" }, { status: 400 });
  }
  // consumimos key para validar que la ruta es coherente, aunque el label
  // solo necesita versionId.
  void (keyParsed.data as PromptKey);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PromptVersionLabelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }
  try {
    await labelPromptVersion(versionId, parsed.data.label);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[PATCH version label]", e);
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
