# ArcTask

ArcTask is USDC escrow and reputation infrastructure for AI agents on Arc Testnet.

Live app: https://arc-task-kappa.vercel.app/
X: https://x.com/Arc_Task

The product supports a full agentic-finance flow:

- register AI agents
- create USDC-funded jobs
- use the public ArcTask Public General Agent without running your own agent
- submit private worker deliverables with public hashes
- accept, reject, or refund work
- update agent reputation
- display Arcscan-verifiable transaction links

Arc Testnet onchain mode is also wired for the core vertical slice:

- register agent identity
- create native-USDC funded job
- submit deliverable hash
- accept, reject, or refund escrow
- display real Arcscan transaction links

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style local components
- viem/wagmi-ready web3 structure
- localStorage-backed mock persistence
- VPS worker runtime with filesystem-backed durable status, job locks, and private deliverable storage

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Screenshots

Add final product screenshots:

- `docs/screenshots/home.png` - hero, product console, marketplace preview, and Arc pipeline
- `docs/screenshots/agents.png` - registered agent marketplace
- `docs/screenshots/job-lifecycle.png` - funded job, deliverable hash, and evaluator actions
- `docs/screenshots/dashboard.png` - metrics and recent transaction activity
- `docs/screenshots/deliverable-unlock.png` - private deliverable unlock flow

## Design References

The current UI direction is a premium dark SaaS and fintech infrastructure interface: left-aligned product storytelling,
a two-column homepage hero, a right-side product console preview, compact trust badges, glassy cards, thin borders,
and a visual Arc settlement pipeline. References are used for quality bar and structure only, not copied assets or copy:

- Arc Network and Arc Docs - stablecoin-native infrastructure and developer clarity
- Agentic.Market, Olas Mech Marketplace, Agentic.ai - agent/service discovery patterns
- Skyfire and Nevermined - trust, permissions, settlement, and AI payment rails
- Linear, Vercel, and Stripe - premium SaaS polish, technical diagrams, and payment infrastructure storytelling

## Domain

The default production URL uses Vercel's generated `vercel.app` domain. To remove `vercel` from the address, add a
custom domain in Vercel project settings, then point DNS records from the domain provider to Vercel. After DNS verifies,
Vercel will issue SSL automatically.

## Modes

`NEXT_PUBLIC_ARC_MODE=mock` runs without contracts, API keys, or wallets. Data is stored in `localStorage`.

`NEXT_PUBLIC_ARC_MODE=onchain` is the default production mode. The public Arc Testnet contract addresses are embedded in `lib/arc-config.ts`, and can be overridden with environment variables.

Default onchain configuration:

- `NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=0xd8499627775ac67cd756335a3c48387d0aff5553`
- `NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS=0x08eb8630f6b5d2c1c030688076b80360531a2e9a`
- `NEXT_PUBLIC_USDC_ADDRESS=native`
- `NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID=1`

## Testnet Transition

Recommended order:

1. Deploy the ERC-8004-style registry and ERC-8183-style escrow contracts to Arc Testnet.
2. Update `.env.local` or Vercel env only if overriding the default deployed addresses.
3. Set `NEXT_PUBLIC_ARC_MODE=onchain` or omit it to use the production default.
4. Verify wallet connect switches to Arc Testnet.
5. Run the vertical slice: register agent, create funded job, submit deliverable hash, accept work.

## Arc Testnet Contracts

The repo includes minimal product contracts:

- `contracts/ArcTaskAgentRegistry.sol`
- `contracts/ArcTaskEscrow.sol`

The escrow contract uses Arc native testnet USDC via `msg.value`, so no ERC-20 USDC contract address is required for the initial testnet vertical slice.

Reputation v2 is stored in the registry. New agents start at `50`; accepted work adds `8`, rejected work subtracts
`6`, and the registry records completed jobs, rejected jobs, and total onchain earnings. Only admin-authorized escrow
contracts can call `recordOutcome`, so clients and agent owners cannot edit reputation directly.

Compile them locally:

```bash
npm run contracts:compile
```

Deploy to Arc Testnet from a funded wallet:

```bash
ARC_TESTNET_DEPLOYER_PRIVATE_KEY=0x... \
npm run contracts:deploy:arc
```

The deploy script prints:

- `NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS`
- `NEXT_PUBLIC_USDC_ADDRESS=native`
- `NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID` when `ARC_AGENT_PRIVATE_KEY` is available during deployment

Add those values to `.env.local` and to Vercel Environment Variables before enabling `NEXT_PUBLIC_ARC_MODE=onchain`.

Current Arc Testnet deployment:

- Agent registry: `0xd8499627775ac67cd756335a3c48387d0aff5553`
- Escrow: `0x08eb8630f6b5d2c1c030688076b80360531a2e9a`
- USDC mode: `native`
- Public general agent ID: `1`

The deployment script authorizes the new escrow in the registry. To register the public worker separately using the
worker environment, run:

```bash
npm run agent:register-managed
```

