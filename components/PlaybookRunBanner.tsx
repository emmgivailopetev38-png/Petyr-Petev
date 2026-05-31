"use client";

import { useEffect, useState } from "react";
import type { PlaybookRun } from "@/lib/playbooks/types";

type Props = {
  runId: string;
  totalSteps: number;
  playbookName: string;
  onComplete: () => void;
};

export function PlaybookRunBanner({ runId, totalSteps, playbookName, onComplete }: Props) {
  const [run, setRun] = useState<PlaybookRun | null>(null);

  useEffect(() => {
    let stopped = false;
    let lastStep = -1;
    async function tick() {
      try {
        const r = await fetch(`/api/playbooks/runs/${runId}`);
        if (!r.ok) return;
        const { run: data } = (await r.json()) as { run: PlaybookRun };
        if (stopped) return;
        setRun(data);
        if (data.current_step !== lastStep) {
          lastStep = data.current_step;
          onComplete(); // triggers message reload on each step progress
        }
        if (data.state !== "running") {
          onComplete();
          return;
        }
      } catch {
        // ignore
      }
      if (!stopped) setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stopped = true;
    };
  }, [runId, onComplete]);

  if (!run) {
    return (
      <div style={banner}>
        <span style={{ fontWeight: 600 }}>▶️ Стартиране на playbook…</span>
      </div>
    );
  }

  if (run.state === "completed") {
    return (
      <div style={{ ...banner, background: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.4)" }}>
        <span style={{ fontWeight: 600 }}>✅ Playbook завършен: {playbookName}</span>
      </div>
    );
  }

  if (run.state === "failed") {
    return (
      <div style={{ ...banner, background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.4)" }}>
        <span style={{ fontWeight: 600 }}>❌ Playbook грешка: {run.error_message ?? "неизвестна"}</span>
      </div>
    );
  }

  return (
    <div style={banner}>
      <span style={{ fontWeight: 600 }}>
        ▶️ {playbookName} · стъпка {run.current_step + 1}/{totalSteps}
      </span>
    </div>
  );
}

const banner: React.CSSProperties = {
  padding: "8px 14px",
  background: "rgba(124, 58, 237, 0.12)",
  border: "1px solid rgba(124, 58, 237, 0.4)",
  borderRadius: 6,
  color: "var(--color-text-primary)",
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
};
