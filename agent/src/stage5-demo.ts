// Stage 5 — end-to-end demonstration: the agent DEFENDS the treasury.
//
// Scenario: an honest (apathetic) holder delegates voting power to the agent. The attacker
// submits a treasury-draining proposal and votes YES. The agent detects the attack
// (deterministic core + LLM), decides to react, and votes NO with the delegated power.
// Result: For 50k < Against 100k -> proposal DEFEATED, treasury intact.
//
// Contrast with Stage 2 (no agent): there the honest holder stayed silent -> the attack passed.
//
// Run: DEPLOYED_FILE=deployed-fast.json npm run stage5
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
  if (!pk) throw new Error(`Missing ${envKey} in .env`);
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

  console.log("\n🛡️  DAO-WARDEN — Stage 5: the agent defends the treasury (fast DAO variant)\n");
  console.log(`   Governor : ${addresses.governor}`);
  console.log(`   LLM layer: ${llmAvailable() ? "ACTIVE" : "disabled"}\n`);

  // --- 1) Delegations: the honest holder gives power to the agent; the attacker to itself ---
  console.log("1) Voting-power delegations");
  const hDeleg = await honest.writeContract({ address: addresses.token, abi: votesTokenAbi, functionName: "delegate", args: [agentAddr] });
  await publicClient.waitForTransactionReceipt({ hash: hDeleg });
  const aDeleg = await attacker.writeContract({ address: addresses.token, abi: votesTokenAbi, functionName: "delegate", args: [attackerAddr] });
  await publicClient.waitForTransactionReceipt({ hash: aDeleg });
  console.log(`   honest -> agent: the agent now has ${(await agentVotingPower()) / 10n ** 18n} WGOV of power`);
  console.log(`   attacker -> self: ${(await publicClient.readContract({ address: addresses.token, abi: votesTokenAbi, functionName: "getVotes", args: [attackerAddr] })) / 10n ** 18n} WGOV\n`);

  // --- 2) The attacker submits a treasury-draining proposal ---
  console.log("2) The attacker submits a treasury-draining proposal");
  const amount = 1_000_000n * 10n ** 6n; // the entire mUSD treasury
  const description = "WGIP-2: Q3 marketing grant for growth campaigns";
  const calldata = encodeFunctionData({ abi: treasuryAbi, functionName: "withdraw", args: [addresses.asset, attackerAddr, amount] });
  const targets = [addresses.treasury] as Address[];
  const values = [0n];
  const calldatas = [calldata] as Hex[];
  const descHash = keccak256(toBytes(description));

  const proposeTx = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "propose", args: [targets, values, calldatas, description] });
  const proposeRcpt = await publicClient.waitForTransactionReceipt({ hash: proposeTx });
  const proposalId = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "hashProposal", args: [targets, values, calldatas, descHash] }) as bigint;
  console.log(`   proposal …${proposalId.toString().slice(-6)} submitted (block ${proposeRcpt.blockNumber})\n`);

  // --- 3) The agent detects and decides (the real agent logic) ---
  console.log("3) The agent analyzes the proposal");
  const decoded = decodeProposal({ proposalId, proposer: attackerAddr, description, voteStart: 0n, voteEnd: 0n, targets, values, calldatas });
  const report = await scoreProposal(decoded, proposeRcpt.blockNumber);
  const llm = llmAvailable() ? await analyzeNarrative(decoded).catch(() => undefined) : undefined;
  const decision = decide(report, llm);
  console.log(`   core: ${report.level} ${report.score}/100${llm ? ` | LLM: ${llm.verdict} ${llm.mismatchScore}/100` : ""}`);
  console.log(`   DECISION: ${decision.action}`);
  for (const r of decision.reasons) console.log(`     - ${r}`);
  console.log();

  // --- 4) Voting: the attacker YES, the agent (if it decided so) NO ---
  console.log("4) Voting window");
  while ((await state(proposalId)) === 0) { process.stdout.write("."); await sleep(1500); }
  console.log(" -> Active");

  const atkVote = await attacker.writeContract({ address: addresses.governor, abi: governorAbi, functionName: "castVote", args: [proposalId, 1] });
  await publicClient.waitForTransactionReceipt({ hash: atkVote });
  console.log("   attacker voted YES (50k)");

  if (decision.action === "VOTE_NO") {
    const tx = await castNoVote(proposalId);
    console.log(`   NO vote cast (tx ${tx.slice(0, 12)}…)`);
  } else {
    console.log("   the agent does NOT react (below threshold) — the attack will pass");
  }

  const [against, forV] = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "proposalVotes", args: [proposalId] }) as [bigint, bigint, bigint];
  console.log(`   vote tally: YES ${forV / 10n ** 18n} / NO ${against / 10n ** 18n}\n`);

  // --- 5) End of voting: check the result ---
  console.log("5) Waiting for the end of voting");
  const deadline = await publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "proposalDeadline", args: [proposalId] }) as bigint;
  while (true) {
    const now = (await publicClient.getBlock()).timestamp;
    if (now > deadline) break;
    process.stdout.write("."); await sleep(2000);
  }
  const finalState = await state(proposalId);
  console.log(` -> ${STATE[finalState]}\n`);

  // --- 6) Execution attempt + treasury verification ---
  const treasuryBal = await publicClient.readContract({ address: addresses.asset, abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }], functionName: "balanceOf", args: [addresses.treasury] }) as bigint;

  if (finalState === 3) {
    console.log("✅ ATTACK STOPPED — proposal DEFEATED.");
    console.log(`   Treasury intact: ${treasuryBal / 10n ** 6n} mUSD (the attacker got nothing).`);
    console.log("   Without the agent (Stage 2) the same attack emptied the treasury to zero.");
  } else if (finalState === 4) {
    console.log("❌ Proposal Succeeded — the agent did NOT stop the attack (check threshold/power).");
  } else {
    console.log(`Final state: ${STATE[finalState]}, treasury ${treasuryBal / 10n ** 6n} mUSD`);
  }
}

main().catch((e) => { console.error("Demo error:", e); process.exit(1); });
