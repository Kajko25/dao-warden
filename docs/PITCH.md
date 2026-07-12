# DAO-WARDEN — pitch document

> A living document prepared for the evaluation committee: what DAO-WARDEN is, the problem it
> solves, how it is built, and how it came together.
> Last updated: 2026-07-12 (**Stages 0–7 complete — full roadmap closed**).

## TL;DR (for the committee)

DAO-WARDEN is an **auditable AI guardian agent** that defends a DAO treasury against *governance
attacks* (the BONK attack class — hijacking the vote, not breaking the code). On Arc we built a
deliberately vulnerable DAO as a proving ground, then an agent that defends it across **two
independent, complementary layers** — and we proved each one on-chain against a measurable baseline:

| Scenario | Who defends | On-chain result |
|---|---|---|
| **Baseline** (Stage 2, no guardian) | nobody (honest holders passive) | treasury **1,000,000 → 0 mUSD**, attack `Executed` |
| **Vote defense** (Stage 5) | agent votes NO with delegated power | proposal **DEFEATED**, treasury intact |
| **Timelock defense** (Stage 7) | agent cancels in the post-vote window | proposal **Canceled**, treasury intact |

On top of that: **narrative-vs-instructions** analysis by Claude (catches "nice description masking
a drain") and **identity + decision trail + reputation** via ERC-8004. Everything independently
verified (`cast`).

---

## 1. The problem — governance attacks

DAOs (decentralized autonomous organizations) manage treasuries through token voting. A
**governance attack** seizes control of such an organization **not by breaking the code, but
through the voting mechanism itself**: the attacker acquires a voting majority and pushes through
a proposal that drains the treasury.

**Reference case — the BONK DAO attack (July 2026):** the attacker spent a few million dollars on
tokens, out-voted everyone at extremely low turnout, and drained the treasury. No contract was
"hacked" — a normal, rules-compliant mechanism did exactly what it was designed to do. That is
what makes this attack class so insidious: a code audit will not catch it.

**Three factors that enable the attack:**
1. **Low quorum** — a tiny fraction of tokens is enough to pass a proposal.
2. **No / zero proposal threshold** — anyone can submit any proposal.
3. **No timelock** — once voting ends, funds leave immediately; the honest community has no time
   window to react.

## 2. What DAO-WARDEN is

DAO-WARDEN is an **AI guardian agent** that monitors a DAO in real time and detects proposals
with the hallmarks of a governance attack before the treasury is drained — and ultimately
**actively reacts** (delegates voting power to itself and votes against), leaving an auditable
trail of its decisions.

The key point: the agent does not just judge "will this proposal pass"; it **compares a proposal's
stated narrative against its real on-chain instructions** (who and how much the calldata actually
moves) and detects the "nice description vs. treasury drain" mismatch.

## 3. Why Arc (Circle)

We build on **Arc Testnet** — Circle's blockchain where the native gas token is USDC. The network
offers sub-second finality (~0.5 s blocks) and predictable, stable fees, which is a natural fit
for value-handling applications (treasuries, agent payments).

## 4. Architecture and approach

Since no real DAO exists on testnet to attack, the project has two layers:

**A. The proving ground — a deliberately vulnerable mini-DAO** (reproducing the BONK vulnerability
class on EVM):
- `GovToken` (WGOV) — the voting token (standard ERC20Votes).
- `DAOGovernor` — the voting mechanism with **1% quorum**, **zero proposal threshold**, **no
  timelock** (all three attack factors).
- `Treasury` — the vault, whose funds only the Governor can withdraw.

**B. The guardian** — an agent (TypeScript + Viem) that watches and defends this DAO. The AI layer
(Claude API) adds semantic narrative-vs-instructions analysis.

**A deliberate methodological choice:** the detection core is **deterministic** (instruction
parsing, risk scoring on hard rules) and is built **before** the LLM layer. The LLM adds judgment
where rules fall short — it is not the sole decision point. This keeps the system auditable and
robust.

**LLM layer (Stage 4, DONE):** we added semantic analysis via **Claude Haiku 4.5** (TypeScript
SDK, structured outputs). The agent compares a proposal's **narrative** (the `description` field,
written for voters) with its **real on-chain instructions** (decoded calldata) and detects the
"nice description vs. actual action" mismatch. The API key comes exclusively from an environment
variable; the layer is optional — the deterministic core runs without it. Verified on WGIP-1: the
model returned **MAJOR_MISMATCH (85/100)**, correctly recognizing that an "operational grant for
ecosystem growth" masked a transfer of 100% of the treasury to the proposer's own address — it
called it out explicitly as a BONK-signature attack. This closes the detection loop: hard rules
catch the mechanics, the LLM catches the intent.

**Agent reaction (Stage 5, DONE) — the first time the guardian ACTS, not just detects.** An honest
(apathetic) holder delegates voting power to the agent; once the risk threshold is crossed the
agent automatically votes **NO**. Demonstrated end-to-end on Arc (fast DAO variant, ~35 s cycle):
the attacker submitted a treasury-draining proposal and voted YES (50k), the agent detected the
attack (CRITICAL 100/100 + MAJOR_MISMATCH 95/100), decided to react, and voted NO with 100k of
delegated power → **result YES 50k / NO 100k → proposal DEFEATED, treasury intact (1,000,000 mUSD)**.
The same attack without the agent (Stage 2) drained the treasury to zero. This is the core of
DAO-WARDEN's value: **the guardian is the always-vigilant delegate to whom an apathetic majority
entrusts its vote.**

