// Shared status-color mapping. Status colors always ship with icon + label —
// color never carries the meaning alone (sub-3:1 warning/serious on light).
import type { RiskLevel } from "@/lib/risk";

export type Tone = "good" | "warning" | "serious" | "critical";

export const TONE_COLORS: Record<Tone, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
};

export const RISK_META: Record<RiskLevel, { tone: Tone; icon: string }> = {
  LOW: { tone: "good", icon: "✓" },
  MEDIUM: { tone: "warning", icon: "!" },
  HIGH: { tone: "serious", icon: "‼" },
  CRITICAL: { tone: "critical", icon: "✕" },
};
