import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listPromptVersions, type PromptKey } from "@/lib/ai/prompts";
import { PromptKeySchema } from "@/lib/validation";

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Requiere permisos de administrador." },
      { status: 403 }
    );
  }
  const { key: raw } = await params;
  const parsed = PromptKeySchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) {
    return NextResponse.json({ error: "key inválida" }, { status: 400 });
  }
  try {
    const data = await listPromptVersions(parsed.data as PromptKey);
    return NextResponse.json({ data });
  } catch (e) {
    console.error("[GET versions]", e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
