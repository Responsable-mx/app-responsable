import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { restorePromptVersion, type PromptKey } from "@/lib/ai/prompts";
import { PromptKeySchema } from "@/lib/validation";

type Ctx = { params: Promise<{ key: string; versionId: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
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
  try {
    await restorePromptVersion(keyParsed.data as PromptKey, versionId, admin);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST restore]", e);
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
