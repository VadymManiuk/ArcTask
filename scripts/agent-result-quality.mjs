const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;
export const completionMarker = "ARCTASK_DELIVERABLE_COMPLETE";

function normalizeUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    if (value.includes("`") || decodeURIComponent(url.pathname).includes("`")) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function collectOpenAiSourceUrls(body, outputText = "") {
  const urls = new Set((outputText.match(urlPattern) ?? []).map(normalizeUrl).filter(Boolean));

  for (const item of body?.output ?? []) {
    for (const content of item?.content ?? []) {
      for (const annotation of content?.annotations ?? []) {
        const candidate = annotation?.url ?? annotation?.url_citation?.url;
        const normalized = normalizeUrl(candidate);
        if (normalized) {
          urls.add(normalized);
        }
      }
    }
  }

  return [...urls];
}

export function appendSourceUrls(summary, sourceUrls) {
  const trimmedSummary = summary.trim();
  const hasCompletionMarker = trimmedSummary.endsWith(completionMarker);
  const summaryWithoutMarker = hasCompletionMarker
    ? trimmedSummary.slice(0, -completionMarker.length).trim()
    : trimmedSummary;
  const missingUrls = sourceUrls.filter((url) => !summaryWithoutMarker.includes(url));
  if (missingUrls.length === 0) {
    return trimmedSummary;
  }

  return [
    summaryWithoutMarker,
    "",
    "Sources:",
    ...missingUrls.map((url, index) => `${index + 1}. ${url}`),
    ...(hasCompletionMarker ? ["", completionMarker] : [])
  ].join("\n");
}

export function stripCompletionMarker(summary) {
  return typeof summary === "string"
    ? summary.replace(new RegExp(`\\s*${completionMarker}\\s*$`), "").trim()
    : "";
}

