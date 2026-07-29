import fs from "node:fs";
import path from "node:path";

function readText(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(rootDir, relativePath) {
  return JSON.parse(readText(rootDir, relativePath));
}

export function loadTaskArtifacts({ taskKind, rootDir, escrowAddress, registryAddress }) {
  if (taskKind !== "contract_review") {
    return undefined;
  }

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
