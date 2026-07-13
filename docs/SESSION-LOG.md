# DAO-WARDEN — session log and recovery state

> This file serves two roles: (1) a **LIVE section at the top** — what is happening right now and
> how to finish if the machine were shut off; (2) the **log** — a chronological record of the work
> (also material for the presentation, see `PITCH.md`).

---

## 🟢 LIVE STATE (as of 2026-07-13) — 🎉 FULL ROADMAP (0–7) DONE + LIVE WEB DASHBOARD IN `web/`.

**Complete: Stages 0, 1, 2, 3, 4, 5, 6, 7 — all deployed and verified on Arc.** Nothing is running
in the background. Only "cosmetic" items remain for the final committee presentation (see the bottom).
**New (2026-07-13):** a public read-only dashboard (`web/`, Next.js + viem) that shows the whole
experiment live from Arc in the browser — deploy it by importing the repo in Vercel with Root
Directory `web/` (no env vars needed). Details in the log entry at the bottom and `web/README.md`.

**Stage 7 — deploy + on-chain E2E proof (2026-07-12):**
- Deployed the **timelocked-fast** variant (`docs/deployed-timelocked.json`): GovToken
  `0x32Ebc2098E99904047303FbBDda8C93FA255ad5A` · **Timelock `0x5fB14e2398E53d15E044b770B8aCB67FDa04337f`**
  (minDelay 120s) · DAOGovernor `0x641181a13c3114392e40fB4dc0785ACE279E9c1E` · Treasury
  `0xB565228545e798495F10330685779eB5C2b639f4` (owner = timelock) · MockAsset
  `0x5907970226D869A4195EE0245ba5E16c35B10c7b`. Roles: Governor=PROPOSER, agent=CANCELLER, deployer
  renounced admin. All confirmed with `cast`.
- **E2E proof (`DEPLOYED_FILE=deployed-timelocked.json npm run stage7`):** a scenario in which the
  honest holders are apathetic → **the attack WINS the vote** (Succeeded), enters the timelock queue
  (Queued), and the agent (core CRITICAL 100/100 + LLM MAJOR_MISMATCH 85/100 → VOTE_NO) **cancels the
  operation in the minDelay window** (tx `0x0b4265cd43…`) → **state Canceled, treasury 1,000,000 mUSD
  intact, `execute` rejected.** This proves the SECOND defense layer — it works even when the first
  (the vote, Stage 5) is inactive.

**Stage 7 — code (2026-07-12):**
- `src/DAOGovernorTimelocked.sol` — mitigated variant: ONE change vs. the vulnerable one = execution
  through `GovernorTimelockControl`. 1% quorum and threshold 0 DELIBERATELY unchanged (clean proof:
  the timelock alone defends).
- `test/TimelockDefense.t.sol` — mitigation golden test, **5/5 PASS**. Four proofs: (1) no immediate
  execution after Succeeded (end of the "drain in 1 tx" from Stage 2), (2) **the agent with
  CANCELLER_ROLE cancels in the minDelay window → Canceled, treasury intact** (the core), (3) honest
  check: without cancellation the attack lands after minDelay (delay alone is not a defense — the
  timelock and the agent are complementary), (4) legitimate proposals still work normally. Whole repo
  suite: **21/21**.
- `script/DeployTimelockedDAO.s.sol` — deploys the variant (fast, minDelay 120s); Treasury → owner =
  timelock, Governor gets PROPOSER_ROLE, agent gets CANCELLER_ROLE, deployer renounces admin.
- Agent: `agent/src/cancel.ts` (computes salt/opId like GovernorTimelockControl — **salt verified
  numerically identical to Solidity**, cancels the operation), `stage7-demo.ts` (`npm run stage7`),
  `abi.ts` extended with queue/timelock/TimelockController, `config.ts` reads the optional `Timelock`.
  tsc clean.
