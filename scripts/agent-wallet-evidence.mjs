import { formatUnits } from "viem";
import { withRpcRetry } from "./arc-rpc.mjs";

const walletPattern = /0x[a-fA-F0-9]{40}/;

function normalizeAddress(value) {
  return typeof value === "string" && walletPattern.test(value) ? value.match(walletPattern)?.[0] : undefined;
}

function sameAddress(left, right) {
  return typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
}

function getAddressHash(value) {
  return typeof value?.hash === "string" ? value.hash : null;
}

function summarizeTransaction(item, subjectWallet) {
  const from = getAddressHash(item?.from);
  const to = getAddressHash(item?.to);
  const direction = sameAddress(from, subjectWallet) ? "outgoing" : sameAddress(to, subjectWallet) ? "incoming" : "related";
  const counterparty = direction === "outgoing" ? to : direction === "incoming" ? from : null;
  const counterpartyRecord = direction === "outgoing" ? item?.to : direction === "incoming" ? item?.from : null;

  return {
    hash: typeof item?.hash === "string" ? item.hash : null,
    blockNumber: Number.isFinite(Number(item?.block_number)) ? Number(item.block_number) : null,
    timestamp: typeof item?.timestamp === "string" ? item.timestamp : null,
    direction,
    from,
    to,
    counterparty,
    counterpartyType:
      typeof counterpartyRecord?.is_contract === "boolean"
        ? counterpartyRecord.is_contract
          ? "contract"
          : "eoa"
        : "unknown",
    counterpartyExplorerLabel: {
      isScam: counterpartyRecord?.is_scam === true,
      reputation: typeof counterpartyRecord?.reputation === "string" ? counterpartyRecord.reputation : null,
      name: typeof counterpartyRecord?.name === "string" ? counterpartyRecord.name : null
    },
    method: typeof item?.method === "string" ? item.method : null,
    status: typeof item?.status === "string" ? item.status : typeof item?.result === "string" ? item.result : null,
    valueRaw: typeof item?.value === "string" ? item.value : null,
    feeRaw: typeof item?.fee?.value === "string" ? item.fee.value : null,
    transactionTypes: Array.isArray(item?.transaction_types)
      ? item.transaction_types.filter((value) => typeof value === "string")
      : []
  };
}

function summarizeTransactionSample(items, nextPageParams, subjectWallet) {
  const transactions = items.slice(0, 20).map((item) => summarizeTransaction(item, subjectWallet));
  const counterparties = new Set(transactions.map((item) => item.counterparty?.toLowerCase()).filter(Boolean));
  const methods = new Set(transactions.map((item) => item.method).filter(Boolean));

  return {
    sampleSize: transactions.length,
    newestFirst: true,
    outgoingCount: transactions.filter((item) => item.direction === "outgoing").length,
    incomingCount: transactions.filter((item) => item.direction === "incoming").length,
    successfulCount: transactions.filter((item) => ["ok", "success"].includes(item.status)).length,
    failedCount: transactions.filter((item) => item.status && !["ok", "success"].includes(item.status)).length,
    uniqueCounterparties: counterparties.size,
    methods: [...methods],
    latestActivityAt: transactions[0]?.timestamp ?? null,
    oldestSampleActivityAt: transactions.at(-1)?.timestamp ?? null,
    nextPageAvailable: Boolean(nextPageParams),
    transactions
  };
}

