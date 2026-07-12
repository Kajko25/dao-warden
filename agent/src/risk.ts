// Risk scoring — ONLY deterministic rules (no LLM; that comes in Stage 4).
// Each rule is an explicit weighted signal; the sum gives a 0..100 score and a risk level.
import { formatUnits, type Address } from "viem";
import { publicClient, addresses } from "./config.js";
import { governorAbi, votesTokenAbi, erc20Abi, QUORUM_DENOMINATOR } from "./abi.js";
import { type DecodedProposal, type Intent, isTreasuryDrain } from "./decode.js";

export interface Signal {
  code: string;
  weight: number;
  detail: string;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskReport {
  proposalId: bigint;
  score: number;
  level: RiskLevel;
  signals: Signal[];
  facts: Record<string, string>;
}

// The on-chain context needed for scoring (read at the moment the proposal is detected).
interface Context {
  totalSupply: bigint;
  quorumThreshold: bigint; // how many votes quorum requires
  proposerVotes: bigint; // the proposer's current voting power
  assetDecimals: number;
  assetSymbol: string;
  // the treasury balance for the asset used in withdraw (key = asset address, lowercase)
  treasuryBalances: Map<string, bigint>;
}

async function gatherContext(p: DecodedProposal, atBlock?: bigint): Promise<Context> {
  // The agent evaluates state AT the proposal's creation moment (its creation block), not the
  // current one — otherwise, after the drain, the treasury balance = 0 and the "% of treasury"
  // rule falsely drops to zero.
  const block = atBlock !== undefined ? { blockNumber: atBlock } : {};
  const [totalSupply, quorumNumerator, proposerVotes] = await Promise.all([
    publicClient.readContract({ address: addresses.token, abi: votesTokenAbi, functionName: "totalSupply", ...block }),
    publicClient.readContract({ address: addresses.governor, abi: governorAbi, functionName: "quorumNumerator", ...block }),
    publicClient.readContract({ address: addresses.token, abi: votesTokenAbi, functionName: "getVotes", args: [p.proposer], ...block }),
  ]);

  const treasuryBalances = new Map<string, bigint>();
  let assetDecimals = 18;
  let assetSymbol = "?";
  for (const intent of p.intents) {
    if (intent.kind !== "treasury-withdraw") continue;
    const key = intent.asset.toLowerCase();
    if (treasuryBalances.has(key)) continue;
    const [bal, dec, sym] = await Promise.all([
      publicClient.readContract({ address: intent.asset, abi: erc20Abi, functionName: "balanceOf", args: [addresses.treasury], ...block }),
      publicClient.readContract({ address: intent.asset, abi: erc20Abi, functionName: "decimals" }),
      publicClient.readContract({ address: intent.asset, abi: erc20Abi, functionName: "symbol" }),
    ]);
    treasuryBalances.set(key, bal);
    assetDecimals = dec;
    assetSymbol = sym;
  }

  return {
    totalSupply,
    quorumThreshold: (totalSupply * quorumNumerator) / QUORUM_DENOMINATOR,
    proposerVotes,
    assetDecimals,
    assetSymbol,
    treasuryBalances,
  };
}

function levelFor(score: number): RiskLevel {
  if (score >= 70) return "CRITICAL";
  if (score >= 45) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

export async function scoreProposal(p: DecodedProposal, atBlock?: bigint): Promise<RiskReport> {
  const ctx = await gatherContext(p, atBlock);
  const signals: Signal[] = [];

  const drains = p.intents.filter(isTreasuryDrain);

  // Rule 1: the proposal moves funds out of the treasury at all.
  if (drains.length > 0) {
    signals.push({ code: "TREASURY_SPEND", weight: 30, detail: `${drains.length} treasury withdrawal(s)` });
  }

  // Rule 2: what fraction of the treasury balance it moves out (per asset, take the max).
  let maxFraction = 0;
  for (const intent of drains) {
    if (intent.kind !== "treasury-withdraw") continue;
    const bal = ctx.treasuryBalances.get(intent.asset.toLowerCase()) ?? 0n;
    if (bal === 0n) continue;
    const fraction = Number(intent.amount) / Number(bal);
    if (fraction > maxFraction) maxFraction = fraction;
  }
  if (maxFraction > 0) {
    const weight = Math.round(Math.min(maxFraction, 1) * 40);
    signals.push({ code: "TREASURY_FRACTION", weight, detail: `moves out ${(maxFraction * 100).toFixed(1)}% of the asset balance` });
  }

  // Rule 3: self-dealing — recipient == proposer.
  const selfDeal = drains.some(
    (i) => i.kind === "treasury-withdraw" && i.to.toLowerCase() === p.proposer.toLowerCase(),
  );
  if (selfDeal) {
    signals.push({ code: "SELF_DEALING", weight: 15, detail: "payout recipient == proposer" });
  }

  // Rule 4: the proposer alone can push the proposal through (their power >= quorum).
  const canPassAlone = ctx.quorumThreshold > 0n && ctx.proposerVotes >= ctx.quorumThreshold;
  if (canPassAlone) {
    signals.push({ code: "PROPOSER_MEETS_QUORUM", weight: 15, detail: "the proposer's voting power alone exceeds quorum" });
  }

  const score = Math.min(100, signals.reduce((s, x) => s + x.weight, 0));

  return {
    proposalId: p.proposalId,
    score,
    level: levelFor(score),
    signals,
    facts: {
      proposer: p.proposer,
      proposerVotes: p.proposer && formatUnits(ctx.proposerVotes, 18) + " WGOV",
      quorumThreshold: formatUnits(ctx.quorumThreshold, 18) + " WGOV",
      quorumMultiple: ctx.quorumThreshold > 0n ? (Number(ctx.proposerVotes) / Number(ctx.quorumThreshold)).toFixed(1) + "x quorum" : "n/a",
      drainSummary: summarizeDrains(drains, ctx.assetSymbol, ctx.assetDecimals, ctx.treasuryBalances),
    },
  };
}

function summarizeDrains(
  drains: Intent[],
  sym: string,
  dec: number,
  balances: Map<string, bigint>,
): string {
  if (drains.length === 0) return "no fund movement";
  return drains
    .map((i) => {
      if (i.kind !== "treasury-withdraw") return "";
      const bal = balances.get(i.asset.toLowerCase()) ?? 0n;
      return `${formatUnits(i.amount, dec)} ${sym} -> ${i.to} (treasury holds ${formatUnits(bal, dec)})`;
    })
    .filter(Boolean)
    .join("; ");
}