- Gas estimate (from `test_MeasureTimelockedDeployGas`): Timelock 1.44M + Governor 3.60M + wiring
  0.06M + Treasury 0.25M + GovToken 1.62M + MockERC20 0.46M + mint/transfers ≈ **~7.6M gas ≈ ~0.15 USDC**.

**➡️ NEXT STEP: technical roadmap 0–7 closed.** Remaining options for the final committee presentation:
(a) tie the narrative together in `PITCH.md` (we have the full set: baseline attack from Stage 2, vote
defense from Stage 5, timelock defense from Stage 7, ERC-8004 identity/audit from Stage 6); (b) optionally
replay the full cycle on the realistic (~1h) variant instead of the fast one; (c) consider pinning the
AgentCard to public IPFS. None of this is required to function — the core is complete and proven on-chain.

---

### (previous LIVE state — archived)
**Complete: Stages 0, 1, 2, 3, 4, 5, 6.** Nothing running in the background — nothing pending, nothing
to watch. The machine can be safely shut off.

**Where we are (quick-resume summary):**
- Built and deployed on Arc a **vulnerable DAO** (1% quorum, threshold 0, no timelock) — two instances:
  realistic (`deployed.json`, ~1h cycle, for the final presentation) and fast (`deployed-fast.json`,
  ~35s cycle, for iterating Stages 5–7).
- The **agent** (TypeScript+Viem, `agent/` directory) is fully working: it detects attacks
  (deterministic core + Claude Haiku LLM layer) AND reacts (votes NO with delegated power).
- **Proven contrast:** without the agent the attack drained the treasury (Stage 2); with the agent the
  same attack is rejected — DEFEATED, treasury intact (Stage 5).
- **ERC-8004 identity (Stage 6):** the agent is registered in `IdentityRegistry` (agentId 1, AgentCard
  on IPFS), every decision leaves a cryptographic trail in `ValidationRegistry`, a validator builds
  reputation.

**➡️ NEXT STEP: Stage 7** — redeploy the DAO with `TimelockController` and prove the timelock provides a
defense window even when the agent misses the voting window (a defense complementary to Stage 5, which
defends DURING voting). No time-watching required — ordinary work.

**How to resume the agent / demos after returning:**
```bash
cd /home/kajko/dao-warden/agent
npm run identity                                  # on-chain ERC-8004 identity + reputation (read-only)
npm run stage6                                    # E2E Stage 6: audit of the WGIP-1 decision + validator score
DEPLOYED_FILE=deployed-fast.json npm run stage5   # full defense demo (~40s, fresh attack cycle)
DEPLOYED_FILE=deployed-fast.json npm run scan     # scoring of existing proposals (core + LLM)
```
(Without `DEPLOYED_FILE` the agent targets the realistic DAO. `ANTHROPIC_API_KEY` in `.env` enables the
LLM layer. The ERC-8004 registries are independent of `DEPLOYED_FILE` — always from
`docs/deployed-erc8004.json`.)

---

## Inventory (Arc Testnet, chainId 5042002)

**Contracts:** GovToken `0xa2f16689aBCDaF264F96e66724CFbdB33EfFF622` · DAOGovernor
`0x0CbCaa61344Efef42916a7461e1bF2B673Fc4a21` · Treasury `0xD3FBEE1CAD68EC7c4C68632A1175b4Dba9BAF293`
· MockAsset mUSD `0xe17a3d3c1bECAAC8A7f66F54598204C9F60EeaE5`.

**ERC-8004 registries (Stage 6, redeployed in English 2026-07-12):** IdentityRegistry
`0x103D690aAc91D88adc01701431dB7e65a9b915fd` · ValidationRegistry
`0x15E965CE0eDa0668464E41D88bca31212b96D33F`. Agent: agentId 1, owner =
agent wallet `0x0bDE…BEFC`, AgentCard `ipfs://bafkreiehe742yroj73474igxfwrataxzun75dzczrm3gld34kw4errng6i`
(file `docs/agent-card.json`; CID genuine but unpinned — see `docs/agent-card.cid.txt`).
Inventory and txs in `docs/deployed-erc8004.json`. (The first Stage 6 deploy — Identity `0x5a33…4D36`,
Validation `0xb7f7…2dE4` — is abandoned; its audited record was in Polish. See Session 3 below.)

