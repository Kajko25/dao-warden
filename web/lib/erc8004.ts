// ERC-8004 reads: the agent's on-chain identity, its filed decisions
// (validation requests) and the validator's attestations + reputation summary.
import { publicClient } from "./chain";
import { identityRegistryAbi, validationRegistryAbi } from "./abi";
import { ERC8004, ROLES } from "./deployments";
import type { Address, Hex } from "viem";

export interface ValidationView {
  requestHash: Hex;
  validator: Address;
  /** 0-100 attestation score; 0 with lastUpdate==requestTime means "not yet answered". */
  response: number;
  tag: string;
  lastUpdate: bigint;
  answered: boolean;
}

export interface AuditTrail {
  agentOwner: Address;
  agentURI: string;
  totalRegistered: bigint;
  reputationCount: number;
  reputationAvg: number;
  validations: ValidationView[];
}

export async function fetchAuditTrail(): Promise<AuditTrail> {
  const { identityRegistry, validationRegistry, agentId } = ERC8004;

  const [agentOwner, agentURI, totalRegistered, hashes, summary] = await Promise.all([
    publicClient.readContract({ address: identityRegistry, abi: identityRegistryAbi, functionName: "ownerOf", args: [agentId] }),
    publicClient.readContract({ address: identityRegistry, abi: identityRegistryAbi, functionName: "tokenURI", args: [agentId] }),
    publicClient.readContract({ address: identityRegistry, abi: identityRegistryAbi, functionName: "totalRegistered" }),
    publicClient.readContract({ address: validationRegistry, abi: validationRegistryAbi, functionName: "getAgentValidations", args: [agentId] }),
    publicClient.readContract({ address: validationRegistry, abi: validationRegistryAbi, functionName: "getSummary", args: [agentId, [ROLES.validator], ""] }),
  ]);

  const validations = await Promise.all(
    hashes.map(async (requestHash): Promise<ValidationView> => {
      const [validatorAddress, , response, responseHash, tag, lastUpdate] =
        await publicClient.readContract({
          address: validationRegistry,
          abi: validationRegistryAbi,
          functionName: "getValidationStatus",
          args: [requestHash],
        });
      return {
        requestHash,
        validator: validatorAddress,
        response,
        tag,
        lastUpdate,
        answered: responseHash !== "0x0000000000000000000000000000000000000000000000000000000000000000",
      };
    }),
  );

  return {
    agentOwner,
    agentURI,
    totalRegistered,
    reputationCount: Number(summary[0]),
    reputationAvg: Number(summary[1]),
    validations,
  };
}
