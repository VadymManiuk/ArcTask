# ArcTask mainnet migration

The code targets Arc Mainnet (5042). A mainnet launch is complete only after all onchain and service checks below pass.
Existing testnet contracts, funds, jobs and reputation stay on testnet; they cannot be moved by changing an RPC URL.

## Preparation

1. Preserve the testnet environment and `.agent-worker` directory for historical jobs and claims. Do not overwrite or delete them.
2. Select the deployer, treasury, arbitrator and managed worker wallets. Fund the deployer and worker with **native mainnet USDC**. Native units use 18 decimals.
3. Copy `.env.example` to a private mainnet env file and set only the required secrets locally/on their existing host. Do not copy a complete secret dump between machines.
4. Clear `ARC_AGENT_RECOVERY_JOB_IDS`, set `ARC_AGENT_DEMO_SUBSIDY=false`, and remove every testnet RPC/contract override. The worker rejects testnet addresses and subsidy overrides.
5. Leave historical mainnet escrow versions empty for a fresh deployment. New jobs use V4 beginning at `3000000`.

## Deploy and verify

```sh
npm ci
npm test
npm run typecheck
npm run contracts:compile
ARCTASK_DEPLOYER_ADDRESS=0xYourAddress npm run contracts:deploy:arc
# Review the plan. Configure ARC_MAINNET_DEPLOYER_PRIVATE_KEY for that wallet.
npm run contracts:deploy:arc:execute
```

Node scripts accept `ARCTASK_ENV_FILE=/absolute/path/to/private.env`. The default file is `.env.local`.
The former `ARC_TESTNET_DEPLOYER_PRIVATE_KEY` is not selected by any mainnet operation. Treasury and arbitrator
default to the selected deployer; explicitly set their address variables to use separate wallets.

The deployment executes exactly three transactions: registry deployment, V4 deployment, and escrow authorization.
Its maximum gas cost is bounded by `ARCTASK_DEPLOY_MAX_COST_USDC` (default 1 USDC). Signed bytes, nonces and hashes
are saved before broadcast in ignored `.mainnet-deploy/journal.json`. A rerun polls the saved hash and does not sign
a replacement. If a broadcast is uncertain or a nonce has changed, reconcile the receipt and wallet before proceeding.
Do not delete the journal to work around an error. Store it durably on the deployment machine.

Successful receipts and runtime code hashes create `deployments/arc-mainnet.json` and a **public-only** env file.
Use the latter for both the web build and worker. Predicted addresses from a plan are not deployed addresses.

```sh
npm run agent:register-managed
# Set the returned NEXT_PUBLIC_ARCTASK_MANAGED_AGENT_ID in both environments.
npm run mainnet:preflight
ARC_AGENT_ONCE=true ARC_AGENT_DRY_RUN=true npm run agent:worker
npm run build
```

Preflight checks every configured RPC chain, registry/escrow/Multicall3 bytecode, recorded runtime hashes,
registry authorization, treasury/arbitrator, managed-agent ownership, and worker gas balance.
The worker validates the read and write RPC networks before processing jobs. Browser writes check configured
contracts and the wallet network. APIs return 503 while mainnet contract configuration is missing or invalid.

The optional `npm run contracts:smoke:arc -- --execute` spends real USDC and requires the signer to own the chosen
agent. Prefer a separate test agent when the deployer and managed worker are different wallets. A build or dry run
does not prove that paid job execution and settlement work.

## Production cutover

- Build a separate release on the existing VPS, retaining the old release and its private env file. Inspect the
  current VPS revision first; it may differ from the local checkout. Do not run the legacy reset-based deploy script
  over uncommitted server work.
- Apply the verified public configuration to Vercel and the VPS before building. Next.js embeds `NEXT_PUBLIC_*`
  variables at build time, so changing the runtime env alone does not migrate the browser bundle.