**Timelocked variant (Stage 7):** GovToken `0x32Ebc2098E99904047303FbBDda8C93FA255ad5A` ·
TimelockController `0x5fB14e2398E53d15E044b770B8aCB67FDa04337f` (minDelay 120s) · DAOGovernorTimelocked
`0x641181a13c3114392e40fB4dc0785ACE279E9c1E` · Treasury `0xB565228545e798495F10330685779eB5C2b639f4`
(owner = timelock) · MockAsset `0x5907970226D869A4195EE0245ba5E16c35B10c7b`. Inventory in
`docs/deployed-timelocked.json`.

**Wallets (keys in `.env`, gitignored):**
- deployer (Wallet B) `0x6D4843155412832dC3Fa9C59e593cdAfdf52639D` — ~11.9 USDC
- attacker `0x3Dfda2a699cF86FB08428CF7100c6bed6fd00586` — 50k WGOV, 0.5 USDC
- honest_voter `0x4979b3d5B712BEd2407D3E69CBA55CAaFc4fe2c5` — 100k WGOV, 0.25 USDC
- agent `0x0bDEb6882AEeFA2E3CcC956FAB425C2c4479BEFC` — ~0.24 USDC
- validator `0xFd8d7CbE0cC709468595926DE552b6E6a2c955fB` — 0.19 USDC

**Attack proposal:** id `106580324092998781649523553524390498126338184535661068633139847809166702258296`,
description `"WGIP-1: Grant operacyjny na rozwoj ekosystemu"`, descHash
`0xe454b786d4548d736c838b4c3e1afd0dd562d787e7563810788a6f3901796503`.

---

## Log

### Session 1 — 2026-07-12 — Stages 0, 1, 2 (partial)

**Stage 0 — environment.** Confirmed: git 2.43, node v24.18, Foundry 1.7.1 (nothing installed).
`forge init` + `forge install OpenZeppelin/openzeppelin-contracts` → OZ **v5.6.1**. `foundry.toml`:
solc 0.8.28, `evm_version = cancun`, optimizer 200.

**Arc verification (empirical, not from memory):**
- chainId `5042002`, block time **~0.5 s** (timestamp delta / 10 blocks), gas ~20.24 gwei.
- Opcodes: **PUSH0 and MCOPY supported** — checked read-only with `cast call --create` (`0x5f5ff3`,
  `0x...5e...f3`), both returned `0x`. Corrected an earlier assumption that `paris` was required.

**Stage 1 — contracts + tests.** Wrote `GovToken` (ERC20Votes, timestamp clock), `DAOGovernor`
(1% quorum, threshold 0, no timelock), `Treasury` (Ownable=Governor), `MockERC20`. Foundry tests
**4/4 PASS** (`test/DAOGovernanceFlow.t.sol`): clock mode, 1% quorum, treasury owner, full cycle
mint→delegate→propose→vote→execute. Deploy cost measured (`gasleft`): ~5.5M gas.

**Stage 2 — deploy + attack.**
- Deploy `script/DeployDAO.s.sol --broadcast`. Distribution: attacker 50k / honest 100k / float
  850k WGOV; treasury 1M mUSD. Independently verified with `cast` (code, params, owner).
