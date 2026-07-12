// SCAN mode: walks historical proposals (the ProposalCreated event), decodes them and
// scores risk. Used to verify the core against already-existing proposals (e.g. the WGIP-1
// attack from Stage 2) without waiting for a new one.
import { type Address, type Hex } from "viem";
import { publicClient, addresses } from "./config.js";
import { governorAbi } from "./abi.js";
import { decodeProposal } from "./decode.js";
import { scoreProposal } from "./risk.js";
import { printReport } from "./report.js";
import { analyzeNarrative, llmAvailable, type NarrativeAnalysis } from "./llm.js";

const CHUNK = 5000n; // Arc: a safe window size for eth_getLogs

async function main() {
  const latest = await publicClient.getBlockNumber();
  const span = BigInt(process.env.SCAN_BLOCKS ?? "40000");
  const fromBlock = latest > span ? latest - span : 0n;
  const useLlm = llmAvailable();
  console.log(`\n🛡️  DAO-WARDEN — scanning proposals from block ${fromBlock} to ${latest} (Governor ${addresses.governor})`);
  console.log(`    LLM layer (narrative vs. action): ${useLlm ? "ACTIVE (Claude Haiku)" : "disabled (no ANTHROPIC_API_KEY)"}\n`);

  let found = 0;
  for (let start = fromBlock; start <= latest; start += CHUNK) {
    const end = start + CHUNK - 1n > latest ? latest : start + CHUNK - 1n;
    const logs = await publicClient.getContractEvents({
      address: addresses.governor,
      abi: governorAbi,
      eventName: "ProposalCreated",
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs) {
      found++;
      const a = log.args as {
        proposalId: bigint; proposer: Address; targets: readonly Address[];
        values: readonly bigint[]; calldatas: readonly Hex[];
        voteStart: bigint; voteEnd: bigint; description: string;
      };
      const decoded = decodeProposal({
        proposalId: a.proposalId, proposer: a.proposer, description: a.description,
        voteStart: a.voteStart, voteEnd: a.voteEnd,
        targets: a.targets, values: a.values, calldatas: a.calldatas,
      });
      // Score at the proposal's creation block — the state it actually acts on.
      const report = await scoreProposal(decoded, log.blockNumber);
      let llm: NarrativeAnalysis | undefined;
      if (useLlm) {
        try {
          llm = await analyzeNarrative(decoded);
        } catch (e) {
          console.error("   (LLM layer skipped:", (e as Error).message, ")");
        }
      }
      printReport(decoded, report, llm);
    }
  }

  if (found === 0) console.log("No proposals in the scanned window.");
  else console.log(`Scanned ${found} proposal(s).`);
}

main().catch((e) => {
  console.error("Scan error:", e);
  process.exit(1);
});
