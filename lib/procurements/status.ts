import type { ProcurementStatus } from "@/lib/procurements/types";

export const STATUS_LABELS: Record<ProcurementStatus, string> = {
  new:        "Нови",
  qualifying: "Квалификация",
  go:         "Go",
  no_go:      "No-Go",
  preparing:  "Подготовка",
  submitted:  "Подадена",
  won:        "Спечелена",
  lost:       "Загубена",
  withdrawn:  "Оттеглена",
};

export const STATUS_COLORS: Record<ProcurementStatus, string> = {
  new:        "var(--color-ink-muted)",
  qualifying: "var(--color-gold-warm)",
  go:         "var(--color-success)",
  no_go:      "var(--color-ink-faint)",
  preparing:  "var(--color-burgundy-deep)",
  submitted:  "var(--color-burgundy-bright)",
  won:        "var(--color-success)",
  lost:       "var(--color-error)",
  withdrawn:  "var(--color-ink-faint)",
};

export const ACTIVE_STATUSES: ProcurementStatus[] = [
  "new", "qualifying", "go", "preparing", "submitted",
];

export const CLOSED_STATUSES: ProcurementStatus[] = [
  "no_go", "won", "lost", "withdrawn",
];

export const ALL_STATUSES: ProcurementStatus[] = [
  ...ACTIVE_STATUSES, ...CLOSED_STATUSES,
];
