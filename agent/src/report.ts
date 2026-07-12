// Formatowanie raportu decyzji agenta (czytelny slad audytowy w konsoli).
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
  console.log(`   opis      : "${p.description}"`);
  console.log(`   proposer  : ${r.facts.proposer} (${r.facts.proposerVotes}, ${r.facts.quorumMultiple})`);
  console.log(`   akcja     : ${r.facts.drainSummary}`);
  console.log(`   sygnaly   :`);
  if (r.signals.length === 0) {
    console.log(`      (brak — propozycja nie rusza skarbca ani nie ma cech ataku)`);
  }
  for (const s of r.signals) {
    console.log(`      +${String(s.weight).padStart(2)}  ${s.code} — ${s.detail}`);
  }
  // Nieznane akcje warto wypisac osobno (agent ich nie rozumie -> uwaga operatora).
  const unknown = p.intents.filter((i) => i.kind === "unknown");
  for (const u of unknown) {
    if (u.kind !== "unknown") continue;
    console.log(`      ??  UNKNOWN_CALL — target ${u.target}, selektor ${u.selector}`);
  }
  // Warstwa LLM (Etap 4): narracja vs realne dzialanie — jesli dostepna.
  if (llm) {
    console.log(`   narracja  : ${VERDICT_ICON[llm.verdict]} ${llm.verdict} (rozbieznosc ${llm.mismatchScore}/100) [Claude Haiku]`);
    console.log(`      "${llm.reasoning}"`);
    for (const flag of llm.redFlags) {
      console.log(`      ⚑ ${flag}`);
    }
  }
  console.log("");
}
