// Tipos de matriz de materialidad.

export type TopicColor = "rose" | "amber" | "teal" | "slate";
export type TopicSize = "sm" | "md" | "lg";

export type MaterialityTopic = {
  id: string;
  client_id: string;
  service_key: string;
  topic_key: string;
  label: string;
  x_pos: number; // 0-100, materialidad financiera
  y_pos: number; // 0-100, impacto (invertido CSS: 0=top)
  color: TopicColor;
  size: TopicSize;
  section_key: string | null;
  position_index: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MaterialityTopicInput = {
  topic_key: string;
  label: string;
  x_pos: number;
  y_pos: number;
  color: TopicColor;
  size: TopicSize;
  section_key?: string | null;
  position_index?: number;
  notes?: string | null;
};

export const COLOR_META: Record<TopicColor, { label: string; symbol: string; quadrant: string }> = {
  rose: { label: "Doble material", symbol: "●", quadrant: "Alto impacto + alta materialidad financiera" },
  amber: { label: "Material por impacto", symbol: "◆", quadrant: "Alto impacto, baja materialidad financiera" },
  teal: { label: "Material financiero", symbol: "■", quadrant: "Bajo impacto, alta materialidad financiera" },
  slate: { label: "En seguimiento", symbol: "▲", quadrant: "Bajo impacto + baja materialidad financiera" },
};

export function deriveColor(x: number, y: number): TopicColor {
  // x: financiera (0-100), y: impacto (0=arriba/alto impacto, 100=abajo/bajo impacto)
  const highImpact = y < 50;
  const highFinancial = x > 50;
  if (highImpact && highFinancial) return "rose";
  if (highImpact && !highFinancial) return "amber";
  if (!highImpact && highFinancial) return "teal";
  return "slate";
}

// Plantilla default de 20 temas (recuperada del mockup BCG).
export const TEMPLATE_TOPICS: MaterialityTopicInput[] = [
  // Cuadrante doble material (rose)
  { topic_key: "emisiones-ghg", label: "Emisiones GHG", x_pos: 72, y_pos: 15, color: "rose", size: "lg", section_key: "contexto-sostenibilidad" },
  { topic_key: "refrigerantes-hfc", label: "Refrigerantes HFC", x_pos: 80, y_pos: 9, color: "rose", size: "lg", section_key: "regulatorio" },
  { topic_key: "transicion-energetica", label: "Transición energética", x_pos: 63, y_pos: 20, color: "rose", size: "lg", section_key: "contexto-sostenibilidad" },
  { topic_key: "seguridad-alimentaria", label: "Seguridad alimentaria", x_pos: 70, y_pos: 26, color: "rose", size: "md", section_key: "modelo-negocio" },
  { topic_key: "gestion-cadena-frio", label: "Gestión cadena de frío", x_pos: 76, y_pos: 33, color: "rose", size: "md", section_key: "modelo-negocio" },
  // Material por impacto (amber)
  { topic_key: "agua-efluentes", label: "Agua y efluentes", x_pos: 28, y_pos: 18, color: "amber", size: "md", section_key: "contexto-sostenibilidad" },
  { topic_key: "residuos-peligrosos", label: "Residuos peligrosos", x_pos: 38, y_pos: 28, color: "amber", size: "md", section_key: "regulatorio" },
  { topic_key: "biodiversidad", label: "Biodiversidad", x_pos: 22, y_pos: 32, color: "amber", size: "sm", section_key: "contexto-sostenibilidad" },
  { topic_key: "diversidad-inclusion", label: "Diversidad e inclusión", x_pos: 18, y_pos: 42, color: "amber", size: "sm", section_key: "contexto-general" },
  { topic_key: "bienestar-animal", label: "Bienestar animal", x_pos: 14, y_pos: 25, color: "amber", size: "sm", section_key: "modelo-negocio" },
  // Material financiero (teal)
  { topic_key: "salud-seguridad", label: "Salud y seguridad", x_pos: 58, y_pos: 54, color: "teal", size: "md", section_key: "contexto-general" },
  { topic_key: "cadena-suministro", label: "Cadena de suministro", x_pos: 68, y_pos: 60, color: "teal", size: "md", section_key: "modelo-negocio" },
  { topic_key: "acceso-financiamiento", label: "Acceso a financiamiento", x_pos: 82, y_pos: 63, color: "teal", size: "md", section_key: "modelo-negocio" },
  { topic_key: "gobernanza-etica", label: "Gobernanza ética", x_pos: 72, y_pos: 70, color: "teal", size: "sm", section_key: "informacion-base" },
  { topic_key: "practicas-laborales", label: "Prácticas laborales", x_pos: 62, y_pos: 67, color: "teal", size: "sm", section_key: "contexto-general" },
  // En seguimiento (slate)
  { topic_key: "derechos-humanos", label: "Derechos humanos", x_pos: 24, y_pos: 60, color: "slate", size: "sm", section_key: "contexto-general" },
  { topic_key: "reputacion-marca", label: "Reputación y marca", x_pos: 40, y_pos: 74, color: "slate", size: "sm", section_key: "contexto-general" },
  { topic_key: "formacion-desarrollo", label: "Formación y desarrollo", x_pos: 18, y_pos: 70, color: "slate", size: "sm", section_key: "contexto-general" },
  { topic_key: "transparencia-fiscal", label: "Transparencia fiscal", x_pos: 35, y_pos: 65, color: "slate", size: "sm", section_key: "regulatorio" },
  { topic_key: "comunidades-locales", label: "Comunidades locales", x_pos: 14, y_pos: 58, color: "slate", size: "sm", section_key: "contexto-sostenibilidad" },
];
