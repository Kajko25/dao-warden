// Scoring ryzyka — WYLACZNIE deterministyczne reguly (bez LLM; to przyjdzie w Etapie 4).
// Kazda regula to jawny sygnal z waga; suma daje wynik 0..100 i poziom ryzyka.
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

// Kontekst on-chain potrzebny do oceny (czytany w momencie wykrycia propozycji).
interface Context {
  totalSupply: bigint;
  quorumThreshold: bigint; // ile glosow trzeba na kworum
  proposerVotes: bigint; // biezaca sila glosu proponujacego
  assetDecimals: number;
  assetSymbol: string;
  // saldo skarbca dla aktywa uzytego w withdraw (klucz = adres aktywa, lowercase)
  treasuryBalances: Map<string, bigint>;
}

async function gatherContext(p: DecodedProposal, atBlock?: bigint): Promise<Context> {
  // Agent ocenia stan Z MOMENTU powstania propozycji (blok jej utworzenia), nie biezacy —
  // inaczej po drenazu saldo skarbca = 0 i regula "% skarbca" falszywie spada do zera.
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

  // Reguła 1: propozycja w ogole rusza srodki ze skarbca.
  if (drains.length > 0) {
    signals.push({ code: "TREASURY_SPEND", weight: 30, detail: `${drains.length} wyplata(y) ze skarbca` });
  }

  // Reguła 2: jaka czesc salda skarbca wyprowadza (per aktywo, bierzemy max).
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
    signals.push({ code: "TREASURY_FRACTION", weight, detail: `wyprowadza ${(maxFraction * 100).toFixed(1)}% salda aktywa` });
  }

  // Reguła 3: samoobsluga — odbiorca == proponujacy.
  const selfDeal = drains.some(
    (i) => i.kind === "treasury-withdraw" && i.to.toLowerCase() === p.proposer.toLowerCase(),
  );
  if (selfDeal) {
    signals.push({ code: "SELF_DEALING", weight: 15, detail: "odbiorca wyplaty == proponujacy" });
  }

  // Reguła 4: proponujacy sam moze przepchnac propozycje (jego sila >= kworum).
  const canPassAlone = ctx.quorumThreshold > 0n && ctx.proposerVotes >= ctx.quorumThreshold;
  if (canPassAlone) {
    signals.push({ code: "PROPOSER_MEETS_QUORUM", weight: 15, detail: "sila glosu proponujacego sama przekracza kworum" });
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
      quorumMultiple: ctx.quorumThreshold > 0n ? (Number(ctx.proposerVotes) / Number(ctx.quorumThreshold)).toFixed(1) + "x kworum" : "n/a",
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
  if (drains.length === 0) return "brak ruchu srodkow";
  return drains
    .map((i) => {
      if (i.kind !== "treasury-withdraw") return "";
      const bal = balances.get(i.asset.toLowerCase()) ?? 0n;
      return `${formatUnits(i.amount, dec)} ${sym} -> ${i.to} (skarbiec ma ${formatUnits(bal, dec)})`;
    })
    .filter(Boolean)
    .join("; ");
}
