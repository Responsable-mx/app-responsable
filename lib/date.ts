// Fechas ancladas a la zona horaria de operación (México), no al UTC del
// servidor. El servidor Vercel corre en UTC; sin esto, entre las 18:00 y 23:59
// de CDMX el "hoy" del servidor ya es el día siguiente → actividades marcadas
// "vencidas" hasta 6h antes de tiempo y correos de alerta con la fecha corrida.

const MX_TZ = "America/Mexico_City";

/** Fecha de HOY en México como `YYYY-MM-DD` (en-CA emite formato ISO). */
export function hoyEnMexico(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: MX_TZ });
}
