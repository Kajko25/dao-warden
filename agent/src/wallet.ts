// Portfel agenta (Etap 5) — klient do WYSYŁANIA transakcji (głos NIE), nie tylko odczytu.
// Klucz agenta wyłącznie ze zmiennej środowiskowej AGENT_PRIVATE_KEY.
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "./config.js";

const RPC_URL = process.env.ARC_TESTNET_RPC_URL!;

export function agentAccount() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) throw new Error("Brak AGENT_PRIVATE_KEY w .env");
  return privateKeyToAccount(pk as Hex);
}

export function agentWalletClient() {
  return createWalletClient({
    account: agentAccount(),
    chain: arcTestnet,
    transport: http(RPC_URL),
  });
}
