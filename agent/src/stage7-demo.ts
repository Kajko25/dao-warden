// Stage 7 — end-to-end demonstration of the SECOND defense layer: timelock + agent-canceller.
//
// Difference from Stage 5: there the agent defended DURING voting (a NO vote with delegated
// power). Here we reproduce a scenario in which the agent has NO voting power in the voting
// window (the honest holders are apathetic, nobody delegated) — the attack WINS the vote. The
// defense moves to the window AFTER voting: the proposal must pass through the timelock
// (minDelay), and the agent with CANCELLER_ROLE cancels the queued drain operation before it
// becomes executable.
//
// Result: state = Canceled, treasury intact. This proves the timelock provides a defense window
// even when the first layer (the vote) fails.
//
// Run: DEPLOYED_FILE=deployed-timelocked.json npm run stage7
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
  if (!pk) throw new Error(`Missing ${envKey} in .env`);
  return createWalletClient({ account: privateKeyToAccount(pk as Hex), chain: arcTestnet, transport: http(RPC) });
}
async function state(id: bigint): Promise<number> {
  return Number(await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "state", args: [id] }));
}
async function treasuryBal(): Promise<bigint> {
  return publicClient.readContract({ address: addresses.asset, abi: erc20Abi, functionName: "balanceOf", args: [addresses.treasury] }) as Promise<bigint>;
}

async function main() {
  if (!addresses.timelock) throw new Error("This variant has no timelock — use DEPLOYED_FILE=deployed-timelocked.json");

  const attacker = walletFor("ATTACKER_PRIVATE_KEY");
  const attackerAddr = attacker.account.address;

  console.log("\n🛡️  DAO-WARDEN — Stage 7: timelock defense (agent cancels in the window)\n");
  console.log(`   Governor : ${addresses.governor}`);
  console.log(`   Timelock : ${addresses.timelock}`);
  console.log(`   LLM layer: ${llmAvailable() ? "ACTIVE" : "disabled"}`);
  console.log(`   agent = CANCELLER: ${(await agentIsCanceller()) ? "YES" : "NO"}\n`);

  // --- 1) The attacker acquires voting power (honest holders apathetic — nobody defends by vote) ---
  console.log("1) The attacker delegates voting power to itself (honest holders stay silent)");
  const aDeleg = await attacker.writeContract({ address: addresses.token, abi: votesTokenAbi, functionName: "delegate", args: [attackerAddr] });
  await publicClient.waitForTransactionReceipt({ hash: aDeleg });
  console.log(`   attacker: ${(await publicClient.readContract({ address: addresses.token, abi: votesTokenAbi, functionName: "getVotes", args: [attackerAddr] })) / 10n ** 18n} WGOV of power\n`);

  // --- 2) A proposal draining the entire treasury ---
  console.log("2) The attacker submits a treasury-draining proposal");
  const amount = 1_000_000n * 10n ** 6n;
  const description = "WGIP-T7: Operational grant for ecosystem growth";
  const calldata = encodeFunctionData({ abi: treasuryAbi, functionName: "withdraw", args: [addresses.asset, attackerAddr, amount] });
  const targets = [addresses.treasury] as Address[];
  const values = [0n];
  const calldatas = [calldata] as Hex[];
  const descHash = keccak256(toBytes(description));

  const proposeTx = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "propose", args: [targets, values, calldatas, description] });
  const proposeRcpt = await publicClient.waitForTransactionReceipt({ hash: proposeTx });
  const proposalId = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "hashProposal", args: [targets, values, calldatas, descHash] }) as bigint;
  console.log(`   proposal …${proposalId.toString().slice(-6)} (block ${proposeRcpt.blockNumber})\n`);

  // --- 3) The agent detects (the same detection logic as Stages 3-5) ---
  console.log("3) The agent analyzes the proposal");
  const decoded = decodeProposal({ proposalId, proposer: attackerAddr, description, voteStart: 0n, voteEnd: 0n, targets, values, calldatas });
  const report = await scoreProposal(decoded, proposeRcpt.blockNumber);
  const llm = llmAvailable() ? await analyzeNarrative(decoded).catch(() => undefined) : undefined;
  const decision = decide(report, llm);
  console.log(`   core: ${report.level} ${report.score}/100${llm ? ` | LLM: ${llm.verdict} ${llm.mismatchScore}/100` : ""}`);
  console.log(`   DECISION: ${decision.action} (defense moves to the timelock window)\n`);

  // --- 4) Voting: the attack wins (the agent has no voting power in this scenario) ---
  console.log("4) Voting window — the attack wins (the first layer is inactive)");
  while ((await state(proposalId)) === 0) { process.stdout.write("."); await sleep(1500); }
  const atkVote = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "castVote", args: [proposalId, 1] });
  await publicClient.waitForTransactionReceipt({ hash: atkVote });
  console.log(" -> attacker voted YES");

  const deadline = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "proposalDeadline", args: [proposalId] }) as bigint;
  while (((await publicClient.getBlock()).timestamp) <= deadline) { process.stdout.write("."); await sleep(2000); }
  console.log(` -> ${STATE[await state(proposalId)]} (Succeeded = the attack won the vote)\n`);

  // --- 5) Queue into the timelock (anyone can; the attacker does it) ---
  console.log("5) The proposal enters the timelock queue");
  const queueTx = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "queue", args: [targets, values, calldatas, descHash] });
  await publicClient.waitForTransactionReceipt({ hash: queueTx });
  console.log(` -> ${STATE[await state(proposalId)]} (Queued — the minDelay defense window starts)\n`);

  // --- 6) DEFENSE: the agent cancels the operation in the minDelay window ---
  console.log("6) The agent reacts in the defense window");
  const opId = await operationIdFor(targets, values, calldatas, descHash);
  console.log(`   timelock operation id: ${opId.slice(0, 18)}… (pending: ${await isOperationPending(opId)})`);
  if (decision.action !== "VOTE_NO") { console.log("   agent below threshold — does NOT cancel (the attack will pass after minDelay)"); }
  else {
    const cancelTx = await cancelOperation(opId);
    console.log(`   cancelled (tx ${cancelTx.slice(0, 12)}…)`);
  }
  console.log();

  // --- 7) Verification: state Canceled, treasury intact, execute impossible ---
  console.log("7) Verification");
  const finalState = await state(proposalId);
  const bal = await treasuryBal();
  console.log(`   proposal state: ${STATE[finalState]}`);
  console.log(`   treasury: ${bal / 10n ** 6n} mUSD`);

  let executeReverted = false;
  try {
    await publicClient.simulateContract({ address: addresses.governor, abi: governorAbi, functionName: "execute", args: [targets, values, calldatas, descHash], account: attackerAddr });
  } catch { executeReverted = true; }
  console.log(`   attacker's execute attempt: ${executeReverted ? "REJECTED ✅" : "PASSED ❌"}\n`);

  if (finalState === 2 && bal === amount && executeReverted) {
    console.log("✅ ATTACK STOPPED by the timelock — the agent cancelled the operation in the defense window.");
    console.log("   This layer works even when the agent cannot / does not vote (Stage 5).");
  } else {
    console.log("⚠️  State different than expected — check roles/timing.");
  }
}

main().catch((e) => { console.error("Demo error:", e); process.exit(1); });
