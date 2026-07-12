// Reakcja agenta w Etapie 7: anulowanie zakolejkowanej operacji ataku na timelocku.
// To DRUGA warstwa obrony — dziala PO wygranym glosowaniu, w oknie minDelay
// (komplementarna do glosu NIE z Etapu 5, ktory dziala W TRAKCIE glosowania).
import { keccak256, encodeAbiParameters, padHex, type Address, type Hex } from "viem";
import { publicClient, addresses } from "./config.js";
import { timelockAbi } from "./abi.js";
import { agentWalletClient, agentAccount } from "./wallet.js";

function requireTimelock(): Address {
  if (!addresses.timelock) {
    throw new Error("Ten wariant DAO nie ma timelocka (brak Timelock w deployed-*.json)");
  }
  return addresses.timelock;
}

/// Sol z operacji timelocka tak, jak liczy go GovernorTimelockControl:
/// salt = bytes20(adres governora) XOR descriptionHash.
/// bytes20 jest w Solidity rozszerzane do bytes32 wyrownaniem DO LEWEJ
/// (dopelnienie zerami z prawej) — stad padHex(..., dir: "right").
export function timelockSalt(governor: Address, descriptionHash: Hex): Hex {
  const gov = BigInt(padHex(governor, { size: 32, dir: "right" }));
  const desc = BigInt(descriptionHash);
  return `0x${(gov ^ desc).toString(16).padStart(64, "0")}` as Hex;
}

/// Id operacji batch w timelocku — liczone LOKALNIE (keccak z abi.encode),
/// nizej weryfikowane z on-chain hashOperationBatch (podwojna kontrola).
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

/// Wyznacza id operacji dla propozycji Governora (predecessor=0, sol jak wyzej)
/// i weryfikuje zgodnosc wyliczenia lokalnego z on-chain.
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
    throw new Error(`Rozjazd id operacji: lokalnie ${local}, on-chain ${onchain}`);
  }
  return local;
}

/// Czy operacja czeka w kolejce timelocka (Waiting/Ready)?
export async function isOperationPending(operationId: Hex): Promise<boolean> {
  return publicClient.readContract({
    address: requireTimelock(),
    abi: timelockAbi,
    functionName: "isOperationPending",
    args: [operationId],
  });
}

/// Czy agent ma na timelocku CANCELLER_ROLE (uprawnienie do anulowania)?
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

/// Anuluje operacje w oknie obronnym. Zwraca hash transakcji.
export async function cancelOperation(operationId: Hex): Promise<Hex> {
  const timelock = requireTimelock();
  console.log(`   🛡️  agent (${agentAccount().address}) anuluje operację ${operationId.slice(0, 12)}… na timelocku`);
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
