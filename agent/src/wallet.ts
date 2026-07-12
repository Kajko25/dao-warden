// The agent wallet (Stage 5) — a client for SENDING transactions (the NO vote), not just reads.
// The agent key comes exclusively from the AGENT_PRIVATE_KEY environment variable.
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./config.js";

const RPC_URL = process.env.ARC_TESTNET_RPC_URL!;

export function agentAccount() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) throw new Error("Missing AGENT_PRIVATE_KEY in .env");
  return privateKeyToAccount(pk as Hex);
}

export function agentWalletClient() {
  return createWalletClient({
    account: agentAccount(),
    chain: arcTestnet,
    transport: http(RPC_URL),
  });
}
