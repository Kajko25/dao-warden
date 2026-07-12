// Proposal instruction parser: turns raw (targets, values, calldatas) into structured
// "intents" that the scoring layer understands.
import { decodeFunctionData, slice, type Address, type Hex } from "viem";
import { treasuryAbi } from "./abi.js";
import { addresses } from "./config.js";

export type Intent =
  | {
      kind: "treasury-withdraw"; // a recognized fund movement out of the treasury
      target: Address;
      asset: Address;
      to: Address;
      amount: bigint;
      value: bigint; // native value (USDC) attached to the call
    }
  | {
      kind: "unknown"; // calldata we cannot decode
      target: Address;
      selector: Hex;
      value: bigint;
      raw: Hex;
    };

export interface DecodedProposal {
  proposalId: bigint;
  proposer: Address;
  description: string;
  voteStart: bigint;
  voteEnd: bigint;
  intents: Intent[];
}

/// Decodes a single action (target + calldata + value) into an intent.
function decodeAction(target: Address, calldata: Hex, value: bigint): Intent {
  // We recognize a Treasury.withdraw call by its ABI (selector 0xd9caed12).
  try {
    const decoded = decodeFunctionData({ abi: treasuryAbi, data: calldata });
    if (decoded.functionName === "withdraw") {
      const [asset, to, amount] = decoded.args as [Address, Address, bigint];
      return { kind: "treasury-withdraw", target, asset, to, amount, value };
    }
  } catch {
    // does not match a known ABI — falls through to "unknown"
  }
  const selector = (calldata.length >= 10 ? slice(calldata, 0, 4) : "0x") as Hex;
  return { kind: "unknown", target, selector, value, raw: calldata };
}

export function decodeProposal(args: {
  proposalId: bigint;
  proposer: Address;
  description: string;
  voteStart: bigint;
  voteEnd: bigint;
  targets: readonly Address[];
  values: readonly bigint[];
  calldatas: readonly Hex[];
}): DecodedProposal {
  const intents: Intent[] = args.targets.map((target, i) =>
    decodeAction(target, args.calldatas[i] ?? "0x", args.values[i] ?? 0n),
  );
  return {
    proposalId: args.proposalId,
    proposer: args.proposer,
    description: args.description,
    voteStart: args.voteStart,
    voteEnd: args.voteEnd,
    intents,
  };
}

/// Does this intent move funds out of OUR treasury (target == Treasury)?
export function isTreasuryDrain(intent: Intent): boolean {
  return (
    intent.kind === "treasury-withdraw" &&
    intent.target.toLowerCase() === addresses.treasury.toLowerCase()
  );
}
