// On-chain data orchestration for one DAO variant: proposal discovery
// (seeded blocks + live tail scan, optionally full history), decoding,
// live governance state, and risk scoring at the creation block.
//
// Arc RPC limits eth_getLogs to a 10,000-block window, so discovery is chunked.
// Known historical proposals are fetched by their exact block (1 call each);
// the live tail covers the recent chain so brand-new proposals still appear.
import type { Address, Hex } from "viem";
import { publicClient } from "./chain";
import { governorAbi, erc20Abi, votesTokenAbi, timelockAbi } from "./abi";
import { decodeProposal, type DecodedProposal } from "./decode";
import { scoreProposal, type RiskReport } from "./risk";
import {
  GETLOGS_MAX_RANGE,
  TAIL_SCAN_BLOCKS,
  type DaoVariant,
} from "./deployments";

export interface ProposalView {
  decoded: DecodedProposal;
  risk: RiskReport;
  state: number;
  votes: { against: bigint; for: bigint; abstain: bigint };
  createdAtBlock: bigint;
  txHash: Hex;
}

export interface VariantSnapshot {
  latestBlock: bigint;
  scannedFromBlock: bigint;
  fullHistory: boolean;
  treasuryBalance: bigint;
  assetSymbol: string;
  assetDecimals: number;
  totalSupply: bigint;
  timelockMinDelay?: bigint;
  proposals: ProposalView[];
}

type RawEvent = {
  args: {
    proposalId: bigint;
    proposer: Address;
    targets: readonly Address[];
    values: readonly bigint[];
    calldatas: readonly Hex[];
    voteStart: bigint;
    voteEnd: bigint;
    description: string;
  };
  blockNumber: bigint;
  transactionHash: Hex;
};

