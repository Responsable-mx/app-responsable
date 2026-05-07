import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { requireConsultorForClient } from "@/lib/auth";
import { getClient } from "@/lib/clients";
import { createAdminClient } from "@/lib/supabase/admin";
import { DmReportDocument, type DmReportData } from "@/lib/pdf/dm-report";
import { BENCHMARK_FIELDS } from "@/lib/dm/fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const resultId = req.nextUrl.searchParams.get("result_id");
  if (!resultId) return NextResponse.json({ error: "result_id requerido" }, { status: 400 });

  const client = await getClient(id).catch(() => null);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const admin = createAdminClient();
  const { data: result, error } = await admin
    .from("dm_benchmark_results")
    .select("*")
    .eq("id", resultId)
    .eq("client_id", id)
    .eq("status", "done")
    .single();

  if (error || !result) {
    return NextResponse.json({ error: "Resultado de benchmark no encontrado" }, { status: 404 });
  }

  // También buscar la narrativa del reporte (si ya fue generada)
  const { data: reportDoc } = await admin
    .from("client_documents")
    .select("markdown_content")
    .eq("client_id", id)
    .eq("kind", "dm_report")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Construir narrativa desde el markdown guardado o usar datos del benchmark
  // Si no hay reporte generado, el PDF solo incluirá el benchmark
  const companies = (result.companies_snapshot as Array<{ name: string; country: string | null; relation: string }>) ?? [];

  // Narrativa básica si no hay reporte IA generado aún
  const defaultNarrative: DmReportData["narrative"] = {
    executive_summary: reportDoc?.markdown_content
      ? extractSection(reportDoc.markdown_content, "Resumen Ejecutivo")
      : `Este reporte presenta el análisis de Doble Materialidad para ${client.name} basado en el benchmark con ${companies.length} empresas de referencia. Genera el reporte con IA para obtener análisis narrativo completo.`,
    client_position: result.narrative ?? "Ejecuta el análisis de reporte IA para obtener el posicionamiento detallado.",
    risks: [],
    strengths: ["Ver análisis detallado en el reporte IA"],
    improvement_areas: ["Genera el reporte con IA para obtener áreas de mejora específicas"],
    recommendations: [{ action: "Generar reporte completo con IA desde el tab de Doble Materialidad", priority: "inmediata" }],
  };

  const reportData: DmReportData = {
    client,
    narrative: defaultNarrative,
    companies,
    fields: BENCHMARK_FIELDS,
    comparison: (result.comparison as Record<string, Record<string, string>>) ?? {},
    generatedAt: new Date().toLocaleDateString("es-MX", {
      year: "numeric", month: "long", day: "numeric",
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(React.createElement(DmReportDocument, { data: reportData }) as any);

  const fileName = `reporte-dm-${client.name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

function extractSection(markdown: string, sectionTitle: string): string {
  const regex = new RegExp(`## ${sectionTitle}\\s*\\n([\\s\\S]*?)(?=\\n---|\n##|$)`, "i");
  const match = markdown.match(regex);
  return match?.[1]?.trim() ?? "";
}
