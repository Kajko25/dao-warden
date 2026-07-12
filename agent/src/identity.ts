// Tozsamosc agenta (Etap 6): odczyt rejestracji ERC-8004 z IdentityRegistry.
import { getAddress, hexToString, type Address } from "viem";
import { publicClient } from "./config.js";
import { erc8004, identityRegistryAbi } from "./erc8004.js";

export interface AgentIdentity {
  agentId: bigint;
  owner: Address;
  agentURI: string;
  wallet: Address;
  framework: string;
  guards: Address | null;
  validator: Address | null;
  globalId: string; // eip155:<chainId>:<registry>:<agentId>
}

function bytesToAddress(hex: `0x${string}`): Address | null {
  // metadane "guards"/"validator" zapisano jako abi.encodePacked(address) = 20 bajtow.
  if (hex.length !== 42) return null; // 0x + 40
  return getAddress(hex);
}

export async function readAgentIdentity(): Promise<AgentIdentity> {
  const id = erc8004.agentId;
  const [owner, agentURI, wallet, frameworkRaw, guardsRaw, validatorRaw] = await Promise.all([
    publicClient.readContract({ address: erc8004.identityRegistry, abi: identityRegistryAbi, functionName: "ownerOf", args: [id] }),
    publicClient.readContract({ address: erc8004.identityRegistry, abi: identityRegistryAbi, functionName: "tokenURI", args: [id] }),
    publicClient.readContract({ address: erc8004.identityRegistry, abi: identityRegistryAbi, functionName: "getAgentWallet", args: [id] }),
    publicClient.readContract({ address: erc8004.identityRegistry, abi: identityRegistryAbi, functionName: "getMetadata", args: [id, "framework"] }),
    publicClient.readContract({ address: erc8004.identityRegistry, abi: identityRegistryAbi, functionName: "getMetadata", args: [id, "guards"] }),
    publicClient.readContract({ address: erc8004.identityRegistry, abi: identityRegistryAbi, functionName: "getMetadata", args: [id, "validator"] }),
  ]);

  return {
    agentId: id,
    owner: getAddress(owner),
    agentURI,
    wallet: getAddress(wallet),
    framework: frameworkRaw && frameworkRaw !== "0x" ? hexToString(frameworkRaw) : "",
    guards: bytesToAddress(guardsRaw),
    validator: bytesToAddress(validatorRaw),
    globalId: `eip155:${arcChainId()}:${erc8004.identityRegistry}:${id}`,
  };
}

function arcChainId(): number {
  return publicClient.chain!.id;
}
