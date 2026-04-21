"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "email" | "otp" | "loading";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStep("loading");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setStep("email");
        return;
      }
      setStep("otp");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setStep("email");
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStep("loading");
    try {
      const res = await fetch("/api/auth/login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setStep("otp");
        return;
      }
      router.push(data.redirect || "/chat");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setStep("otp");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-700 text-white font-bold text-2xl mb-3">
            R
          </div>
          <h1 className="text-xl font-bold text-slate-900">App ResponSable</h1>
          <p className="text-slate-500 text-sm mt-1">
            Consultoría ESG con cadena de calidad IA
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6">
          {step === "email" && (
            <form onSubmit={handleSendOtp}>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Iniciar sesión
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Te enviamos un código a tu correo
              </p>

              <label
                htmlFor="email-input"
                className="block text-sm font-medium text-slate-900 mb-1"
              >
                Correo electrónico
              </label>
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoFocus
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent placeholder:text-slate-400"
              />

              {error && (
                <p role="alert" className="text-sm text-red-600 mt-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="w-full mt-4 py-2.5 bg-teal-700 text-white rounded-lg font-medium text-sm hover:bg-teal-800 transition-colors"
              >
                Enviar código
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp}>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Verificar código
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Ingresa el código enviado a <strong>{email}</strong>
              </p>

              <label
                htmlFor="otp-input"
                className="block text-sm font-medium text-slate-900 mb-1"
              >
                Código de verificación
              </label>
              <input
                id="otp-input"
                type="text"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                required
                autoFocus
                maxLength={6}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent"
              />

              {error && (
                <p role="alert" className="text-sm text-red-600 mt-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="w-full mt-4 py-2.5 bg-teal-700 text-white rounded-lg font-medium text-sm hover:bg-teal-800 transition-colors"
              >
                Verificar
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                  setError("");
                }}
                className="w-full mt-2 py-2 text-slate-500 text-sm hover:text-slate-900 transition-colors"
              >
                Cambiar correo
              </button>
            </form>
          )}

          {step === "loading" && (
            <div className="py-8 text-center">
              <div className="inline-block w-8 h-8 border-2 border-teal-700 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500 mt-4">Procesando...</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Acceso restringido — solo consultores autorizados
        </p>
      </div>
    </div>
  );
}
