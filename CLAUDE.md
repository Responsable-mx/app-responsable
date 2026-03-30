# App ResponSable

Sistema conversacional con IA y cadena de calidad por roles para consultoría ESG.

## Descripcion

App web interna para el equipo de consultoría de ResponSable. Cuatro asistentes IA especializados (Aurora, Rebeca, Elena, Valeria) que operan como cadena de calidad escalonada sobre entregables de consultoría, empezando por Estudios de Doble Materialidad.

## Usuarios finales

- Internos: 8 consultores (MVP), expandible a ~20 (marketing, talento)
- Futuros: clientes corporativos (post-piloto)

## Roles IA (cadena de calidad)

| Rol | Nombre | Funcion |
|-----|--------|---------|
| Autor | Aurora | Construye borrador alineado a metodologia y estandares internos |
| Revisor | Rebeca | Detecta fallas, omisiones, riesgos. Checklist y rubrica |
| Elevador | Elena | Insights, trade-offs, narrativa, recomendaciones estrategicas |
| Validador | Valeria | Verifica Definition of Done, consistencia, evidencia, trazabilidad |

Flujo: secuencial sugerido (Aurora -> Rebeca -> Elena -> Valeria), no obligatorio.

## Stack

- Stack base: ver `~/.claude/STACK_BASE.md`
- Diferencias con base: ver `STACK.md`

## Piloto

- Entregable: Estudio de Doble Materialidad
- Usuarios piloto: equipo de consultoria (8 personas)

## MVP

1. Chat con 4 roles IA (Aurora/Rebeca/Elena/Valeria) con flujo secuencial sugerido
