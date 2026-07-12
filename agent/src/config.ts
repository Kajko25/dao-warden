// Configuration: loads addresses from docs/deployed.json (a single source of truth),
// defines the Arc chain for viem, and creates a public (read-only) client.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as loadEnv } from "dotenv";
import { createPublicClient, defineChain, http, getAddress, type Address } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", ".."); // agent/src -> dao-warden

// The project .env (ARC_TESTNET_RPC_URL, etc.) lives in the repo root.
loadEnv({ path: join(repoRoot, ".env") });

const RPC_URL = process.env.ARC_TESTNET_RPC_URL;
if (!RPC_URL) throw new Error("Missing ARC_TESTNET_RPC_URL in .env");

type Deployed = {
  chainId: number;
  // Timelock is optional — only the mitigated variants have it (Stage 7).
  contracts: {
    GovToken: Address;
    DAOGovernor: Address;
    Treasury: Address;
    MockAsset: Address;
    Timelock?: Address;
  };
  roles: Record<string, Address>;
};
// DEPLOYED_FILE lets you target a DAO variant (e.g. deployed-fast.json for Stages 5-7).
const deployedFile = process.env.DEPLOYED_FILE ?? "deployed.json";
const deployed: Deployed = JSON.parse(
  readFileSync(join(repoRoot, "docs", deployedFile), "utf8"),
);

export const arcTestnet = defineChain({
  id: deployed.chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: arcTestnet,
  // Arc RPC does not always support persistent filters -> we force polling via getLogs.
  transport: http(RPC_URL),
});

export const addresses = {
  governor: getAddress(deployed.contracts.DAOGovernor),
  token: getAddress(deployed.contracts.GovToken),
  treasury: getAddress(deployed.contracts.Treasury),
  asset: getAddress(deployed.contracts.MockAsset),
  // undefined in the vulnerable variants (no timelock)
  timelock: deployed.contracts.Timelock ? getAddress(deployed.contracts.Timelock) : undefined,
};

export const roles = deployed.roles;
