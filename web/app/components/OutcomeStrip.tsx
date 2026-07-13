import { VARIANTS, VARIANT_ORDER, type VariantKey } from "@/lib/deployments";
import { formatAmount } from "@/lib/format";
import { TONE_COLORS } from "./status";

export interface Outcome {
  key: string;
  balance: bigint;
  decimals: number;
  symbol: string;
}

const DEFENSE_LABEL: Record<string, string> = {
  none: "no guardian, no timelock",
  "guardian-vote": "guardian holds delegated votes",
  "guardian-timelock": "guardian + timelock veto",
};

// "One attack, three outcomes" — the project's thesis, proven by live balances.
export function OutcomeStrip({
  outcomes,
  selected,
  onSelect,
}: {
  outcomes: Outcome[] | null;
  selected: VariantKey;
  onSelect: (key: VariantKey) => void;
}) {
  return (
    <section aria-label="One attack, three outcomes">
      <h2 className="text-sm font-semibold text-ink">
        One attack, three outcomes
        <span className="ml-2 font-normal text-muted">
          — the same treasury-drain attack was run against all three deployments; balances below are read live
        </span>
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {VARIANT_ORDER.map((key) => {
          const variant = VARIANTS[key];
          const outcome = outcomes?.find((o) => o.key === key);
          const drained = outcome !== undefined && outcome.balance === 0n;
          const tone = drained ? "critical" : "good";
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className="rounded-xl border bg-surface px-4 py-3 text-left transition-colors hover:border-baseline"
              style={{
                borderColor: selected === key ? "var(--accent)" : "var(--hairline)",
              }}
              aria-pressed={selected === key}
            >
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
                {variant.label}
              </div>
              <div className="mt-1 text-2xl font-semibold text-ink tabular-nums">
                {outcome ? (
                  <>
                    {formatAmount(outcome.balance, outcome.decimals)}{" "}
                    <span className="text-sm font-normal text-ink2">{outcome.symbol}</span>
                  </>
                ) : (
                  <span className="text-sm font-normal text-muted">reading…</span>
                )}
              </div>
              {outcome && (
                <div
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold"
                  style={{ color: drained ? TONE_COLORS[tone] : "var(--good-text)" }}
                >
                  <span aria-hidden>{drained ? "✕" : "✓"}</span>
                  {drained ? "treasury drained" : "treasury intact"}
                </div>
              )}
              <div className="mt-1 text-xs text-muted">{DEFENSE_LABEL[variant.defense]}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
