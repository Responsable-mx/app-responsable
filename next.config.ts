import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  compress: true,
  // Excluir libs pesadas de parseo del bundle Next.js — se cargan desde node_modules
  // en runtime (cold start solo cuando se invoca la ruta de documentos, no siempre).
  // pdf-parse: ~1.5MB; exceljs: ~3MB; mammoth: ~1MB; jszip: ~0.3MB
  serverExternalPackages: ["pdf-parse", "exceljs", "mammoth", "jszip"],
  experimental: {
    optimizePackageImports: ["swr", "zod"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // connect-src incluye Sentry ingest para captura de errores
          // D-129: 'unsafe-eval' eliminado — habilitaba eval-based XSS en prod.
          // 'unsafe-inline' necesario para Next.js inline scripts (App Router).
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src * data: blob:; connect-src 'self' *.supabase.co wss://*.supabase.co *.ingest.sentry.io *.ingest.us.sentry.io; font-src 'self'; frame-src 'none'; object-src 'none';" },
        ],
      },
      {
        source: "/(.*)\\.(png|jpg|jpeg|svg|ico|woff2)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Source maps: activos solo si SENTRY_AUTH_TOKEN está en env — sin token,
  // el plugin falla silenciosamente. Agregar la var en Vercel activa esto solo.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
  // No crear cron monitors automáticos en Vercel
  automaticVercelMonitors: false,
});
