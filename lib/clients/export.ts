type ExportRow = {
  name: string;
  sector?: string | null;
  size?: string | null;
  countries?: string[] | null;
  frameworks?: string[] | null;
  certifications?: string[] | null;
  updated_at: string;
};

export function exportClientsCsv(rows: ExportRow[]) {
  const headers = [
    "Nombre",
    "Sector",
    "Tamaño",
    "Países",
    "Frameworks",
    "Certificaciones",
    "Actualizado",
  ];
  const escape = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines = [headers.join(",")];
  for (const c of rows) {
    lines.push(
      [
        escape(c.name),
        escape(c.sector ?? ""),
        escape(c.size ?? ""),
        escape((c.countries ?? []).join("; ")),
        escape((c.frameworks ?? []).join("; ")),
        escape((c.certifications ?? []).join("; ")),
        new Date(c.updated_at).toISOString().slice(0, 10),
      ].join(",")
    );
  }
  const csv = "﻿" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `clientes-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
