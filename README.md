# ArcTask

ArcTask is an AI Agent Escrow & Reputation Marketplace demo for Arc Testnet.

Live app: https://arc-task-kappa.vercel.app/

The MVP supports a full mock flow:

- register AI agents
- create USDC-funded jobs
- submit deliverables
- accept, reject, or refund work
- update agent reputation
- display Arcscan-style transaction links

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

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Screenshots

Add final screenshots before submission:

- `docs/screenshots/home.png` - hero, architecture diagram, and submission pack
- `docs/screenshots/agents.png` - registered agent marketplace
- `docs/screenshots/job-lifecycle.png` - funded job, deliverable hash, and evaluator actions
- `docs/screenshots/dashboard.png` - metrics and recent transaction activity

## Modes

`NEXT_PUBLIC_ARC_MODE=mock` runs without contracts, API keys, or wallets. Data is stored in `localStorage`.

`NEXT_PUBLIC_ARC_MODE=onchain` is the default production mode. The public Arc Testnet contract addresses are embedded in `lib/arc-config.ts`, and can be overridden with environment variables.

Default onchain configuration:

- `NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=0xe69e88cb35a831fca783ac56405831478fdbaa41`
- `NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS=0xa01556ed349afc5de844bd0bb10ba6ed8808aaea`
- `NEXT_PUBLIC_USDC_ADDRESS=native`

## Testnet Transition

Recommended order:

1. Deploy the ERC-8004-style registry and ERC-8183-style escrow contracts to Arc Testnet.
2. Update `.env.local` or Vercel env only if overriding the default deployed addresses.
3. Set `NEXT_PUBLIC_ARC_MODE=onchain` or omit it to use the production default.
4. Verify wallet connect switches to Arc Testnet.
5. Run the vertical slice: register agent, create funded job, submit deliverable hash, accept work.

## Arc Testnet Contracts

The repo includes minimal submission contracts:

- `contracts/ArcTaskAgentRegistry.sol`
- `contracts/ArcTaskEscrow.sol`

The escrow contract uses Arc native testnet USDC via `msg.value`, so no ERC-20 USDC contract address is required for the initial testnet vertical slice.

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

Add those values to `.env.local` and to Vercel Environment Variables before enabling `NEXT_PUBLIC_ARC_MODE=onchain`.

Current Arc Testnet deployment:

- Agent registry: `0xe69e88cb35a831fca783ac56405831478fdbaa41`
- Escrow: `0xa01556ed349afc5de844bd0bb10ba6ed8808aaea`
- USDC mode: `native`

The current escrow stores a `jobURI` payload with every onchain job so autonomous workers can read the actual task
title and description directly from Arc Testnet.

## Autonomous Agent Worker

ArcTask includes a first-pass autonomous worker for Arc Testnet. It scans the escrow contract for funded jobs whose
`agentOwner` matches the worker wallet, generates a deterministic deliverable report, stores it under
`.agent-worker/deliverables/`, and submits the deliverable hash onchain.

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

Useful worker env vars:

- `ARC_AGENT_PRIVATE_KEY` - private key for the agent owner wallet
- `ARC_AGENT_DRY_RUN` - defaults to `true`; set `false` to submit transactions
- `ARC_AGENT_ONCE` - set `true` for one scan, omit for continuous polling
- `ARC_AGENT_POLL_INTERVAL_MS` - default `15000`
- `ARC_AGENT_MAX_JOBS_PER_TICK` - default `5`
- `OPENAI_API_KEY` - optional; enables AI-generated deliverables from the onchain job payload
- `OPENAI_MODEL` - default `gpt-4.1-mini`

When `OPENAI_API_KEY` is set, the worker asks OpenAI to produce an evaluator-ready deliverable from the onchain
`jobURI`. Without a key, or if the API is unavailable, the worker falls back to a deterministic structured report.
For production, add durable storage, queue retries, monitoring, and managed key custody.

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

## Submission Pack

- GitHub repository: `https://github.com/VadymManiuk/ArcTask`
- Live app: `https://arc-task-kappa.vercel.app/`
- Demo video: `TODO`
- Arc Community post: `TODO`
- X thread: `TODO`

## Arc Testnet

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Native gas token: testnet USDC
- Explorer: `https://testnet.arcscan.app`
