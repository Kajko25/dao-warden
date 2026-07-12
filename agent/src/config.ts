// Konfiguracja: laduje adresy z docs/deployed.json (jedno zrodlo prawdy),
// definiuje lancuch Arc dla viem i tworzy publiczny klient (tylko odczyt w Etapie 3).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config as loadEnv } from "dotenv";
import { createPublicClient, defineChain, http, getAddress, type Address } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", ".."); // agent/src -> dao-warden

// .env projektu (ARC_TESTNET_RPC_URL itd.) lezy w katalogu glownym repo.
loadEnv({ path: join(repoRoot, ".env") });

const RPC_URL = process.env.ARC_TESTNET_RPC_URL;
if (!RPC_URL) throw new Error("Brak ARC_TESTNET_RPC_URL w .env");

type Deployed = {
  chainId: number;
  // Timelock jest opcjonalny — maja go tylko warianty zmitygowane (Etap 7).
  contracts: {
    GovToken: Address;
    DAOGovernor: Address;
    Treasury: Address;
    MockAsset: Address;
    Timelock?: Address;
  };
  roles: Record<string, Address>;
};
// DEPLOYED_FILE pozwala celowac w wariant DAO (np. deployed-fast.json dla Etapow 5-7).
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
  // Arc RPC nie zawsze wspiera trwale filtry -> wymuszamy polling przez getLogs.
  transport: http(RPC_URL),
});

export const addresses = {
  governor: getAddress(deployed.contracts.DAOGovernor),
  token: getAddress(deployed.contracts.GovToken),
  treasury: getAddress(deployed.contracts.Treasury),
  asset: getAddress(deployed.contracts.MockAsset),
  // undefined w wariantach podatnych (bez timelocka)
  timelock: deployed.contracts.Timelock ? getAddress(deployed.contracts.Timelock) : undefined,
};

export const roles = deployed.roles;
