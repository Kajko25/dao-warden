# DAO-WARDEN — agent

A TypeScript + Viem agent that watches `DAOGovernor` on Arc Testnet, decodes proposal
instructions, and scores their risk **on hard, deterministic rules**. An LLM layer
(Claude Haiku 4.5) adds semantic analysis — comparing the description's narrative with the
real action. It then **reacts** (votes NO, or cancels on the timelock) and records every
decision on-chain via ERC-8004.

## Running

```bash
npm install
npm run scan     # scans historical proposals and scores them (test against WGIP-1)
npm run watch    # live watch: every new proposal is scored immediately
```

Contract addresses are read from `../docs/deployed.json`; RPC + `ANTHROPIC_API_KEY` from `../.env`.
The LLM layer turns on automatically when `ANTHROPIC_API_KEY` is set; without a key the agent
runs in a purely deterministic mode.

## How it works (pipeline)

1. **Listener** (`index.ts` / `scan.ts`) — the `ProposalCreated` event from the Governor.
2. **Parser** (`decode.ts`) — decodes `targets/values/calldatas` into structured intents;
   recognizes `Treasury.withdraw(asset,to,amount)` (selector `0xd9caed12`), marks the rest `unknown`.
3. **Scoring** (`risk.ts`) — deterministic rules, 0–100 score → LOW/MEDIUM/HIGH/CRITICAL.

## Risk rules (weights)

| Code | Weight | Meaning |
|---|---|---|
| `TREASURY_SPEND` | +30 | the proposal moves funds out of the treasury |
| `TREASURY_FRACTION` | +0..40 | proportional to the % of the treasury balance it moves out (100% = +40) |
| `SELF_DEALING` | +15 | payout recipient == proposer |
| `PROPOSER_MEETS_QUORUM` | +15 | the proposer alone has voting power ≥ quorum (can push it through alone) |

Thresholds: ≥70 CRITICAL, ≥45 HIGH, ≥25 MEDIUM, otherwise LOW.

## A key decision: score at the proposal's creation state

The agent reads on-chain state (treasury balance, voting power, supply) **at the proposal's
creation block**, not the current one. Without this, when we scan after a completed drain, the
treasury balance = 0 and the `TREASURY_FRACTION` rule would falsely drop to zero. So `scan`
scores at `log.blockNumber`, while `watch` (live) scores current state = the state at detection.

## LLM layer (Stage 4) — `llm.ts`

Claude **Haiku 4.5** (`claude-haiku-4-5`) via `@anthropic-ai/sdk`, structured outputs
(`output_config.format` + json_schema). Input: the proposal description + decoded intents.
Output: `{ verdict: MATCH|MINOR_DISCREPANCY|MAJOR_MISMATCH, mismatchScore 0-100, redFlags[], reasoning }`.
It detects "nice description vs. real drain" — the intent that hard rules cannot see. It
complements the core, it does not replace it.

## Verification

`npm run scan` on the WGIP-1 attack proposal:
- **Deterministic core → CRITICAL 100/100**: TREASURY_SPEND +30, TREASURY_FRACTION +40
  (100% of the treasury), SELF_DEALING +15, PROPOSER_MEETS_QUORUM +15 (attacker 50,000 WGOV = 5× quorum).
- **LLM layer → MAJOR_MISMATCH**: "operational grant for ecosystem growth" masks a transfer of
  100% of the treasury to the proposer's address — recognized as a BONK attack signature.

## Agent reaction, layer 1 (Stage 5) — `decide.ts` + `react.ts` + `wallet.ts`

The agent does not just detect — it **acts**. `decide.ts` combines the core and LLM verdicts into
a decision (VOTE_NO when score≥45 OR LLM=MAJOR_MISMATCH); `react.ts` casts a NO vote (support=0)
with power delegated by honest holders; `wallet.ts` holds the agent's wallet client (`AGENT_PRIVATE_KEY`).

End-to-end demo (fast DAO variant):
```bash
DEPLOYED_FILE=deployed-fast.json npm run stage5
```
Result: attacker YES 50k, agent NO 100k → proposal **DEFEATED**, treasury intact. Without the agent
(Stage 2) the same attack emptied the treasury. `DEPLOYED_FILE` switches the agent between the
realistic variant (`deployed.json`) and the fast one (`deployed-fast.json`).

## Agent reaction, layer 2 (Stage 7) — `cancel.ts` + `stage7-demo.ts`

The second, complementary defense: when the attack **wins** the vote, the mitigated DAO routes
execution through a `TimelockController`. Holding `CANCELLER_ROLE`, the agent cancels the queued
drain operation inside the `minDelay` window. `cancel.ts` computes the timelock operation id exactly
like `GovernorTimelockControl` (`salt = bytes20(governor) XOR descriptionHash`, cross-checked against
the on-chain `hashOperationBatch`).

```bash
DEPLOYED_FILE=deployed-timelocked.json npm run stage7
```
Result: the attack wins the vote (Succeeded) → Queued → the agent cancels → **Canceled**, treasury
intact, execute rejected.

## Identity, audit & reputation (Stage 6) — `identity.ts` + `audit.ts` + `validate.ts`

The agent is registered as an ERC-8004 ERC-721 identity (AgentCard on IPFS). Every decision is filed
as a `validationRequest` whose `requestHash` is the keccak256 of the canonical decision record — a
cryptographic commitment. An independent validator scores it (0–100), aggregated into reputation.

```bash
npm run identity   # print the on-chain ERC-8004 identity + reputation (read-only)
npm run stage6     # E2E: audit the WGIP-1 decision + validator score
```
The ERC-8004 registries are independent of `DEPLOYED_FILE` — always read from `../docs/deployed-erc8004.json`.
