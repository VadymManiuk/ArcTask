export type ExecutionTierId = "starter" | "standard" | "pro" | "expert" | "critical";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type BudgetDecision = "sufficient" | "subsidized" | "insufficient";
export type ExecutionModel =
  | "gpt-5.4-nano"
  | "gpt-5.4-mini"
  | "gpt-5.6-luna"
  | "gpt-5.6-terra"
  | "gpt-5.6-sol";

export interface AiRoutingAssessment {
  score: number;
  risk: "low" | "medium" | "high" | "critical";
  recommendedTier?: ExecutionTierId;
  reasoningEffort: ReasoningEffort;
  estimatedOutputTokens: number;
  maxRequests: number;
  needsWebSearch: boolean;
  needsCodeAnalysis: boolean;
  confidence: number;
  reason: string;
}

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
  model: ExecutionModel;
  reasoningEffort: ReasoningEffort;
  reasoningMode: "pro" | null;
  maxRuntimeMs: number;
  requestTimeoutMs: number;
  minimumOutputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
  maxRequests: number;
  maxAttempts: number;
  validationPasses: number;
  webSearchContext: "low" | "medium" | "high";
  minimumSources: number;
  computeBudgetShare: number;
}

export interface ExecutionPlan {
  version: 6;
  complexity: ComplexityAssessment;
  routingSource: "ai" | "deterministic";
  aiAssessment: AiRoutingAssessment | null;
  rewardAmount: number;
  rewardTier: ExecutionTierId;
  requiredTier: ExecutionTierId;
  selectedTier: ExecutionTierId;
  budgetDecision: BudgetDecision;
  minimumRecommendedReward: number;
  computeBudgetUsd: number;
  computeBudgetShare: number;
  estimatedMaximumCostUsd: number;
  model: ExecutionTier["model"];
  reasoningEffort: ReasoningEffort;
  reasoningMode: "pro" | null;
  maxRuntimeMs: number;
  requestTimeoutMs: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
  maxRequests: number;
  maxAttempts: number;
  validationPasses: number;
  escalationModel: ExecutionModel | null;
  serviceTier: "default" | "flex";
  webSearchContext: "low" | "medium" | "high";
  minimumSources: number;
}

export function listExecutionTiers(): ExecutionTier[];
export function assessJobComplexity(input: { title?: string; description?: string }): ComplexityAssessment;
export function getRewardTier(rewardAmount: number): ExecutionTier;
export function normalizeAiRoutingAssessment(value: unknown): AiRoutingAssessment;
export function createExecutionPlan(
  input: { title?: string; description?: string; rewardAmount?: number },
  options?: {
    allowSubsidy?: boolean;
    minimumTier?: ExecutionTierId;
    aiAssessment?: Partial<AiRoutingAssessment>;
  }
): ExecutionPlan;
export function formatRuntime(maxRuntimeMs: number): string;
