// Reakcja agenta (Etap 5): oddanie głosu NIE (support=0) z portfela agenta.
// Agent głosuje siłą, którą oddelegowali mu apatyczni uczciwi posiadacze.
import { formatUnits } from "viem";
import { publicClient, addresses } from "./config.js";
import { governorAbi, votesTokenAbi } from "./abi.js";
import { agentWalletClient, agentAccount } from "./wallet.js";

/// Ile siły głosu ma obecnie agent (z delegacji).
export async function agentVotingPower(): Promise<bigint> {
  return publicClient.readContract({
    address: addresses.token,
    abi: votesTokenAbi,
    functionName: "getVotes",
    args: [agentAccount().address],
  });
}

/// Oddaje głos NIE na wskazaną propozycję. Zwraca hash transakcji.
export async function castNoVote(proposalId: bigint): Promise<`0x${string}`> {
  const account = agentAccount();
  const power = await agentVotingPower();
  console.log(
    `   🛡️  agent (${account.address}) głosuje NIE siłą ${formatUnits(power, 18)} WGOV`,
  );

  const wallet = agentWalletClient();
  const hash = await wallet.writeContract({
    address: addresses.governor,
    abi: governorAbi,
    functionName: "castVote",
    args: [proposalId, 0], // 0 = Against (NIE)
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
