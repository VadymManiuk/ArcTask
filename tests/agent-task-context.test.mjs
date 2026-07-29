import assert from "node:assert/strict";
import test from "node:test";
import { loadTaskArtifacts } from "../scripts/agent-task-context.mjs";

test("contract-review context includes deployed contracts, source, and ABI", () => {
  const artifacts = loadTaskArtifacts({
    taskKind: "contract_review",
    rootDir: process.cwd(),
    escrowAddress: "0x08eb8630f6b5d2c1c030688076b80360531a2e9a",
    registryAddress: "0xd8499627775ac67cd756335a3c48387d0aff5553"
  });

  assert.equal(artifacts.reviewTarget.name, "ArcTaskEscrow");
  assert.match(artifacts.reviewTarget.sourceCode, /function acceptWork/);
  assert.match(artifacts.reviewTarget.sourceCode, /modifier nonReentrant/);
  assert.ok(artifacts.reviewTarget.abi.some((item) => item.name === "refundExpired"));
  assert.equal(artifacts.dependency.name, "ArcTaskAgentRegistry");
  assert.match(artifacts.dependency.sourceCode, /function recordOutcome/);
});

test("product QA context includes live route and source evidence", () => {
  const artifacts = loadTaskArtifacts({
    taskKind: "product_qa",
    payload: {
      title: "Validate mobile marketplace UX",
      description: "Review agents, jobs, dashboard, and docs routes on small screens."
    },
    rootDir: process.cwd(),
    escrowAddress: "0x08eb8630f6b5d2c1c030688076b80360531a2e9a",
    registryAddress: "0xd8499627775ac67cd756335a3c48387d0aff5553"
  });

  assert.equal(artifacts.liveSiteUrl, "https://arctask.xyz");
  assert.ok(artifacts.files.some((file) => file.path === "app/agents/page.tsx"));
  assert.ok(artifacts.files.some((file) => file.path === "app/jobs/page.tsx"));
  assert.match(artifacts.reviewMethod, /Do not claim/);
});

test("documentation context contains verified ArcTask configuration", () => {
  const artifacts = loadTaskArtifacts({
    taskKind: "documentation_task",
    payload: { title: "Write ArcTask integration guide" },
    rootDir: process.cwd(),
    escrowAddress: "0x08eb8630f6b5d2c1c030688076b80360531a2e9a",
    registryAddress: "0xd8499627775ac67cd756335a3c48387d0aff5553"
  });

  assert.equal(
    artifacts.productConfiguration.escrowAddress,
    "0x08eb8630f6b5d2c1c030688076b80360531a2e9a"
  );
  assert.match(artifacts.productDocumentation.content, /ArcTask/);
});