export function assertAgentResultQuality({
  taskKind,
  summary,
  sourceUrls,
  minimumSources = 3,
  evidence,
  minimumLength = 240,
  requiredTopics = [],
  requiredEvidenceValues = [],
  contractCodeReferences = [],
  requireCompletionMarker = false,
  requireSources = false
}) {
  const rawSummary = typeof summary === "string" ? summary.trim() : "";
  if (requireCompletionMarker && !rawSummary.endsWith(completionMarker)) {
    throw new Error("Generated deliverable is incomplete or truncated.");
  }

  const normalizedSummary = stripCompletionMarker(rawSummary);
  if (normalizedSummary.length < minimumLength) {
    throw new Error("Generated deliverable is too short to submit.");
  }

  const placeholderSignals = [
    "no external evidence, links, files",
    "web search is disabled",
    "request more information if the evaluator needs proof",
    "review the submitted deliverable hash"
  ];
  if (placeholderSignals.some((signal) => normalizedSummary.toLowerCase().includes(signal))) {
    throw new Error("Generated deliverable contains placeholder language.");
  }

  if ((normalizedSummary.match(/```/g) ?? []).length % 2 !== 0) {
    throw new Error("Generated deliverable contains an unfinished code block.");
  }

  const normalizedTopics = normalizedSummary.toLowerCase().replace(/[-–—_]/g, " ");
  const topicAliases = {
    "data source": ["data source", "source field", "marketplace snapshot", "evidence source"],
    limitation: ["limitation", "limited", "unavailable history", "data gap", "constraint"],
    "settlement risk": [
      "settlement risk",
      "settlement exposure",
      "payment execution risk",
      "transfer risk"
    ]
  };
  const missingRequiredTopics = requiredTopics.filter((topic) => {
    const normalizedTopic = String(topic).toLowerCase().replace(/[-–—_]/g, " ");
    const acceptedSignals = topicAliases[normalizedTopic] ?? [normalizedTopic];
    return !acceptedSignals.some((signal) => normalizedTopics.includes(signal));
  });
  if (missingRequiredTopics.length > 0) {
    throw new Error(`Deliverable is missing required topics: ${missingRequiredTopics.join(", ")}.`);
  }
  const missingRequiredEvidence = requiredEvidenceValues
    .filter((value) => value !== undefined && value !== null && String(value).length > 0)
    .filter((value) => !normalizedSummary.toLowerCase().includes(String(value).toLowerCase()));
  if (missingRequiredEvidence.length > 0) {
    throw new Error(`Deliverable omitted required evidence: ${missingRequiredEvidence.join(", ")}.`);
  }

  if ((taskKind === "market_research" || requireSources) && sourceUrls.length < minimumSources) {
    throw new Error(
      `Research deliverable has ${sourceUrls.length} verified source URL(s); at least ${minimumSources} are required.`
    );
  }

  if (taskKind === "contract_review") {
    if (normalizedSummary.length < 1_200) {
      throw new Error("Contract review is too short to contain a complete invariant analysis.");
    }

    const requiredCodeReferences =
      contractCodeReferences.length > 0
        ? contractCodeReferences
        : [
            "createJob",
            "submitDeliverable",
            "acceptWork",
            "rejectWork",
            "refundExpired",
            "_sendNativeUsdc",
            "nonReentrant"
          ];
    const missingCodeReferences = requiredCodeReferences.filter((name) => !normalizedSummary.includes(name));
    if (missingCodeReferences.length > 0) {
      throw new Error(`Contract review is missing code references: ${missingCodeReferences.join(", ")}.`);
    }

    const normalizedLower = normalizedSummary.toLowerCase();
    const normalizedContractTopics = normalizedLower.replace(/[-–—]/g, " ");
    const requiredTopics = [
      "authorization",
      "state transition",
      "settlement",
      "refund",
      "reentrancy",
      "recommended test",
      "deployment recommendation"
    ];
    const missingTopics = requiredTopics.filter((topic) => !normalizedContractTopics.includes(topic));
    if (missingTopics.length > 0) {
      throw new Error(`Contract review is missing required topics: ${missingTopics.join(", ")}.`);
    }

    const missingSourceSignals = [
      "no escrow contract address or source code was supplied",
      "cannot confirm whether the actual escrow contract",
      "review is limited to the supplied job payload"
    ];
    if (missingSourceSignals.some((signal) => normalizedLower.includes(signal))) {
      throw new Error("Contract review incorrectly claims that repository source artifacts are unavailable.");
    }

    if (/[:;,]\s*$/.test(normalizedSummary)) {
      throw new Error("Contract review appears to end with an unfinished section or sentence.");
    }
  }

  if (taskKind === "wallet_or_counterparty_risk" && evidence?.available) {
    if (normalizedSummary.length < 900) {
      throw new Error("Wallet risk assessment is too short to contain evidence-backed findings.");
    }

    const normalizedLower = normalizedSummary.toLowerCase();
    const requiredEvidenceValues = [
      evidence.subjectWallet,
      String(evidence.network?.chainId),
      String(evidence.rpcSnapshot?.referenceBlock),
      String(evidence.rpcSnapshot?.sentTransactionCount),
      evidence.rpcSnapshot?.accountType
    ].filter(Boolean);
    const missingEvidenceValues = requiredEvidenceValues.filter(
      (value) => !normalizedLower.includes(String(value).toLowerCase())
    );
    if (missingEvidenceValues.length > 0) {
      throw new Error(`Wallet assessment omitted verified evidence: ${missingEvidenceValues.join(", ")}.`);
    }

    const requiredTopics = ["verified", "transaction", "ownership", "severity", "limitation", "recommendation"];
    const missingTopics = requiredTopics.filter((topic) => !normalizedLower.includes(topic));
    if (missingTopics.length > 0) {
      throw new Error(`Wallet assessment is missing required topics: ${missingTopics.join(", ")}.`);
    }

    const sampledHashes =
      evidence.explorerEvidence?.transactionSample?.transactions
        ?.slice(0, 5)
        .map((transaction) => transaction.hash)
        .filter(Boolean) ?? [];
    if (sampledHashes.length > 0 && !sampledHashes.some((hash) => normalizedLower.includes(hash.toLowerCase()))) {
      throw new Error("Wallet assessment does not reference any sampled transaction hash.");
    }

    const contradictedEvidenceSignals = [
      "the intended blockchain is not identified",
      "no chain id",
      "no chain-specific code query",
      "account type and custody controls are unknown",
      "transaction and counterparty risk is unassessed",
      "reward amount and asset encoding are unresolved"
    ];
    if (contradictedEvidenceSignals.some((signal) => normalizedLower.includes(signal))) {
      throw new Error("Wallet assessment contradicts the supplied Arc RPC evidence.");
    }
  }
}
