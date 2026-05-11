import { NextRequest, NextResponse } from "next/server";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Lookup fuzzy igual que en el frontend. */
function lookupVal(
  comparison: Record<string, Record<string, string>>,
  fieldKey: string,
  companyName: string,
): string {
  const fieldMap = comparison[fieldKey] ?? {};
  return (
    fieldMap[companyName] ??
    Object.entries(fieldMap).find(
      ([k]) => companyName.startsWith(k) || k.startsWith(companyName.split(" ")[0]!)
    )?.[1] ??
    ""
  );
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await requireConsultorForClient(id);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();

  const [clientRes, resultRes] = await Promise.all([
    admin.from("clients").select("name").eq("id", id).single(),
    admin
      .from("dm_benchmark_results")
      .select("companies_snapshot, fields_snapshot, comparison, created_at")
      .eq("client_id", id)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  if (clientRes.error || resultRes.error || !clientRes.data || !resultRes.data) {
    return NextResponse.json({ error: "Sin resultados disponibles" }, { status: 404 });
  }

  const clientName = clientRes.data.name;
  const { companies_snapshot, fields_snapshot, comparison } = resultRes.data as {
    companies_snapshot: Array<{ name: string; relation: string }>;
    fields_snapshot: Array<{ key: string; label: string }>;
    comparison: Record<string, Record<string, string>>;
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ResponSable App";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Benchmark ESG");

  // ── Columnas ──────────────────────────────────────────────────
  sheet.columns = [
    { header: "Dimensión ESG", key: "dim", width: 38 },
    { header: `${clientName} (Cliente)`, key: "client", width: 45 },
    ...companies_snapshot.map((c, i) => ({
      header: c.name,
      key: `comp_${i}`,
      width: 45,
    })),
  ];

  // ── Estilo encabezado ─────────────────────────────────────────
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3C4D" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  // Columna cliente con fondo teal claro
  headerRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB2D8D8" } };
  headerRow.getCell(2).font = { bold: true, color: { argb: "FF1A3C4D" }, size: 9 };
  headerRow.height = 28;

  // ── Filas de datos ────────────────────────────────────────────
  fields_snapshot.forEach((field, rowIdx) => {
    const rowData: Record<string, string> = {
      dim: field.label,
      client: lookupVal(comparison, field.key, clientName),
    };
    companies_snapshot.forEach((c, i) => {
      rowData[`comp_${i}`] = lookupVal(comparison, field.key, c.name);
    });

    const row = sheet.addRow(rowData);
    row.height = 72;
    row.alignment = { wrapText: true, vertical: "top" };

    // Zebra
    if (rowIdx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFB" } };
      });
    }
    // Highlight columna cliente
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4F4" } };

    // Primera columna (dimensión) en bold
    row.getCell(1).font = { bold: true, size: 9 };
  });

  // ── Freeze pane + filtro ──────────────────────────────────────
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: { row: 1, column: 1 + companies_snapshot.length + 1 } };

  const buffer = await workbook.xlsx.writeBuffer();

  const safeName = clientName.replace(/[^a-zA-Z0-9\-_]/g, "-");
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="benchmark-${safeName}.xlsx"`,
    },
  });
}
