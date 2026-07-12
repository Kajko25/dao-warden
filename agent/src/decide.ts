// Decyzja agenta (Etap 5): łączy werdykt rdzenia deterministycznego z warstwą LLM
// w JEDNĄ rekomendację akcji. To tutaj kończy się "wykrywanie", a zaczyna "reakcja".
import type { RiskReport } from "./risk.js";
import type { NarrativeAnalysis } from "./llm.js";

export interface Decision {
  action: "VOTE_NO" | "ALLOW";
  reasons: string[];
}

// Progi eskalacji do głosu NIE:
//  - rdzeń deterministyczny osiąga HIGH lub wyżej (score >= 45), LUB
//  - warstwa LLM orzeka poważną rozbieżność narracja-vs-działanie.
// Wystarczy jeden sygnał — obrona woli fałszywy alarm niż przepuszczony drenaż.
const DETERMINISTIC_THRESHOLD = 45;

export function decide(report: RiskReport, llm?: NarrativeAnalysis): Decision {
  const reasons: string[] = [];

  if (report.score >= DETERMINISTIC_THRESHOLD) {
    reasons.push(`rdzeń deterministyczny: ${report.level} (${report.score}/100)`);
  }
  if (llm && llm.verdict === "MAJOR_MISMATCH") {
    reasons.push(`LLM: narracja maskuje działanie (rozbieżność ${llm.mismatchScore}/100)`);
  }

  return { action: reasons.length > 0 ? "VOTE_NO" : "ALLOW", reasons };
}
