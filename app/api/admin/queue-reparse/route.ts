import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Tipos de archivo que se benefician de re-parsear con LlamaParse (visión).
// TXT/MD son passthroughs — no necesitan re-parse.
// XLSX usa ExcelJS local — sin mejora con LlamaParse.
const REPARSEABLE_TYPES = ["pdf", "docx", "pptx"];

export async function POST() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!process.env.QSTASH_TOKEN) {
    return NextResponse.json({ error: "QSTASH_TOKEN no configurado" }, { status: 500 });
  }

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.responsable.net";

  // Todos los docs parseables — excluir virtual splits (no tienen archivo en Storage)
  const { data: docs, error } = await admin
    .from("client_documents")
    .select("id, file_name, client_id, file_type, storage_path")
    .in("file_type", REPARSEABLE_TYPES)
    .not("storage_path", "like", "%virtual-split-%");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = (docs ?? []).length;
  if (total === 0) {
    return NextResponse.json({ ok: true, total: 0, queued: 0, failed: 0 });
  }

  const qstash = new Client({ token: process.env.QSTASH_TOKEN });
  const jobUrl = `${appUrl}/api/jobs/reparse-document`;

  let queued = 0;
  const dispatchErrors: { docId: string; fileName: string; error: string }[] = [];

  await Promise.all(
    (docs ?? []).map(async (doc) => {
      try {
        await qstash.publishJSON({
          url: jobUrl,
          body: { docId: doc.id },
          retries: 2,
          headers: process.env.CRON_SECRET
            ? { "x-reparse-secret": process.env.CRON_SECRET }
            : undefined,
        });
        queued++;
      } catch (e) {
        const err = e instanceof Error ? e.message : "dispatch failed";
        dispatchErrors.push({ docId: doc.id as string, fileName: doc.file_name as string, error: err });
        console.error(`[queue-reparse] dispatch failed for ${doc.id}:`, err);
      }
    })
  );

  return NextResponse.json({
    ok: true,
    total,
    queued,
    failed: dispatchErrors.length,
    dispatchErrors,
  });
}