- Generated 4 fresh role wallets, funded with gas from Wallet B.
- **Attack (DONE):** attacker `delegate` (tx `0xe0633555…`) → `propose` WGIP-1 draining 1M mUSD to
  its own address (tx `0xe8b45ac7…`) → `castVote` For (tx `0xa6f9bcda39…b4a2bef66e`) → after voting
  ended `execute` (tx `0x0381784133e786bbbeccd67da354ae0f07b7b50e9f17c4f1eb93eb4ce5cbdd21`, status 1,
  block 51461489). Vote tally: For 50,000, Against 0, Abstain 0 — quorum (10,000) exceeded 5×, honest
  passive. **Effect: treasury 1,000,000 → 0, attacker 0 → 1,000,000 mUSD.** Real-world time
  proposal→drain: ~1h (60s delay + 3600s voting). **Moral:** 5% of tokens drains the treasury in <1h,
  with no exploit at all — pure BONK class.

**Decisions from this session (and why):** timestamp clock (0.5 s block), treasury asset = MockERC20
for full control in the test, `evm_version cancun`, distribution 50k/100k chosen so the defense (2×
the attacker's power) can win — provided it reacts in time (the core of the timelock's value in
Stage 7).

**Stage 3 — deterministic agent (DONE).** `agent/` directory (TypeScript + Viem, run via `tsx`).
Pipeline: `ProposalCreated` listener → calldata parser (`decode.ts`, recognizes `Treasury.withdraw`
0xd9caed12) → scoring `risk.ts` (4 rules: TREASURY_SPEND +30, TREASURY_FRACTION +0..40, SELF_DEALING
+15, PROPOSER_MEETS_QUORUM +15; thresholds 70/45/25). Two modes: `npm run scan` (historical) and
`npm run watch` (live, polling). **Decision:** evaluate on state at the proposal's creation block
(without this, after the drain the treasury balance=0 falsified the fraction rule — caught and fixed).
Verification: `scan` on WGIP-1 → **CRITICAL 100/100** (all 4 signals); `watch` connects to Arc and
listens; `tsc --noEmit` clean.

**Stage 4 — LLM layer (DONE).** `agent/src/llm.ts` — Claude **Haiku 4.5** (`claude-haiku-4-5`) via
`@anthropic-ai/sdk`, structured outputs (`output_config.format` + json_schema, enum on the verdict).
Compares `description` (narrative) with the decoded intents (real action) → `{verdict, mismatchScore,
redFlags, reasoning}`. Key ONLY from `ANTHROPIC_API_KEY` (never in code); the layer is optional — the
core runs without it (`llmAvailable()` flag). Wired into `scan` and `watch`, result in the report.
Verified on WGIP-1: **MAJOR_MISMATCH 85/100** — the model recognized that an "operational grant"
masked a 100%-treasury drain to the proposer's address, and called it a BONK signature. `tsc --noEmit`
clean.

**Fast DAO variant deployed (2026-07-12)** for iterating Stages 5–7 — `script/DeployFastDAO.s.sol`,
delay 5s / period 30s, ~35s cycle. Addresses in `docs/deployed-fast.json`: GovToken `0x0e9337D3…`,
DAOGovernor `0xddd55F7a…`, Treasury `0x7fc58608…`, MockAsset `0xbFA5369F…`. The agent targets the
variant via `DEPLOYED_FILE=deployed-fast.json` (config.ts reads this variable). The realistic DAO is
kept for the final presentation.

**Stage 5 — agent reaction (DONE).** New files: `wallet.ts` (agent wallet client from
`AGENT_PRIVATE_KEY`), `decide.ts` (combines core + LLM into a VOTE_NO/ALLOW decision; threshold:
score≥45 OR LLM=MAJOR_MISMATCH), `react.ts` (`castNoVote` — vote support=0 with delegated power),
`stage5-demo.ts` (full scenario). Run: `DEPLOYED_FILE=deployed-fast.json npm run stage5`. **E2E
result, verified with `cast`:** the honest holder delegated 100k to the agent → the attacker submitted
WGIP-2 (draining 1M) and voted YES (50k) → the agent detected it (CRITICAL 100 + MAJOR_MISMATCH 95),
voted NO (100k) → **YES 50k < NO 100k → DEFEATED (state=3), agent hasVoted=true, treasury 1,000,000
mUSD intact.** The contrast with Stage 2 (without the agent the attack drained the treasury) is the
core of the project's value.

