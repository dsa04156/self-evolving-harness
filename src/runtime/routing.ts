import { sha256 } from "../core/canonical.js";
import { assertCondition } from "../core/errors.js";

export type RoutingTaskClass =
  | "analysis"
  | "code_change"
  | "test"
  | "documentation"
  | "recovery"
  | "unknown";
export type RoutingRiskClass = "low" | "medium" | "high";

export interface RouteTarget {
  readonly kind: "primary" | "subagent";
  readonly routeId: string;
}

export interface DeclarativeRoutingPolicy {
  readonly schemaVersion: 1;
  readonly language: "seh.routing-policy.v1";
  readonly rules: readonly {
    readonly ruleId: string;
    readonly priority: number;
    readonly match: {
      readonly taskClass: RoutingTaskClass;
      readonly riskClass: RoutingRiskClass;
    };
    readonly target: RouteTarget;
  }[];
  readonly defaultTarget: RouteTarget;
}

export interface RouteSelectionReceipt {
  readonly taskClass: RoutingTaskClass;
  readonly riskClass: RoutingRiskClass;
  readonly matchedRuleIds: readonly string[];
  readonly selectedRuleId: string | null;
  readonly target: RouteTarget;
  readonly receiptHash: string;
}

export class ClosedRoutingRuntime {
  readonly #policy: DeclarativeRoutingPolicy;

  public constructor(policy: DeclarativeRoutingPolicy) {
    const ruleIds = policy.rules.map((rule) => rule.ruleId);
    assertCondition(
      new Set(ruleIds).size === ruleIds.length,
      "SCHEMA_INVALID",
      "Routing policy has duplicate rule IDs",
    );
    this.#policy = policy;
  }

  public select(input: {
    readonly taskClass: RoutingTaskClass;
    readonly riskClass: RoutingRiskClass;
  }): RouteSelectionReceipt {
    const matched = this.#policy.rules
      .filter(
        (rule) =>
          rule.match.taskClass === input.taskClass &&
          rule.match.riskClass === input.riskClass,
      )
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          left.ruleId.localeCompare(right.ruleId),
      );
    const selected = matched[0];
    const core = {
      taskClass: input.taskClass,
      riskClass: input.riskClass,
      matchedRuleIds: matched.map((rule) => rule.ruleId).sort(),
      selectedRuleId: selected?.ruleId ?? null,
      target: selected?.target ?? this.#policy.defaultTarget,
    };
    return {
      ...core,
      receiptHash: sha256(core),
    };
  }
}
