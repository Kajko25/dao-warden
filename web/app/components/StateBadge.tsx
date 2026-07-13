import { stateName } from "@/lib/format";

// Factual lifecycle chip — deliberately neutral ink. The *meaning* of a state
// (drained vs defended) is carried by the defense-outcome banner, not here.
export function StateBadge({ state }: { state: number }) {
  const name = stateName(state);
  const active = name === "Active";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-xs font-medium text-ink2">
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? "animate-pulse" : ""}`}
        style={{ background: active ? "var(--accent)" : "var(--baseline)" }}
        aria-hidden
      />
      {name}
    </span>
  );
}
