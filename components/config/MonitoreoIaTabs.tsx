"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";

type Tab = "salud" | "metricas";

export function MonitoreoIaTabs({
  salud,
  metricas,
}: {
  salud: ReactNode;
  metricas: ReactNode;
}) {
  const [active, setActive] = useState<Tab>("salud");

  // Leer tab inicial desde URL (ej. ?tab=metricas)
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "metricas") setActive("metricas");
  }, []);

  const switchTab = (tab: Tab) => {
    setActive(tab);
    const url = new URL(window.location.href);
    if (tab === "salud") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState({}, "", url.toString());
  };

  return (
    <div>
      {/* Barra de tabs */}
      <div className="flex items-center border-b border-slate-200 bg-white sticky top-0 z-10 px-8">
        <TabBtn
          label="Salud y decisiones"
          active={active === "salud"}
          onClick={() => switchTab("salud")}
        />
        <TabBtn
          label="Métricas detalladas"
          active={active === "metricas"}
          onClick={() => switchTab("metricas")}
        />
      </div>

      {/* Contenido — server-rendered, visibilidad vía CSS */}
      <div className={active !== "salud" ? "hidden" : ""}>{salud}</div>
      <div className={active !== "metricas" ? "hidden" : ""}>{metricas}</div>
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-brand-primary text-brand-primary"
          : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}
