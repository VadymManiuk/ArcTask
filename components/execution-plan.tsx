import { createExecutionPlan, formatRuntime, type ExecutionPlan as ExecutionPlanData } from "@/lib/execution-routing.mjs";

export function getJobExecutionPlan(input: {
  title: string;
  description: string;
  rewardAmount: number;
}) {
  return createExecutionPlan(input);
}

export function ExecutionPlan({
  plan,
  compact = false
}: {
  plan: ExecutionPlanData;
  compact?: boolean;
}) {
  const isUnderfunded = plan.budgetDecision === "insufficient";

  return (
    <div
      className={`rounded-xl border p-4 ${
        isUnderfunded
          ? "border-amber-300/20 bg-amber-300/[0.055]"
          : "border-[#1a2736] bg-[#070c13]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {plan.routingSource === "ai" ? "AI execution plan" : "Execution estimate"}
          </p>
          <p className="mt-1 font-semibold text-slate-100">
            {plan.complexity.label} · {plan.complexity.score}/100
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            isUnderfunded ? "bg-amber-300/10 text-amber-200" : "bg-cyan-300/10 text-cyan-200"
          }`}
        >
          {isUnderfunded ? "Underfunded" : plan.selectedTier}
        </span>
      </div>

      {isUnderfunded ? (
        <p className="mt-3 text-sm leading-6 text-amber-100/80">
          This task needs at least {plan.minimumRecommendedReward} USDC for the {plan.requiredTier} tier. The worker
          will keep it funded instead of submitting a low-quality result.
        </p>
      ) : null}

      <dl className={`mt-4 grid gap-x-4 gap-y-3 text-sm ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        <PlanValue label="Model" value={plan.model.replace("gpt-", "GPT ")} />
        <PlanValue label="Reasoning" value={plan.reasoningMode === "pro" ? `${plan.reasoningEffort} / pro` : plan.reasoningEffort} />
        <PlanValue label="Maximum time" value={formatRuntime(plan.maxRuntimeMs)} />
        <PlanValue label="Output budget" value={`${plan.maxOutputTokens.toLocaleString()} tokens`} />
        <PlanValue label="Total token ceiling" value={`${plan.maxTotalTokens.toLocaleString()} tokens`} />
        <PlanValue label="Compute budget" value={`$${plan.computeBudgetUsd.toFixed(4)}`} />
        <PlanValue label="Processing" value={plan.serviceTier} />
        <PlanValue label="Attempts" value={String(plan.maxAttempts)} />
        <PlanValue label="Escalation" value={plan.escalationModel?.replace("gpt-", "GPT ") ?? "none"} />
      </dl>

      {!compact && plan.complexity.factors.length > 0 ? (
        <p className="mt-4 border-t border-white/[0.06] pt-3 text-xs leading-5 text-slate-500">
          Complexity signals: {plan.complexity.factors.map((factor) => factor.label).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

function PlanValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="mt-0.5 font-medium capitalize text-slate-300">{value}</dd>
    </div>
  );
}
