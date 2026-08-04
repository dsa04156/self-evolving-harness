# ADR-0007: Adopt Codex interaction patterns, not the Codex runtime

- Status: accepted with implementation proof
- Date: 2026-08-04
- Decision gate: GPT Pro Architect Round 07, `REVISE`
- Reference checkout: `openai/codex@db1a4145692fcfc88fb354f478b0019ca0d2ef9d`

## Context

The product needs a coding-agent experience comparable to Codex CLI and Gajae-Code while retaining
the research claim that SEH owns its model loop, context assembly, tools, memory, sessions,
permissions, evidence, verification, and harness-evolution lifecycle. The tempting shortcut is to
fork Codex and add the evolution plane.

The exact-SHA audit found that Codex's TUI is not a detachable terminal skin. The Rust TUI is coupled
to app-server protocol/client types, core configuration, provider and login state, tools, sandboxing,
thread storage, skills, hooks, plugins, and MCP. Running or embedding that stack would make Codex the
authoritative task runtime. At the audited commit, selected `codex-rs` core, TUI, and app-server trees
contain about 665,929 lines. SEH's TypeScript source is about 63,116 lines. A wholesale fork would
therefore replace rather than strengthen the system under study.

## Decision

SEH will remain an independent runtime. It may clean-room implement publicly observable interaction
patterns:

- full-screen terminal composition and command discovery;
- provider/model/reasoning selectors;
- durable Thread / Turn / Item-style projections;
- explicit resume and fork lineage;
- tool, verification, and lifecycle progress surfaces.

The authoritative path remains:

```text
ProductExecutionConfig
→ typed HarnessComponents
→ persistent HarnessVersion
→ session pin committed before provider construction
→ SEH AgentExecutionLoop / SEH tools / SEH verifier
→ signed RuntimeEvents
→ non-authoritative Thread / Turn / Item projection
```

The following are forbidden as SEH runtime dependencies:

- a `codex` child process;
- Codex app-server or its protocol as the execution backend;
- Codex login/session/provider state;
- Codex Rust crates in the task execution path;
- claims that a Codex session is an SEH session or HarnessVersion.

Any future Codex-derived distribution must be separately named, licensed, tested, and excluded from
standalone-runtime and evolution evidence.

## Implementation consequences

- `src/product/harness-registry.ts` materializes the actual product configuration into the typed,
  content-addressed component registry. It does not synthesize an informal version hash.
- Mutable product behavior is bound as SystemPrompt, ContextPolicy, MemoryRetrievalPolicy, Skill,
  WorkflowPolicy, RoutingPolicy, SubagentPrompt, and ToolDescription components.
- Model identity, budget, permission, safety, evaluator, trace collector, middleware, and each tool
  implementation are bound as immutable or conditionally frozen components.
- `ProductSessionRecord` commits the manifest hash, closure hash, runtime contract, selection mode,
  thread lineage, and HarnessVersion before the provider is constructed.
- Resume and fork inherit the parent's exact HarnessVersion. Config changes take effect only in a
  new root thread.
- The pinned WorkflowPolicy gates context, model, tool, verification, completion, block, and retry
  transitions. The pinned RoutingPolicy gates child-agent creation. Both produce runtime events.
- `src/product/thread-projection.ts` derives a convenience view from hash-validated RuntimeEvents.
  Its `authority` is permanently `projection_only`; it cannot authorize tools, evaluation,
  promotion, or rollback.

## Rejected alternatives

### Full Codex fork

Rejected because it destroys independent runtime ownership, expands the trusted computing base by an
order of magnitude, couples evolution evidence to upstream churn, and makes the central comparison
against existing harnesses circular.

### Codex app-server backend with an SEH control plane

Rejected because this is an external controller/wrapper, explicitly outside project scope.

### Copy only the Codex TUI crate

Rejected because the audited dependency graph shows the TUI is coupled to Codex runtime and protocol
state. Treating it as a skin would understate the imported authority and maintenance surface.

## Verification

The deterministic suite must prove:

1. identical product configurations create the same HarnessVersion;
2. behavioral configuration changes create another version;
3. resume and fork inherit the exact parent version despite current-config drift;
4. workflow and routing decisions appear in authoritative SEH RuntimeEvents;
5. projections reproduce their hash and are rejected as authority;
6. the fake-provider path completes with no Codex process, app-server, login, or provider state.