**Identity, audit, and reputation (Stage 6, DONE) — the guardian becomes accountable.** We built
and deployed on Arc two registries compliant with the **ERC-8004 (Trustless Agents)** standard:
**IdentityRegistry** (the agent as an ERC-721 token with an AgentCard on IPFS) and
**ValidationRegistry**. The agent registered **itself** — it owns its `agentId`, so only it can
submit its own decisions for validation. The standard serves two functions at once here:
- **An auditable decision trail** — for every evaluated proposal the agent files a
  `validationRequest`, where `requestHash` is the keccak256 of the canonical decision record (what
  it flagged and why). This is a **cryptographic commitment**: the decision cannot be silently
  altered afterward. Confirmed to the byte — keccak of the stored record = the on-chain hash, and
  its CID = the stored `requestURI`.
- **A reputation signal** — an **independent validator** scores the decision (`validationResponse`,
  0–100); `getSummary` aggregates this into the agent's reputation. Demonstrated on the real WGIP-1
  attack: the agent recorded a `VOTE_NO` decision (CRITICAL 100 + MAJOR_MISMATCH 95), and the
  validator confirmed it with a score of **100/100 → reputation: 1 review, average 100**.

The result: the agent has a **portable on-chain identity** (`eip155:5042002:<registry>:1`) and a
verifiable history of its judgments — essential when it is entrusted with a real DAO's voting power.

**Timelock mitigation (Stage 7, DONE) — a second, independent defense layer.** We redeployed the
DAO, changing **exactly one variable** relative to the vulnerable variant: execution now goes
through a `TimelockController`. **We deliberately left the 1% quorum and zero threshold unchanged** —
so the proof is clean: it is *the timelock itself* (not tighter parameters) that provides the
defense. The proposal lifecycle changes from "Succeeded → immediate drain" to "Succeeded → queue →
**`minDelay` window** → execution". In that window the agent, holding the `CANCELLER` role on the
timelock, **cancels the attack operation**.

Why this is a separate layer and not a repeat of Stage 5: the vote defense (Stage 5) acts **during**
voting and requires the agent to hold enough delegated power. The timelock acts **after** a won
vote — it saves the situation even when the first layer fails (the agent didn't make it in time,
held no votes, or the attacker acquired a genuine majority). Demonstrated end-to-end on Arc in
exactly that "worst case" scenario: honest holders passive → **the attack wins the vote** (Succeeded)
→ it enters the queue (Queued) → the agent (CRITICAL 100/100 + LLM MAJOR_MISMATCH 85/100 → VOTE_NO)
**cancels the operation in the `minDelay` window** → **state Canceled, treasury 1,000,000 mUSD
intact, `execute` rejected**.

We honestly mark the limit of this defense in the tests: the delay alone is **not** a safeguard — if
nobody reacts in the `minDelay` window, the attack still lands. That is why the timelock and the
agent are **complementary**: the timelock *buys time*, and the guardian *uses* that time.

## 5. Build stages

| Stage | Scope | Status |
|---|---|---|
| 0 | Environment, repo, OpenZeppelin, Arc configuration | ✅ |
| 1 | Vulnerable DAO contracts + local tests | ✅ |
| 2 | Deploy on Arc + end-to-end attack simulation | ✅ |
| 3 | Agent — deterministic core (listener + parser + scoring) | ✅ |
| 4 | LLM layer (Claude): narrative vs. real instructions | ✅ |
| 5 | Agent reaction (delegation + automatic NO vote) | ✅ |
| 6 | ERC-8004 identity + decision logging + reputation | ✅ |
| 7 | Mitigation: redeploy with timelock, proof the attack is stopped | ✅ |

## 6. Key engineering decisions (and their rationale)

- **Voting clock in `timestamp` mode, not block number.** With ~0.5 s blocks, block-counted periods
  are impractical and depend on variable block time; timestamps give periods in seconds. The token
  and the Governor share the clock (the Governor inherits it from the token).
- **`evm_version = cancun`** — we verified empirically (read-only `eth_call`) that Arc supports
  Cancun opcodes (PUSH0, MCOPY); OpenZeppelin v5.6 requires them. We corrected an earlier (outdated)
  assumption that `paris` was necessary.
- **Empirical verification over assumptions** — every fact about the network (chainId, block time,
  opcode support, gas price) confirmed live, not taken from memory.
- **Hermetic tests** — the attack golden test runs locally (Foundry) with a stand-in asset
  (MockERC20), independent of network state; the on-chain version uses the same code.

## 7. Proofs (on-chain, Arc Testnet — chainId 5042002)

Contracts deployed and independently verified (`cast`), explorer: `testnet.arcscan.app`.