async function fetchJson(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ArcTask-Agent-Worker/1.0"
      }
    });
    if (!response.ok) {
      throw new Error(`Explorer request failed with HTTP ${response.status}.`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function extractSubjectWallet(payload) {
  const explicitCandidates = [
    payload?.vendorWallet,
    payload?.wallet,
    payload?.walletAddress,
    payload?.subjectWallet,
    payload?.address
  ];
  for (const candidate of explicitCandidates) {
    const address = normalizeAddress(candidate);
    if (address) {
      return address;
    }
  }

  return normalizeAddress(payload?.description) ?? normalizeAddress(payload?.title);
}

export async function collectWalletRiskEvidence({
  payload,
  publicClient,
  rpcUrl,
  explorerUrl,
  fetchImpl = fetch,
  explorerTimeoutMs = 15_000
}) {
  const subjectWallet = extractSubjectWallet(payload);
  if (!subjectWallet) {
    return {
      kind: "wallet_risk",
      available: false,
      error: "No subject wallet address was found in the task payload."
    };
  }

  const observedAt = new Date().toISOString();
  const chainId = await withRpcRetry(() => publicClient.getChainId());
  const blockNumber = await withRpcRetry(() => publicClient.getBlockNumber());
  const balance = await withRpcRetry(() => publicClient.getBalance({ address: subjectWallet }));
  const sentTransactionCount = await withRpcRetry(() =>
    publicClient.getTransactionCount({ address: subjectWallet })
  );
  const bytecode = await withRpcRetry(() => publicClient.getCode({ address: subjectWallet }));
  const accountType = !bytecode || bytecode === "0x" ? "eoa" : "contract";
  const normalizedExplorerUrl = explorerUrl.replace(/\/+$/, "");
  const addressUrl = `${normalizedExplorerUrl}/address/${subjectWallet}`;
  const addressApiUrl = `${normalizedExplorerUrl}/api/v2/addresses/${subjectWallet}`;
  const transactionsApiUrl = `${addressApiUrl}/transactions`;
  let explorerEvidence;

  try {
    const [addressSummary, transactionResponse] = await Promise.all([
      fetchJson(addressApiUrl, { fetchImpl, timeoutMs: explorerTimeoutMs }),
      fetchJson(transactionsApiUrl, { fetchImpl, timeoutMs: explorerTimeoutMs })
    ]);
    const transactionItems = Array.isArray(transactionResponse?.items) ? transactionResponse.items : [];

    explorerEvidence = {
      available: true,
      source: "Arcscan Blockscout REST API",
      addressUrl,
      addressApiUrl,
      transactionsApiUrl,
      addressSummary: {
        isContract: addressSummary?.is_contract === true,
        isScamLabel: addressSummary?.is_scam === true,
        reputation: typeof addressSummary?.reputation === "string" ? addressSummary.reputation : null,
        hasTokenTransfers: addressSummary?.has_token_transfers === true,
        hasTokens: addressSummary?.has_tokens === true,
        balanceUpdatedAtBlock: Number.isFinite(Number(addressSummary?.block_number_balance_updated_at))
          ? Number(addressSummary.block_number_balance_updated_at)
          : null
      },
      transactionSample: summarizeTransactionSample(
        transactionItems,
        transactionResponse?.next_page_params,
        subjectWallet
      )
    };
  } catch (caught) {
    explorerEvidence = {
      available: false,
      addressUrl,
      error: caught instanceof Error ? caught.message : "Explorer evidence could not be loaded."
    };
  }

  return {
    kind: "wallet_risk",
    available: true,
    subjectWallet,
    observedAt,
    network: {
      name: publicClient.chain?.name ?? "Arc Testnet",
      chainId,
      rpcUrl,
      explorerUrl: normalizedExplorerUrl,
      nativeCurrency: {
        name: publicClient.chain?.nativeCurrency?.name ?? "testnet USDC",
        symbol: publicClient.chain?.nativeCurrency?.symbol ?? "USDC",
        decimals: publicClient.chain?.nativeCurrency?.decimals ?? 18
      }
    },
    rpcSnapshot: {
      referenceBlock: blockNumber.toString(),
      balanceRaw: balance.toString(),
      balanceDisplay: `${formatUnits(balance, publicClient.chain?.nativeCurrency?.decimals ?? 18)} ${
        publicClient.chain?.nativeCurrency?.symbol ?? "USDC"
      }`,
      sentTransactionCount,
      bytecode,
      accountType
    },
    explorerEvidence,
    limitations: [
      "A successful RPC query proves chain state at the reference block, not legal ownership or current key control.",
      "Arcscan labels and reputation are explorer metadata, not a sanctions, AML, or beneficial-ownership clearance.",
      "The transaction list is a recent sample when pagination is available, not necessarily full lifetime history.",
      "A false isScam label means no Arcscan scam label was observed; it does not prove the wallet is safe."
    ]
  };
}
