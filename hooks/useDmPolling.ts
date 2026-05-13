import { useRef, useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

type PushFn = (type: "success" | "error", msg: string) => void;
type SetBool = Dispatch<SetStateAction<boolean>>;

// ── Benchmark polling ─────────────────────────────────────────
// Component owns `isPolling` state (needed by SWR refreshInterval).
// Hook manages the completion-detection effect + startPolling callback.

export function useBenchmarkPolling(
  isPolling: boolean,
  setIsPolling: SetBool,
  latestResultId: string | undefined,
  latestResultStatus: string | null | undefined,
  push: PushFn,
) {
  const pollingNotified = useRef(false);
  const pollingStartId = useRef<string | null>(null);

  useEffect(() => {
    if (!isPolling) {
      pollingNotified.current = false;
      return;
    }
    const isStale = latestResultId === pollingStartId.current;
    if (isStale) return;
    if (latestResultStatus === "done" && !pollingNotified.current) {
      pollingNotified.current = true;
      setIsPolling(false);
      push("success", "Benchmark completado. Revisa el análisis comparativo.");
    }
    if (latestResultStatus === "failed" && !pollingNotified.current) {
      pollingNotified.current = true;
      setIsPolling(false);
      push("error", "El benchmark falló. Intenta de nuevo.");
    }
  }, [latestResultId, latestResultStatus, isPolling, setIsPolling, push]);

  const startPolling = useCallback((currentId?: string | null) => {
    pollingStartId.current = currentId ?? null;
    setIsPolling(true);
  }, [setIsPolling]);

  return { startPolling };
}

// ── IRO polling ───────────────────────────────────────────────

export function useIroPolling(
  isIroPolling: boolean,
  setIsIroPolling: SetBool,
  irosStatus: string,
  irosCount: number,
  push: PushFn,
) {
  const pollingNotifiedIro = useRef(false);

  useEffect(() => {
    if (!isIroPolling) {
      pollingNotifiedIro.current = false;
      return;
    }
    if (irosStatus === "done" && !pollingNotifiedIro.current) {
      pollingNotifiedIro.current = true;
      setIsIroPolling(false);
      push("success", `${irosCount} IROs generados. Revisa y ajusta los scores.`);
    }
    if (irosStatus === "failed" && !pollingNotifiedIro.current) {
      pollingNotifiedIro.current = true;
      setIsIroPolling(false);
      push("error", "La generación de IROs falló. Intenta de nuevo.");
    }
  }, [irosStatus, isIroPolling, irosCount, setIsIroPolling, push]);

  const startPolling = useCallback(() => {
    pollingNotifiedIro.current = false;
    setIsIroPolling(true);
  }, [setIsIroPolling]);

  return { startPolling };
}

// ── Reporte polling ───────────────────────────────────────────

export function useReportPolling(
  isReportPolling: boolean,
  setIsReportPolling: SetBool,
  latestReportId: string | undefined,
  latestReportStatus: string | null | undefined,
  latestReportBatchId: string | null | undefined,
  push: PushFn,
) {
  const pollingNotifiedReport = useRef(false);
  const pollingStartReportId = useRef<string | null>(null);

  useEffect(() => {
    if (!isReportPolling) {
      pollingNotifiedReport.current = false;
      return;
    }
    const isStale = latestReportId === pollingStartReportId.current;
    if (isStale) return;
    if (latestReportStatus === "ok" && !pollingNotifiedReport.current) {
      pollingNotifiedReport.current = true;
      setIsReportPolling(false);
      push("success", "Reporte generado. Puedes descargarlo en PDF.");
    }
    if (latestReportStatus === "failed" && !pollingNotifiedReport.current) {
      pollingNotifiedReport.current = true;
      setIsReportPolling(false);
      push("error", "El reporte falló. Intenta de nuevo.");
    }
  }, [latestReportId, latestReportStatus, isReportPolling, setIsReportPolling, push]);

  // Auto-restart polling si al montar hay un reporte pending con batch_id
  // (usuario cambió de tab o refrescó mientras el batch seguía corriendo)
  useEffect(() => {
    if (
      latestReportStatus === "pending" &&
      latestReportBatchId &&
      !isReportPolling
    ) {
      pollingStartReportId.current = latestReportId ?? null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restart polling al detectar pending+batch_id externos; guard !isReportPolling previene loop
      setIsReportPolling(true);
    }
  }, [latestReportStatus, latestReportBatchId, latestReportId, isReportPolling, setIsReportPolling]);

  const startPolling = useCallback((currentId?: string | null) => {
    pollingStartReportId.current = currentId ?? null;
    setIsReportPolling(true);
  }, [setIsReportPolling]);

  return { startPolling };
}
