#!/usr/bin/env node
// Liczy PRAWDZIWY CIDv1 (kodek raw, sha2-256) z bajtow pliku — identycznie jak
// `ipfs add --cid-version 1 --raw-leaves` dla pliku miesczacego sie w jednym bloku
// (< 256 KiB). Dzieki content-addressingowi kazdy moze przeliczyc CID z tresci
// zacommitowanego pliku i potwierdzic integralnosc AgentCard — bez zaufania do nas.
//
// Uzycie: node scripts/ipfs-cid.mjs docs/agent-card.json
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const path = process.argv[2];
if (!path) {
  console.error("Uzycie: node scripts/ipfs-cid.mjs <plik>");
  process.exit(1);
}

const bytes = readFileSync(path);
const digest = createHash("sha256").update(bytes).digest(); // 32 bajty

// multihash = <kod funkcji: 0x12 sha2-256> <dlugosc: 0x20 = 32> <digest>
const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), digest]);
// CIDv1 = <wersja: 0x01> <kodek: 0x55 raw> <multihash>
const cidBytes = Buffer.concat([Buffer.from([0x01, 0x55]), multihash]);

// Multibase base32 (RFC4648, male litery, bez paddingu), prefiks 'b'.
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

const cid = "b" + base32(cidBytes);
console.log(cid);