- Keep API/worker credentials on their existing hosts. Set the remote deliverable URL to the matching mainnet API.
- Run preflight, a dry worker scan, and the production build in the new release, then switch only the ArcTask services.
  Start the mainnet worker with `ARC_AGENT_DRY_RUN=false` after checking its wallet and contract configuration.
- Verify `/api/network/agents`, `/api/network/jobs`, `/api/worker/status`, wallet switching to `0x13b2`, and the
  create → submit → review → settle → withdraw flow with confirmed receipts. Confirm private deliverable access.
- The worker status must include the same `deploymentScope` as the web app. A testnet or different-deployment
  fallback must not count as a healthy worker.

Default state folders are `.agent-worker/<chain-registry-escrow>/state`, `locks`, and `deliverables`. If custom
`ARC_AGENT_*_DIR` paths are used, point them to new mainnet directories. Local browser state and access signatures
also include the deployment scope. Do not import old usage/locks/deliverables by job ID alone.

## Rollback

Retain the old public deployment settings, server release and state. A UI rollback does not reverse an onchain
deployment or move user funds. Once mainnet jobs exist, keep a compatible mainnet interface and worker available
for their completion, claims and refunds. Restore web and worker settings as one matching deployment; never combine
testnet RPCs or old addresses with this mainnet build.

## Verified production launch — 2026-09-16

- Site: https://arctask.xyz (Vercel project `arc-task`). The browser shows Mainnet, the registered agent and the accepted launch-check job.
- Network: Arc Mainnet, chain ID `5042`; primary RPC `https://niorfun.com/api/rpc`, secondary read endpoint `https://rpc.arc-scan.org`.
- Registry: `0xE69E88cb35a831fcA783Ac56405831478FDbAa41`.
- Escrow V4: `0x2B3e0b7a7D96F8199fE31b2867358990430b5181`.
- Managed agent ID: `1`; owner, treasury and arbitrator: `0x7B42ED8165710a86684a54E8B02ec0f61Da8C897`.
- Deployment and authorization receipts, runtime code hashes and registration transaction are recorded in
  [`deployments/arc-mainnet.json`](../deployments/arc-mainnet.json). Both configured RPCs passed the deployment preflight.
- VPS release: `/root/ArcTask-releases/mainnet-20260916T085816Z`, linked as `/root/ArcTask-current`.
  PM2 runs `arctask-mainnet-web` on port 3001 and `arctask-mainnet-worker` in live mode; the process list is saved.
  Old `arctask-web` and `arctask-worker` processes are stopped; `/root/ArcTask` and its testnet state remain intact.
- Vercel uses the confirmed public mainnet environment, a stable deployment nonce secret, and
  `ARCTASK_DELIVERABLE_REMOTE_BASE_URL=http://109.206.243.135:3001`. Existing wallet and AI secrets stayed on their existing hosts.
- Launch-check job `3000000` paid a 0.01 USDC reward. The real AI worker produced the requested four bullets,
  submitted the matching hash, and the client accepted and withdrew all claimable funds. Confirmed transaction
  evidence is in [`deployments/mainnet-launch-check.json`](../deployments/mainnet-launch-check.json).
- Private report access returned 401 without a proof and 200 with the owner's signature, including through the public domain.
- 75 tests, TypeScript checking, ESLint, local and VPS production builds passed; Vercel completed its production build.
- Public RPC gateways intermittently timed out or returned `No answer was obtained`. All launch transactions were
  reconciled using their saved hashes and confirmed receipts; no replacement transactions were signed.

The operator launch check is resumable and stores signed transactions in the ignored `.mainnet-deploy` directory:

```sh
npm run mainnet:launch-check -- create --execute
# Wait for the worker, retrieve its report privately and review it.
npm run mainnet:launch-check -- settle --execute --report=/absolute/path/to/report.json
```

Do not delete the launch journal to repeat a check. Preserve scoped worker state and deliverables across future
releases; the current release directory is also their durable storage location. New releases must retain the same
state/lock/deliverable paths and stop the old worker before starting its replacement. Run preflight and verify
private report access again after each cutover.