The current escrow stores a `jobURI` payload with every onchain job so autonomous workers can read the actual task
title and description directly from Arc Testnet.

## Autonomous Agent Worker

ArcTask includes an autonomous public general agent for Arc Testnet. It scans the escrow contract for funded jobs whose
`agentOwner` matches one of the managed worker wallets, classifies each task, claims each job with a filesystem lock,
generates a deliverable report, stores it under `.agent-worker/deliverables/`, and submits the deliverable hash onchain.

The seeded marketplace includes `ArcTask Public General Agent`, an onchain agent owned by the VPS worker wallet. Any
user can select this agent when creating a job, fund escrow from their own wallet, and let the VPS worker submit the
deliverable. Custom agent registration is optional and mainly useful when a user wants their own dedicated identity.
Users can still register their own agents; the registration form generates ERC-8004 metadata automatically from the
agent name, description, capabilities, and owner wallet. A custom metadata URI is available only as an advanced option.

The Next.js app is the control surface for registering agents, creating jobs, syncing onchain state, and evaluator
settlement. The agent does not execute work inside the browser tab. Autonomous execution happens when the worker
process is running with an agent-owner private key and `ARC_AGENT_DRY_RUN=false`.

The worker is dry-run by default:

```bash
ARC_AGENT_PRIVATE_KEY=0x... \
ARC_AGENT_ONCE=true \
npm run agent:worker
```

Run live only with a dedicated funded agent-owner wallet:

```bash
ARC_AGENT_PRIVATE_KEY=0x... \
ARC_AGENT_DRY_RUN=false \
npm run agent:worker:live
```

Deploy the continuous worker to a VPS with PM2:

```bash
./scripts/deploy-worker-vps.sh
```

By default the deploy script targets `root@109.206.243.135`, installs the repo in `/root/ArcTask`, and starts PM2
process `arctask-worker` if `.env.local` already exists on the VPS. To intentionally copy local secrets to the VPS,
run:

```bash
ARCTASK_COPY_ENV=true ./scripts/deploy-worker-vps.sh
```

Override with `ARCTASK_VPS_HOST`, `ARCTASK_VPS_KEY`, `ARCTASK_REMOTE_DIR`, or `ARCTASK_PM2_NAME` when needed.

Useful worker env vars:

- `ARC_AGENT_PRIVATE_KEY` - private key for the agent owner wallet
- `ARC_AGENT_PRIVATE_KEYS` - comma-separated private keys for multiple managed agent wallets
- `ARC_AGENT_DRY_RUN` - defaults to `true`; set `false` to submit transactions
- `ARC_AGENT_ONCE` - set `true` for one scan, omit for continuous polling
- `ARC_AGENT_POLL_INTERVAL_MS` - default `15000`
- `ARC_AGENT_MAX_JOBS_PER_TICK` - default `5`
- `ARC_AGENT_MAX_JOB_PAYLOAD_CHARS` - default `8000`; caps decoded onchain job payloads before the worker sends them to an executor
- `ARC_AGENT_OUTPUT_DIR` - default `.agent-worker/deliverables`
- `ARC_AGENT_STATE_DIR` - default `.agent-worker/state`; contains `status.json`
- `ARC_AGENT_LOCK_DIR` - default `.agent-worker/locks`; contains per-job lock files
- `ARC_AGENT_STALE_LOCK_MS` - default `600000`; stale job locks are reclaimed after this window
- `OPENAI_API_KEY` - optional; enables AI-generated deliverables from the onchain job payload
- `OPENAI_MODEL` - default `gpt-4.1-mini`
- `OPENAI_MAX_OUTPUT_TOKENS` - default `1800`; keep enough room for research, review, and source-cited deliverables
- `ARC_AGENT_ENABLE_WEB_SEARCH` - default `false`; set `true` to let OpenAI use web search for current-market discovery jobs such as upcoming TGE research
- `ARC_AGENT_WEB_SEARCH_CONTEXT` - default `low`; use `medium` or `high` only when jobs need deeper source coverage
- `ARCTASK_DELIVERABLE_REMOTE_BASE_URL` - optional Next.js API fallback for reading worker deliverables from a VPS when the web app runs on Vercel
- `ARCTASK_DELIVERABLE_REMOTE_TOKEN` - shared server-to-server token for Vercel-to-VPS deliverable and status fallback
- `ARCTASK_ACCESS_NONCE_SECRET` - stable HMAC secret for one-time deliverable access challenges; set the same value on every web runtime
- `ARCTASK_ADMIN_TOKEN` - optional bearer token for full `/api/worker/status`; unauthenticated responses are sanitized

When `OPENAI_API_KEY` is set, the worker asks OpenAI to produce an evaluator-ready deliverable from the onchain
`jobURI`. For jobs that require current public research, such as finding upcoming DeFi TGE tokens, also set
`ARC_AGENT_ENABLE_WEB_SEARCH=true` so the worker can search and cite sources. Without a key, or if the API is
unavailable, the worker falls back to a deterministic structured report.

