// Deployment registry for the dashboard — a snapshot of docs/deployed*.json
// (those deployments are immutable history; the addresses can never change).
// deployBlock and seedProposalBlocks were verified empirically against Arc RPC
// on 2026-07-13: Arc limits eth_getLogs to a 10,000-block range, so the
// dashboard fetches known (seeded) proposals directly by block and only scans
// the recent chain tail live. "Scan full history" walks from deployBlock.
import type { Address } from "viem";

export const ARC_CHAIN_ID = 5042002;
export const DEFAULT_RPC_URL = "https://rpc.testnet.arc.network";
export const EXPLORER_URL = "https://testnet.arcscan.app";
export const GITHUB_URL = "https://github.com/Kajko25/dao-warden";
export const GETLOGS_MAX_RANGE = 10_000n; // Arc RPC hard limit (verified: error -32614 above it)
export const TAIL_SCAN_BLOCKS = 20_000n; // live tail ≈ last ~2.8h at ~0.5s blocks

export type VariantKey = "baseline" | "fast" | "timelocked";

export interface DaoVariant {
  key: VariantKey;
  label: string;
  /** One-line description of what this deployment demonstrates. */
  tagline: string;
  defense: "none" | "guardian-vote" | "guardian-timelock";
  contracts: {
    govToken: Address;
    governor: Address;
    treasury: Address;
    asset: Address;
    timelock?: Address;
  };
  params: {
    votingDelaySec: number;
    votingPeriodSec: number;
    quorumPct: number;
    proposalThreshold: number;
    timelockMinDelaySec?: number;
  };
  /** Block where the Governor contract was deployed (start of full-history scans). */
  deployBlock: bigint;
  /** Blocks known to contain a ProposalCreated event (fetched directly, no scan needed). */
  seedProposalBlocks: bigint[];
}

export const VARIANTS: Record<VariantKey, DaoVariant> = {
  baseline: {
    key: "baseline",
    label: "Baseline (vulnerable)",
    tagline:
      "1% quorum, zero threshold, no timelock, no guardian — the WGIP-1 attack drained the full treasury.",
    defense: "none",
    contracts: {
      govToken: "0xa2f16689aBCDaF264F96e66724CFbdB33EfFF622",
      governor: "0x0CbCaa61344Efef42916a7461e1bF2B673Fc4a21",
      treasury: "0xD3FBEE1CAD68EC7c4C68632A1175b4Dba9BAF293",
      asset: "0xe17a3d3c1bECAAC8A7f66F54598204C9F60EeaE5",
    },
    params: { votingDelaySec: 60, votingPeriodSec: 3600, quorumPct: 1, proposalThreshold: 0 },
    deployBlock: 51_453_447n,
    seedProposalBlocks: [51_454_256n],
  },
  fast: {
    key: "fast",
    label: "Guardian vote (Stage 5)",
    tagline:
      "Same vulnerable DAO, but honest holders delegated to DAO-WARDEN — the agent voted NO and defeated WGIP-2.",
    defense: "guardian-vote",
    contracts: {
      govToken: "0x0e9337D33c19b58551366b29116FfE3CA22EEcE4",
      governor: "0xddd55F7aCbFCb5DcB6e59e3e01Cca135f4B0A6c4",
      treasury: "0x7fc586086513538f493280F9eA49B1E30531cF92",
      asset: "0xbFA5369FF625149670dCFe0e9e247E08CD6B31FC",
    },
    params: { votingDelaySec: 5, votingPeriodSec: 30, quorumPct: 1, proposalThreshold: 0 },
    deployBlock: 51_465_959n,
    seedProposalBlocks: [51_466_380n],
  },
  timelocked: {
    key: "timelocked",
    label: "Guardian + timelock (Stage 7)",
    tagline:
      "The attack WON the vote (honest holders apathetic), but the agent cancelled it inside the timelock window.",
    defense: "guardian-timelock",
    contracts: {
      govToken: "0x32Ebc2098E99904047303FbBDda8C93FA255ad5A",
      governor: "0x641181a13c3114392e40fB4dc0785ACE279E9c1E",
      treasury: "0xB565228545e798495F10330685779eB5C2b639f4",
      asset: "0x5907970226D869A4195EE0245ba5E16c35B10c7b",
      timelock: "0x5fB14e2398E53d15E044b770B8aCB67FDa04337f",
    },
    params: {
      votingDelaySec: 5,
      votingPeriodSec: 30,
      quorumPct: 1,
      proposalThreshold: 0,
      timelockMinDelaySec: 120,
    },
    deployBlock: 51_496_737n,
    seedProposalBlocks: [51_496_834n],
  },
};

export const VARIANT_ORDER: VariantKey[] = ["baseline", "fast", "timelocked"];

// ERC-8004 registries (independent of the DAO variant) — docs/deployed-erc8004.json.
export const ERC8004 = {
  identityRegistry: "0x103D690aAc91D88adc01701431dB7e65a9b915fd" as Address,
  validationRegistry: "0x15E965CE0eDa0668464E41D88bca31212b96D33F" as Address,
  agentId: 1n,
  globalAgentId: "eip155:5042002:0x103D690aAc91D88adc01701431dB7e65a9b915fd:1",
};

export const ROLES = {
  attacker: "0x3Dfda2a699cF86FB08428CF7100c6bed6fd00586" as Address,
  honestVoter: "0x4979b3d5B712BEd2407D3E69CBA55CAaFc4fe2c5" as Address,
  agent: "0x0bDEb6882AEeFA2E3CcC956FAB425C2c4479BEFC" as Address,
  validator: "0xFd8d7CbE0cC709468595926DE552b6E6a2c955fB" as Address,
};

/** Known human names for the demo role wallets, keyed by lowercase address. */
export const ROLE_NAMES: Record<string, string> = {
  [ROLES.attacker.toLowerCase()]: "attacker",
  [ROLES.honestVoter.toLowerCase()]: "honest voter",
  [ROLES.agent.toLowerCase()]: "DAO-WARDEN agent",
  [ROLES.validator.toLowerCase()]: "validator",
};
