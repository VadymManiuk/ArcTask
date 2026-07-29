const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi;

function normalizeUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
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
  const missingUrls = sourceUrls.filter((url) => !summary.includes(url));
  if (missingUrls.length === 0) {
    return summary;
  }

  return [summary.trim(), "", "Sources:", ...missingUrls.map((url, index) => `${index + 1}. ${url}`)].join("\n");
}

export function assertAgentResultQuality({ taskKind, summary, sourceUrls }) {
  const normalizedSummary = typeof summary === "string" ? summary.trim() : "";
  if (normalizedSummary.length < 240) {
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

  if (taskKind === "market_research" && sourceUrls.length < 3) {
    throw new Error(`Research deliverable has ${sourceUrls.length} verified source URL(s); at least 3 are required.`);
  }

  if (taskKind === "contract_review") {
    if (normalizedSummary.length < 1_200) {
      throw new Error("Contract review is too short to contain a complete invariant analysis.");
    }

    const requiredCodeReferences = [
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
    const normalizedTopics = normalizedLower.replace(/[-–—]/g, " ");
    const requiredTopics = [
      "authorization",
      "state transition",
      "settlement",
      "refund",
      "reentrancy",
      "recommended test",
      "deployment recommendation"
    ];
    const missingTopics = requiredTopics.filter((topic) => !normalizedTopics.includes(topic));
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
}
