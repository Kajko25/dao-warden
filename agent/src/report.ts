// Formats the agent's decision report (a readable audit trail in the console).
import type { DecodedProposal } from "./decode.js";
import type { RiskReport, RiskLevel } from "./risk.js";
import type { NarrativeAnalysis, NarrativeVerdict } from "./llm.js";

const ICON: Record<RiskLevel, string> = {
  LOW: "🟢",
  MEDIUM: "🟡",
  HIGH: "🟠",
  CRITICAL: "🔴",
};

const VERDICT_ICON: Record<NarrativeVerdict, string> = {
  MATCH: "🟢",
  MINOR_DISCREPANCY: "🟡",
  MAJOR_MISMATCH: "🔴",
};

export function printReport(
  p: DecodedProposal,
  r: RiskReport,
  llm?: NarrativeAnalysis,
): void {
  const shortId = "…" + p.proposalId.toString().slice(-6);
  console.log("────────────────────────────────────────────────────────");
  console.log(`${ICON[r.level]} [${r.level}] score=${r.score}/100  proposal ${shortId}`);
  console.log(`   description: "${p.description}"`);
  console.log(`   proposer   : ${r.facts.proposer} (${r.facts.proposerVotes}, ${r.facts.quorumMultiple})`);
  console.log(`   action     : ${r.facts.drainSummary}`);
  console.log(`   signals    :`);
  if (r.signals.length === 0) {
    console.log(`      (none — the proposal does not touch the treasury or show attack traits)`);
  }
  for (const s of r.signals) {
    console.log(`      +${String(s.weight).padStart(2)}  ${s.code} — ${s.detail}`);
  }
  // Unknown actions are worth printing separately (the agent does not understand them -> operator's attention).
  const unknown = p.intents.filter((i) => i.kind === "unknown");
  for (const u of unknown) {
    if (u.kind !== "unknown") continue;
    console.log(`      ??  UNKNOWN_CALL — target ${u.target}, selector ${u.selector}`);
  }
  // LLM layer (Stage 4): narrative vs. real action — if available.
  if (llm) {
    console.log(`   narrative  : ${VERDICT_ICON[llm.verdict]} ${llm.verdict} (mismatch ${llm.mismatchScore}/100) [Claude Haiku]`);
    console.log(`      "${llm.reasoning}"`);
    for (const flag of llm.redFlags) {
      console.log(`      ⚑ ${flag}`);
    }
  }
  console.log("");
}
