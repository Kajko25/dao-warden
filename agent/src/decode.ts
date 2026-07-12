// Parser instrukcji propozycji: zamienia surowe (targets, values, calldatas)
// na ustrukturyzowane "intencje", ktore rozumie warstwa scoringu.
import { decodeFunctionData, slice, type Address, type Hex } from "viem";
import { treasuryAbi } from "./abi.js";
import { addresses } from "./config.js";

export type Intent =
  | {
      kind: "treasury-withdraw"; // rozpoznany ruch srodkow ze skarbca
      target: Address;
      asset: Address;
      to: Address;
      amount: bigint;
      value: bigint; // natywna wartosc (USDC) dolaczona do calla
    }
  | {
      kind: "unknown"; // calldata, ktorej nie potrafimy zdekodowac
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

/// Dekoduje pojedyncza akcje (target + calldata + value) na intencje.
function decodeAction(target: Address, calldata: Hex, value: bigint): Intent {
  // Rozpoznajemy wywolanie Treasury.withdraw po ABI (selektor 0xd9caed12).
  try {
    const decoded = decodeFunctionData({ abi: treasuryAbi, data: calldata });
    if (decoded.functionName === "withdraw") {
      const [asset, to, amount] = decoded.args as [Address, Address, bigint];
      return { kind: "treasury-withdraw", target, asset, to, amount, value };
    }
  } catch {
    // nie pasuje do znanego ABI — spada do "unknown"
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

/// Czy dana intencja rusza srodki z NASZEGO skarbca (target == Treasury)?
export function isTreasuryDrain(intent: Intent): boolean {
  return (
    intent.kind === "treasury-withdraw" &&
    intent.target.toLowerCase() === addresses.treasury.toLowerCase()
  );
}
