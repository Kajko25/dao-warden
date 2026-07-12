// Tryb SKANOWANIA: przechodzi historyczne propozycje (event ProposalCreated),
// dekoduje je i ocenia ryzyko. Sluzy do weryfikacji rdzenia na juz istniejacych
// propozycjach (np. atak WGIP-1 z Etapu 2) bez czekania na nowa.
import { type Address, type Hex } from "viem";
import { publicClient, addresses } from "./config.js";
import { governorAbi } from "./abi.js";
import { decodeProposal } from "./decode.js";
import { scoreProposal } from "./risk.js";
import { printReport } from "./report.js";
import { analyzeNarrative, llmAvailable, type NarrativeAnalysis } from "./llm.js";

const CHUNK = 5000n; // Arc: bezpieczny rozmiar okna dla eth_getLogs

async function main() {
  const latest = await publicClient.getBlockNumber();
  const span = BigInt(process.env.SCAN_BLOCKS ?? "40000");
  const fromBlock = latest > span ? latest - span : 0n;
  const useLlm = llmAvailable();
  console.log(`\n🛡️  DAO-WARDEN — skan propozycji od bloku ${fromBlock} do ${latest} (Governor ${addresses.governor})`);
  console.log(`    warstwa LLM (narracja vs dzialanie): ${useLlm ? "AKTYWNA (Claude Haiku)" : "wylaczona (brak ANTHROPIC_API_KEY)"}\n`);

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
      // Ocena na bloku powstania propozycji — stan, na ktory faktycznie dziala.
      const report = await scoreProposal(decoded, log.blockNumber);
      let llm: NarrativeAnalysis | undefined;
      if (useLlm) {
        try {
          llm = await analyzeNarrative(decoded);
        } catch (e) {
          console.error("   (warstwa LLM pominieta:", (e as Error).message, ")");
        }
      }
      printReport(decoded, report, llm);
    }
  }

  if (found === 0) console.log("Brak propozycji w przeskanowanym oknie.");
  else console.log(`Przeskanowano ${found} propozycji.`);
}

main().catch((e) => {
  console.error("Blad skanu:", e);
  process.exit(1);
});
