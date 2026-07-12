// Computes a GENUINE CIDv1 (raw codec, sha2-256) from bytes — just like
// `ipfs add --cid-version 1 --raw-leaves` for single-block content (<256 KiB).
// Content-addressing: anyone can recompute the CID from the record content and confirm integrity.
// (Mirror of scripts/ipfs-cid.mjs, used on the agent side for decision records.)
import { createHash } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32(buf: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/// Returns "ipfs://<cidv1>" for the given text (UTF-8).
export function ipfsUriForContent(content: string): string {
  const digest = createHash("sha256").update(content, "utf8").digest();
  const cidBytes = Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), digest]);
  return "ipfs://b" + base32(cidBytes);
}
