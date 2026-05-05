import { TeamOccupancy } from "@/components/config/TeamOccupancy";

export const dynamic = "force-dynamic";

export default function EquipoPage() {
  return (
    <div className="px-8 py-6 max-w-5xl mx-auto">
      <p className="text-sm text-slate-600 mb-4">
        Ocupación actual del equipo. Cada consultor muestra sus proyectos
        activos y el seniority asignado por proyecto (si difiere del global).
        Verde = capacidad disponible · Ámbar = carga alta · Rojo = sobrecargado.
      </p>
      <TeamOccupancy />
    </div>
  );
}
