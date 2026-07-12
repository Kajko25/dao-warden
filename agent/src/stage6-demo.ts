// Etap 6 — demonstracja end-to-end: TOZSAMOSC + AUDYT + REPUTACJA (ERC-8004).
//
// Scenariusz (bez nowej transakcji na DAO — audytujemy PRAWDZIWA decyzje agenta o
// istniejacym ataku WGIP-1 z Etapu 2):
//   1. Odczyt tozsamosci agenta z IdentityRegistry (agentId, portfel, metadane, AgentCard).
//   2. Agent ocenia realna propozycje ataku swoim pelnym potokiem (rdzen + LLM + decyzja).
//   3. Agent SKLADA rekord decyzji do ValidationRegistry (validationRequest) —
//      audytowalny slad: co oflagowal i dlaczego, z kryptograficznym zobowiazaniem.
//   4. Niezalezny WALIDATOR ocenia decyzje (validationResponse 0-100) — sygnal reputacji.
//   5. Odczyt agregatu reputacji agenta (getSummary) i statusu walidacji.
//
// Uruchomienie: npm run stage6            (realistyczny DAO — ma atak WGIP-1)
//   ewentualnie: SCAN_BLOCKS=60000 npm run stage6
import { type Address, type Hex } from "viem";
import { publicClient, addresses } from "./config.js";
import { governorAbi } from "./abi.js";
import { decodeProposal } from "./decode.js";
import { scoreProposal, type RiskReport } from "./risk.js";
import { analyzeNarrative, llmAvailable, type NarrativeAnalysis } from "./llm.js";
import { decide } from "./decide.js";
import { readAgentIdentity } from "./identity.js";
import { buildDecisionRecord, fileDecision } from "./audit.js";
import { respondToDecision, readReputation, readStatus } from "./validate.js";

const CHUNK = 5000n;

interface Candidate {
  decoded: ReturnType<typeof decodeProposal>;
  report: RiskReport;
  llm?: NarrativeAnalysis;
  description: string;
}

// Znajduje najgrozniejsza propozycje na chronionym Governorze (ocena rdzeniem).
async function findRiskiestProposal(): Promise<Candidate | null> {
  const latest = await publicClient.getBlockNumber();
  const span = BigInt(process.env.SCAN_BLOCKS ?? "40000");
  const fromBlock = latest > span ? latest - span : 0n;
  let best: Candidate | null = null;

  for (let start = fromBlock; start <= latest; start += CHUNK) {
    const end = start + CHUNK - 1n > latest ? latest : start + CHUNK - 1n;
    const logs = await publicClient.getContractEvents({
      address: addresses.governor, abi: governorAbi, eventName: "ProposalCreated",
      fromBlock: start, toBlock: end,
    });
    for (const log of logs) {
      const a = log.args as {
        proposalId: bigint; proposer: Address; targets: readonly Address[];
        values: readonly bigint[]; calldatas: readonly Hex[];
        voteStart: bigint; voteEnd: bigint; description: string;
      };
      const decoded = decodeProposal({
        proposalId: a.proposalId, proposer: a.proposer, description: a.description,
        voteStart: a.voteStart, voteEnd: a.voteEnd, targets: a.targets, values: a.values, calldatas: a.calldatas,
      });
      const report = await scoreProposal(decoded, log.blockNumber);
      if (!best || report.score > best.report.score) best = { decoded, report, description: a.description };
    }
  }
  return best;
}

async function main() {
  console.log("\n🛡️  DAO-WARDEN — Etap 6: tozsamosc ERC-8004 + audyt decyzji + reputacja\n");

  // --- 1) Tozsamosc agenta ---
  console.log("1) Tozsamosc agenta (IdentityRegistry ERC-8004)");
  const id = await readAgentIdentity();
  console.log(`   agentId globalny : ${id.globalId}`);
  console.log(`   wlasciciel/portfel: ${id.owner}`);
  console.log(`   AgentCard        : ${id.agentURI}`);
  console.log(`   framework        : ${id.framework}`);
  console.log(`   chroni Governor  : ${id.guards}`);
  console.log(`   walidator        : ${id.validator}\n`);

  // --- 2) Realna decyzja agenta o propozycji ataku ---
  console.log(`2) Agent ocenia propozycje na chronionym Governorze (${addresses.governor})`);
  const cand = await findRiskiestProposal();
  if (!cand) {
    console.log("   Brak propozycji w oknie skanu — zwieksz SCAN_BLOCKS albo uruchom na wariancie z atakiem.");
    process.exit(1);
  }
  if (llmAvailable()) {
    cand.llm = await analyzeNarrative(cand.decoded).catch(() => undefined);
  }
  const decision = decide(cand.report, cand.llm);
  console.log(`   propozycja …${cand.decoded.proposalId.toString().slice(-6)}: "${cand.description}"`);
  console.log(`   rdzen: ${cand.report.level} ${cand.report.score}/100` + (cand.llm ? ` | LLM: ${cand.llm.verdict} ${cand.llm.mismatchScore}/100` : ""));
  console.log(`   DECYZJA: ${decision.action}`);
  for (const r of decision.reasons) console.log(`     - ${r}`);
  console.log();

  // --- 3) Agent sklada decyzje do walidacji (audytowalny slad) ---
  console.log("3) Agent zapisuje decyzje do ValidationRegistry (validationRequest)");
  const record = buildDecisionRecord(cand.decoded.proposalId, cand.description, id.guards ?? addresses.governor, cand.report, decision, cand.llm);
  const filed = await fileDecision(record);
  console.log(`   requestHash: ${filed.requestHash}`);
  console.log(`   requestURI : ${filed.requestURI}`);
  console.log(`   rekord     : ${filed.recordPath}`);
  console.log(`   tx         : ${filed.txHash}\n`);

  // --- 4) Walidator ocenia decyzje (sygnal reputacji) ---
  console.log("4) Walidator ocenia decyzje (validationResponse)");
  // Niezalezna weryfikacja: decyzja poprawna, gdy agent oflagowal realny drenaz i glosuje NIE.
  const correct = decision.action === "VOTE_NO" && (cand.report.level === "CRITICAL" || cand.report.level === "HIGH");
  const score = correct ? 100 : decision.action === "VOTE_NO" ? 70 : 20;
  const note = correct
    ? `Potwierdzono: propozycja ${cand.decoded.proposalId} to drenaz skarbca (klasa BONK); glos NIE prawidlowy.`
    : `Ocena decyzji ${decision.action} dla propozycji ${cand.decoded.proposalId}.`;
  const vtx = await respondToDecision(filed.requestHash, score, note, "attack-defense");
  console.log(`   ocena: ${score}/100 (tag attack-defense)`);
  console.log(`   tx   : ${vtx}\n`);

  // --- 5) Odczyt reputacji i statusu ---
  console.log("5) Agregat reputacji agenta (getSummary) + status walidacji");
  const rep = await readReputation();
  const status = await readStatus(filed.requestHash) as readonly [Address, bigint, number, Hex, string, bigint];
  console.log(`   reputacja: ${rep.count} ocen, srednia ${rep.average}/100`);
  console.log(`   status tego zadania: response=${status[2]}, tag="${status[4]}", walidator=${status[0]}\n`);

  console.log("✅ Etap 6 zakonczony: agent ma zweryfikowalna tozsamosc ERC-8004, kazda decyzja");
  console.log("   zostawia kryptograficzny slad on-chain, a niezalezny walidator buduje jego reputacje.");
}

main().catch((e) => { console.error("Blad demo Etap 6:", e); process.exit(1); });
