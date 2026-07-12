// Agent reaction (Stage 5): casting a NO vote (support=0) from the agent's wallet.
// The agent votes with the power delegated to it by apathetic honest holders.
import { formatUnits } from "viem";
import { publicClient, addresses } from "./config.js";
import { governorAbi, votesTokenAbi } from "./abi.js";
import { agentWalletClient, agentAccount } from "./wallet.js";

/// How much voting power the agent currently holds (from delegation).
export async function agentVotingPower(): Promise<bigint> {
  return publicClient.readContract({
    address: addresses.token,
    abi: votesTokenAbi,
    functionName: "getVotes",
    args: [agentAccount().address],
  });
}

/// Casts a NO vote on the given proposal. Returns the transaction hash.
export async function castNoVote(proposalId: bigint): Promise<`0x${string}`> {
  const account = agentAccount();
  const power = await agentVotingPower();
  console.log(
    `   🛡️  agent (${account.address}) votes NO with ${formatUnits(power, 18)} WGOV`,
  );

  const wallet = agentWalletClient();
  const hash = await wallet.writeContract({
    address: addresses.governor,
    abi: governorAbi,
    functionName: "castVote",
    args: [proposalId, 0], // 0 = Against (NO)
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
