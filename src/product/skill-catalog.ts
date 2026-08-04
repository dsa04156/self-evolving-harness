import { assertCondition } from "../core/errors.js";
import type { DeclarativeSkill } from "../runtime/skills.js";
import { allowedToolIds } from "./defaults.js";
import type { PermissionMode } from "./config.js";

interface SkillTemplate {
  readonly skillId: string;
  readonly summary: string;
  readonly steps: readonly {
    readonly stepId: string;
    readonly kind: "instruction" | "tool_guidance" | "evidence_check" | "completion_check";
    readonly instruction: string;
    readonly toolId?: string;
  }[];
  readonly completionChecks: readonly string[];
}

const TEMPLATES: readonly SkillTemplate[] = [
  {
    skillId: "debug",
    summary: "Reproduce, localize, fix, and regression-test a concrete defect.",
    steps: [
      { stepId: "reproduce", kind: "tool_guidance", instruction: "Run the narrowest reliable reproduction before changing code.", toolId: "shell.bash" },
      { stepId: "trace", kind: "instruction", instruction: "Trace data and control flow to a specific mechanism; distinguish observed facts from hypotheses." },
      { stepId: "fix", kind: "instruction", instruction: "Change the smallest coherent surface that addresses the mechanism, not only the symptom." },
      { stepId: "regress", kind: "tool_guidance", instruction: "Run the reproduction and nearby regression tests after the change.", toolId: "shell.bash" },
    ],
    completionChecks: ["The original failure is reproduced or its absence is explained.", "The fix is covered by focused verification.", "Residual uncertainty is stated."],
  },
  {
    skillId: "review",
    summary: "Review a diff for correctness, regressions, security, and missing tests.",
    steps: [
      { stepId: "status", kind: "tool_guidance", instruction: "Inspect repository status before interpreting the change surface.", toolId: "git.status" },
      { stepId: "diff", kind: "tool_guidance", instruction: "Read the entire relevant diff and then inspect surrounding source and tests.", toolId: "git.diff" },
      { stepId: "findings", kind: "evidence_check", instruction: "Lead with actionable findings ordered by severity and cite exact files or behaviors." },
    ],
    completionChecks: ["Every finding is grounded in code or test evidence.", "No issue-free approval is claimed from a partial diff.", "Residual test gaps are explicit."],
  },
  {
    skillId: "tests",
    summary: "Design and implement focused deterministic tests for behavior and failure paths.",
    steps: [
      { stepId: "contract", kind: "instruction", instruction: "State the behavior contract, boundary cases, and observable failure mode before writing tests." },
      { stepId: "existing", kind: "tool_guidance", instruction: "Inspect nearby test conventions and reusable fixtures.", toolId: "filesystem.read" },
      { stepId: "execute", kind: "tool_guidance", instruction: "Run the narrow test first, then the smallest relevant suite.", toolId: "shell.bash" },
    ],
    completionChecks: ["Tests fail for the intended reason without the behavior.", "Assertions verify outcomes rather than implementation trivia.", "The focused suite passes deterministically."],
  },
  {
    skillId: "refactor",
    summary: "Improve structure while preserving externally observable behavior.",
    steps: [
      { stepId: "baseline", kind: "tool_guidance", instruction: "Establish a passing behavioral baseline before structural edits.", toolId: "shell.bash" },
      { stepId: "boundary", kind: "instruction", instruction: "Name the responsibility boundary being improved and avoid unrelated cleanup." },
      { stepId: "verify", kind: "tool_guidance", instruction: "Run behavior-preservation tests and inspect the final diff for accidental scope expansion.", toolId: "shell.bash" },
    ],
    completionChecks: ["Public behavior and data contracts are preserved.", "The diff stays within the named boundary.", "Verification covers both old and reorganized paths."],
  },
  {
    skillId: "docs",
    summary: "Write user-facing documentation grounded in the current executable behavior.",
    steps: [
      { stepId: "prove", kind: "tool_guidance", instruction: "Inspect the implementation and run help or examples before documenting them.", toolId: "shell.bash" },
      { stepId: "audience", kind: "instruction", instruction: "Lead with the user's outcome, then show the shortest working path and important constraints." },
      { stepId: "drift", kind: "evidence_check", instruction: "Check names, flags, defaults, versions, and links against authoritative files." },
    ],
    completionChecks: ["Every command shown exists and uses current syntax.", "Limitations and required credentials are explicit.", "Examples avoid secrets and machine-specific paths."],
  },
  {
    skillId: "secure-review",
    summary: "Inspect trust boundaries, input handling, secret exposure, and authority widening.",
    steps: [
      { stepId: "boundary", kind: "instruction", instruction: "Map untrusted inputs, privileged operations, durable state, and external process or network boundaries." },
      { stepId: "search", kind: "tool_guidance", instruction: "Inspect authentication, permissions, validation, logging, and secret-handling code paths.", toolId: "filesystem.read" },
      { stepId: "adversary", kind: "evidence_check", instruction: "Test plausible abuse cases without claiming exhaustive security assurance." },
    ],
    completionChecks: ["Findings identify threat, precondition, impact, and concrete mitigation.", "Security claims match tested boundaries.", "No credential value is copied into evidence."],
  },
  {
    skillId: "performance",
    summary: "Measure a bottleneck, make one bounded optimization, and compare matched runs.",
    steps: [
      { stepId: "measure", kind: "tool_guidance", instruction: "Capture a repeatable baseline with workload, environment, and metric recorded.", toolId: "shell.bash" },
      { stepId: "mechanism", kind: "instruction", instruction: "Attribute the bottleneck before optimizing and preserve correctness checks." },
      { stepId: "compare", kind: "tool_guidance", instruction: "Repeat the same workload and report both performance and correctness outcomes.", toolId: "shell.bash" },
    ],
    completionChecks: ["Before and after use matched conditions.", "Correctness does not regress.", "Noise and measurement limits are reported."],
  },
  {
    skillId: "parallel-research",
    summary: "Split independent repository questions across bounded child agents and synthesize their evidence.",
    steps: [
      { stepId: "split", kind: "instruction", instruction: "Choose non-overlapping questions whose answers can be produced independently." },
      { stepId: "delegate", kind: "tool_guidance", instruction: "Spawn one child per independent question and record every returned ID.", toolId: "agent.spawn" },
      { stepId: "collect", kind: "tool_guidance", instruction: "Wait for every required child result before reaching a conclusion.", toolId: "descendant.wait" },
      { stepId: "synthesize", kind: "evidence_check", instruction: "Resolve contradictions against source evidence and state which conclusions are inferred." },
    ],
    completionChecks: ["Delegated scopes do not overlap needlessly.", "All relied-upon child results reached a terminal state.", "The parent independently integrates rather than blindly repeats outputs."],
  },
] as const;

