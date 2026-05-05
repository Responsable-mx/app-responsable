/**
 * PDF entregable de cronograma del cliente.
 * Por servicio → etapas → actividades con plan/real/status/assignee.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

import type { Client } from "@/lib/clients";
import type { ServiceStage, ActivityStatus } from "@/lib/stages";

const C = {
  teal: "#0d9488",
  tealDark: "#115e59",
  tealLight: "#ccfbf1",
  slate900: "#0f172a",
  slate700: "#334155",
  slate500: "#64748b",
  slate300: "#cbd5e1",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  white: "#ffffff",
  rose: "#dc2626",
  roseLight: "#fee2e2",
  amber: "#d97706",
  amberLight: "#fef3c7",
  emerald: "#059669",
  emeraldLight: "#d1fae5",
};

const STATUS_BG: Record<ActivityStatus, string> = {
  pending: C.slate100,
  in_progress: C.tealLight,
  completed: C.emeraldLight,
  delayed: C.roseLight,
};
const STATUS_FG: Record<ActivityStatus, string> = {
  pending: C.slate700,
  in_progress: C.tealDark,
  completed: C.emerald,
  delayed: C.rose,
};
const STATUS_LBL: Record<ActivityStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  delayed: "Retrasada",
};

const s = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    color: C.slate900,
    fontFamily: "Helvetica",
  },
  cover: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  coverLabel: {
    fontSize: 9,
    color: C.slate500,
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: C.tealDark,
    marginBottom: 4,
    textAlign: "center",
  },
  coverSub: {
    fontSize: 14,
    color: C.slate700,
    marginBottom: 30,
  },
  coverMeta: {
    fontSize: 9,
    color: C.slate500,
    marginTop: 20,
  },
  serviceHeader: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.tealDark,
    marginTop: 18,
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: C.teal,
  },
  serviceMeta: {
    fontSize: 8,
    color: C.slate500,
    marginBottom: 10,
  },
  stageHeader: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.slate900,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: C.slate50,
    padding: 4,
  },
  emptyStage: {
    fontSize: 9,
    color: C.slate500,
    fontStyle: "italic",
    paddingLeft: 8,
    marginBottom: 6,
  },
  table: {
    marginBottom: 6,
  },
  thead: {
    flexDirection: "row",
    backgroundColor: C.slate100,
    borderBottomWidth: 1,
    borderBottomColor: C.slate300,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.slate500,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  trow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: C.slate100,
  },
  tcell: {
    fontSize: 8,
    color: C.slate700,
    paddingRight: 4,
  },
  // Anchos por columna (suman ~520 sobre página A4 con padding 40)
  colName: { width: 160 },
  colPlan: { width: 90 },
  colReal: { width: 90 },
  colAssignee: { width: 100 },
  colStatus: { width: 80 },
  statusPill: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
    alignSelf: "flex-start",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: C.slate500,
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: C.slate300,
    paddingTop: 4,
  },
  summaryBox: {
    flexDirection: "row",
    backgroundColor: C.slate50,
    borderWidth: 0.5,
    borderColor: C.slate300,
    padding: 10,
    marginBottom: 10,
    gap: 16,
  },
  kpi: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 7,
    color: C.slate500,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
  },
  kpiValue: {
    fontSize: 16,
    color: C.slate900,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
  },
});

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export type CronogramaService = {
  client_service_id: string;
  service_label: string;
  stages: ServiceStage[];
};

export type CronogramaReportProps = {
  client: Client;
  services: CronogramaService[];
  generatedAt: string; // ISO
};

export function CronogramaReport({ client, services, generatedAt }: CronogramaReportProps) {
  // Stats globales
  let totalActivities = 0;
  let active = 0;
  let delayed = 0;
  let completed = 0;
  for (const sv of services) {
    for (const st of sv.stages) {
      for (const a of st.activities) {
        totalActivities++;
        if (a.status === "in_progress") active++;
        if (a.status === "delayed") delayed++;
        if (a.status === "completed") completed++;
      }
    }
  }

  return (
    <Document>
      {/* Cover */}
      <Page size="A4" style={s.page}>
        <View style={s.cover}>
          <Text style={s.coverLabel}>Cronograma del proyecto</Text>
          <Text style={s.coverTitle}>{client.name}</Text>
          <Text style={s.coverSub}>{client.sector ?? ""}</Text>
          <Text style={s.coverMeta}>
            Generado {new Date(generatedAt).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </Text>
        </View>
        <Text style={s.footer}>ResponSable · cronograma · {client.name}</Text>
      </Page>

      {/* Resumen + servicios */}
      <Page size="A4" style={s.page}>
        <Text style={s.serviceHeader}>Resumen ejecutivo</Text>
        <View style={s.summaryBox}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Servicios</Text>
            <Text style={s.kpiValue}>{services.length}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Actividades</Text>
            <Text style={s.kpiValue}>{totalActivities}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>En curso</Text>
            <Text style={[s.kpiValue, { color: C.tealDark }]}>{active}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Completadas</Text>
            <Text style={[s.kpiValue, { color: C.emerald }]}>{completed}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Retrasadas</Text>
            <Text style={[s.kpiValue, { color: C.rose }]}>{delayed}</Text>
          </View>
        </View>

        {services.length === 0 && (
          <Text style={s.emptyStage}>
            No hay servicios contratados con cronograma definido.
          </Text>
        )}

        {services.map((sv) => {
          const totalActs = sv.stages.reduce((acc, st) => acc + st.activities.length, 0);
          return (
            <View key={sv.client_service_id} wrap={false}>
              <Text style={s.serviceHeader}>{sv.service_label}</Text>
              <Text style={s.serviceMeta}>
                {sv.stages.length} etapa{sv.stages.length === 1 ? "" : "s"} · {totalActs}{" "}
                actividad{totalActs === 1 ? "" : "es"}
              </Text>
            </View>
          );
        })}
        <Text style={s.footer}>ResponSable · cronograma · {client.name}</Text>
      </Page>

      {/* Detalle: una página por servicio (puede paginarse si es muy largo) */}
      {services.map((sv) => (
        <Page key={sv.client_service_id} size="A4" style={s.page}>
          <Text style={s.serviceHeader}>{sv.service_label}</Text>
          <Text style={s.serviceMeta}>
            {sv.stages.length} etapa{sv.stages.length === 1 ? "" : "s"}
          </Text>

          {sv.stages.length === 0 && (
            <Text style={s.emptyStage}>Sin etapas definidas para este servicio.</Text>
          )}

          {sv.stages.map((st) => (
            <View key={st.id}>
              <Text style={s.stageHeader}>
                {st.name}
                {"  "}
                <Text style={{ fontFamily: "Helvetica", fontSize: 9, color: C.slate500 }}>
                  ({st.activities.length} actividad{st.activities.length === 1 ? "" : "es"})
                </Text>
              </Text>

              {st.activities.length === 0 ? (
                <Text style={s.emptyStage}>Sin actividades.</Text>
              ) : (
                <View style={s.table}>
                  <View style={s.thead}>
                    <Text style={[s.th, s.colName]}>Actividad</Text>
                    <Text style={[s.th, s.colPlan]}>Plan</Text>
                    <Text style={[s.th, s.colReal]}>Real</Text>
                    <Text style={[s.th, s.colAssignee]}>Asignado</Text>
                    <Text style={[s.th, s.colStatus]}>Status</Text>
                  </View>
                  {st.activities.map((a) => (
                    <View key={a.id} style={s.trow} wrap={false}>
                      <Text style={[s.tcell, s.colName]}>{a.name}</Text>
                      <Text style={[s.tcell, s.colPlan]}>
                        {fmtDate(a.planned_start)} → {fmtDate(a.planned_end)}
                      </Text>
                      <Text style={[s.tcell, s.colReal]}>
                        {fmtDate(a.actual_start)} → {fmtDate(a.actual_end)}
                      </Text>
                      <Text style={[s.tcell, s.colAssignee]}>
                        {a.assignee_email ? a.assignee_email.split("@")[0] : "—"}
                      </Text>
                      <View style={s.colStatus}>
                        <Text
                          style={[
                            s.statusPill,
                            {
                              backgroundColor: STATUS_BG[a.status],
                              color: STATUS_FG[a.status],
                            },
                          ]}
                        >
                          {STATUS_LBL[a.status]}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
          <Text style={s.footer}>ResponSable · cronograma · {client.name}</Text>
        </Page>
      ))}
    </Document>
  );
}
