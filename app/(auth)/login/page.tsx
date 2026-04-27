"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Step = "email" | "otp";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setStep("otp");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      router.push(data.redirect || "/chat");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-primary-hover text-white font-bold text-2xl mb-3">
            R
          </div>
          <h1 className="text-xl font-bold text-slate-900">App ResponSable</h1>
          <p className="text-slate-600 text-sm mt-1">
            Consultoría en sostenibilidad con cadena de calidad IA
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
          {step === "email" && (
            <form onSubmit={handleSendOtp}>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Iniciar sesión
              </h2>
              <p className="text-sm text-slate-600 mb-6">
                Te enviamos un código a tu correo
              </p>

              <Input
                id="email-input"
                label="Correo electrónico"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoFocus
                error={error || undefined}
              />

              <Button
                type="submit"
                size="lg"
                loading={submitting}
                className="w-full mt-4"
              >
                Enviar código
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp}>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Verificar código
              </h2>
              <p className="text-sm text-slate-600 mb-6">
                Ingresa el código enviado a <strong>{email}</strong>
              </p>

              <label
                htmlFor="otp-input"
                className="block text-sm font-medium text-slate-700 mb-1"
              >
                Código de verificación
              </label>
              <input
                id="otp-input"
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                required
                autoFocus
                maxLength={6}
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? "otp-error" : undefined}
                className={`w-full px-3 py-2 border rounded-lg text-sm text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent ${error ? "border-brand-berry" : "border-stone-300"}`}
              />

              {error && (
                <p
                  id="otp-error"
                  role="alert"
                  className="text-xs text-brand-berry font-medium mt-1"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                loading={submitting}
                className="w-full mt-4"
              >
                Verificar
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                  setError("");
                }}
                disabled={submitting}
                className="w-full mt-2"
              >
                Cambiar correo
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Acceso restringido — solo consultores autorizados
        </p>
      </div>
    </div>
  );
}