### Session 2 — 2026-07-12 — Stage 6 (ERC-8004 identity + audit + reputation)

**Spec verification (empirical, not from memory).** Fetched the current ERC-8004 from
eips.ethereum.org — the standard is now based on **ERC-721 + URIStorage** (`register(agentURI,
metadata[])` → `agentId` = tokenId), NOT the older `newAgent(agentDomain, agentAddress)`. Designed
against the current version.

**Contracts (`src/erc8004/`, solc 0.8.28, OZ 5.6.1).**
- `IdentityRegistry` — ERC-721 URIStorage: `register` (+ overload), `getMetadata`/`setMetadata`,
  `setAgentURI`, `getAgentWallet`, events `Registered`/`MetadataSet`/`URIUpdated`. Deliberate
  simplifications vs. the spec (described in NatSpec + `deployed-erc8004.json`): omitted the EIP-712
  `setAgentWallet` (agent wallet == owner).
- `ValidationRegistry` — `validationRequest`/`validationResponse` + reads (`getValidationStatus`,
  `getSummary`, `getAgentValidations`, `getValidatorRequests`). Carries BOTH Stage 6 functions: an
  auditable decision trail (request) + a validator reputation signal (response 0-100).
  `constructor(identity)` instead of `initialize` (no proxy — simpler deploy).
- **Foundry tests: 10/10 PASS** (`test/ERC8004.t.sol`) — full cycle register→request→response→reputation,
  access control (a non-owner cannot request, a non-validator cannot respond), bounds (response>100
  revert, duplicate hash revert). Whole repo suite: **15/15**.

**AgentCard + IPFS.** `docs/agent-card.json` (format `registration-v1`: name/description/services/
supportedTrust). Computed a **genuine CIDv1 (raw+sha256)** with `scripts/ipfs-cid.mjs` →
`bafkreiehe742yroj73474igxfwrataxzun75dzczrm3gld34kw4errng6i`. **Honestly:** no pinning credentials in
this environment — the CID is content-addressed and verifiable from the content, but the file is not
pinned to a public gateway (a separate hosting step). Documented in `docs/agent-card.cid.txt`.

**Deploy (Arc, after user approval — plan with gas estimate presented beforehand).**
`script/DeployERC8004.s.sol`: the deployer (Wallet B) deployed both registries, then **the agent
registered itself** (to be `ownerOf(agentId)` and able to submit its own decisions). Independently
verified with `cast`: code present, `ownerOf(1)` = agent, `tokenURI` = our CID, metadata
`framework=dao-warden` / `guards=<Governor>` / `validator=<validator>`,
`ValidationRegistry.getIdentityRegistry()` = IdentityRegistry.
- deploy IdentityRegistry: tx `0xcbde2ca62372bd9ca43ed0d7f6f262e7618b109dc178798234f1d1a886414b38`
- deploy ValidationRegistry: tx `0x90be37f96422540573d199352afe845be128d2d8b1c689dca65fd719ad17760e`
- register agent: tx `0xd288094b0c8f5822fd0484520bfb0def6a25d1b1579634e7d65c7109ae38b28f`

**Agent integration (TypeScript, `agent/src/`).** `erc8004.ts` (addresses + ABI + clients),
`identity.ts` (identity reads), `audit.ts` (the agent builds a canonical decision record, files a
`validationRequest`), `validate.ts` (the validator responds + reputation reads), `cid.ts` (CID on the
agent side), `stage6-demo.ts` + `identity-cli.ts`. `tsc --noEmit` clean.

