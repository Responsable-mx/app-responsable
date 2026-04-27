// Skip-link — WCAG 2.4.1
// Oculto hasta recibir foco con Tab (ver .skip-link en globals.css).
// Dejar como primer hijo del <body> para que sea el primer tab-stop.

export function SkipLink({
  targetId = "main-content",
  children = "Saltar al contenido principal",
}: {
  targetId?: string;
  children?: string;
}) {
  return (
    <a href={`#${targetId}`} className="skip-link">
      {children}
    </a>
  );
}