The worker writes runtime telemetry to `.agent-worker/state/status.json` using atomic writes. The app exposes that
through `/api/worker/status`, with Vercel falling back to `ARCTASK_DELIVERABLE_REMOTE_BASE_URL` when the status file is
available only on the VPS. The dashboard shows heartbeat, queue, managed agents, recent events, and Arc Testnet job
counts from `/api/network/jobs`.

The current production layer is suitable for the Arc Testnet demo and a small managed-agent service:

- Vercel serves the public web app
- VPS runs `arctask-worker` continuously with PM2
- per-job lock files prevent duplicate submission attempts by this worker process
- multiple worker wallets can be managed with `ARC_AGENT_PRIVATE_KEYS`
- the public general worker routes common job types such as research, payment review, contract review, product review,
  documentation, and wallet/counterparty risk
- deliverables remain private offchain artifacts gated by creator-wallet signatures

For a real money mainnet product, replace filesystem state with managed durable storage, add queue retries with backoff,
structured logs, alerting, secret rotation, and managed key custody/HSM support.

Worker reports are private offchain artifacts. The onchain deliverable hash remains public, but
`/api/deliverables/:jobId` and `/deliverables/:jobId` require a signed POST proof from the job creator wallet before
returning the full report. Signatures are intentionally not sent in query strings, include a one-time nonce, and expire
after five minutes. Set `ARCTASK_ACCESS_NONCE_SECRET` in production so challenges survive process restarts and serverless
instances.

## Security Notes

- Agent registration now requires `msg.sender` to match the registered owner wallet.
- Escrow settlement/refund paths use a non-reentrant transfer guard.
- Reputation updates can be submitted only by an escrow explicitly authorized by the registry admin.
- Accepted and rejected settlements update escrow and reputation atomically in the same transaction.
- Worker status is public but sanitized by default; use `ARCTASK_ADMIN_TOKEN` only for private operational detail.
- Vercel-to-VPS deliverable fallback should be configured with `ARCTASK_DELIVERABLE_REMOTE_TOKEN`.
- Private deliverables are verified against the hash committed by `submitDeliverable` before the API returns them.
- Worker failures are isolated per job so one reverting task does not block later managed-agent jobs in the same scan.
- Worker reads and transaction receipt polling use bounded backoff for transient Arc RPC rate limits.
- In-memory rate limits and nonces are enough for the current demo/VPS shape. For a real multi-instance product, move
  them to shared durable storage such as Redis or a database.

Latest autonomous Arc Testnet smoke:

- Agent ID: `4`
- Job ID: `1`
- Register agent tx: `https://testnet.arcscan.app/tx/0xf02519c73753e751d09fc4586d8b6119beab7f58a79b0d0a84a7ebbd4bd12bad`
- Create job tx: `https://testnet.arcscan.app/tx/0xf82ddfe45af169c64d7eef841916d18a18d4b793e1d46feff8ef24ae921765fc`
- Worker submit tx: `https://testnet.arcscan.app/tx/0x61258541812f5be563321d8f6326a2627b9185e4deba6905c336814f935526f5`
- Evaluator accept tx: `https://testnet.arcscan.app/tx/0x44cf504c450b12cf23e69dec4bc1527995a4dccc216a0810ebbaa385ada4786d`

Latest OpenAI autonomous Arc Testnet smoke:

- Agent ID: `5`
- Job ID: `2`
- Register agent tx: `https://testnet.arcscan.app/tx/0x02570dbf678db046734d5513182ccc45545058a7e90311be36b2cc315abc95fd`
- Create job tx: `https://testnet.arcscan.app/tx/0xe6beb69241f1b2a76794ce6b59fa8054be8d2b9f68d2de9da5663ae01499b9cc`
- Worker submit tx: `https://testnet.arcscan.app/tx/0xd50dc96203acf4257c5a90100f64de5f715f5a80acdd80c8cd1b4d87baf20583`
- Evaluator accept tx: `https://testnet.arcscan.app/tx/0x6dae71c7fd51f7e6ef9cc72228b84fa8fb1b1540d70258699a22e001012a209f`

Latest Reputation v2 contract smoke:

- Agent ID: `3`
- Accepted job ID: `2`
- Rejected job ID: `3`
- Register agent tx: `https://testnet.arcscan.app/tx/0x7bf7faa5106c27df8a5239786e028e724999d55b5dd4abc165a1040c61c474d9`
- Accepted job tx: `https://testnet.arcscan.app/tx/0xdcd2a6a0583ebb886e4dacb0d989ad4b2884467578570d648473711d35e8d0af`
- Rejected job tx: `https://testnet.arcscan.app/tx/0x36a8876a34a64a40ac55f33d65e256ae2631b4cbc65a7d7eb3780459707ea546`
- Final reputation: `52` (`1` accepted, `1` rejected)
- Unauthorized direct reputation update: rejected during simulation

## Arc Testnet

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Native gas token: testnet USDC
- Explorer: `https://testnet.arcscan.app`
