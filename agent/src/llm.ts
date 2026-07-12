// LLM layer (Stage 4) — compares a proposal's NARRATIVE (the description field, written
// for humans) with its REAL on-chain instructions (decoded calldata). Detects the classic
// attack vector: a "nice grant description" vs. "draining the whole treasury to yourself".
//
// This is a layer that COMPLEMENTS the deterministic core, not one that replaces it. The
// API key comes exclusively from an environment variable (the SDK reads ANTHROPIC_API_KEY itself).
import Anthropic from "@anthropic-ai/sdk";
import { formatUnits } from "viem";
import type { DecodedProposal } from "./decode.js";

// Haiku 4.5 — cheap and fast, more than enough to analyze the proposal text.
const MODEL = "claude-haiku-4-5";

export type NarrativeVerdict = "MATCH" | "MINOR_DISCREPANCY" | "MAJOR_MISMATCH";

export interface NarrativeAnalysis {
  verdict: NarrativeVerdict;
  mismatchScore: number; // 0..100, how far the description diverges from the action
  redFlags: string[];
  reasoning: string;
}

// A schema forcing a structured response (structured outputs).
// enum on the verdict, additionalProperties:false — hard API requirements.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["MATCH", "MINOR_DISCREPANCY", "MAJOR_MISMATCH"],
      description: "MATCH: description matches the actions; MAJOR_MISMATCH: description masks harmful action",
    },
    mismatchScore: {
      type: "integer",
      description: "0 = full agreement of narrative with actions, 100 = total divergence / hidden drain",
    },
    redFlags: {
      type: "array",
      items: { type: "string" },
      description: "Concrete red flags (e.g. 'description mentions a grant, calldata drains the whole treasury')",
    },
    reasoning: { type: "string", description: "Short justification in English, 1-3 sentences" },
  },
  required: ["verdict", "mismatchScore", "redFlags", "reasoning"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "You are a DAO security analyst. You receive a governance proposal's DESCRIPTION " +
  "(the narrative written for voters) and its REAL on-chain instructions (decoded from " +
  "calldata). Your task is to judge whether the description HONESTLY reflects what the " +
  "proposal actually does. You are looking for a BONK-class attack vector: a proposal with " +
  "an innocent description ('grant', 'growth', 'operational') that in reality moves funds out " +
  "of the treasury — especially to the proposer's own address. Judge only the agreement of the " +
  "NARRATIVE with the ACTION, not the mere existence of a payout (legitimate payouts exist too).";

/// Renders the decoded intents into a readable description for the model.
function renderActions(p: DecodedProposal): string {
  const lines = p.intents.map((intent, i) => {
    if (intent.kind === "treasury-withdraw") {
      const amt = formatUnits(intent.amount, 6); // treasury asset = 6 decimals
      const selfDeal = intent.to.toLowerCase() === p.proposer.toLowerCase();
      return `  [${i}] TREASURY WITHDRAWAL: ${amt} tokens -> ${intent.to}` +
        (selfDeal ? "  (WARNING: recipient == proposer)" : "");
    }
    return `  [${i}] Unknown call: target=${intent.target}, selector=${intent.selector}`;
  });
  return lines.join("\n");
}

/// Analyzes the narrative-vs-action mismatch via Claude Haiku.
export async function analyzeNarrative(p: DecodedProposal): Promise<NarrativeAnalysis> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY from env

  const userMessage =
    `PROPOSER: ${p.proposer}\n\n` +
    `PROPOSAL DESCRIPTION (narrative):\n"${p.description}"\n\n` +
    `REAL ON-CHAIN INSTRUCTIONS (decoded from calldata):\n${renderActions(p)}\n\n` +
    `Does the description honestly reflect the real action? Return a verdict per the schema.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
  });

  // With output_config.format the first text block contains valid JSON per the schema.
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM did not return a text block");
  }
  return JSON.parse(textBlock.text) as NarrativeAnalysis;
}

/// Is the LLM layer available (key set)? The core runs without it.
export function llmAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
