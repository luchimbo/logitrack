"use client";

import { useEffect } from "react";
import { toast } from "@/lib/api";

// Follows the background searches of settlements from anywhere in the app. Each poll also lets the server
// advance the search, and a finished one is announced once. Pages listen to "settlement-jobs" for progress.
export function useSettlementJobs(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null, stopped = false;
    const poll = async () => {
      clearTimeout(timer);
      let running = false;
      try {
        const res = await fetch("/api/logistics-finance/jobs", { cache: "no-store" });
        if (res.ok) {
          const { jobs = [] } = await res.json();
          running = jobs.some((j) => j.status === "running");
          window.dispatchEvent(new CustomEvent("settlement-jobs", { detail: jobs }));
          const finished = jobs.filter((j) => j.status !== "running" && !j.notified);
          for (const j of finished) {
            toast(j.status === "done"
              ? `Liquidación #${j.settlementId} de ${j.carrierName || "transportista"} lista: ya se buscaron los envíos del período.`
              : `No se pudo completar la búsqueda de la liquidación #${j.settlementId}: ${j.error || "error desconocido"}`, j.status === "done" ? "success" : "error", 12000);
          }
          if (finished.length) await fetch("/api/logistics-finance/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "notified", ids: finished.map((j) => j.settlementId) }) });
        }
      } catch { /* Offline or signed out: try again later. */ }
      if (!stopped) timer = setTimeout(poll, running ? 15_000 : 120_000);
    };
    const now = () => poll();
    window.addEventListener("settlement-jobs-refresh", now);
    poll();
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener("settlement-jobs-refresh", now); };
  }, [enabled]);
}
