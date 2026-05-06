import { describe, it, expect } from "vitest";
import { parseToMarkdown } from "@/lib/documents/parsers";

// Tests de integración con archivos sintéticos generados en runtime.
// Verifican que los parsers reales funcionan, no solo los mocks de TXT/MD.

describe("parseToMarkdown - DOCX integración", () => {
  it("extrae texto de DOCX válido generado en runtime", async () => {
    // Genera un DOCX mínimo via JSZip (mismo enfoque que pptx parser)
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    zip.folder("word")?.file("document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hola desde DOCX</w:t></w:r></w:p>
    <w:p><w:r><w:t>Segundo párrafo de prueba</w:t></w:r></w:p>
  </w:body>
</w:document>`);

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const md = await parseToMarkdown(buffer, "docx");

    expect(md).toContain("Hola desde DOCX");
    expect(md).toContain("Segundo párrafo");
  });
});

describe("parseToMarkdown - XLSX integración", () => {
  it("extrae tabla markdown de XLSX válido", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Datos");
    sheet.addRow(["Empresa", "Sector", "Ingresos MXN"]);
    sheet.addRow(["Heineken", "Bebidas", 80_000_000_000]);
    sheet.addRow(["Cemex", "Construcción", 250_000_000_000]);

    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const md = await parseToMarkdown(Buffer.from(buffer), "xlsx");

    expect(md).toContain("## Hoja: Datos");
    expect(md).toContain("Empresa");
    expect(md).toContain("Heineken");
    expect(md).toContain("Cemex");
    // Verifica formato markdown table (con pipes)
    expect(md).toMatch(/\|.*Empresa.*\|/);
    expect(md).toMatch(/\| --- \|/);
  });

  it("escapa pipes en celdas para no romper tabla markdown", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Test");
    sheet.addRow(["Col1", "Col2"]);
    sheet.addRow(["valor con | pipe", "normal"]);

    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const md = await parseToMarkdown(Buffer.from(buffer), "xlsx");

    expect(md).toContain("valor con \\| pipe");
  });
});

describe("parseToMarkdown - PPTX integración", () => {
  it("extrae texto de PPTX con 2 slides", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`);

    zip.folder("ppt")?.folder("slides")?.file("slide1.xml", `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>Título Slide 1</a:t></a:r></a:p>
      <a:p><a:r><a:t>Bullet point uno</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`);

    zip.folder("ppt")?.folder("slides")?.file("slide2.xml", `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:t>Slide dos contenido</a:t></a:r></a:p>
    </p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`);

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const md = await parseToMarkdown(buffer, "pptx");

    expect(md).toContain("## Slide 1");
    expect(md).toContain("Título Slide 1");
    expect(md).toContain("Bullet point uno");
    expect(md).toContain("## Slide 2");
    expect(md).toContain("Slide dos contenido");
  });

  it("decodifica entities XML correctamente", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<x/>");
    zip.folder("ppt")?.folder("slides")?.file("slide1.xml", `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><a:p><a:r><a:t>caf&#233; &amp; pan</a:t></a:r></a:p></p:cSld>
</p:sld>`);

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const md = await parseToMarkdown(buffer, "pptx");

    expect(md).toContain("&");
    expect(md).not.toContain("&amp;");
  });

  it("retorna vacío si no hay slides", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<x/>");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const md = await parseToMarkdown(buffer, "pptx");
    expect(md).toBe("");
  });
});

describe("parseToMarkdown - tope de tamaño", () => {
  it("XLSX con muchas filas no truncado por parser (truncate aparte)", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Big");
    sheet.addRow(["A", "B"]);
    for (let i = 0; i < 100; i++) {
      sheet.addRow([`row${i}`, `val${i}`]);
    }
    const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const md = await parseToMarkdown(Buffer.from(buffer), "xlsx");
    expect(md).toContain("row0");
    expect(md).toContain("row99");
  });
});
