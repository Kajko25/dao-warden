import type { AuditTrail as AuditTrailData } from "@/lib/erc8004";
import { ERC8004, GITHUB_URL, ROLES } from "@/lib/deployments";
import { formatTimestamp, shortHash } from "@/lib/format";
import { AddressLink } from "./AddressLink";
import { TONE_COLORS } from "./status";

function decisionRecordUrl(requestHash: string): string {
  // Decision records are stored as docs/decisions/<first-8-bytes-of-requestHash>.json;
  // the on-chain requestHash is the keccak256 of that exact file.
  return `${GITHUB_URL}/blob/main/docs/decisions/${requestHash.slice(2, 18)}.json`;
}

export function AuditTrail({ audit }: { audit: AuditTrailData | null }) {
  return (
    <section aria-label="ERC-8004 identity and audit trail">
      <h2 className="text-sm font-semibold text-ink">
        ERC-8004 — on-chain identity & audit trail
        <span className="ml-2 font-normal text-muted">
          — every decision the agent takes is committed on-chain and attested by an independent validator
        </span>
      </h2>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-surface p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Agent identity
          </div>
          {audit ? (
            <dl className="mt-2 space-y-2 text-xs">
              <div className="flex flex-wrap justify-between gap-1">
                <dt className="text-muted">Agent ID</dt>
                <dd className="text-ink">#{ERC8004.agentId.toString()} (ERC-721 token)</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-1">
                <dt className="text-muted">Global ID</dt>
                <dd className="break-all font-mono text-[11px] text-ink2">{ERC8004.globalAgentId}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-1">
                <dt className="text-muted">Agent wallet (owner)</dt>
                <dd><AddressLink address={audit.agentOwner} /></dd>
              </div>
              <div className="flex flex-wrap justify-between gap-1">
                <dt className="text-muted">Identity registry</dt>
                <dd><AddressLink address={ERC8004.identityRegistry} label={shortHash(ERC8004.identityRegistry)} /></dd>
              </div>
              <div className="flex flex-wrap justify-between gap-1">
                <dt className="text-muted">Validation registry</dt>
                <dd><AddressLink address={ERC8004.validationRegistry} label={shortHash(ERC8004.validationRegistry)} /></dd>
              </div>
              <div className="flex flex-wrap justify-between gap-1">
                <dt className="text-muted">AgentCard URI</dt>
                <dd className="break-all font-mono text-[11px] text-ink2">{audit.agentURI}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-2 text-xs text-muted">reading…</div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            The AgentCard CID is content-addressed (its hash is derived from the card itself) but not
            pinned to public IPFS; the card is versioned in the{" "}
            <a className="underline underline-offset-2" href={`${GITHUB_URL}/blob/main/docs/agent-card.json`} target="_blank" rel="noreferrer">
              repository
            </a>.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Validator reputation
            </div>
            {audit && (
              <div className="text-sm font-semibold text-ink tabular-nums">
                {audit.reputationAvg}/100
                <span className="ml-1 font-normal text-muted">
                  avg · {audit.reputationCount} review{audit.reputationCount === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>
          <ul className="mt-2 space-y-2">
            {audit?.validations.map((v) => (
              <li key={v.requestHash} className="rounded-lg border border-hairline px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-ink tabular-nums">
                    <span aria-hidden style={{ color: v.answered ? TONE_COLORS.good : TONE_COLORS.warning }}>
                      {v.answered ? "✓" : "!"}
                    </span>
                    {v.answered ? `${v.response}/100` : "awaiting validator"}
                  </span>
                  {v.tag && (
                    <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink2">
                      {v.tag}
                    </span>
                  )}
                  <span className="text-muted tabular-nums">{formatTimestamp(v.lastUpdate)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span>
                    decision{" "}
                    <a className="font-mono underline underline-offset-2" href={decisionRecordUrl(v.requestHash)} target="_blank" rel="noreferrer">
                      {shortHash(v.requestHash)}
                    </a>
                  </span>
                  <span>
                    validator <AddressLink address={v.validator} />
                  </span>
                </div>
              </li>
            ))}
            {audit && audit.validations.length === 0 && (
              <li className="text-xs text-muted">No decisions filed yet.</li>
            )}
            {!audit && <li className="text-xs text-muted">reading…</li>}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Integrity: the on-chain <span className="font-mono">requestHash</span> is the keccak256 of
            the committed decision record — the record cannot be edited after the fact. Validator{" "}
            <AddressLink address={ROLES.validator} /> attests each decision independently.
          </p>
        </div>
      </div>
    </section>
  );
}