**E2E demo (`npm run stage6`) — audit of the REAL WGIP-1 attack decision.** The agent scanned the
protected Governor, found WGIP-1, evaluated it with its full pipeline (**CRITICAL 100/100 + LLM
MAJOR_MISMATCH 92/100 → VOTE_NO**), filed a decision record to the ValidationRegistry, and the
validator scored the decision **100/100** (tag `attack-defense`). Reputation read: **1 review, average
100**. Transactions:
- validationRequest (agent): tx `0x25c57718310350ed6295d75618e066eb0b44ff5ddc4ecdb2741a025967387a73`
  · requestHash `0x13b6af1c…e73197` · requestURI `ipfs://bafkreighw2gqagqepbv64jypkz4amwdwjbfgegkharksmgdoubamtiqlzi`
- validationResponse (validator): tx `0x81386c4a054502bbe0524cb7702e7743d8174c2b1e2961a3892041008eab6c0e`

**Integrity check (the key auditability proof):** keccak256 of the stored decision record
(`docs/decisions/13b6af1c0df212e2.json`) = the on-chain `requestHash`, and its CID = the stored
`requestURI`. This proves the on-chain commitment binds EXACTLY to the committed record — the decision
cannot be silently changed later. All state independently confirmed with `cast`
(getAgentValidations/getSummary/getValidationStatus/getValidatorRequests).

**Next step:** Stage 7 — redeploy the DAO with `TimelockController`, proof that the timelock provides a
defense window even when the agent misses the voting window (a defense complementary to Stage 5, which
defends during voting).

### Session 3 — 2026-07-12 — Stage 7 (timelock mitigation) + English translation

**Stage 7 done and proven on-chain** — see the LIVE section at the top of this file for the full detail
(deployment addresses, roles, E2E proof, gas estimate). Commit `9704d03` pushed to
github.com/Kajko25/dao-warden.

**English translation (committee is English-speaking).** All committee-facing material translated to
English: README, PITCH, this session log, code comments, Solidity revert strings, and console logs.
Identifiers were already English. Chat with the user stays Polish. The LLM system prompt is now English
too (the model reasons in English). Verified: forge suite still 21/21, agent tsc clean, no Polish
diacritics/words remain in `src/test/script/agent`. ONE intentional exception: the on-chain-committed
decision record `docs/decisions/13b6af1c0df212e2.json` is left in Polish — its keccak256 == the on-chain
`requestHash` and its CID == the on-chain `requestURI` (Stage 6), so translating it would break the
integrity proof. Re-running `npm run stage6` would file a fresh English record if ever needed.

**Visual pitch.** Added `docs/pitch.html` — a self-contained, theme-aware "defense dossier" for the
committee (three-outcome proof, WGIP-1 threat readout, two defense layers, ERC-8004 accountability,
on-chain proofs appendix). Also published as a private Artifact on claude.ai.

**ERC-8004 redeployed in English (2026-07-12).** Because the original Stage 6 audited decision record
was in Polish and its keccak/CID are sealed on-chain (immutable), fixing it in place was impossible.
Instead we deployed FRESH registries and re-ran `stage6` with the English agent, giving a single clean
English audit trail (reputation 1 review, average 100 — not an appended second one). New addresses:
IdentityRegistry `0x103D690aAc91D88adc01701431dB7e65a9b915fd` (deploy tx
`0x7851a9160afe8401ddc37cef38face3179a75156a9ac1236b8fedf65339c0c06`), ValidationRegistry
`0x15E965CE0eDa0668464E41D88bca31212b96D33F` (deploy tx
`0xe7cc7fb671913cb59bfde809747520ba70f2b47f5d2308a0ece783e02ac0e70e`), register agent tx
`0x90ed7051f5f16aaf8303fe397f040f8b875dfe742c928ba764a096ce3c4114df`. English decision record
`docs/decisions/559681ee8639ad20.json`: agent files it (CRITICAL 100 + LLM MAJOR_MISMATCH 95 → VOTE_NO,
validationRequest tx `0x1d8d0252241fcb9c50be329210104e27412bb7967aeaee86c778c327040d09f8`, requestHash
`0x559681ee…d83e38`, requestURI `ipfs://bafkreidi4bf6rmm5g73n5vwewwnxhkv33oishxwmw2gg35lwllqsuzqhra`),
validator scores 100/100 (validationResponse tx `0xb8e6324419d8764a9b93edc6a7dade4f11aa123ee0b88403d2d79019c3e7873e`).
Integrity re-verified with `cast`: keccak256 of the stored record == on-chain requestHash. The old Polish
record file was removed; the first registries are simply abandoned on-chain. The proposal `description`
quoted inside the record stays Polish — it is the real, immutable on-chain WGIP-1 title.

