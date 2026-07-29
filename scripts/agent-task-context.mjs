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

function getPayloadText(payload) {
  return `${payload?.title ?? ""}\n${payload?.description ?? ""}`.toLowerCase();
}

export function loadTaskArtifacts({
  taskKind,
  payload,
  rootDir,
  escrowAddress,
  registryAddress
}) {
  if (taskKind === "contract_review" || taskKind === "governance_compliance") {
    return {
      reviewTarget: {
        name: "ArcTaskEscrow",
        deployedAddress: escrowAddress,
        sourcePath: "contracts/ArcTaskEscrow.sol",
        sourceCode: readText(rootDir, "contracts/ArcTaskEscrow.sol"),
        abi: readJson(rootDir, "lib/contracts/abis/ERC8183Escrow.json")
      },
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
        ? ["lib/onchain.ts", "contracts/ArcTaskEscrow.sol", "contracts/ArcTaskAgentRegistry.sol"]
        : [])
    ];

    return {
      liveSiteUrl: "https://arctask.xyz",
      reviewMethod:
        "Use the supplied route source as concrete static evidence. Do not claim that browser or viewport execution occurred unless the task evidence explicitly contains screenshots or runtime observations.",
      files: files.map((file) => readTextArtifact(rootDir, file))
    };
  }

  if (taskKind === "documentation_task") {
    return {
      productConfiguration: {
        escrowAddress,
        registryAddress,
        networkSource: readTextArtifact(rootDir, "lib/arc.ts", 8_000)
      },
      productDocumentation: readTextArtifact(rootDir, "README.md", 28_000),
      verificationNote:
        "Use these repository facts for ready-to-use ArcTask documentation. Do not invent routes, contract addresses, lifecycle transitions, or wallet behavior."
    };
  }

  if (taskKind === "devops_reliability") {
    return {
      architecture: [
        readTextArtifact(rootDir, "scripts/deploy-worker-vps.sh", 8_000),
        readTextArtifact(rootDir, "scripts/arc-rpc.mjs", 8_000),
        readTextArtifact(rootDir, "app/api/network/jobs/route.ts", 14_000),
        readTextArtifact(rootDir, "app/api/worker/status/route.ts", 14_000)
      ],
      verificationNote:
        "Base the outage, retry, degraded-mode, and recovery plan on these deployed ArcTask code paths. Separate implemented controls from recommendations."
    };
  }

  if (taskKind === "protocol_integration") {
    return {
      arcConfiguration: readTextArtifact(rootDir, "lib/arc.ts", 8_000),
      escrowBoundary: readTextArtifact(rootDir, "contracts/ArcTaskEscrow.sol", 14_000),
      verificationNote:
        "Use current primary-source documentation for external protocols and these repository artifacts for ArcTask integration boundaries."
    };
  }

  return undefined;
}
