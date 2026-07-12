// The agent's decision (Stage 5): combines the deterministic core's verdict with the LLM
// layer into ONE action recommendation. This is where "detection" ends and "reaction" begins.
import type { RiskReport } from "./risk.js";
import type { NarrativeAnalysis } from "./llm.js";

export interface Decision {
  action: "VOTE_NO" | "ALLOW";
  reasons: string[];
}

// Escalation thresholds for the NO vote:
//  - the deterministic core reaches HIGH or above (score >= 45), OR
//  - the LLM layer rules a major narrative-vs-action discrepancy.
// One signal is enough — the defense prefers a false alarm over a missed drain.
const DETERMINISTIC_THRESHOLD = 45;

export function decide(report: RiskReport, llm?: NarrativeAnalysis): Decision {
  const reasons: string[] = [];

  if (report.score >= DETERMINISTIC_THRESHOLD) {
    reasons.push(`deterministic core: ${report.level} (${report.score}/100)`);
  }
  if (llm && llm.verdict === "MAJOR_MISMATCH") {
    reasons.push(`LLM: the narrative masks the action (mismatch ${llm.mismatchScore}/100)`);
  }

  return { action: reasons.length > 0 ? "VOTE_NO" : "ALLOW", reasons };
}
