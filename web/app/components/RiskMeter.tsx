import type { RiskReport } from "@/lib/risk";
import { RISK_META, TONE_COLORS } from "./status";

// The guardian's deterministic 0-100 score, recomputed live in the browser
// from chain state at the proposal's creation block (same rules as the agent).
export function RiskMeter({ risk }: { risk: RiskReport }) {
  const meta = RISK_META[risk.level];
  const color = TONE_COLORS[meta.tone];
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
          DAO-WARDEN risk score
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink tabular-nums">
          {risk.score}/100
          <span className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5">
            <span aria-hidden style={{ color }}>{meta.icon}</span>
            {risk.level}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full rounded-[4px] bg-grid">
        <div
          className="h-2 rounded-[4px]"
          style={{ width: `${risk.score}%`, background: color }}
        />
      </div>
      <ul className="mt-2 space-y-1">
        {risk.signals.map((s) => (
          <li key={s.code} className="flex items-baseline gap-2 text-xs">
            <span className="w-9 shrink-0 text-right font-mono font-medium text-ink tabular-nums">
              +{s.weight}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink2">{s.code}</span>
            <span className="text-muted">{s.detail}</span>
          </li>
        ))}
        {risk.signals.length === 0 && (
          <li className="text-xs text-muted">No risk signals fired.</li>
        )}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Proposer holds {risk.facts.proposerVotes} ({risk.facts.quorumMultiple}); quorum is{" "}
        {risk.facts.quorumThreshold}.
      </p>
    </div>
  );
}
