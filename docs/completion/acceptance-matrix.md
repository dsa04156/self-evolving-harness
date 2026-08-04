# Deterministic MVP Acceptance Matrix

Audit date: 2026-08-04
Product verdict: **PASS**
Empirical self-improvement verdict: **REVISE / unexecuted**

`PASS` below means implemented and covered by deterministic tests inside the documented local trusted
computing base. It does not mean that C-H1–C-H4, provider quality, or held-out generalization has been
demonstrated.

## Runtime ownership

| Requirement | Status | Implementation | Deterministic evidence |
|---|---|---|---|
| Model-provider abstraction | PASS | `src/domain/model.ts` | `test/openai-provider.test.ts`, `test/canonical-request-table-provider.test.ts` |
| Agent execution loop | PASS | `src/runtime/agent-loop.ts` | `test/runtime-loop.test.ts` |
| Context construction | PASS | `src/runtime/context.ts` | `test/context-policy-runtime.test.ts` |
| Tool registry/execution | PASS | `src/runtime/tools.ts` | `test/runtime-loop.test.ts`, `test/security-boundaries.test.ts` |
| Read/write/edit/bash/git | PASS | `src/tools/builtins.ts` | runtime and security-boundary tests |
| Filesystem persistent memory | PASS | `src/runtime/memory.ts` | `test/context-policy-runtime.test.ts` |
| Declarative skills | PASS | `src/runtime/skills.ts` | `test/workflow-routing.test.ts`, standalone tests |
| Workflow and routing | PASS | `src/runtime/workflow.ts`, `src/runtime/routing.ts` | `test/workflow-routing.test.ts` |
| Subagents/backend jobs | PASS | `src/runtime/descendants.ts` | `test/runtime-loop.test.ts`, `test/hfb-semantic-execution.test.ts` |
| Session lifecycle | PASS | `src/operations/session-lifecycle.ts` | `test/evidence-lifecycle.test.ts`, `test/termination-recovery.test.ts` |
| Permissions/sandboxing | PASS, bounded TCB | `src/runtime/path-guard.ts`, `sandbox-process.ts`, `tools.ts` | security, OS-boundary, cancellation tests |
| Events/evidence | PASS | `src/evidence/` | evidence lifecycle, Unix audit, tamper tests |
| Verification/recovery | PASS | `src/runtime/verifier.ts`, operations control plane | runtime, evidence, termination-recovery tests |
| Managed end-to-end entry point | PASS | `src/runtime/managed.ts`, `src/cli.ts` | `test/managed-runtime.test.ts`, `npm run cli -- demo` |
| User CLI and full-screen terminal | PASS | `src/product/cli.ts`, `fullscreen-tui.tsx`, `shell-completion.ts` | product CLI/TUI tests, installed-package cross-directory smoke |
| Composable discovery and diagnostics | PASS | global option router; `doctor`, `models`, `skills`, `tools`; JSON error envelope | `test/product-cli.test.ts`, `test/product-interactive.test.ts` |

The runtime imports no Codex, Gajae-Code, OpenCode, NexAU, DeepAgent, or other agent runtime. The OpenAI
package is a model-provider client only.

## Six architectural planes

| Plane | Status | Primary modules |
|---|---|---|
| 1. Agent Runtime Kernel | PASS | `src/runtime/`, `src/providers/`, `src/tools/` |
| 2. Harness Component Model | PASS | `src/harness/component-registry.ts`, component/version schemas |
| 3. Operations Control Plane | PASS | `src/operations/`, managed runtime |
| 4. Evidence Plane | PASS | `src/evidence/`, `src/storage/` |
| 5. Evolution Control Plane | PASS for deterministic orchestration | `src/evolution/` |
| 6. Immutable Trust Plane | PASS for local threat model | `src/trust/`, `src/governance/`, `evaluator/` |

## Evolution contract