**AgentCard translated to English + on-chain agentURI updated (2026-07-12).** `docs/agent-card.json` was
Polish and its CID is the on-chain `agentURI`, so we translated the card, recomputed the CID
(`bafkreiehe742yroj73474igxfwrataxzun75dzczrm3gld34kw4errng6i`), and the agent called
`IdentityRegistry.setAgentURI(1, …)` (tx `0xc34db186d28a21c162b64537508663806fd1f1b6e9e74b2ada56bfe8579aba65`).
Verified: `tokenURI(1)` == the recomputed CID of the English file. Also translated `agent/README.md`
(and updated it through Stage 7) and the agent's `package.json` description.

---

## 2026-07-13 — Live web dashboard (`web/`)

**Goal:** a public, user-facing frontend (deployable to Vercel) that lets anyone — including the
committee — watch the whole experiment live on Arc, without trusting our documents.

**What was built (`web/`, Next.js 16 + viem, read-only):**
- **"One attack, three outcomes"** strip — live treasury balances of the three deployments read
  from chain on every load: baseline **0 mUSD (drained)**, guardian-vote **1,000,000 mUSD intact**,
  guardian+timelock **1,000,000 mUSD intact**. The project's thesis as three live numbers.
- **Per-deployment proposal view** — every `ProposalCreated` is decoded in the browser
  (`Treasury.withdraw` recognition, same as the agent), scored with the agent's exact four
  deterministic rules **recomputed client-side at the proposal's creation block**, and shown with
  live vote tallies, lifecycle state, and a defense-outcome banner (drained / defeated / cancelled).
- **ERC-8004 panel** — agent identity (ERC-721 #1, global id, AgentCard URI with the honest
  "not pinned" caveat), filed decision records (linked to the repo files whose keccak256 == the
  on-chain `requestHash`), validator attestations and the reputation summary (1 review, avg 100).
- Every address/tx links to `testnet.arcscan.app`; footer states the trust model explicitly
  (read-only page; the agent runs off-chain; no private keys or API keys in the browser).

**Empirical findings (verified against the live RPC, not assumed):**
- Arc `eth_getLogs` is hard-limited to a **10,000-block range** (error -32614 above that).
  Discovery therefore = seeded known proposal blocks (immutable log positions, recorded in
  `web/lib/deployments.ts`) + live scan of the last 20,000 blocks + optional chunked
  "scan full history" with a progress indicator.
- Governor deploy blocks found by `eth_getCode` binary search: baseline 51453447,
  fast 51465959, timelocked 51496737; proposal creation blocks 51454256 / 51466380 / 51496834.
- The RPC sends permissive CORS headers, so the browser can read the chain directly — no backend.

**Verification:** production build clean; the chain library exercised standalone against live Arc
(expected values for all three proposals + audit trail); the running page driven in headless
Chromium — light and dark mode, all three tabs, full-history scan — zero console errors, all
on-chain values render correctly (screenshots reviewed).

**Vercel deploy (user action):** import the GitHub repo in Vercel → Root Directory `web/` →
Deploy. No environment variables required.
