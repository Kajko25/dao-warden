import { formatAmount } from "@/lib/format";

// For/Against is polarity → the diverging pair (blue ↔ red) with a neutral
// abstain. Stacked share bar, 2px surface gaps, legend + direct value labels.
const SERIES = [
  { key: "for", label: "For", color: "var(--vote-for)" },
  { key: "against", label: "Against", color: "var(--vote-against)" },
  { key: "abstain", label: "Abstain", color: "var(--vote-abstain)" },
] as const;

export function VoteBar({
  votes,
  quorum,
}: {
  votes: { for: bigint; against: bigint; abstain: bigint };
  /** Quorum threshold in the same 18-dp units as the votes. */
  quorum?: bigint;
}) {
  const total = votes.for + votes.against + votes.abstain;
  const quorumMet = quorum !== undefined && votes.for + votes.abstain >= quorum;

  return (
    <div>
      {total === 0n ? (
        <div className="text-xs text-muted">No votes cast yet.</div>
      ) : (
        <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img"
          aria-label={SERIES.map((s) => `${s.label} ${formatAmount(votes[s.key], 18)}`).join(", ")}>
          {SERIES.filter((s) => votes[s.key] > 0n).map((s) => (
            <div
              key={s.key}
              style={{
                background: s.color,
                width: `${(Number(votes[s.key]) / Number(total)) * 100}%`,
              }}
            />
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 tabular-nums">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
            {s.label} {formatAmount(votes[s.key], 18)}
          </span>
        ))}
        {quorum !== undefined && (
          <span className="text-muted tabular-nums">
            · quorum {formatAmount(quorum, 18)} WGOV {total === 0n ? "" : quorumMet ? "(met)" : "(not met)"}
          </span>
        )}
      </div>
    </div>
  );
}
