// Etap 7 — demonstracja end-to-end DRUGIEJ warstwy obrony: timelock + agent-canceller.
//
// Roznica wzgledem Etapu 5: tam agent bronil W TRAKCIE glosowania (glos NIE oddelegowana
// sila). Tu odtwarzamy scenariusz, w ktorym agent NIE ma sily glosu w oknie glosowania
// (uczciwi sa apatyczni, nikt nie oddelegowal) — atak WYGRYWA glosowanie. Obrona przenosi
// sie do okna PO glosowaniu: propozycja musi przejsc przez timelock (minDelay), a agent
// z CANCELLER_ROLE anuluje zakolejkowana operacje drenazu, zanim stanie sie wykonywalna.
//
// Wynik: state = Canceled, skarbiec nietkniety. To dowodzi, ze timelock daje okno obronne
// nawet gdy pierwsza warstwa (glos) zawiedzie.
//
// Uruchomienie: DEPLOYED_FILE=deployed-timelocked.json npm run stage7
import { encodeFunctionData, keccak256, toBytes, type Address, type Hex } from "viem";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient, addresses, arcTestnet } from "./config.js";
import { governorAbi, treasuryAbi, votesTokenAbi, erc20Abi } from "./abi.js";
import { decodeProposal } from "./decode.js";
import { scoreProposal } from "./risk.js";
import { analyzeNarrative, llmAvailable } from "./llm.js";
import { decide } from "./decide.js";
import {
  operationIdFor, isOperationPending, agentIsCanceller, cancelOperation,
} from "./cancel.js";

const RPC = process.env.ARC_TESTNET_RPC_URL!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STATE = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"];

function walletFor(envKey: string) {
  const pk = process.env[envKey];
  if (!pk) throw new Error(`Brak ${envKey} w .env`);
  return createWalletClient({ account: privateKeyToAccount(pk as Hex), chain: arcTestnet, transport: http(RPC) });
}
async function state(id: bigint): Promise<number> {
  return Number(await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "state", args: [id] }));
}
async function treasuryBal(): Promise<bigint> {
  return publicClient.readContract({ address: addresses.asset, abi: erc20Abi, functionName: "balanceOf", args: [addresses.treasury] }) as Promise<bigint>;
}

