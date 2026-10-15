"use client";

import { useEffect, useState } from "react";
import { LiveChart } from "@/components/LiveChart";
import { fmtMb } from "@/lib/format";
import type { HostSample } from "@/lib/vm";

export function NodeLiveCharts({ nodeId, hostRamGb }: { nodeId: number; hostRamGb: number }) {
  const [current, setCurrent] = useState<HostSample | null>(null);
  const [history, setHistory] = useState<HostSample[]>([]);

  useEffect(() => {
    let stop = false;
    const tick = async (withHistory: boolean) => {
      try {
        const res = await fetch(`/api/host/metrics?nodeId=${nodeId}${withHistory ? "&history=1" : ""}`, {
          cache: "no-store",
        });
        if (!res.ok || stop) return;
        const data = (await res.json()) as { metrics: { current: HostSample; history?: HostSample[] } };
        setCurrent(data.metrics.current);
        setHistory((prev) => {
          const incoming = data.metrics.history ?? [data.metrics.current];
          const merged = withHistory
            ? incoming
            : prev.at(-1)?.t === incoming[0].t
              ? [...prev.slice(0, -1), ...incoming]
              : [...prev, ...incoming];
          return merged.slice(-30);
        });
      } catch {
        // transient error, next tick retries
      }
    };
    void tick(true);
    const id = setInterval(() => {
      if (!document.hidden) void tick(false);
    }, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [nodeId]);

  const col = (pick: (s: HostSample) => number) => history.map(pick);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <LiveChart
        title="Node CPU"
        max={100}
        series={[{ label: "usage", color: "#f97316", data: col((s) => s.cpuPct), current: current ? `${current.cpuPct.toFixed(1)}%` : "—" }]}
      />
      <LiveChart
        title="Node memory"
        max={hostRamGb}
        series={[
          {
            label: "used",
            color: "#a78bfa",
            data: col((s) => Math.round((s.memUsedMb / 1024) * 10) / 10),
            current: current ? `${fmtMb(current.memUsedMb)} / ${hostRamGb} GB` : "—",
          },
        ]}
      />
    </div>
  );
}
