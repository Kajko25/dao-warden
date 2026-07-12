// Warstwa LLM (Etap 4) — porównuje NARRACJĘ propozycji (pole description, pisane
// dla ludzi) z jej REALNYMI instrukcjami on-chain (zdekodowane calldata). Wykrywa
// klasyczny wektor ataku: "ładny opis grantu" vs "drenaż całego skarbca na siebie".
//
// To WARSTWA UZUPEŁNIAJĄCA rdzeń deterministyczny, nie zastępująca go. Klucz API
// wyłącznie ze zmiennej środowiskowej (SDK czyta ANTHROPIC_API_KEY sam).
import Anthropic from "@anthropic-ai/sdk";
import { formatUnits } from "viem";
import type { DecodedProposal } from "./decode.js";

// Haiku 4.5 — tani i szybki, w zupełności wystarcza do analizy tekstu propozycji.
const MODEL = "claude-haiku-4-5";

export type NarrativeVerdict = "MATCH" | "MINOR_DISCREPANCY" | "MAJOR_MISMATCH";

export interface NarrativeAnalysis {
  verdict: NarrativeVerdict;
  mismatchScore: number; // 0..100, jak bardzo opis rozjeżdża się z działaniem
  redFlags: string[];
  reasoning: string;
}

// Schemat wymuszający ustrukturyzowaną odpowiedź (structured outputs).
// enum na verdykcie, additionalProperties:false — twarde wymogi API.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["MATCH", "MINOR_DISCREPANCY", "MAJOR_MISMATCH"],
      description: "MATCH: opis zgodny z akcjami; MAJOR_MISMATCH: opis maskuje szkodliwe działanie",
    },
    mismatchScore: {
      type: "integer",
      description: "0 = pełna zgodność narracji z akcjami, 100 = całkowita rozbieżność / ukryty drenaż",
    },
    redFlags: {
      type: "array",
      items: { type: "string" },
      description: "Konkretne czerwone flagi (np. 'opis mówi o grancie, calldata wyprowadza cały skarbiec')",
    },
    reasoning: { type: "string", description: "Krótkie uzasadnienie po polsku, 1-3 zdania" },
  },
  required: ["verdict", "mismatchScore", "redFlags", "reasoning"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "Jestes analitykiem bezpieczenstwa DAO. Dostajesz OPIS propozycji governance " +
  "(narracje pisana dla glosujacych) oraz jej REALNE instrukcje on-chain (zdekodowane " +
  "z calldata). Twoim zadaniem jest ocenic, czy opis UCZCIWIE oddaje to, co propozycja " +
  "faktycznie robi. Szukasz wektora ataku klasy BONK: propozycja z niewinnym opisem " +
  "('grant', 'rozwoj', 'operacyjne'), ktora w rzeczywistosci wyprowadza srodki ze skarbca " +
  "— zwlaszcza na adres samego wnioskodawcy. Oceniaj wylacznie zgodnosc NARRACJI z " +
  "DZIALANIEM, nie samo istnienie wyplaty (legalne wyplaty tez istnieja).";

/// Renderuje zdekodowane intencje na czytelny opis dla modelu.
function renderActions(p: DecodedProposal): string {
  const lines = p.intents.map((intent, i) => {
    if (intent.kind === "treasury-withdraw") {
      const amt = formatUnits(intent.amount, 6); // aktywo skarbca = 6 decimals
      const selfDeal = intent.to.toLowerCase() === p.proposer.toLowerCase();
      return `  [${i}] WYPLATA ZE SKARBCA: ${amt} tokenow -> ${intent.to}` +
        (selfDeal ? "  (UWAGA: odbiorca == wnioskodawca)" : "");
    }
    return `  [${i}] Nieznane wywolanie: target=${intent.target}, selektor=${intent.selector}`;
  });
  return lines.join("\n");
}

/// Analizuje rozbieżność narracja-vs-działanie przez Claude Haiku.
export async function analyzeNarrative(p: DecodedProposal): Promise<NarrativeAnalysis> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY z env

  const userMessage =
    `PROPONUJACY: ${p.proposer}\n\n` +
    `OPIS PROPOZYCJI (narracja):\n"${p.description}"\n\n` +
    `REALNE INSTRUKCJE ON-CHAIN (zdekodowane z calldata):\n${renderActions(p)}\n\n` +
    `Czy opis uczciwie oddaje realne dzialanie? Zwroc ocene wg schematu.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
  });

  // Przy output_config.format pierwszy blok text zawiera poprawny JSON wg schematu.
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM nie zwrocil bloku text");
  }
  return JSON.parse(textBlock.text) as NarrativeAnalysis;
}

/// Czy warstwa LLM jest dostępna (klucz ustawiony)? Rdzeń działa bez niej.
export function llmAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
