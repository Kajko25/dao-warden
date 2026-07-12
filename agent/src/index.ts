// WATCH mode (live): the agent observes the Governor and, for every new proposal
// (ProposalCreated), immediately decodes it and scores risk. The Stage 3 deterministic
// core — still without a reaction (voting); that comes in Stage 5.
import { type Address, type Hex } from "viem";
import { publicClient, addresses } from "./config.js";
import { governorAbi } from "./abi.js";
import { decodeProposal } from "./decode.js";
import { scoreProposal } from "./risk.js";
import { printReport } from "./report.js";
import { analyzeNarrative, llmAvailable, type NarrativeAnalysis } from "./llm.js";

async function main() {
  const chainId = await publicClient.getChainId();
  const start = await publicClient.getBlockNumber();
  const useLlm = llmAvailable();
  console.log(`\n🛡️  DAO-WARDEN is watching (chainId ${chainId}, from block ${start})`);
  console.log(`    Governor: ${addresses.governor}`);
  console.log(`    Treasury: ${addresses.treasury}`);
  console.log(`    LLM layer: ${useLlm ? "ACTIVE (Claude Haiku)" : "disabled (no ANTHROPIC_API_KEY)"}\n`);

  publicClient.watchContractEvent({
    address: addresses.governor,
    abi: governorAbi,
    eventName: "ProposalCreated",
    poll: true, // Arc: polling instead of persistent filters
    pollingInterval: 3_000,
    onError: (err) => console.error("watch error:", err.message),
    onLogs: async (logs) => {
      for (const log of logs) {
        const a = log.args as {
          proposalId: bigint; proposer: Address; targets: readonly Address[];
          values: readonly bigint[]; calldatas: readonly Hex[];
          voteStart: bigint; voteEnd: bigint; description: string;
        };
        console.log(`\n⚡ New proposal detected in block ${log.blockNumber}`);
        const decoded = decodeProposal({
          proposalId: a.proposalId, proposer: a.proposer, description: a.description,
          voteStart: a.voteStart, voteEnd: a.voteEnd,
          targets: a.targets, values: a.values, calldatas: a.calldatas,
        });
        try {
          const report = await scoreProposal(decoded);
          let llm: NarrativeAnalysis | undefined;
          if (useLlm) {
            try {
              llm = await analyzeNarrative(decoded);
            } catch (e) {
              console.error("   (LLM layer skipped:", (e as Error).message, ")");
            }
          }
          printReport(decoded, report, llm);
        } catch (e) {
          console.error("Proposal scoring error:", (e as Error).message);
        }
      }
    },
  });
}

main().catch((e) => {
  console.error("Agent startup error:", e);
  process.exit(1);
});
