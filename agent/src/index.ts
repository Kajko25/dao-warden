// Tryb NASŁUCHU (na żywo): agent obserwuje Governor i na każdą nową propozycję
// (ProposalCreated) natychmiast ją dekoduje i ocenia ryzyko. Rdzeń deterministyczny
// Etapu 3 — jeszcze bez reakcji (głosowania); ta przyjdzie w Etapie 5.
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
  console.log(`\n🛡️  DAO-WARDEN nasłuchuje (chainId ${chainId}, od bloku ${start})`);
  console.log(`    Governor: ${addresses.governor}`);
  console.log(`    Treasury: ${addresses.treasury}`);
  console.log(`    warstwa LLM: ${useLlm ? "AKTYWNA (Claude Haiku)" : "wylaczona (brak ANTHROPIC_API_KEY)"}\n`);

  publicClient.watchContractEvent({
    address: addresses.governor,
    abi: governorAbi,
    eventName: "ProposalCreated",
    poll: true, // Arc: polling zamiast trwałych filtrów
    pollingInterval: 3_000,
    onError: (err) => console.error("watch error:", err.message),
    onLogs: async (logs) => {
      for (const log of logs) {
        const a = log.args as {
          proposalId: bigint; proposer: Address; targets: readonly Address[];
          values: readonly bigint[]; calldatas: readonly Hex[];
          voteStart: bigint; voteEnd: bigint; description: string;
        };
        console.log(`\n⚡ Nowa propozycja wykryta w bloku ${log.blockNumber}`);
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
              console.error("   (warstwa LLM pominieta:", (e as Error).message, ")");
            }
          }
          printReport(decoded, report, llm);
        } catch (e) {
          console.error("Blad oceny propozycji:", (e as Error).message);
        }
      }
    },
  });
}

main().catch((e) => {
  console.error("Blad startu agenta:", e);
  process.exit(1);
});
