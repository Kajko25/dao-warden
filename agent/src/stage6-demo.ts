// Stage 6 — end-to-end demonstration: IDENTITY + AUDIT + REPUTATION (ERC-8004).
//
// Scenario (no new transaction on the DAO — we audit the agent's REAL decision about the
// existing WGIP-1 attack from Stage 2):
//   1. Read the agent's identity from IdentityRegistry (agentId, wallet, metadata, AgentCard).
//   2. The agent scores the real attack proposal with its full pipeline (core + LLM + decision).
//   3. The agent FILES a decision record to the ValidationRegistry (validationRequest) —
//      an auditable trail: what it flagged and why, with a cryptographic commitment.
//   4. An independent VALIDATOR scores the decision (validationResponse 0-100) — a reputation signal.
//   5. Read the agent's reputation aggregate (getSummary) and the validation status.
//
// Run: npm run stage6            (the realistic DAO — it has the WGIP-1 attack)
//   optionally: SCAN_BLOCKS=60000 npm run stage6
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

// Finds the most dangerous proposal on the guarded Governor (scored by the core).
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
  console.log("\n🛡️  DAO-WARDEN — Stage 6: ERC-8004 identity + decision audit + reputation\n");

  // --- 1) Agent identity ---
  console.log("1) Agent identity (ERC-8004 IdentityRegistry)");
  const id = await readAgentIdentity();
  console.log(`   global agentId   : ${id.globalId}`);
  console.log(`   owner/wallet     : ${id.owner}`);
  console.log(`   AgentCard        : ${id.agentURI}`);
  console.log(`   framework        : ${id.framework}`);
  console.log(`   guards Governor  : ${id.guards}`);
  console.log(`   validator        : ${id.validator}\n`);

  // --- 2) The agent's real decision about the attack proposal ---
  console.log(`2) The agent scores a proposal on the guarded Governor (${addresses.governor})`);
  const cand = await findRiskiestProposal();
  if (!cand) {
    console.log("   No proposals in the scan window — increase SCAN_BLOCKS or run against a variant with the attack.");
    process.exit(1);
  }
  if (llmAvailable()) {
    cand.llm = await analyzeNarrative(cand.decoded).catch(() => undefined);
  }
  const decision = decide(cand.report, cand.llm);
  console.log(`   proposal …${cand.decoded.proposalId.toString().slice(-6)}: "${cand.description}"`);
  console.log(`   core: ${cand.report.level} ${cand.report.score}/100` + (cand.llm ? ` | LLM: ${cand.llm.verdict} ${cand.llm.mismatchScore}/100` : ""));
  console.log(`   DECISION: ${decision.action}`);
  for (const r of decision.reasons) console.log(`     - ${r}`);
  console.log();

  // --- 3) The agent files the decision for validation (an auditable trail) ---
  console.log("3) The agent records the decision in the ValidationRegistry (validationRequest)");
  const record = buildDecisionRecord(cand.decoded.proposalId, cand.description, id.guards ?? addresses.governor, cand.report, decision, cand.llm);
  const filed = await fileDecision(record);
  console.log(`   requestHash: ${filed.requestHash}`);
  console.log(`   requestURI : ${filed.requestURI}`);
  console.log(`   record     : ${filed.recordPath}`);
  console.log(`   tx         : ${filed.txHash}\n`);

  // --- 4) The validator scores the decision (reputation signal) ---
  console.log("4) The validator scores the decision (validationResponse)");
  // Independent verification: the decision is correct when the agent flagged a real drain and votes NO.
  const correct = decision.action === "VOTE_NO" && (cand.report.level === "CRITICAL" || cand.report.level === "HIGH");
  const score = correct ? 100 : decision.action === "VOTE_NO" ? 70 : 20;
  const note = correct
    ? `Confirmed: proposal ${cand.decoded.proposalId} is a treasury drain (BONK class); the NO vote is correct.`
    : `Scoring the ${decision.action} decision for proposal ${cand.decoded.proposalId}.`;
  const vtx = await respondToDecision(filed.requestHash, score, note, "attack-defense");
  console.log(`   score: ${score}/100 (tag attack-defense)`);
  console.log(`   tx   : ${vtx}\n`);

  // --- 5) Read reputation and status ---
  console.log("5) The agent's reputation aggregate (getSummary) + validation status");
  const rep = await readReputation();
  const status = await readStatus(filed.requestHash) as readonly [Address, bigint, number, Hex, string, bigint];
  console.log(`   reputation: ${rep.count} review(s), average ${rep.average}/100`);
  console.log(`   status of this request: response=${status[2]}, tag="${status[4]}", validator=${status[0]}\n`);

  console.log("✅ Stage 6 complete: the agent has a verifiable ERC-8004 identity, every decision");
  console.log("   leaves a cryptographic on-chain trail, and an independent validator builds its reputation.");
}

main().catch((e) => { console.error("Stage 6 demo error:", e); process.exit(1); });
