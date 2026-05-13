import "server-only";

export type FileType = "pdf" | "docx" | "pptx" | "xlsx" | "txt" | "md";

export type ParseResult = {
  markdown: string;
  fileType: FileType;
};

const MIME_TO_TYPE: Record<string, FileType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
  "text/plain": "txt",
  "text/markdown": "md",
};

export function detectFileType(mimeType: string, fileName: string): FileType | null {
  if (MIME_TO_TYPE[mimeType]) return MIME_TO_TYPE[mimeType];
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "pptx" || ext === "ppt") return "pptx";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "txt") return "txt";
  if (ext === "md") return "md";
  return null;
}

export async function parseToMarkdown(buffer: Buffer, fileType: FileType): Promise<string> {
  switch (fileType) {
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "xlsx":
      return parseXlsx(buffer);
    case "pptx":
      return parsePptx(buffer);
    case "txt":
    case "md":
      return buffer.toString("utf-8");
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  // LlamaParse preserva tablas GRI/ESRS multi-columna que pdf-parse aplana.
  // Activo solo si LLAMA_CLOUD_API_KEY está configurada; fallback = pdf-parse.
  if (process.env.LLAMA_CLOUD_API_KEY) {
    try {
      const md = await parsePdfWithLlamaParse(buffer);
      if (md && md.length > 200) return cleanText(md);
    } catch (e) {
      console.error("[parsers] LlamaParse failed, falling back to pdf-parse:", e);
    }
  }
  // Fallback: importar desde /lib directamente — el entry point de pdf-parse carga archivos
  // de test que no existen en producción (ENOENT ./test/data/05-versions-space.pdf).
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const result = await pdfParse(buffer);
  return cleanText(result.text);
}

/**
 * Parseo de PDF con LlamaParse (LlamaIndex Cloud).
 * Preserva tablas, columnas y layouts complejos de informes ESG/GRI.
 * Flujo async: upload → poll hasta done → retornar markdown.
 * Timeout 120s — informes ESG de 100+ páginas suelen tardar 30-60s.
 */
async function parsePdfWithLlamaParse(buffer: Buffer): Promise<string | null> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY!;
  const BASE = "https://api.cloud.llamaindex.ai/api/parsing";

  // 1. Upload del PDF
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
  formData.append("file", blob, "document.pdf");

  const uploadRes = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`LlamaParse upload failed ${uploadRes.status}: ${err.slice(0, 200)}`);
  }

  const { id: jobId } = (await uploadRes.json()) as { id: string };

  // 2. Poll hasta status=SUCCESS (timeout 120s)
  const POLL_INTERVAL = 4_000;
  const MAX_POLLS = 30; // 30 × 4s = 120s
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const statusRes = await fetch(`${BASE}/job/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!statusRes.ok) continue;
    const { status } = (await statusRes.json()) as { status: string };
    if (status === "SUCCESS") {
      // 3. Obtener resultado en markdown
      const mdRes = await fetch(`${BASE}/job/${jobId}/result/markdown`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!mdRes.ok) throw new Error(`LlamaParse result fetch failed ${mdRes.status}`);
      const { markdown } = (await mdRes.json()) as { markdown: string };
      return markdown ?? null;
    }
    if (status === "ERROR") throw new Error("LlamaParse job returned ERROR status");
  }
  throw new Error("LlamaParse timeout after 120s");
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  // Mammoth no tiene markdown nativo — convertimos a HTML y luego strip básico
  const result = await mammoth.convertToHtml({ buffer });
  return cleanText(htmlToMarkdownLite(result.value));
}

async function parseXlsx(buffer: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  // exceljs types quieren ArrayBuffer; Buffer.buffer es el ArrayBuffer subyacente del Uint8Array
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await wb.xlsx.load(arrayBuffer as ArrayBuffer);
  const out: string[] = [];
  wb.eachSheet((sheet) => {
    out.push(`## Hoja: ${sheet.name}\n`);
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return "";
        if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text ?? "");
        if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result ?? "");
        return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
      });
      rows.push(values);
    });
    if (rows.length === 0) return;
    const cols = Math.max(...rows.map((r) => r.length));
    const header = rows[0]!;
    const headerRow = Array.from({ length: cols }, (_, i) => header[i] ?? `Col${i + 1}`);
    out.push("| " + headerRow.join(" | ") + " |");
    out.push("| " + headerRow.map(() => "---").join(" | ") + " |");
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]!;
      const padded = Array.from({ length: cols }, (_, j) => r[j] ?? "");
      out.push("| " + padded.join(" | ") + " |");
    }
    out.push("");
  });
  return cleanText(out.join("\n"));
}

async function parsePptx(buffer: Buffer): Promise<string> {
  // PPTX = ZIP con ppt/slides/slideN.xml. Extraemos texto de cada slide.
  // Usamos JSZip que ya viene como dep transitiva de mammoth/exceljs.
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const slides: { idx: number; text: string }[] = [];
  const slidePaths = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p));
  slidePaths.sort((a, b) => {
    const na = parseInt(a.match(/slide(\d+)\.xml$/i)?.[1] ?? "0", 10);
    const nb = parseInt(b.match(/slide(\d+)\.xml$/i)?.[1] ?? "0", 10);
    return na - nb;
  });
  for (const path of slidePaths) {
    const xml = await zip.files[path]!.async("string");
    const idx = parseInt(path.match(/slide(\d+)\.xml$/i)?.[1] ?? "0", 10);
    // Match texto entre <a:t>...</a:t>
    const matches = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) ?? [];
    const text = matches
      .map((m) => m.replace(/<a:t[^>]*>([\s\S]*?)<\/a:t>/, "$1"))
      .map(decodeXmlEntities)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) slides.push({ idx, text });
  }
  const md = slides.map((s) => `## Slide ${s.idx}\n\n${s.text}\n`).join("\n");
  return cleanText(md);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function cleanText(s: string): string {
  // Normaliza saltos múltiples y trim
  return s.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Conversión HTML→Markdown ligera: solo headings/listas/párrafos/links/bold/italic
function htmlToMarkdownLite(html: string): string {
  let s = html;
  s = s.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n");
  s = s.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n");
  s = s.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n");
  s = s.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n");
  s = s.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  s = s.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  s = s.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  s = s.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  s = s.replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  s = s.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, ""); // strip resto
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  return s;
}

const MAX_MARKDOWN_CHARS = 200_000; // ~50k tokens — tope para no inflar prompts

export function truncateMarkdown(md: string): string {
  if (md.length <= MAX_MARKDOWN_CHARS) return md;
  return md.slice(0, MAX_MARKDOWN_CHARS) + "\n\n[…contenido truncado a 200k caracteres]";
}
