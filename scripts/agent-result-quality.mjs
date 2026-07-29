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
}
