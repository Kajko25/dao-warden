import type { ProposalView } from "@/lib/proposals";
import { formatAmount, formatTimestamp, labeledAddress, stateName } from "@/lib/format";
import { StateBadge } from "./StateBadge";
import { VoteBar } from "./VoteBar";
import { RiskMeter } from "./RiskMeter";
import { AddressLink, TxLink } from "./AddressLink";
import { TONE_COLORS, type Tone } from "./status";

function defenseOutcome(p: ProposalView): { tone: Tone; icon: string; text: string } | null {
  if (p.risk.level !== "HIGH" && p.risk.level !== "CRITICAL") return null;
  switch (stateName(p.state)) {
    case "Executed":
      return {
        tone: "critical",
        icon: "✕",
        text: "Attack executed — the treasury was drained. No guardian was on duty in this baseline deployment.",
      };
    case "Defeated":
      return {
        tone: "good",
        icon: "✓",
        text: "Attack defeated — DAO-WARDEN cast the delegated NO vote that outweighed the attacker.",
      };
    case "Canceled":
      return {
        tone: "good",
        icon: "✓",
        text: "Attack cancelled — DAO-WARDEN vetoed the queued operation inside the timelock window.",
      };
    case "Pending":
    case "Active":
      return {
        tone: "warning",
        icon: "!",
        text: "High-risk proposal is live — the guardian is watching.",
      };
    case "Succeeded":
    case "Queued":
      return {
        tone: "serious",
        icon: "‼",
        text: "The attack won the vote — the timelock window is now the last line of defense.",
      };
    default:
      return null;
  }
}

export function ProposalCard({
  proposal: p,
  assetSymbol,
  assetDecimals,
  quorum,
}: {
  proposal: ProposalView;
  assetSymbol: string;
  assetDecimals: number;
  quorum?: bigint;
}) {
  const [title, ...rest] = p.decoded.description.split("\n");
  const body = rest.join("\n").trim();
  const outcome = defenseOutcome(p);

  return (
    <article className="rounded-xl border border-hairline bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <StateBadge state={p.state} />
      </div>
      {body && <p className="mt-1 whitespace-pre-line text-xs text-ink2">{body}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          proposed by <AddressLink address={p.decoded.proposer} />
        </span>
        <span>
          tx <TxLink hash={p.txHash} />
        </span>
        <span className="tabular-nums">block {p.createdAtBlock.toString()}</span>
        <span className="tabular-nums">
          voting {formatTimestamp(p.decoded.voteStart)} → {formatTimestamp(p.decoded.voteEnd)}
        </span>
      </div>

      {outcome && (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg border border-hairline px-3 py-2 text-xs font-medium text-ink"
          style={{
            borderLeft: `3px solid ${TONE_COLORS[outcome.tone]}`,
            background: `color-mix(in srgb, ${TONE_COLORS[outcome.tone]} 7%, transparent)`,
          }}
        >
          <span aria-hidden style={{ color: TONE_COLORS[outcome.tone] }}>{outcome.icon}</span>
          {outcome.text}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Votes</div>
          <div className="mt-1.5">
            <VoteBar votes={p.votes} quorum={quorum} />
          </div>
          <div className="mt-3 text-[11px] font-medium uppercase tracking-wider text-muted">
            Decoded on-chain actions
          </div>
          <ul className="mt-1 space-y-1">
            {p.decoded.intents.map((intent, i) => (
              <li key={i} className="text-xs text-ink2">
                {intent.kind === "treasury-withdraw" ? (
                  <>
                    <span className="font-mono text-[11px]">Treasury.withdraw</span> —{" "}
                    {formatAmount(intent.amount, assetDecimals)} {assetSymbol} →{" "}
                    {labeledAddress(intent.to)}
                  </>
                ) : (
                  <>
                    <span className="font-mono text-[11px]">{intent.selector}</span> on{" "}
                    {labeledAddress(intent.target)} (unrecognized calldata)
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
        <RiskMeter risk={p.risk} />
      </div>
    </article>
  );
}
