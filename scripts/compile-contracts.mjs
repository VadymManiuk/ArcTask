import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import solc from "solc";

const rootDir = process.cwd();
function readContractSource(fileName) {
  const filePath = path.join(rootDir, "contracts", fileName);
  return fs.readFileSync(filePath, "utf8");
}

export function compileContracts() {
  const input = {
    language: "Solidity",
    sources: {
      "ArcTaskAgentRegistry.sol": {
        content: readContractSource("ArcTaskAgentRegistry.sol")
      },
      "ArcTaskEscrow.sol": {
        content: readContractSource("ArcTaskEscrow.sol")
      },
      "ArcTaskEscrowV2.sol": {
        content: readContractSource("ArcTaskEscrowV2.sol")
      }
    },
    settings: {
      evmVersion: "paris",
      optimizer: {
        enabled: true,
        runs: 200
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = output.errors ?? [];
  const fatalErrors = errors.filter((error) => error.severity === "error");

  for (const error of errors) {
    const log = error.severity === "error" ? console.error : console.warn;
    log(error.formattedMessage);
  }

  if (fatalErrors.length > 0) {
    throw new Error("Solidity compilation failed.");
  }

  return {
    registry: output.contracts["ArcTaskAgentRegistry.sol"].ArcTaskAgentRegistry,
    escrow: output.contracts["ArcTaskEscrow.sol"].ArcTaskEscrow,
    escrowV2: output.contracts["ArcTaskEscrowV2.sol"].ArcTaskEscrowV2
  };
}

export function writeContractAbis(compiled) {
  const abiDir = path.join(rootDir, "lib", "contracts", "abis");
  fs.mkdirSync(abiDir, { recursive: true });
  fs.writeFileSync(path.join(abiDir, "ERC8004AgentRegistry.json"), `${JSON.stringify(compiled.registry.abi, null, 2)}\n`);
  fs.writeFileSync(path.join(abiDir, "ERC8183Escrow.json"), `${JSON.stringify(compiled.escrow.abi, null, 2)}\n`);
  fs.writeFileSync(path.join(abiDir, "ERC8183EscrowV2.json"), `${JSON.stringify(compiled.escrowV2.abi, null, 2)}\n`);
}

