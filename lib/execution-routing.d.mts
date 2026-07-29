export type ExecutionTierId = "starter" | "standard" | "pro" | "expert" | "critical";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type BudgetDecision = "sufficient" | "subsidized" | "insufficient";

export interface ComplexityFactor {
  id: string;
  label: string;
  points: number;
}

export interface ComplexityAssessment {
  score: number;
  band: ExecutionTierId;
  label: string;
  factors: ComplexityFactor[];
}

export interface ExecutionTier {
  id: ExecutionTierId;
  label: string;
  minimumReward: number;
  minimumComplexity: number;
  model: "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";
  reasoningEffort: ReasoningEffort;
  reasoningMode: "pro" | null;
  maxRuntimeMs: number;
  requestTimeoutMs: number;
  maxOutputTokens: number;
  maxAttempts: number;
  validationPasses: number;
  webSearchContext: "low" | "medium" | "high";
  minimumSources: number;
}

export interface ExecutionPlan {
  version: 1;
  complexity: ComplexityAssessment;
  rewardAmount: number;
  rewardTier: ExecutionTierId;
  requiredTier: ExecutionTierId;
  selectedTier: ExecutionTierId;
  budgetDecision: BudgetDecision;
  minimumRecommendedReward: number;
  model: ExecutionTier["model"];
  reasoningEffort: ReasoningEffort;
  reasoningMode: "pro" | null;
  maxRuntimeMs: number;
  requestTimeoutMs: number;
  maxOutputTokens: number;
  maxAttempts: number;
  validationPasses: number;
  webSearchContext: "low" | "medium" | "high";
  minimumSources: number;
}

export function listExecutionTiers(): ExecutionTier[];
export function assessJobComplexity(input: { title?: string; description?: string }): ComplexityAssessment;
export function getRewardTier(rewardAmount: number): ExecutionTier;
export function createExecutionPlan(
  input: { title?: string; description?: string; rewardAmount?: number },
  options?: { allowSubsidy?: boolean }
): ExecutionPlan;
export function formatRuntime(maxRuntimeMs: number): string;