async function eventsInRange(
  governor: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RawEvent[]> {
  const logs = await publicClient.getContractEvents({
    address: governor,
    abi: governorAbi,
    eventName: "ProposalCreated",
    fromBlock,
    toBlock,
  });
  return logs as unknown as RawEvent[];
}

/** Chunked ProposalCreated walk respecting Arc's getLogs range limit. */
async function scanRange(
  governor: Address,
  fromBlock: bigint,
  toBlock: bigint,
  onProgress?: (done: number, total: number) => void,
): Promise<RawEvent[]> {
  const chunks: { from: bigint; to: bigint }[] = [];
  for (let from = fromBlock; from <= toBlock; from += GETLOGS_MAX_RANGE) {
    const to = from + GETLOGS_MAX_RANGE - 1n > toBlock ? toBlock : from + GETLOGS_MAX_RANGE - 1n;
    chunks.push({ from, to });
  }
  const events: RawEvent[] = [];
  // Sequential, oldest-first: keeps the RPC happy and makes progress meaningful.
  for (let i = 0; i < chunks.length; i++) {
    events.push(...(await eventsInRange(governor, chunks[i].from, chunks[i].to)));
    onProgress?.(i + 1, chunks.length);
  }
  return events;
}

async function discoverProposals(
  variant: DaoVariant,
  latestBlock: bigint,
  fullHistory: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<{ events: RawEvent[]; scannedFrom: bigint }> {
  const governor = variant.contracts.governor;

  if (fullHistory) {
    const events = await scanRange(governor, variant.deployBlock, latestBlock, onProgress);
    return { events, scannedFrom: variant.deployBlock };
  }

  // Seeded blocks (exact, immutable history) + the live tail for new proposals.
  const tailFrom = latestBlock > TAIL_SCAN_BLOCKS ? latestBlock - TAIL_SCAN_BLOCKS : 0n;
  const scannedFrom = tailFrom < variant.deployBlock ? variant.deployBlock : tailFrom;
  const seedFetches = variant.seedProposalBlocks
    .filter((b) => b < scannedFrom) // seeds inside the tail get picked up by the tail scan
    .map((b) => eventsInRange(governor, b, b));
  const [seedResults, tailEvents] = await Promise.all([
    Promise.all(seedFetches),
    scanRange(governor, scannedFrom, latestBlock),
  ]);

  const byId = new Map<string, RawEvent>();
  for (const ev of [...seedResults.flat(), ...tailEvents]) {
    byId.set(ev.args.proposalId.toString(), ev);
  }
  return { events: [...byId.values()], scannedFrom };
}

async function enrichProposal(variant: DaoVariant, ev: RawEvent): Promise<ProposalView> {
  const a = ev.args;
  const decoded = decodeProposal({
    proposalId: a.proposalId,
    proposer: a.proposer,
    description: a.description,
    voteStart: a.voteStart,
    voteEnd: a.voteEnd,
    targets: a.targets,
    values: a.values,
    calldatas: a.calldatas,
  });
  const governor = variant.contracts.governor;
  const [risk, state, votes] = await Promise.all([
    // Score at the creation block — the same rule the agent follows.
    scoreProposal(variant, decoded, ev.blockNumber),
    publicClient.readContract({ address: governor, abi: governorAbi, functionName: "state", args: [a.proposalId] }),
    publicClient.readContract({ address: governor, abi: governorAbi, functionName: "proposalVotes", args: [a.proposalId] }),
  ]);
  return {
    decoded,
    risk,
    state,
    votes: { against: votes[0], for: votes[1], abstain: votes[2] },
    createdAtBlock: ev.blockNumber,
    txHash: ev.transactionHash,
  };
}

export async function fetchVariantSnapshot(
  variant: DaoVariant,
  opts: { fullHistory?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<VariantSnapshot> {
  const latestBlock = await publicClient.getBlockNumber();

  const [{ events, scannedFrom }, treasuryBalance, assetSymbol, assetDecimals, totalSupply, timelockMinDelay] =
    await Promise.all([
      discoverProposals(variant, latestBlock, opts.fullHistory ?? false, opts.onProgress),
      publicClient.readContract({ address: variant.contracts.asset, abi: erc20Abi, functionName: "balanceOf", args: [variant.contracts.treasury] }),
      publicClient.readContract({ address: variant.contracts.asset, abi: erc20Abi, functionName: "symbol" }),
      publicClient.readContract({ address: variant.contracts.asset, abi: erc20Abi, functionName: "decimals" }),
      publicClient.readContract({ address: variant.contracts.govToken, abi: votesTokenAbi, functionName: "totalSupply" }),
      variant.contracts.timelock
        ? publicClient.readContract({ address: variant.contracts.timelock, abi: timelockAbi, functionName: "getMinDelay" })
        : Promise.resolve(undefined),
    ]);

  const proposals = await Promise.all(events.map((ev) => enrichProposal(variant, ev)));
  proposals.sort((a, b) => (a.createdAtBlock < b.createdAtBlock ? 1 : -1)); // newest first

  return {
    latestBlock,
    scannedFromBlock: scannedFrom,
    fullHistory: opts.fullHistory ?? false,
    treasuryBalance,
    assetSymbol,
    assetDecimals,
    totalSupply,
    timelockMinDelay,
    proposals,
  };
}

/** Live treasury balances of all variants — the "same attack, three outcomes" strip. */
export async function fetchTreasuryOutcomes(
  variants: DaoVariant[],
): Promise<{ key: string; balance: bigint; decimals: number; symbol: string }[]> {
  return Promise.all(
    variants.map(async (v) => {
      const [balance, decimals, symbol] = await Promise.all([
        publicClient.readContract({ address: v.contracts.asset, abi: erc20Abi, functionName: "balanceOf", args: [v.contracts.treasury] }),
        publicClient.readContract({ address: v.contracts.asset, abi: erc20Abi, functionName: "decimals" }),
        publicClient.readContract({ address: v.contracts.asset, abi: erc20Abi, functionName: "symbol" }),
      ]);
      return { key: v.key, balance, decimals, symbol };
    }),
  );
}