| Item | Address / value |
|---|---|
| GovToken (WGOV) | `0xa2f16689aBCDaF264F96e66724CFbdB33EfFF622` |
| DAOGovernor | `0x0CbCaa61344Efef42916a7461e1bF2B673Fc4a21` |
| Treasury | `0xD3FBEE1CAD68EC7c4C68632A1175b4Dba9BAF293` |
| Treasury asset (mUSD) | `0xe17a3d3c1bECAAC8A7f66F54598204C9F60EeaE5` |
| Vulnerability parameters | 1% quorum, proposal threshold 0, no timelock |
| Treasury (pre-attack) | 1,000,000 mUSD |
| **IdentityRegistry** (ERC-8004) | `0x103D690aAc91D88adc01701431dB7e65a9b915fd` |
| **ValidationRegistry** (ERC-8004) | `0x15E965CE0eDa0668464E41D88bca31212b96D33F` |
| Global agentId | `eip155:5042002:0x103D…915fd:1` (owner = agent wallet) |
| **Timelocked variant (Stage 7):** | |
| DAOGovernorTimelocked | `0x641181a13c3114392e40fB4dc0785ACE279E9c1E` |
| **TimelockController** (minDelay 120 s) | `0x5fB14e2398E53d15E044b770B8aCB67FDa04337f` |
| Treasury (owner = timelock) | `0xB565228545e798495F10330685779eB5C2b639f4` |
| Timelock roles | Governor = PROPOSER, agent = CANCELLER, admin renounced |

**Attack simulation (Stage 2, DONE):** the attacker with 50,000 WGOV (5% of supply) alone cleared
quorum (10,000) and the majority while the honest holder of 100,000 WGOV stayed passive — exactly
the BONK scenario. Result confirmed on-chain: **treasury 1,000,000 → 0 mUSD, attacker 0 →
1,000,000 mUSD**; proposal in state `Executed`. Real-world time proposal→drain ~1h. Execution
transaction: `0x0381784133e786bbbeccd67da354ae0f07b7b50e9f17c4f1eb93eb4ce5cbdd21`. Full trail in
`docs/SESSION-LOG.md`.

This result is the **baseline** for the whole project: the same attack is to be detected and
repelled by the agent in Stage 5, and made impossible by the timelock in Stage 7.

**Agent — deterministic core (Stage 3, DONE):** the agent (TypeScript + Viem, `agent/` directory)
listens for the `ProposalCreated` event, decodes the proposal's instructions (recognizes
`Treasury.withdraw` by selector `0xd9caed12`), and scores risk on **four deterministic rules** (fund
movement, % of treasury, self-dealing, proposer ≥ quorum) — without the LLM. A key decision: the
agent evaluates on-chain state **at the proposal's creation block**, not the current one.
Verification: run against the real WGIP-1 attack proposal it returned **CRITICAL 100/100** with all
four signals — i.e., it correctly recognized the BONK-class attack signature before it executed.

**Vote defense (Stage 5, DONE):** on the fast DAO variant the agent repelled the same attack by
voting NO with 100k of delegated power → **YES 50k / NO 100k → DEFEATED**, treasury intact (in
contrast to the baseline, where the treasury dropped to zero).

**Timelock defense (Stage 7, DONE):** in a scenario where the attack **wins** the vote (honest
holders passive), the agent cancelled the queued operation in the `minDelay` window → **state
`Canceled`, treasury 1,000,000 mUSD intact, `execute` rejected**. An engineering detail worth
noting: the agent computes the timelock operation id on its own side (`salt = bytes20(governor) XOR
descriptionHash`, exactly like `GovernorTimelockControl`); we verified the match with Solidity
numerically and additionally by comparison with the on-chain `hashOperationBatch`. The golden test
for this mitigation (4 proofs, including "delay alone is not a defense") passes locally **5/5** (the
whole repo suite is 21/21).

## 8. What this project demonstrates

- Governance attacks are a real, growing threat class, undetectable by code audit.
- Defense requires **real-time monitoring + a reaction within a time window** — not just better
  contract code.
- **One layer is not enough.** We showed two independent, complementary lines of defense: the vote
  during voting (Stage 5) and cancellation in the timelock window after voting (Stage 7). The
  timelock buys time, the guardian uses it — and conversely, the vote defense works even without a
  timelock. Together they cover both an attack intercepted early and one that has won the vote.
- DAO-WARDEN combines deterministic rules with AI judgment and on-chain identity (ERC-8004),
  building an **auditable, autonomous guardian** — a pattern portable to real DAOs.

## 9. Possible directions for further work

- **Realistic live demo** — replaying the full cycle on the production variant (~1h voting period)
  instead of the fast one, for a committee watching in real time.
- **Pinning the AgentCard to public IPFS** — the CID is already genuine and content-addressed; only
  hosting on a public gateway is missing (a separate step, requiring pinning credentials).
- **More attack patterns** — extending the rules beyond `Treasury.withdraw` (e.g., swapping Governor
  settings, changing ownership, granting a role) and calibrating thresholds on historical proposals.
- **Multiple validators** — reputation from a single validator is a starting point; ultimately a set
  of independent validators with collusion-resistant aggregation.
