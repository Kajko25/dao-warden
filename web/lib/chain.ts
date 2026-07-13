// Arc Testnet chain definition + the read-only client the dashboard uses.
// Everything on this dashboard is a public read — no keys ever reach the browser.
import { createPublicClient, defineChain, http } from "viem";
import { ARC_CHAIN_ID, DEFAULT_RPC_URL } from "./deployments";

const RPC_URL = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? DEFAULT_RPC_URL;

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(RPC_URL, { batch: true }),
});
