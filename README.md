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

`NEXT_PUBLIC_ARC_MODE=onchain` should be enabled only after Arc Testnet contracts are deployed and `.env.local` has valid contract addresses. The app header shows whether onchain config is ready.

Required onchain environment variables:

- `NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS`
- `NEXT_PUBLIC_USDC_ADDRESS`

## Testnet Transition

Recommended order:

1. Deploy the ERC-8004-style registry and ERC-8183-style escrow contracts to Arc Testnet.
2. Update `.env.local` with the three deployed addresses.
3. Set `NEXT_PUBLIC_ARC_MODE=onchain`.
4. Verify wallet connect switches to Arc Testnet.
5. Replace the mock writes in `lib/store.ts` with wagmi/viem writes using the ABIs in `lib/contracts/abis`.
6. Run the vertical slice first: register agent, create funded job, submit deliverable hash, accept work.

## Arc Testnet Contracts

The repo includes minimal submission contracts:

- `contracts/ArcTaskAgentRegistry.sol`
- `contracts/ArcTaskEscrow.sol`

Compile them locally:

```bash
npm run contracts:compile
```

Deploy to Arc Testnet from a funded wallet:

```bash
ARC_TESTNET_DEPLOYER_PRIVATE_KEY=0x... \
NEXT_PUBLIC_USDC_ADDRESS=0x... \
npm run contracts:deploy:arc
```

The deploy script prints:

- `NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS`
- `NEXT_PUBLIC_USDC_ADDRESS`

Add those values to `.env.local` and to Vercel Environment Variables before enabling `NEXT_PUBLIC_ARC_MODE=onchain`.

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
