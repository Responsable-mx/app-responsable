import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireConsultorForClient } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Clasificación ESG inline (lib/dm/esg-classify.ts no existe aún) ──────────

const E_KEYWORDS = [
  "emisi", "ghg", "carbono", "co2", "agua", "hidric", "biodiversidad", "ecosistem",
  "circular", "residuo", "reciclaj", "energ", "contaminac", "suelo", "deforest",
  "bosque", "clima",
];
const S_KEYWORDS = [
  "laboral", "trabajo", "trabajador", "emplead", "comunidad", "consumidor",
  "derechos human", "diversidad", "inclusión", "salud", "seguridad", "acceso",
  "indígena", "género",
];
const G_KEYWORDS = [
  "gobierno", "gobernanza", "corrupción", "ética", "transparencia",
  "consejo", "remuneración", "impuesto", "compliance", "anticorrupción", "lobby",
];

function classifyEsgServer(tema: string): "E" | "S" | "G" {
  const lower = tema.toLowerCase();
  const score = (kw: string[]) => kw.filter((k) => lower.includes(k)).length;
  const e = score(E_KEYWORDS), s = score(S_KEYWORDS), g = score(G_KEYWORDS);
  if (e > s && e > g) return "E";
  if (s > e && s > g) return "S";
  if (g > e && g > s) return "G";
  return "E"; // default ambiental
}

// ── Tipos locales ─────────────────────────────────────────────────────────────

type IroRow = {
  n_iro: number;
  tema_esg: string;
  descripcion: string;
  tipo: string;
  cadena: string;
  horizonte: string;
  evidencia: string | null;
  confianza: string;
  score_impacto: number | null;
  score_financiero: number | null;
  incluido: boolean;
};

type EsgBucket = {
  total: number;
  incluidos: number;
  scoreMax: number;
  altaPrioridad: number;
};

type Ctx = { params: Promise<{ id: string }> };

