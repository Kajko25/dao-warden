// Small display helpers shared by the dashboard components.
import { formatUnits } from "viem";
import { ROLE_NAMES } from "./deployments";

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** "0x3Dfd…0586 (attacker)" when the address is a known demo role. */
export function labeledAddress(addr: string): string {
  const role = ROLE_NAMES[addr.toLowerCase()];
  return role ? `${shortAddress(addr)} (${role})` : shortAddress(addr);
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

/** Grouped integer rendering of a token amount, e.g. 1000000n/6dp -> "1,000,000". */
export function formatAmount(value: bigint, decimals: number, maxFraction = 0): string {
  const num = Number(formatUnits(value, decimals));
  return num.toLocaleString("en-US", { maximumFractionDigits: maxFraction });
}

export function formatTimestamp(ts: bigint | number): string {
  return new Date(Number(ts) * 1000).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

/** OpenZeppelin Governor ProposalState enum. */
export const PROPOSAL_STATES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
] as const;

export type ProposalStateName = (typeof PROPOSAL_STATES)[number];

export function stateName(state: number): ProposalStateName {
  return PROPOSAL_STATES[state] ?? "Pending";
}
