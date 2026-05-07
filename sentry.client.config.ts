import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // 10% de transacciones — suficiente para detectar tendencias sin agotar cuota
  tracesSampleRate: 0.1,
  // 401/404 son flujos normales, no errores reales
  ignoreErrors: [/40[14]/, /Unauthorized/, /Not Found/],
});
