import fs from "node:fs";
import path from "node:path";

function readText(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(rootDir, relativePath) {
  return JSON.parse(readText(rootDir, relativePath));
}

function readTextArtifact(rootDir, relativePath, maximumChars = 24_000) {
  const content = readText(rootDir, relativePath);
  return {
    path: relativePath,
    content: content.slice(0, maximumChars),
    truncated: content.length > maximumChars
  };
}

function createArtifactReader(rootDir, maximumArtifactChars) {
  let remainingChars = Number.isFinite(maximumArtifactChars)
    ? Math.max(0, Math.floor(maximumArtifactChars))
    : Number.POSITIVE_INFINITY;

  return (relativePath, maximumChars = 24_000) => {
    const allowedChars = Math.min(maximumChars, remainingChars);
    const artifact = readTextArtifact(rootDir, relativePath, allowedChars);
    remainingChars -= artifact.content.length;
    return artifact;
  };
}

function getPayloadText(payload) {
  return `${payload?.title ?? ""}\n${payload?.description ?? ""}`.toLowerCase();
}

function usesVersionedEscrow(escrowVersion) {
  return escrowVersion === "v2" || escrowVersion === "v3" || escrowVersion === "v4";
}

function getEscrowReviewTarget({ rootDir, escrowAddress, escrowVersion }) {
  const isVersionedEscrow = usesVersionedEscrow(escrowVersion);
  const sourcePath = isVersionedEscrow
    ? "contracts/ArcTaskEscrowV2.sol"
    : "contracts/ArcTaskEscrow.sol";
  const abiPath = isVersionedEscrow
    ? "lib/contracts/abis/ERC8183EscrowV2.json"
    : "lib/contracts/abis/ERC8183Escrow.json";

  return {
    name: isVersionedEscrow
      ? `ArcTaskEscrowV2 (${escrowVersion.toUpperCase()} deployment)`
      : "ArcTaskEscrow",
    deployedAddress: escrowAddress,
    deploymentVersion: escrowVersion ?? "legacy",
    sourcePath,
    sourceCode: readText(rootDir, sourcePath),
    abi: readJson(rootDir, abiPath)
  };
}

export function loadTaskArtifacts({
  taskKind,
  payload,
  rootDir,
  escrowAddress,
  registryAddress,
  escrowVersion,
  maximumArtifactChars
}) {
  const readArtifact = createArtifactReader(rootDir, maximumArtifactChars);

  if (taskKind === "contract_review" || taskKind === "governance_compliance") {
    return {
      reviewTarget: getEscrowReviewTarget({
        rootDir,
        escrowAddress,
        escrowVersion
      }),
      dependency: {
        name: "ArcTaskAgentRegistry",
        deployedAddress: registryAddress,
        sourcePath: "contracts/ArcTaskAgentRegistry.sol",
        sourceCode: readText(rootDir, "contracts/ArcTaskAgentRegistry.sol"),
        abi: readJson(rootDir, "lib/contracts/abis/ERC8004AgentRegistry.json")
      },
      verificationNote:
        "These are the repository sources and generated ABIs used by the deployed ArcTask testnet configuration. Review concrete code paths and clearly distinguish source-confirmed findings from deployment assumptions."
    };
  }

  if (taskKind === "product_qa" || taskKind === "product_review") {
    const text = getPayloadText(payload);
    const routeFiles = [
      ...(text.includes("agent") ? ["app/agents/page.tsx"] : []),
      ...(text.includes("job") ? ["app/jobs/page.tsx", "app/jobs/[id]/page.tsx"] : []),
      ...(text.includes("dashboard") ? ["app/dashboard/page.tsx"] : []),
      ...(text.includes("doc") ? ["app/docs/page.tsx"] : [])
    ];
    const files = [
      "app/globals.css",
      ...new Set(routeFiles.length > 0 ? routeFiles : ["app/jobs/[id]/page.tsx"]),
      ...(/\b(settlement|onchain|transaction|lifecycle|creation)\b/i.test(text)
        ? [
            "lib/onchain.ts",
            usesVersionedEscrow(escrowVersion)
              ? "contracts/ArcTaskEscrowV2.sol"
              : "contracts/ArcTaskEscrow.sol",
            "contracts/ArcTaskAgentRegistry.sol"
          ]
        : [])
    ];
    const maximumCharsPerFile = Number.isFinite(maximumArtifactChars)
      ? Math.max(2_000, Math.floor(maximumArtifactChars / files.length))
      : 24_000;

    return {
      liveSiteUrl: "https://arctask.xyz",
      reviewMethod:
        "Use the supplied route source as concrete static evidence. Do not claim that browser or viewport execution occurred unless the task evidence explicitly contains screenshots or runtime observations.",
      files: files.map((file) => readArtifact(file, maximumCharsPerFile))
    };
  }

  if (taskKind === "documentation_task") {
    return {
      productConfiguration: {
        escrowAddress,
        registryAddress,
        networkSource: readArtifact("lib/arc.ts", 4_000)
      },
      productDocumentation: readArtifact("README.md", 28_000),
      verificationNote:
        "Use these repository facts for ready-to-use ArcTask documentation. Do not invent routes, contract addresses, lifecycle transitions, or wallet behavior."
    };
  }

  if (taskKind === "devops_reliability") {
    return {
      architecture: [
        readArtifact("scripts/deploy-worker-vps.sh", 8_000),
        readArtifact("scripts/arc-rpc.mjs", 8_000),
        readArtifact("app/api/network/jobs/route.ts", 14_000),
        readArtifact("app/api/worker/status/route.ts", 14_000)
      ],
      verificationNote:
        "Base the outage, retry, degraded-mode, and recovery plan on these deployed ArcTask code paths. Separate implemented controls from recommendations."
    };
  }

  if (taskKind === "protocol_integration") {
    return {
      arcConfiguration: readArtifact("lib/arc.ts", 8_000),
      escrowBoundary: readArtifact(
        usesVersionedEscrow(escrowVersion)
          ? "contracts/ArcTaskEscrowV2.sol"
          : "contracts/ArcTaskEscrow.sol",
        14_000
      ),
      verificationNote:
        "Use current primary-source documentation for external protocols and these repository artifacts for ArcTask integration boundaries."
    };
  }

  return undefined;
}
