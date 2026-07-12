// Audytowalny slad decyzji (Etap 6): agent zapisuje KAZDA ocene propozycji jako
// validationRequest w ValidationRegistry. requestHash = keccak256 kanonicznego
// rekordu decyzji (zobowiazanie — decyzji nie da sie pozniej po cichu zmienic),
// requestURI = ipfs://<CID> tego samego rekordu.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { keccak256, toBytes, type Hex } from "viem";
import { publicClient } from "./config.js";
import { erc8004, validationRegistryAbi, walletClientFor } from "./erc8004.js";
import { ipfsUriForContent } from "./cid.js";
import type { RiskReport } from "./risk.js";
import type { Decision } from "./decide.js";
import type { NarrativeAnalysis } from "./llm.js";

const here = dirname(fileURLToPath(import.meta.url));
const decisionsDir = join(here, "..", "..", "docs", "decisions");

export interface DecisionRecord {
  schema: "dao-warden/decision-v1";
  agentGlobalId: string;
  guardedGovernor: string;
  proposalId: string;
  description: string;
  deterministic: { level: string; score: number; signals: string[] };
  llm: { verdict: string; mismatchScore: number } | null;
  decision: { action: string; reasons: string[] };
}

/// Kanoniczny JSON (klucze posortowane rekurencyjnie) — te same bajty hashujemy,
/// zapisujemy i adresujemy przez CID, wiec hash i URI sa deterministyczne.
function canonical(obj: unknown): string {
  const sort = (v: any): any => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.keys(v).sort().reduce((a, k) => { a[k] = sort(v[k]); return a; }, {} as any);
    }
    return v;
  };
  return JSON.stringify(sort(obj));
}

export function buildDecisionRecord(
  proposalId: bigint,
  description: string,
  guardedGovernor: string,
  report: RiskReport,
  decision: Decision,
  llm?: NarrativeAnalysis,
): DecisionRecord {
  return {
    schema: "dao-warden/decision-v1",
    agentGlobalId: `eip155:${publicClient.chain!.id}:${erc8004.identityRegistry}:${erc8004.agentId}`,
    guardedGovernor,
    proposalId: proposalId.toString(),
    description,
    deterministic: { level: report.level, score: report.score, signals: report.signals.map((s) => s.code) },
    llm: llm ? { verdict: llm.verdict, mismatchScore: llm.mismatchScore } : null,
    decision: { action: decision.action, reasons: decision.reasons },
  };
}

export interface FiledDecision {
  requestHash: Hex;
  requestURI: string;
  txHash: Hex;
  recordPath: string;
}

/// Agent (wlasciciel agentId) sklada rekord decyzji do walidacji. Zwraca hash/URI/tx.
export async function fileDecision(record: DecisionRecord): Promise<FiledDecision> {
  const json = canonical(record);
  const requestHash = keccak256(toBytes(json));
  const requestURI = ipfsUriForContent(json);

  // Zapis lokalny rekordu (content-addressowany; nieprzypiety do publicznego IPFS).
  mkdirSync(decisionsDir, { recursive: true });
  const recordPath = join(decisionsDir, `${requestHash.slice(2, 18)}.json`);
  writeFileSync(recordPath, json + "\n");

  const wallet = walletClientFor("AGENT_PRIVATE_KEY");
  const txHash = await wallet.writeContract({
    address: erc8004.validationRegistry,
    abi: validationRegistryAbi,
    functionName: "validationRequest",
    args: [erc8004.validator, erc8004.agentId, requestURI, requestHash],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { requestHash, requestURI, txHash, recordPath };
}
