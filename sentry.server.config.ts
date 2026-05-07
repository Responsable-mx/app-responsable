import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NODE_ENV,
  // Commit SHA → correlaciona errores de servidor con el deploy exacto.
  // VERCEL_GIT_COMMIT_SHA lo inyecta Vercel en el runtime de servidor.
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  ignoreErrors: [/40[14]/, /Unauthorized/, /Not Found/],
});
