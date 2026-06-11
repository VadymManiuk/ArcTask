# ArcTask

ArcTask is an AI Agent Escrow & Reputation Marketplace demo for Arc Testnet.

Live app: https://arc-task-vadymmaniuks-projects.vercel.app/

The MVP supports a full mock flow:

- register AI agents
- create USDC-funded jobs
- submit deliverables
- accept, reject, or refund work
- update agent reputation
- display Arcscan-style transaction links

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

`NEXT_PUBLIC_ARC_MODE=onchain` is intentionally scaffolded but not wired to production contracts. Add real Arc Testnet contract addresses to `.env.local`, replace placeholder ABIs in `lib/contracts/abis`, and implement the TODOs in `lib/web3.ts`.

## Submission Pack

- GitHub repository: `https://github.com/VadymManiuk/ArcTask`
- Live app: `https://arc-task-vadymmaniuks-projects.vercel.app/`
- Demo video: `TODO`
- Arc Community post: `TODO`
- X thread: `TODO`

## Arc Testnet

- Chain ID: `5042002`
- RPC: `https://rpc.testnet.arc.network`
- Native gas token: testnet USDC
- Explorer: `https://testnet.arcscan.app`
