import { EXPLORER_URL } from "@/lib/deployments";
import { labeledAddress, shortHash } from "@/lib/format";

export function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a
      href={`${EXPLORER_URL}/address/${address}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-ink2 underline decoration-[var(--baseline)] underline-offset-2 hover:text-ink"
      title={address}
    >
      {label ?? labeledAddress(address)}
    </a>
  );
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a
      href={`${EXPLORER_URL}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-ink2 underline decoration-[var(--baseline)] underline-offset-2 hover:text-ink"
      title={hash}
    >
      {label ?? shortHash(hash)}
    </a>
  );
}
