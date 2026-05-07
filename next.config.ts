import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  compress: true,
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
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src * data: blob:; connect-src 'self' *.supabase.co wss://*.supabase.co *.ingest.sentry.io *.ingest.us.sentry.io; font-src 'self'; frame-src 'none'; object-src 'none';" },
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
  // Source maps deshabilitados — activar con SENTRY_AUTH_TOKEN cuando se requiera
  sourcemaps: { disable: true },
  disableLogger: true,
  // No crear cron monitors automáticos en Vercel
  automaticVercelMonitors: false,
});
