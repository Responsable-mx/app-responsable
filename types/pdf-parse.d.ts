// pdf-parse subpath — el entry point principal carga archivos de test que no
// existen en producción (ENOENT). Importamos desde /lib directamente; este
// stub satisface a TypeScript sin necesitar @types/pdf-parse para el subpath.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfData {
    text: string;
    numpages: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    version: string;
  }
  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfData>;
  export default pdfParse;
}
