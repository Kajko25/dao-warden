// Agent reaction in Stage 7: cancelling the queued attack operation on the timelock.
// This is the SECOND defense layer — it acts AFTER a won vote, in the minDelay window
// (complementary to the NO vote from Stage 5, which acts DURING voting).
import { keccak256, encodeAbiParameters, padHex, type Address, type Hex } from "viem";
import { publicClient, addresses } from "./config.js";
import { timelockAbi } from "./abi.js";
import { agentWalletClient, agentAccount } from "./wallet.js";

function requireTimelock(): Address {
  if (!addresses.timelock) {
    throw new Error("This DAO variant has no timelock (no Timelock in deployed-*.json)");
  }
  return addresses.timelock;
}

/// The timelock operation salt, computed exactly as GovernorTimelockControl does:
/// salt = bytes20(governor address) XOR descriptionHash.
/// In Solidity bytes20 is widened to bytes32 with LEFT alignment (right-padded with
/// zeros) — hence padHex(..., dir: "right").
export function timelockSalt(governor: Address, descriptionHash: Hex): Hex {
  const gov = BigInt(padHex(governor, { size: 32, dir: "right" }));
  const desc = BigInt(descriptionHash);
  return `0x${(gov ^ desc).toString(16).padStart(64, "0")}` as Hex;
}

/// The batch operation id in the timelock — computed LOCALLY (keccak of abi.encode),
/// cross-checked below against the on-chain hashOperationBatch (a double check).
export function hashOperationBatch(
  targets: Address[],
  values: bigint[],
  payloads: Hex[],
  predecessor: Hex,
  salt: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address[]" },
        { type: "uint256[]" },
        { type: "bytes[]" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [targets, values, payloads, predecessor, salt],
    ),
  );
}

/// Determines the operation id for a Governor proposal (predecessor=0, salt as above)
/// and verifies that the local computation matches the on-chain one.
export async function operationIdFor(
  targets: Address[],
  values: bigint[],
  calldatas: Hex[],
  descriptionHash: Hex,
): Promise<Hex> {
  const timelock = requireTimelock();
  const salt = timelockSalt(addresses.governor, descriptionHash);
  const zero = `0x${"0".repeat(64)}` as Hex;

  const local = hashOperationBatch(targets, values, calldatas, zero, salt);
  const onchain = (await publicClient.readContract({
    address: timelock,
    abi: timelockAbi,
    functionName: "hashOperationBatch",
    args: [targets, values, calldatas, zero, salt],
  })) as Hex;
  if (local !== onchain) {
    throw new Error(`Operation id mismatch: local ${local}, on-chain ${onchain}`);
  }
  return local;
}

/// Is the operation waiting in the timelock queue (Waiting/Ready)?
export async function isOperationPending(operationId: Hex): Promise<boolean> {
  return publicClient.readContract({
    address: requireTimelock(),
    abi: timelockAbi,
    functionName: "isOperationPending",
    args: [operationId],
  });
}

/// Does the agent hold CANCELLER_ROLE on the timelock (permission to cancel)?
export async function agentIsCanceller(): Promise<boolean> {
  const timelock = requireTimelock();
  const role = (await publicClient.readContract({
    address: timelock,
    abi: timelockAbi,
    functionName: "CANCELLER_ROLE",
    args: [],
  })) as Hex;
  return publicClient.readContract({
    address: timelock,
    abi: timelockAbi,
    functionName: "hasRole",
    args: [role, agentAccount().address],
  });
}

/// Cancels the operation in the defense window. Returns the transaction hash.
export async function cancelOperation(operationId: Hex): Promise<Hex> {
  const timelock = requireTimelock();
  console.log(`   🛡️  agent (${agentAccount().address}) cancels operation ${operationId.slice(0, 12)}… on the timelock`);
  const wallet = agentWalletClient();
  const hash = await wallet.writeContract({
    address: timelock,
    abi: timelockAbi,
    functionName: "cancel",
    args: [operationId],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
