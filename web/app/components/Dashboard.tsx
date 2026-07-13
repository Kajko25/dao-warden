"use client";

// Read-only live dashboard. Everything shown here is fetched from Arc Testnet
// in the browser — no backend, no keys. The agent itself runs off-chain; this
// page only observes what it (and the attacker) did on-chain.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ERC8004,
  EXPLORER_URL,
  GITHUB_URL,
  VARIANTS,
  VARIANT_ORDER,
  type VariantKey,
} from "@/lib/deployments";
import {
  fetchTreasuryOutcomes,
  fetchVariantSnapshot,
  type VariantSnapshot,
} from "@/lib/proposals";
import { fetchAuditTrail, type AuditTrail as AuditTrailData } from "@/lib/erc8004";
import { QUORUM_DENOMINATOR } from "@/lib/abi";
import { formatAmount, formatDuration } from "@/lib/format";
import { OutcomeStrip, type Outcome } from "./OutcomeStrip";
import { ProposalCard } from "./ProposalCard";
import { AuditTrail } from "./AuditTrail";
import { StatTile } from "./StatTile";
import { AddressLink } from "./AddressLink";

const REFRESH_MS = 30_000;

export default function Dashboard() {
  const [selected, setSelected] = useState<VariantKey>("baseline");
  const [snapshots, setSnapshots] = useState<Partial<Record<VariantKey, VariantSnapshot>>>({});
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [audit, setAudit] = useState<AuditTrailData | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  // Guards against a slow response for variant A landing after the user switched to B.
  const requestSeq = useRef(0);

  const load = useCallback(
    async (key: VariantKey, opts: { fullHistory?: boolean } = {}) => {
      const seq = ++requestSeq.current;
      setError(null);
      if (opts.fullHistory) setScanProgress({ done: 0, total: 1 });
      try {
        const [snapshot, outcomeRows, auditData] = await Promise.all([
          fetchVariantSnapshot(VARIANTS[key], {
            fullHistory: opts.fullHistory,
            onProgress: (done, total) =>
              opts.fullHistory && seq === requestSeq.current && setScanProgress({ done, total }),
          }),
          fetchTreasuryOutcomes(VARIANT_ORDER.map((k) => VARIANTS[k])),
          fetchAuditTrail(),
        ]);
        if (seq !== requestSeq.current) return;
        setSnapshots((prev) => ({ ...prev, [key]: snapshot }));
        setOutcomes(outcomeRows);
        setAudit(auditData);
        setUpdatedAt(new Date());
      } catch (e) {
        if (seq !== requestSeq.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === requestSeq.current) setScanProgress(null);
      }
    },
    [],
  );

  useEffect(() => {
    load(selected);
    const timer = setInterval(() => load(selected), REFRESH_MS);
    return () => clearInterval(timer);
  }, [selected, load]);

  const variant = VARIANTS[selected];
  const snapshot = snapshots[selected];
  const quorum = snapshot ? snapshot.totalSupply / QUORUM_DENOMINATOR : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            DAO-WARDEN <span className="font-normal text-muted">/ live dashboard</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink2">
            An AI guardian that detects BONK-class governance attacks and defends the treasury —
            everything on this page is read live from Arc Testnet in your browser.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--status-good)" }} aria-hidden />
            block{" "}
            <span className="font-mono tabular-nums">
              {snapshot ? snapshot.latestBlock.toLocaleString("en-US") : "…"}
            </span>
          </span>
          <span className="rounded-full border border-hairline bg-surface px-2.5 py-1">
            Arc Testnet · 5042002
          </span>
          {updatedAt && (
            <span className="rounded-full border border-hairline bg-surface px-2.5 py-1 tabular-nums">
              updated {updatedAt.toLocaleTimeString("en-GB")}
            </span>
          )}
          <button
            type="button"
            onClick={() => load(selected)}
            className="rounded-full border border-hairline bg-surface px-2.5 py-1 font-medium text-ink hover:border-baseline"
          >
            refresh
          </button>
        </div>
      </header>

      {error && (
        <div
          className="rounded-lg border border-hairline px-3 py-2 text-xs text-ink"
          style={{ borderLeft: "3px solid var(--status-serious)", background: "color-mix(in srgb, var(--status-serious) 7%, transparent)" }}
          role="alert"
        >
          <span aria-hidden style={{ color: "var(--status-serious)" }}>‼</span> RPC error: {error} —{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => load(selected)}>
            retry
          </button>
        </div>
      )}

      <OutcomeStrip outcomes={outcomes} selected={selected} onSelect={setSelected} />

      <section aria-label="DAO deployment detail">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="DAO variant">
          {VARIANT_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected === key}
              onClick={() => setSelected(key)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                selected === key
                  ? "border-transparent bg-ink text-surface"
                  : "border-hairline bg-surface text-ink2 hover:border-baseline"
              }`}
            >
              {VARIANTS[key].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink2">{variant.tagline}</p>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="Treasury"
            value={
              snapshot ? `${formatAmount(snapshot.treasuryBalance, snapshot.assetDecimals)}` : "…"
            }
            sub={snapshot?.assetSymbol}
          />
          <StatTile label="Quorum" value={`${variant.params.quorumPct}%`} sub="of total supply" />
          <StatTile
            label="Voting delay"
            value={formatDuration(variant.params.votingDelaySec)}
            sub="before voting opens"
          />
          <StatTile
            label="Voting period"
            value={formatDuration(variant.params.votingPeriodSec)}
            sub="to cast votes"
          />
          <StatTile
            label="Proposal threshold"
            value={String(variant.params.proposalThreshold)}
            sub="anyone can propose"
          />
          <StatTile
            label="Timelock"
            value={
              variant.params.timelockMinDelaySec
                ? formatDuration(variant.params.timelockMinDelaySec)
                : "none"
            }
            sub={
              variant.params.timelockMinDelaySec
                ? "guardian can veto in this window"
                : "execution is immediate"
            }
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            Governor <AddressLink address={variant.contracts.governor} label={variant.contracts.governor.slice(0, 10) + "…"} />
          </span>
          <span>
            Treasury <AddressLink address={variant.contracts.treasury} label={variant.contracts.treasury.slice(0, 10) + "…"} />
          </span>
          <span>
            Token <AddressLink address={variant.contracts.govToken} label={variant.contracts.govToken.slice(0, 10) + "…"} />
          </span>
          {variant.contracts.timelock && (
            <span>
              Timelock <AddressLink address={variant.contracts.timelock} label={variant.contracts.timelock.slice(0, 10) + "…"} />
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Proposals</h2>
          <div className="text-xs text-muted">
            {snapshot && !snapshot.fullHistory && (
              <>
                seeded history + live scan from block{" "}
                <span className="font-mono tabular-nums">{snapshot.scannedFromBlock.toString()}</span> ·{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-ink"
                  onClick={() => load(selected, { fullHistory: true })}
                  disabled={scanProgress !== null}
                >
                  {scanProgress
                    ? `scanning… ${Math.round((scanProgress.done / scanProgress.total) * 100)}%`
                    : "scan full history since deployment"}
                </button>
              </>
            )}
            {snapshot?.fullHistory && (
              <>
                full history since deployment block{" "}
                <span className="font-mono tabular-nums">{variant.deployBlock.toString()}</span> ✓
              </>
            )}
          </div>
        </div>

        <div className="mt-2 space-y-3">
          {!snapshot && !error && (
            <div className="rounded-xl border border-hairline bg-surface p-6 text-center text-sm text-muted">
              Reading proposals from Arc Testnet…
            </div>
          )}
          {snapshot?.proposals.map((p) => (
            <ProposalCard
              key={p.decoded.proposalId.toString()}
              proposal={p}
              assetSymbol={snapshot.assetSymbol}
              assetDecimals={snapshot.assetDecimals}
              quorum={quorum}
            />
          ))}
          {snapshot && snapshot.proposals.length === 0 && (
            <div className="rounded-xl border border-hairline bg-surface p-6 text-center text-sm text-muted">
              No proposals found in the scanned range.
            </div>
          )}
        </div>
      </section>

      <AuditTrail audit={audit} />

      <footer className="mt-2 border-t border-hairline pt-4 text-xs text-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a className="underline underline-offset-2 hover:text-ink" href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub repository
          </a>
          <a className="underline underline-offset-2 hover:text-ink" href={`${GITHUB_URL}/blob/main/docs/PITCH.md`} target="_blank" rel="noreferrer">
            Project pitch
          </a>
          <a className="underline underline-offset-2 hover:text-ink" href={EXPLORER_URL} target="_blank" rel="noreferrer">
            Arcscan explorer
          </a>
          <span className="break-all font-mono">{ERC8004.globalAgentId}</span>
        </div>
        <p className="mt-2 max-w-3xl leading-relaxed">
          This dashboard is read-only: it recomputes the guardian&apos;s deterministic risk scores in
          your browser from on-chain state and links every claim to a transaction. The agent itself
          (vote casting, timelock vetoes, LLM narrative analysis) runs off-chain — no private keys or
          API keys are ever shipped to this page.
        </p>
      </footer>
    </div>
  );
}
