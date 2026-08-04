# Architect packet 08 — SEH-native product HarnessVersion execution

## Gate request

Review the implementation that follows Round 07's `REVISE` decision. Return exactly one verdict:
`APPROVE`, `REVISE`, or `BLOCK`, followed by findings ordered by severity.

This is an architecture/correctness gate only. It must not approve empirical self-improvement claims;
the real-provider, matched-budget B0–B6, and sealed held-out obligations remain open.

## Prior decision being closed

Round 07 rejected a whole Codex fork and required this authority path:

```text
ProductExecutionConfig
→ typed HarnessComponents
→ persistent HarnessVersion
→ pinned session
→ SEH execution
→ non-authoritative Thread / Turn / Item-style projection
```

It also required no Codex process, crate, app server, login, provider, or session backend.

## Implementation summary

### Product configuration to persistent component graph

New `src/product/harness-registry.ts`:

- defines `ProductExecutionConfig` containing provider, permission, budget, process, verification,
  prompt, context, memory retrieval, skills, tool descriptions/grants, workflow, routing, and
  subagent prompt;
- materializes the actual product values into the existing persistent
  `HarnessComponentRegistry` and content-addressed artifact store;
- creates mutable components for SystemPrompt, ContextPolicy, MemoryRetrievalPolicy, Skill,
  WorkflowPolicy, RoutingPolicy, SubagentPrompt, and ToolDescription;
- creates immutable/conditionally frozen bindings for every tool implementation, PermissionPolicy,
  SafetyPolicy, BudgetPolicy, ModelIdentity, VerificationPolicy, RecoveryPolicy, AuditPolicy,
  MemoryPolicy, SubagentConfiguration, Evaluator, TraceCollector, and Middleware;
- binds ToolDescription → exact ToolImplementation and validates current implementation and input
  schema hashes during both materialization and resolution;
- persists a `HarnessVersionManifest` with exact behavior-closure and runtime-contract hashes;
- resolves old pinned manifests back into executable configuration and rejects another runtime
  contract or tool implementation.

`PRODUCT_RUNTIME_CONTRACT_HASH` explicitly identifies the SEH-owned context/model/tool/verification,
closed workflow/routing, and RuntimeEvent contracts. It names Codex/Gajae/OpenCode only in a
forbidden-backend list, never as executable dependencies.

### Pin before provider construction

`src/product/coding-agent.ts` now:

1. opens/materializes or resolves the product HarnessVersion;
2. writes immutable session pins and lineage;
3. only then constructs the provider adapter;
4. passes the resolved prompt/context/memory/skills/tools/workflow/routing/subagent prompt into the
   SEH managed standalone runtime.

The old ad-hoc `sha256({prompt, skills, ...})` HarnessVersion substitute was removed.

### Resume/fork lineage

`ProductSessionRecord` retains schema version 1 compatibility but new records include:

- `lineageKind = root | resume | fork`;
- `threadId` and `forkedFromThreadId`;
- `harnessVersionId`, manifest hash, closure hash, runtime contract hash, and selection reason;
- immutability checks covering all new fields.

Resume and fork must inherit the parent's exact HarnessVersion. An explicit conflicting pin fails.
Legacy sessions can create one `legacy-current` bridge. Interactive model, effort, Fast, permission,
or skill changes detach the pinned thread and start a new root thread instead of silently rebinding
it. Read-only review runs as an isolated root.

New UX:

- `seh fork [SESSION_ID] [guidance] [--last]` and `/fork`;
- `seh thread [SESSION_ID] [--json]` and `/thread`/`/turns`;
- status exposes lineage and exact harness identities;
- version bumped to 0.8.0 and shell completions/docs updated.

### Workflow/routing are causal

`AgentExecutionLoop` instantiates `ClosedWorkflowRuntime` from the pinned policy. Context assembly,
model invocation, tool execution, verification, retry, completion, and block each require the
selected destination state's action. Every transition emits `workflow_transitioned` with the
closed-dispatch receipt.

`createStandaloneRuntime` instantiates `ClosedRoutingRuntime`. A deterministic task/risk classifier
selects a route before `spawnAgent`; only the pinned `bounded-child-v1` subagent route may create a
child. High-risk routes retained on primary fail the spawn call. `route_selected` is authoritative
event evidence. The child receives the pinned SubagentPrompt instead of a hard-coded prompt.

### Non-authoritative Thread / Turn / Item projection

New `src/product/thread-projection.ts` and
`schemas/product-thread-projection.schema.json`:

- reopen and validate the append-only log and every RuntimeEvent/event hash/pin;
- derive thread, turns, and items for user message, model request/response hashes, tools,
  verification, workflow, routing, state changes, and failures;
- commit a deterministic projection hash;
- set `authority: projection_only`;
- provide an explicit guard rejecting the projection as runtime, evaluator, promotion, or rollback
  authority.

The authoritative records remain ProductSession metadata plus SEH RuntimeEvents.

### Codex boundary and provenance

- ADR: `docs/architecture/adr-0007-codex-patterns-not-runtime.md`
- exact-SHA ledger: `docs/research/codex-reuse-ledger.md`
- audited reference: `openai/codex@db1a4145692fcfc88fb354f478b0019ca0d2ef9d`, Apache-2.0
- current disposition: observation/clean-room patterns only; no copied/adapted Codex source
- static ownership test scans product/runtime/tools/providers imports and process-launch sites and
  rejects Codex, Gajae, or OpenCode backends/dependencies.

## Deterministic evidence run before submission

- TypeScript strict check: PASS
- all tests (`npm test`): PASS
- product suite: 32/32 PASS before adding the two new standalone product-boundary files
- product HarnessVersion registry test: PASS
- standalone runtime ownership test: PASS
- workflow/routing tests including product high-risk retention: PASS
- JSON Schema compilation: 132 schemas PASS
- focused root → resume with config drift → fork test: PASS
  - same HarnessVersion across resume and fork;
  - provider and permission remain parent's pinned values;
  - root/resume share thread ID;
  - fork has a new thread ID and source-thread pointer;
  - workflow transition items are projected;
  - projection is rejected as authority.

Full release verification, package dry run, secret scan, commit/push, and hosted CI will run after
this gate response and any required revision.

## Files most relevant to review

- `src/product/harness-registry.ts`
- `src/product/coding-agent.ts`
- `src/product/session-store.ts`
- `src/runtime/agent-loop.ts`
- `src/runtime/standalone.ts`
- `src/runtime/workflow.ts`
- `src/product/thread-projection.ts`
- `schemas/product-thread-projection.schema.json`
- `test/product-harness-registry.test.ts`
- `test/product-coding-agent.test.ts`
- `test/standalone-runtime-ownership.test.ts`
- `test/workflow-routing.test.ts`

## Questions for the gate

1. Does product behavior now flow through a real persistent HarnessVersion rather than metadata-only
   hashing?
2. Are workflow, routing, subagent prompt, and resume/fork pins causally connected enough to close
   Round 07?
3. Is the Thread / Turn / Item projection sufficiently non-authoritative and traceable to source
   events?
4. Does any path accidentally make Codex the backend or overstate source reuse?
5. What exact revision, if any, is required before releasing 0.8.0?

## Claim boundary

Even an `APPROVE` here means only that the product/runtime architecture and Codex boundary are
acceptable. It does not establish that SEH self-evolution improves held-out coding performance.