// ── GET — genera y devuelve el XLSX ──────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  // 1. Autenticación
  const user = await requireConsultorForClient(id);
  if (!user) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Validar UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return new Response(JSON.stringify({ error: "ID de cliente inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createAdminClient();

  // 3. Query IROs + cliente en paralelo
  const [irosRes, clientRes] = await Promise.all([
    admin
      .from("client_iro_inventory")
      .select(
        "n_iro, tema_esg, descripcion, tipo, cadena, horizonte, evidencia, confianza, score_impacto, score_financiero, incluido"
      )
      .eq("client_id", id)
      .order("n_iro", { ascending: true }),
    admin
      .from("clients")
      .select("name")
      .eq("id", id)
      .single(),
  ]);

  if (clientRes.error || !clientRes.data) {
    return new Response(JSON.stringify({ error: "Cliente no encontrado" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clientName = clientRes.data.name as string;
  const iros = (irosRes.data ?? []) as IroRow[];

  // 4. Construir XLSX con ExcelJS
  const wb = new ExcelJS.Workbook();
  wb.creator = "ResponSable — app.responsable.net";
  wb.created = new Date();

  // ── Sheet 1: Inventario IROs ──────────────────────────────────────────────
  const ws1 = wb.addWorksheet("Inventario IROs");

  const HEADER_FILL: ExcelJS.FillPattern = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFCCCCCC" },
  };
  const ZEBRA_FILL: ExcelJS.FillPattern = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFAFAFA" },
  };

  // Definir columnas con anchos
  ws1.columns = [
    { key: "n_iro",        width: 5  },
    { key: "tema_esg",     width: 25 },
    { key: "descripcion",  width: 50 },
    { key: "tipo",         width: 15 },
    { key: "cadena",       width: 15 },
    { key: "horizonte",    width: 15 },
    { key: "evidencia",    width: 15 },
    { key: "confianza",    width: 15 },
    { key: "dim1",         width: 15 },
    { key: "dim2",         width: 15 },
    { key: "score_max",    width: 15 },
    { key: "prioridad",    width: 15 },
    { key: "incluido",     width: 15 },
  ];

  // Fila de encabezados
  const headerRow = ws1.addRow([
    "#",
    "Tema ESG",
    "Descripción",
    "Tipo",
    "Cadena",
    "Horizonte",
    "Evidencia",
    "Confianza",
    "Dim.1 (Impacto)",
    "Dim.2 (Financiero)",
    "Score Max",
    "Prioridad",
    "Incluido",
  ]);

  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });

  // Freeze fila 1
  ws1.views = [{ state: "frozen", ySplit: 1 }];

  // AutoFilter en fila 1
  ws1.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: 13 },
  };

  // Filas de datos
  iros.forEach((iro, idx) => {
    // Score Max
    const siImpacto    = iro.score_impacto    !== null && iro.score_impacto    !== undefined;
    const siFinanciero = iro.score_financiero  !== null && iro.score_financiero !== undefined;
    const scoreMax     = siImpacto || siFinanciero
      ? Math.max(iro.score_impacto ?? 0, iro.score_financiero ?? 0)
      : "";

    // Prioridad
    let prioridad = "";
    if (siImpacto && siFinanciero) {
      const suma = (iro.score_impacto ?? 0) + (iro.score_financiero ?? 0);
      if (suma >= 5)      prioridad = "Alta";
      else if (suma >= 3) prioridad = "Media";
      else                prioridad = "Baja";
    }

    const dataRow = ws1.addRow([
      iro.n_iro,
      iro.tema_esg,
      iro.descripcion,
      iro.tipo,
      iro.cadena,
      iro.horizonte,
      iro.evidencia ?? "",
      iro.confianza,
      iro.score_impacto  ?? "",
      iro.score_financiero ?? "",
      scoreMax,
      prioridad,
      iro.incluido ? "Sí" : "No",
    ]);

    // Zebra: filas pares (idx 0-based → fila 2 es par visualmente)
    if ((idx + 1) % 2 === 0) {
      dataRow.eachCell((cell) => {
        cell.fill = ZEBRA_FILL;
      });
    }
  });

  // ── Sheet 2: Resumen E-S-G ────────────────────────────────────────────────
  const ws2 = wb.addWorksheet("Resumen E-S-G");

  ws2.columns = [
    { key: "categoria",      width: 20 },
    { key: "total",          width: 15 },
    { key: "incluidos",      width: 15 },
    { key: "score_max",      width: 15 },
    { key: "alta_prioridad", width: 18 },
  ];

  const headerRow2 = ws2.addRow([
    "Categoría",
    "Total IROs",
    "Incluidos",
    "Score Max",
    "Alta Prioridad",
  ]);
  headerRow2.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });

  // Agregar IROs por categoría ESG
  const buckets: Record<"E" | "S" | "G", EsgBucket> = {
    E: { total: 0, incluidos: 0, scoreMax: 0, altaPrioridad: 0 },
    S: { total: 0, incluidos: 0, scoreMax: 0, altaPrioridad: 0 },
    G: { total: 0, incluidos: 0, scoreMax: 0, altaPrioridad: 0 },
  };

  iros.forEach((iro) => {
    const cat = classifyEsgServer(iro.tema_esg);
    const bucket = buckets[cat];
    bucket.total++;
    if (iro.incluido) bucket.incluidos++;

    const siImpacto    = iro.score_impacto    !== null && iro.score_impacto    !== undefined;
    const siFinanciero = iro.score_financiero  !== null && iro.score_financiero !== undefined;
    if (siImpacto || siFinanciero) {
      const sm = Math.max(iro.score_impacto ?? 0, iro.score_financiero ?? 0);
      if (sm > bucket.scoreMax) bucket.scoreMax = sm;
    }
    if (siImpacto && siFinanciero) {
      const suma = (iro.score_impacto ?? 0) + (iro.score_financiero ?? 0);
      if (suma >= 5) bucket.altaPrioridad++;
    }
  });

  const LABELS: Array<["E" | "S" | "G", string]> = [
    ["E", "E — Ambiental"],
    ["S", "S — Social"],
    ["G", "G — Gobernanza"],
  ];

  let totTotal = 0, totIncluidos = 0, totAlta = 0;
  LABELS.forEach(([key, label], idx) => {
    const b = buckets[key];
    totTotal     += b.total;
    totIncluidos += b.incluidos;
    totAlta      += b.altaPrioridad;

    const dataRow = ws2.addRow([
      label,
      b.total,
      b.incluidos,
      b.scoreMax > 0 ? b.scoreMax : "",
      b.altaPrioridad,
    ]);

    if ((idx + 1) % 2 === 0) {
      dataRow.eachCell((cell) => {
        cell.fill = ZEBRA_FILL;
      });
    }
  });

  // Fila totales en bold
  const totalsRow = ws2.addRow([
    "Totales",
    totTotal,
    totIncluidos,
    "",
    totAlta,
  ]);
  totalsRow.eachCell((cell) => {
    cell.font = { bold: true };
  });

  // 5. Serializar a buffer
  const buffer = await wb.xlsx.writeBuffer();

  // 6. Respuesta con headers de descarga
  const safeClientName = clientName.replace(/[^a-zA-Z0-9]/g, "-");
  const dateStr = new Date().toISOString().slice(0, 10);

  return new Response(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="IROs-${safeClientName}-${dateStr}.xlsx"`,
    },
  });
}