function materialize(
  template: SkillTemplate,
  permissionMode: PermissionMode,
  coordinationEnabled: boolean,
): DeclarativeSkill | null {
  const granted = new Set(allowedToolIds(permissionMode, coordinationEnabled));
  if (template.skillId === "parallel-research" && !coordinationEnabled) return null;
  const steps = template.steps.map((step) => {
    if (step.toolId === undefined || granted.has(step.toolId)) return step;
    return {
      stepId: step.stepId,
      kind: "instruction" as const,
      instruction: `${step.instruction} The active authority does not expose the referenced mutation or shell tool, so diagnose or describe the check without claiming it ran.`,
    };
  });
  const usedTools = [...new Set(
    steps.flatMap((step) => step.toolId === undefined ? [] : [step.toolId]),
  )].sort();
  return {
    schemaVersion: 1,
    language: "seh.skill.v1",
    skillId: template.skillId,
    summary: template.summary,
    allowedToolIds: usedTools,
    steps,
    completionChecks: template.completionChecks,
  };
}

export function productSkillCatalog(
  permissionMode: PermissionMode,
  coordinationEnabled: boolean,
): readonly DeclarativeSkill[] {
  return TEMPLATES
    .map((template) => materialize(template, permissionMode, coordinationEnabled))
    .filter((skill): skill is DeclarativeSkill => skill !== null);
}

export function selectProductSkills(
  skillIds: readonly string[],
  permissionMode: PermissionMode,
  coordinationEnabled: boolean,
): readonly DeclarativeSkill[] {
  const catalog = new Map(
    productSkillCatalog(permissionMode, coordinationEnabled).map((skill) => [skill.skillId, skill]),
  );
  const unique = [...new Set(skillIds)];
  return unique.map((skillId) => {
    const skill = catalog.get(skillId);
    assertCondition(skill !== undefined, "SCHEMA_INVALID", `Unknown skill ${skillId}`);
    return skill;
  });
}

export const PRODUCT_SKILL_IDS = Object.freeze(TEMPLATES.map((template) => template.skillId));
