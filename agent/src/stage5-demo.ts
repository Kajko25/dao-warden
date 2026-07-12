// Etap 5 — demonstracja end-to-end: agent BRONI skarbca.
//
// Scenariusz: uczciwy (apatyczny) posiadacz deleguje siłę głosu agentowi. Atakujący
// składa propozycję drenującą skarbiec i głosuje ZA. Agent wykrywa atak (rdzeń
// deterministyczny + LLM), decyduje o reakcji i głosuje NIE oddelegowaną siłą.
// Wynik: For 50k < Against 100k -> propozycja DEFEATED, skarbiec nietknięty.
//
// Kontrast z Etapem 2 (bez agenta): tam uczciwy milczał -> atak przeszedł.
//
// Uruchomienie: DEPLOYED_FILE=deployed-fast.json npm run stage5
import {
  createWalletClient, http, encodeFunctionData, keccak256, toBytes,
  type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient, addresses, arcTestnet } from "./config.js";
import { governorAbi, treasuryAbi, votesTokenAbi } from "./abi.js";
import { decodeProposal } from "./decode.js";
import { scoreProposal } from "./risk.js";
import { analyzeNarrative, llmAvailable } from "./llm.js";
import { decide } from "./decide.js";
import { castNoVote, agentVotingPower } from "./react.js";

const RPC = process.env.ARC_TESTNET_RPC_URL!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function walletFor(envKey: string) {
  const pk = process.env[envKey];
  if (!pk) throw new Error(`Brak ${envKey} w .env`);
  return createWalletClient({ account: privateKeyToAccount(pk as Hex), chain: arcTestnet, transport: http(RPC) });
}

const STATE = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"];
async function state(id: bigint): Promise<number> {
  return Number(await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "state", args: [id] }));
}

async function main() {
  const attacker = walletFor("ATTACKER_PRIVATE_KEY");
  const honest = walletFor("HONEST_VOTER_PRIVATE_KEY");
  const attackerAddr = attacker.account.address;
  const agentAddr = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex).address;

  console.log("\n🛡️  DAO-WARDEN — Etap 5: agent broni skarbca (szybki wariant DAO)\n");
  console.log(`   Governor : ${addresses.governor}`);
  console.log(`   warstwa LLM: ${llmAvailable() ? "AKTYWNA" : "wyłączona"}\n`);

  // --- 1) Delegacje: uczciwy oddaje siłę agentowi; atakujący sobie ---
  console.log("1) Delegacje siły głosu");
  const hDeleg = await honest.writeContract({ address: addresses.token, abi: votesTokenAbi, functionName: "delegate", args: [agentAddr] });
  await publicClient.waitForTransactionReceipt({ hash: hDeleg });
  const aDeleg = await attacker.writeContract({ address: addresses.token, abi: votesTokenAbi, functionName: "delegate", args: [attackerAddr] });
  await publicClient.waitForTransactionReceipt({ hash: aDeleg });
  console.log(`   uczciwy -> agent: agent ma teraz ${(await agentVotingPower()) / 10n ** 18n} WGOV siły`);
  console.log(`   atakujący -> sam: ${(await publicClient.readContract({ address: addresses.token, abi: votesTokenAbi, functionName: "getVotes", args: [attackerAddr] })) / 10n ** 18n} WGOV\n`);

  // --- 2) Atakujący składa propozycję drenującą skarbiec ---
  console.log("2) Atakujący składa propozycję drenującą skarbiec");
  const amount = 1_000_000n * 10n ** 6n; // cały skarbiec mUSD
  const description = "WGIP-2: Grant marketingowy Q3 na kampanie wzrostowe";
  const calldata = encodeFunctionData({ abi: treasuryAbi, functionName: "withdraw", args: [addresses.asset, attackerAddr, amount] });
  const targets = [addresses.treasury] as Address[];
  const values = [0n];
  const calldatas = [calldata] as Hex[];
  const descHash = keccak256(toBytes(description));

  const proposeTx = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "propose", args: [targets, values, calldatas, description] });
  const proposeRcpt = await publicClient.waitForTransactionReceipt({ hash: proposeTx });
  const proposalId = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "hashProposal", args: [targets, values, calldatas, descHash] }) as bigint;
  console.log(`   propozycja …${proposalId.toString().slice(-6)} złożona (blok ${proposeRcpt.blockNumber})\n`);

  // --- 3) Agent wykrywa i decyduje (prawdziwa logika agenta) ---
  console.log("3) Agent analizuje propozycję");
  const decoded = decodeProposal({ proposalId, proposer: attackerAddr, description, voteStart: 0n, voteEnd: 0n, targets, values, calldatas });
  const report = await scoreProposal(decoded, proposeRcpt.blockNumber);
  const llm = llmAvailable() ? await analyzeNarrative(decoded).catch(() => undefined) : undefined;
  const decision = decide(report, llm);
  console.log(`   rdzeń: ${report.level} ${report.score}/100${llm ? ` | LLM: ${llm.verdict} ${llm.mismatchScore}/100` : ""}`);
  console.log(`   DECYZJA: ${decision.action}`);
  for (const r of decision.reasons) console.log(`     - ${r}`);
  console.log();

  // --- 4) Głosowanie: atakujący ZA, agent (jeśli zdecydował) NIE ---
  console.log("4) Okno głosowania");
  while ((await state(proposalId)) === 0) { process.stdout.write("."); await sleep(1500); }
  console.log(" -> Active");

  const atkVote = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "castVote", args: [proposalId, 1] });
  await publicClient.waitForTransactionReceipt({ hash: atkVote });
  console.log("   atakujący zagłosował ZA (50k)");

  if (decision.action === "VOTE_NO") {
    const tx = await castNoVote(proposalId);
    console.log(`   głos NIE oddany (tx ${tx.slice(0, 12)}…)`);
  } else {
    console.log("   agent NIE reaguje (poniżej progu) — atak przejdzie");
  }

  const [against, forV] = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "proposalVotes", args: [proposalId] }) as [bigint, bigint, bigint];
  console.log(`   wynik głosów: ZA ${forV / 10n ** 18n} / PRZECIW ${against / 10n ** 18n}\n`);

  // --- 5) Koniec głosowania: sprawdzamy wynik ---
  console.log("5) Czekam na koniec głosowania");
  const deadline = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "proposalDeadline", args: [proposalId] }) as bigint;
  while (true) {
    const now = (await publicClient.getBlock()).timestamp;
    if (now > deadline) break;
    process.stdout.write("."); await sleep(2000);
  }
  const finalState = await state(proposalId);
  console.log(` -> ${STATE[finalState]}\n`);

  // --- 6) Próba wykonania + weryfikacja skarbca ---
  const treasuryBal = await publicClient.readContract({ address: addresses.asset, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [addresses.treasury] }) as bigint;

  if (finalState === 3) {
    console.log("✅ ATAK POWSTRZYMANY — propozycja DEFEATED.");
    console.log(`   Skarbiec nietknięty: ${treasuryBal / 10n ** 6n} mUSD (atakujący nic nie dostał).`);
    console.log("   Bez agenta (Etap 2) ten sam atak opróżnił skarbiec do zera.");
  } else if (finalState === 4) {
    console.log("❌ Propozycja Succeeded — agent NIE powstrzymał ataku (sprawdź próg/siłę).");
  } else {
    console.log(`Stan końcowy: ${STATE[finalState]}, skarbiec ${treasuryBal / 10n ** 6n} mUSD`);
  }
}

main().catch((e) => { console.error("Błąd demo:", e); process.exit(1); });
