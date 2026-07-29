import assert from "node:assert/strict";
import test from "node:test";
import { collectWalletRiskEvidence, extractSubjectWallet } from "../scripts/agent-wallet-evidence.mjs";

const subjectWallet = "0x7B42ED8165710a86684a54E8B02ec0f61Da8C897";

test("wallet evidence extracts the task subject before collecting verified chain facts", async () => {
  assert.equal(
    extractSubjectWallet({
      title: "Assess vendor wallet",
      description: `Assess ${subjectWallet} for onboarding.`
    }),
    subjectWallet
  );

  const publicClient = {
    chain: {
      name: "Arc Testnet",
      nativeCurrency: { name: "testnet USDC", symbol: "USDC", decimals: 18 }
    },
    getChainId: async () => 5_042_002,
    getBlockNumber: async () => 54_242_998n,
    getBalance: async () => 70_832_663_972_052_887_367n,
    getTransactionCount: async () => 128,
    getCode: async () => undefined
  };
  const responses = [
    {
      is_contract: false,
      is_scam: false,
      reputation: "ok",
      has_token_transfers: true,
      has_tokens: true,
      block_number_balance_updated_at: 54_242_347
    },
    {
      items: [
        {
          hash: `0x${"a".repeat(64)}`,
          block_number: 54_242_347,
          timestamp: "2026-07-29T10:41:19.000000Z",
          from: { hash: subjectWallet, is_contract: false, is_scam: false, reputation: "ok" },
          to: {
            hash: "0x08eB8630f6B5D2c1c030688076b80360531a2e9a",
            is_contract: true,
            is_scam: false,
            reputation: "ok"
          },
          method: "submitDeliverable",
          status: "ok",
          value: "0",
          fee: { value: "1516434200000000" },
          transaction_types: ["contract_call"]
        }
      ],
      next_page_params: { block_number: 54_242_347 }
    }
  ];

  const evidence = await collectWalletRiskEvidence({
    payload: { description: `Assess vendor wallet ${subjectWallet}.` },
    publicClient,
    rpcUrl: "https://rpc.testnet.arc.network",
    explorerUrl: "https://testnet.arcscan.app/",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift()
    })
  });

  assert.equal(evidence.available, true);
  assert.equal(evidence.network.chainId, 5_042_002);
  assert.equal(evidence.rpcSnapshot.accountType, "eoa");
  assert.equal(evidence.rpcSnapshot.sentTransactionCount, 128);
  assert.equal(evidence.rpcSnapshot.balanceDisplay, "70.832663972052887367 USDC");
  assert.equal(evidence.explorerEvidence.transactionSample.sampleSize, 1);
  assert.equal(evidence.explorerEvidence.transactionSample.transactions[0].method, "submitDeliverable");
  assert.equal(evidence.explorerEvidence.transactionSample.transactions[0].counterpartyType, "contract");
});

test("wallet evidence keeps RPC facts when the explorer is temporarily unavailable", async () => {
  const publicClient = {
    chain: {
      name: "Arc Testnet",
      nativeCurrency: { name: "testnet USDC", symbol: "USDC", decimals: 18 }
    },
    getChainId: async () => 5_042_002,
    getBlockNumber: async () => 100n,
    getBalance: async () => 1n,
    getTransactionCount: async () => 1,
    getCode: async () => "0x1234"
  };
  const evidence = await collectWalletRiskEvidence({
    payload: { wallet: subjectWallet },
    publicClient,
    rpcUrl: "https://rpc.testnet.arc.network",
    explorerUrl: "https://testnet.arcscan.app",
    fetchImpl: async () => {
      throw new Error("network unavailable");
    }
  });

  assert.equal(evidence.available, true);
  assert.equal(evidence.rpcSnapshot.accountType, "contract");
  assert.equal(evidence.explorerEvidence.available, false);
  assert.match(evidence.explorerEvidence.error, /network unavailable/);
});
