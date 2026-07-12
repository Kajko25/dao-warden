// Reputation signal (Stage 6): an independent validator scores the agent's filed decision.
// response 0-100 (0 = the decision is wrong, 100 = fully confirmed). getSummary aggregates
// the scores into the agent's reputation.
import { keccak256, toBytes, type Hex } from "viem";
import { publicClient } from "./config.js";
import { erc8004, validationRegistryAbi, walletClientFor } from "./erc8004.js";
import { ipfsUriForContent } from "./cid.js";

/// The validator answers a validation request. Returns the tx hash.
export async function respondToDecision(
  requestHash: Hex,
  response: number, // 0-100
  note: string,
  tag: string,
): Promise<Hex> {
  if (response < 0 || response > 100) throw new Error("response must be 0-100");
  const responseURI = ipfsUriForContent(note);
  const responseHash = keccak256(toBytes(note));

  const wallet = walletClientFor("VALIDATOR_PRIVATE_KEY");
  const txHash = await wallet.writeContract({
    address: erc8004.validationRegistry,
    abi: validationRegistryAbi,
    functionName: "validationResponse",
    args: [requestHash, response, responseURI, responseHash, tag],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

export interface Reputation {
  count: bigint;
  average: number;
}

/// The agent's reputation aggregate (all validators, any tag).
export async function readReputation(tag = ""): Promise<Reputation> {
  const [count, average] = (await publicClient.readContract({
    address: erc8004.validationRegistry,
    abi: validationRegistryAbi,
    functionName: "getSummary",
    args: [erc8004.agentId, [], tag],
  })) as [bigint, number];
  return { count, average };
}

/// The latest (ANSWERED) score for a given request.
export async function readStatus(requestHash: Hex) {
  return publicClient.readContract({
    address: erc8004.validationRegistry,
    abi: validationRegistryAbi,
    functionName: "getValidationStatus",
    args: [requestHash],
  });
}