async function main() {
  if (!addresses.timelock) throw new Error("Ten wariant nie ma timelocka — uzyj DEPLOYED_FILE=deployed-timelocked.json");

  const attacker = walletFor("ATTACKER_PRIVATE_KEY");
  const attackerAddr = attacker.account.address;

  console.log("\n🛡️  DAO-WARDEN — Etap 7: obrona timelockiem (agent anuluje w oknie)\n");
  console.log(`   Governor : ${addresses.governor}`);
  console.log(`   Timelock : ${addresses.timelock}`);
  console.log(`   warstwa LLM: ${llmAvailable() ? "AKTYWNA" : "wyłączona"}`);
  console.log(`   agent = CANCELLER: ${(await agentIsCanceller()) ? "TAK" : "NIE"}\n`);

  // --- 1) Atakujacy zdobywa sile glosu (uczciwi apatyczni — nikt nie broni glosem) ---
  console.log("1) Atakujący deleguje sobie siłę głosu (uczciwi milczą)");
  const aDeleg = await attacker.writeContract({ address: addresses.token, abi: votesTokenAbi, functionName: "delegate", args: [attackerAddr] });
  await publicClient.waitForTransactionReceipt({ hash: aDeleg });
  console.log(`   atakujący: ${(await publicClient.readContract({ address: addresses.token, abi: votesTokenAbi, functionName: "getVotes", args: [attackerAddr] })) / 10n ** 18n} WGOV siły\n`);

  // --- 2) Propozycja drenujaca caly skarbiec ---
  console.log("2) Atakujący składa propozycję drenującą skarbiec");
  const amount = 1_000_000n * 10n ** 6n;
  const description = "WGIP-T7: Grant operacyjny na rozwój ekosystemu";
  const calldata = encodeFunctionData({ abi: treasuryAbi, functionName: "withdraw", args: [addresses.asset, attackerAddr, amount] });
  const targets = [addresses.treasury] as Address[];
  const values = [0n];
  const calldatas = [calldata] as Hex[];
  const descHash = keccak256(toBytes(description));

  const proposeTx = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "propose", args: [targets, values, calldatas, description] });
  const proposeRcpt = await publicClient.waitForTransactionReceipt({ hash: proposeTx });
  const proposalId = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "hashProposal", args: [targets, values, calldatas, descHash] }) as bigint;
  console.log(`   propozycja …${proposalId.toString().slice(-6)} (blok ${proposeRcpt.blockNumber})\n`);

  // --- 3) Agent wykrywa (ta sama logika detekcji co Etapy 3-5) ---
  console.log("3) Agent analizuje propozycję");
  const decoded = decodeProposal({ proposalId, proposer: attackerAddr, description, voteStart: 0n, voteEnd: 0n, targets, values, calldatas });
  const report = await scoreProposal(decoded, proposeRcpt.blockNumber);
  const llm = llmAvailable() ? await analyzeNarrative(decoded).catch(() => undefined) : undefined;
  const decision = decide(report, llm);
  console.log(`   rdzeń: ${report.level} ${report.score}/100${llm ? ` | LLM: ${llm.verdict} ${llm.mismatchScore}/100` : ""}`);
  console.log(`   DECYZJA: ${decision.action} (obrona przeniesie się do okna timelocka)\n`);

  // --- 4) Glosowanie: atak wygrywa (agent nie ma sily glosu w tym scenariuszu) ---
  console.log("4) Okno głosowania — atak wygrywa (pierwsza warstwa nieaktywna)");
  while ((await state(proposalId)) === 0) { process.stdout.write("."); await sleep(1500); }
  const atkVote = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "castVote", args: [proposalId, 1] });
  await publicClient.waitForTransactionReceipt({ hash: atkVote });
  console.log(" -> atakujący zagłosował ZA");

  const deadline = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "proposalDeadline", args: [proposalId] }) as bigint;
  while (((await publicClient.getBlock()).timestamp) <= deadline) { process.stdout.write("."); await sleep(2000); }
  console.log(` -> ${STATE[await state(proposalId)]} (Succeeded = atak wygrał głosowanie)\n`);

  // --- 5) Kolejkowanie do timelocka (dowolny moze; robi to atakujacy) ---
  console.log("5) Propozycja trafia do kolejki timelocka");
  const queueTx = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "queue", args: [targets, values, calldatas, descHash] });
  await publicClient.waitForTransactionReceipt({ hash: queueTx });
  console.log(` -> ${STATE[await state(proposalId)]} (Queued — start okna obronnego minDelay)\n`);

  // --- 6) OBRONA: agent anuluje operacje w oknie minDelay ---
  console.log("6) Agent reaguje w oknie obronnym");
  const opId = await operationIdFor(targets, values, calldatas, descHash);
  console.log(`   id operacji na timelocku: ${opId.slice(0, 18)}… (pending: ${await isOperationPending(opId)})`);
  if (decision.action !== "VOTE_NO") { console.log("   agent poniżej progu — NIE anuluje (atak przejdzie po minDelay)"); }
  else {
    const cancelTx = await cancelOperation(opId);
    console.log(`   anulowano (tx ${cancelTx.slice(0, 12)}…)`);
  }
  console.log();

  // --- 7) Weryfikacja: stan Canceled, skarbiec caly, execute niemozliwe ---
  console.log("7) Weryfikacja");
  const finalState = await state(proposalId);
  const bal = await treasuryBal();
  console.log(`   stan propozycji: ${STATE[finalState]}`);
  console.log(`   skarbiec: ${bal / 10n ** 6n} mUSD`);

  let executeReverted = false;
  try {
    await publicClient.simulateContract({ address: addresses.governor, abi: governorAbi, functionName: "execute", args: [targets, values, calldatas, descHash], account: attackerAddr });
  } catch { executeReverted = true; }
  console.log(`   próba execute przez atakującego: ${executeReverted ? "ODRZUCONA ✅" : "PRZESZŁA ❌"}\n`);

  if (finalState === 2 && bal === amount && executeReverted) {
    console.log("✅ ATAK POWSTRZYMANY przez timelock — agent anulował operację w oknie obronnym.");
    console.log("   Ta warstwa działa nawet gdy agent NIE zdąży/zdoła zagłosować (Etap 5).");
  } else {
    console.log("⚠️  Stan inny niż oczekiwany — sprawdź role/timing.");
  }
}

main().catch((e) => { console.error("Błąd demo:", e); process.exit(1); });
