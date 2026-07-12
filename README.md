# DAO-WARDEN

An AI **guardian agent** on **Arc Testnet** that detects *governance attacks* — attacks where
someone buys a voting majority and pushes through a proposal that drains the treasury (the EVM
analogue of the July 2026 BONK DAO attack: a proposal passed at extremely low turnout, with no
code exploit, purely through the legitimate voting mechanism).

We reproduce the **vulnerability class** of BONK on EVM (vote-buying, low quorum, no timelock) —
we do not copy the Solana code.

**Defense in two independent, complementary layers, each proven on-chain against a measured
baseline:**

| Scenario | Who defends | On-chain result |
|---|---|---|
| **Baseline** (no guardian) | nobody (honest holders passive) | treasury **1,000,000 → 0 mUSD**, attack `Executed` |
| **Vote defense** | agent votes NO with delegated power | proposal **DEFEATED**, treasury intact |
| **Timelock defense** | agent cancels in the post-vote window | proposal **Canceled**, treasury intact |

## Network (empirically verified 2026-07-12)

| Parameter | Value |
|---|---|
| Chain | Arc Testnet (Circle) |
| chainId | `5042002` (hex `0x4cef52`) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `testnet.arcscan.app` |
| Block time | ~0.5 s |
| Gas token | USDC (native) |

## Stack

- **Contracts:** Solidity 0.8.28 + OpenZeppelin Contracts v5.6.1 (ERC20Votes, Governor,
  TimelockController), Foundry.
- **Governor clock:** **timestamp** mode (`mode=timestamp`) — voting periods in seconds, robust
  to the ~0.5 s block time.
- **Agent:** TypeScript + Viem.
- **LLM:** Claude API (Haiku model) — key exclusively from an environment variable.
- **Identity/audit:** ERC-8004 IdentityRegistry + ValidationRegistry + IPFS.

## Structure

```
src/        contracts (GovToken, Treasury, DAOGovernor, DAOGovernorTimelocked, erc8004/, mocks/)
test/       Foundry tests (attack golden test, timelock defense golden test)
script/     deploy scripts
agent/      TS + Viem agent (detection core, LLM layer, reaction, ERC-8004 integration)
docs/       notes, pitch, session log, deployment inventories
```

## Stage map (roadmap 0–7 complete)

- [x] **Stage 0** — environment, repo, OpenZeppelin, Arc configuration
- [x] **Stage 1** — vulnerable DAO contracts + local tests
- [x] **Stage 2** — deploy on Arc + end-to-end attack simulation (on-chain golden test)
- [x] **Stage 3** — agent: deterministic core (listener + parser + scoring)
- [x] **Stage 4** — LLM layer (Claude): narrative vs. real instructions
- [x] **Stage 5** — agent reaction (delegation + NO vote)
- [x] **Stage 6** — ERC-8004 identity + decision audit + reputation
- [x] **Stage 7** — mitigation: redeploy with timelock, proof the attack is stopped

See [`docs/PITCH.md`](docs/PITCH.md) for the full narrative and on-chain proofs, and
[`docs/SESSION-LOG.md`](docs/SESSION-LOG.md) for the chronological build log and deployment inventory.

## Deployments (Arc Testnet, chainId 5042002)

**Vulnerable DAO** (baseline + reaction demos): inventory in `docs/deployed.json` (realistic,
~1h cycle) and `docs/deployed-fast.json` (fast, ~35s cycle).

**Timelocked DAO** (Stage 7 mitigation): inventory in `docs/deployed-timelocked.json`.

**ERC-8004 registries**: `docs/deployed-erc8004.json`.

## Running the agent / demos

```bash
cd agent
npm install
npm run identity                                        # on-chain ERC-8004 identity + reputation (read-only)
npm run stage6                                          # E2E Stage 6: decision audit of WGIP-1 + validator score
DEPLOYED_FILE=deployed-fast.json      npm run stage5    # vote-defense demo (~40s, fresh attack cycle)
DEPLOYED_FILE=deployed-timelocked.json npm run stage7   # timelock-defense demo (attack wins vote, agent cancels)
DEPLOYED_FILE=deployed-fast.json      npm run scan      # score existing proposals (core + LLM)
```

Without `DEPLOYED_FILE` the agent targets the realistic DAO. `ANTHROPIC_API_KEY` in `.env` enables
the LLM layer. The ERC-8004 registries are independent of `DEPLOYED_FILE` (always read from
`docs/deployed-erc8004.json`).

## Wallets & secrets

Private keys live in `.env` (gitignored). Deployer is **Wallet B**
`0x6D4843155412832dC3Fa9C59e593cdAfdf52639D`. Role wallets (attacker, honest voter, agent,
validator) are listed in the deployment inventories under `docs/`.