| Requirement | Status | Evidence |
|---|---|---|
| New HarnessVersion per mutation | PASS | content-addressed registry and `HarnessEvolutionLoop` |
| Changed component and provenance recorded | PASS | mutation, provenance, lineage, and candidate-bundle schemas |
| Parent/candidate independently evaluated | PASS | authenticated external evaluator transaction and tests |
| Promote/reject history | PASS | `PromotionService`, signed decisions and lifecycle records |
| Rollback history | PASS | deployment authorizer/registry exact CAS and rollback swap |
| Parent preserved | PASS | immutable manifests, Git candidate commit/snapshot, failed-candidate tests |
| Immutable mutation boundary | PASS | type registry, candidate admission, bundle verification, adversarial tests |
| Rejected proposal memory | PASS | bounded mutation proposal disposition log |
| Worktree isolation | PASS | `worktree-isolation.ts`, `worktree-evaluation-executor.ts` |
| External evaluator process | PASS | TypeScript coordinator plus Python evaluator/gates |

Task retry, reflection, recovery, memory writes, and routing choices keep the same harness ID. Only the
outer loop creates a candidate.

## Component model

All requested behavior-bearing types exist. `mutableClass` is frozen in the type registry;
`componentId`, semantic version, payload/content identities, dependencies, and behavior closure are in
the immutable manifest; provenance and evaluation history are append-only external records; active
deployment is a channel pointer. This normalized representation avoids rewriting component content when
provenance, evaluation history, or deployment status changes.

MVP mutation admits only SystemPrompt, ContextPolicy, MemoryRetrievalPolicy, Skill, WorkflowPolicy,
RoutingPolicy, SubagentPrompt, and ToolDescription. Evaluator, data, permission/safety, model identity,
budget, trace/audit, tool implementation, middleware, promotion policy, and optimizer remain immutable.

## Lifecycle interpretation

The required session states are implemented, with `waiting` plus explicit abnormal
`terminating → terminated` states.

The implementation deliberately splits the requested harness lifecycle into two authoritative
projections:

```text
qualification: draft → candidate → statically_validated → evaluating → canary
               → approved/rejected → retired

deployment:    null → active exact channel pointer → deploy/rollback/decommission CAS history
```

Thus requested `active` is the current deployment-pointer target and requested `rolled_back` is a signed
deployment operation with an exact before/after tuple. Neither is embedded in the immutable manifest.
This is a documented refinement, not a missing transition: approval cannot deploy, rollback cannot erase
qualification, and already-running sessions stay pinned.

## Schemas and diagrams

- All JSON Schemas compile with `npm run cli -- check-schemas`.
- Core schemas include RuntimeEvent, EvidenceReceipt, FailurePattern, AttributionResult,
  MutationProposal, HarnessVersion, EvaluationResult, PromotionDecision, session/harness lifecycles,
  deployment, descendant lifecycle, budgets, provider proxy, and trust-plane custody.
- HTML/SVG diagrams cover system architecture, both sequences, and both lifecycle views under
  `docs/diagrams/`; textual/Mermaid equivalents are in `ARCHITECTURE.md` and `docs/architecture/`.

## Evaluation implementation

| Item | Status |
|---|---|
| Frozen HarnessFaultBench and Terminal-Bench 2.1 split IDs | PASS |
| B0–B6 definitions and size-matched controls | PASS |
| Matched model/token/tool/feedback/time accounting | PASS |
| Mine/gate/final access policy | PASS as contract and local process tests |
| Deterministic fault and semantic-development fixtures | PASS, development-only |
| Live B0–B6 provider experiment | NOT RUN |
| Sealed/temporal final evaluation | NOT RUN |
| H1–H4 statistical claims | UNSUPPORTED |

## Release commands

```bash
npm run cli -- demo
npm run verify:release
```

The first proves the no-key managed runtime path. The second is the authoritative deterministic release
gate. Live provider smoke remains a separate, opt-in command and is not part of completion.
