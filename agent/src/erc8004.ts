// ERC-8004 (Etap 6): adresy rejestrow, ABI i klienci portfeli agenta/walidatora.
// Rejestry sa NIEZALEZNE od wariantu DAO (DEPLOYED_FILE) — laduja sie zawsze z
// docs/deployed-erc8004.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWalletClient, http, getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./config.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const RPC_URL = process.env.ARC_TESTNET_RPC_URL!;

type DeployedErc8004 = {
  contracts: { IdentityRegistry: Address; ValidationRegistry: Address };
  agent: { agentId: number; owner: Address; agentURI: string };
  validator: Address;
};

const deployed: DeployedErc8004 = JSON.parse(
  readFileSync(join(repoRoot, "docs", "deployed-erc8004.json"), "utf8"),
);

export const erc8004 = {
  identityRegistry: getAddress(deployed.contracts.IdentityRegistry),
  validationRegistry: getAddress(deployed.contracts.ValidationRegistry),
  agentId: BigInt(deployed.agent.agentId),
  agentOwner: getAddress(deployed.agent.owner),
  agentURI: deployed.agent.agentURI,
  validator: getAddress(deployed.validator),
};

// --- ABI (tylko to, czego uzywa agent) ---

export const identityRegistryAbi = [
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "function", name: "getAgentWallet", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "getMetadata", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }, { name: "metadataKey", type: "string" }], outputs: [{ type: "bytes" }] },
  { type: "function", name: "totalRegistered", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "register", stateMutability: "nonpayable",
    inputs: [
      { name: "agentURI", type: "string" },
      { name: "metadata", type: "tuple[]", components: [{ name: "metadataKey", type: "string" }, { name: "metadataValue", type: "bytes" }] },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
] as const;

export const validationRegistryAbi = [
  { type: "function", name: "validationRequest", stateMutability: "nonpayable", inputs: [{ name: "validatorAddress", type: "address" }, { name: "agentId", type: "uint256" }, { name: "requestURI", type: "string" }, { name: "requestHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "validationResponse", stateMutability: "nonpayable", inputs: [{ name: "requestHash", type: "bytes32" }, { name: "response", type: "uint8" }, { name: "responseURI", type: "string" }, { name: "responseHash", type: "bytes32" }, { name: "tag", type: "string" }], outputs: [] },
  { type: "function", name: "getValidationStatus", stateMutability: "view", inputs: [{ name: "requestHash", type: "bytes32" }], outputs: [{ name: "validatorAddress", type: "address" }, { name: "agentId", type: "uint256" }, { name: "response", type: "uint8" }, { name: "responseHash", type: "bytes32" }, { name: "tag", type: "string" }, { name: "lastUpdate", type: "uint256" }] },
  { type: "function", name: "getSummary", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }, { name: "validatorAddresses", type: "address[]" }, { name: "tag", type: "string" }], outputs: [{ name: "count", type: "uint64" }, { name: "averageResponse", type: "uint8" }] },
  { type: "function", name: "getAgentValidations", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "bytes32[]" }] },
  { type: "function", name: "getValidatorRequests", stateMutability: "view", inputs: [{ name: "validatorAddress", type: "address" }], outputs: [{ type: "bytes32[]" }] },
] as const;

// --- Klienci portfeli ---

export function walletClientFor(envKey: string) {
  const pk = process.env[envKey];
  if (!pk) throw new Error(`Brak ${envKey} w .env`);
  return createWalletClient({ account: privateKeyToAccount(pk as Hex), chain: arcTestnet, transport: http(RPC_URL) });
}

export const agentAddressFromEnv = () => privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex).address;
export const validatorAddressFromEnv = () => privateKeyToAccount(process.env.VALIDATOR_PRIVATE_KEY as Hex).address;
