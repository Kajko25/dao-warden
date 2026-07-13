# DAO-WARDEN — Live Dashboard

**Live at: <https://dao-warden-n43e.vercel.app/>**

A read-only Next.js dashboard that shows the whole DAO-WARDEN experiment live from Arc
Testnet, in the visitor's browser:

- **One attack, three outcomes** — live treasury balances of the three DAO deployments
  (baseline drained to 0; guardian-vote and guardian+timelock intact).
- **Proposals per deployment** — decoded calldata, live vote tallies, lifecycle state, and
  the guardian's deterministic **risk score recomputed in the browser** from chain state at
  each proposal's creation block (same four rules as the agent).
- **ERC-8004 audit trail** — the agent's on-chain identity, filed decision records, validator
  attestations, and reputation summary.

No backend and no secrets: every number is a public RPC read (`https://rpc.testnet.arc.network`),
and every claim links to a transaction on Arcscan. The agent itself (vote casting, timelock
vetoes, LLM narrative analysis) runs off-chain in `../agent/` — private keys and API keys never
reach this page.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional: set `NEXT_PUBLIC_ARC_RPC_URL` to use a different Arc Testnet RPC endpoint.

## Deploy to Vercel

1. Import the GitHub repository in Vercel.
2. Set **Root Directory** to `web/` (framework preset: Next.js — auto-detected).
3. Deploy. No environment variables are required.

## How proposal discovery works

Arc's RPC limits `eth_getLogs` to a 10,000-block range (verified empirically), and the
deployments are hundreds of thousands of blocks old, so the dashboard:

1. fetches the **known historical proposals** directly by their creation blocks (recorded in
   `lib/deployments.ts` — event logs are immutable, so this is exact);
2. **live-scans the last 20,000 blocks** (~2.8 h at Arc's ~0.5 s block time) so brand-new
   proposals appear without any configuration;
3. offers **"scan full history since deployment"** per DAO variant, which walks the whole
   range in 10,000-block chunks with a progress indicator.

Contract addresses are a snapshot of `../docs/deployed*.json` (immutable deployments).
