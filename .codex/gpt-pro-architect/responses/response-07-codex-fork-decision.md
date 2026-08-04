Decision: REVISE

Rationale:

A full Codex fork is not justified under the current SEH contract. Option A is not a routine implementation shortcut. It would replace the project’s central research object.

The governing contribution is that SEH independently owns:

provider abstraction
context construction
agent/model/tool loop
filesystem and shell execution
memory, skills, workflows, and descendants
sessions and recovery
permissions and evidence
verification
HarnessVersion lifecycle
Harness Evolution lifecycle

Making Codex the executor would change the contribution from:

standalone self-evolving coding-agent harness

to:

evolution layer attached to a Codex fork

That may be a legitimate separate product or research direction, but it is not the project currently specified by SCOPE.md, RESEARCH_CONTRACT.md, and NON_GOALS.md. Option A would invalidate the independent-runtime claim and make later B0–B6 attribution much harder because runtime changes, upstream Codex changes, and evolution changes would become entangled.

The current SEH state also removes the strongest practical argument for replacing the core. The repository already has an owned model/tool loop, tools, sessions, TUI, model profiles, sandbox integration, memory, descendants, skills, versioned harness components, evidence, evaluation, and lifecycle machinery. The remaining integration gap is specific and repairable:

product execution configuration
→ persistent HarnessComponentRegistry
→ exact HarnessVersion
→ executable workflow/routing/subagent policies

Replacing an 87,000-line tested independent system with a roughly 666,000-line coupled Rust workspace to avoid finishing that integration would be less “acceleration” and more “buying a new house because one room needs wiring.”

Option B is technically credible and is the correct plan. The source audit supports the conclusion that the Codex TUI is not a small detachable frontend. It is coupled to app-server, core, provider, state, sandbox, skills, plugins, MCP, rollout, and other Codex crates. Wholesale transplantation would either import much of Codex or require a large decoupling rewrite. Clean-room adoption of bounded interaction and protocol patterns avoids both outcomes.

Option C remains possible only as a separately named and separately evaluated distribution after the independent SEH artifact and evaluation protocol are frozen. Its outputs must never be used as evidence for the standalone-runtime track.

Required changes:

Record an explicit architecture decision for Option B.

The ADR must state:

Codex is not the SEH execution backend.
Codex app-server is not called by the SEH runtime.
Codex CLI is not launched as a solver.
Codex sessions, login state, browser state, or account tokens are not reused.
Codex-derived product work cannot satisfy standalone-runtime evaluation.

Option A must be classified as a research-contract pivot requiring a separate ruling, contribution statement, baseline design, and evaluation protocol.

Implement one bounded vertical slice: an SEH-native harness-bound session facade.

The smallest useful slice is:

ProductExecutionConfig
→ exact typed HarnessComponents
→ persistent HarnessVersion
→ pinned task session
→ SEH-owned execution
→ Thread/Turn/Item-style event projection

It should include only:

materializing the product’s active prompt, context, memory, skill, workflow, routing, subagent-prompt, and tool-description configuration into the persistent component registry;

creating or resolving one content-addressed HarnessVersion;

pinning new, resumed, and forked sessions to that exact version;

executing WorkflowPolicy, RoutingPolicy, and SubagentPrompt through the product path rather than leaving them as registry-only objects;

exposing an SEH-owned local Thread, Turn, and Item projection over existing runtime events and signed evidence;

adding local resume and fork ergonomics without importing Codex runtime state.

The projection must remain non-authoritative. Existing signed lifecycle records, receipts, and audit objects remain authoritative.

Do not import the Codex app-server as a dependency.

A Codex-shaped local API is acceptable. A Codex-backed local API is not.

The facade must call the existing SEH runtime directly. No Codex process, Rust crate, app-server endpoint, session store, or provider path may sit behind it.

Add source-provenance controls before any reuse.

For every Codex-derived element, classify it as one of:

observed interaction pattern
clean-room reimplementation
adapted Apache-2.0 code
copied Apache-2.0 code

Any adapted or copied code must bind:

exact Codex commit;

repository path;

relevant source range or symbol;

local destination;

Apache attribution;

modified-file notice;

clean-room or reuse disposition; and

security and dependency review result.

Pattern-level reimplementations must still retain exact-SHA source observations so later reviewers can distinguish independent design from accidental near-copying.

Keep branding and distribution boundaries explicit.

SEH must not imply that it is Codex, an official Codex distribution, or endorsed by OpenAI.

Any later Option C distribution must have:

a separate name;

a separate package or repository boundary;

a separate license and modification ledger;

separate release artifacts;

separate evaluation manifests; and

permanent exclusion from standalone SEH evidence.

Prevent upstream changes from becoming evolution mutations.

Codex source updates, UX ports, and compatibility changes must be ordinary reviewed development commits. They must not enter the candidate-mutation surface or be presented as trace-driven harness evolution.

Upstream updates need a pinned source commit and an explicit patch/provenance ledger. Automatic upstream merging is not acceptable evidence for this research track.

Preserve evaluation separation.

The independent SEH runtime remains the artifact evaluated under the standalone B0–B6 protocol.

A future Codex-derived distribution may be evaluated as:

separate product experiment
external baseline
portability target

but not pooled with or substituted for the independent runtime. Compute, tools, provider access, feedback, and runtime capabilities would require separate matching.

Do not add Codex subscription login as an imitation provider path.

The packet correctly notes that an independent adapter cannot simply inherit a user’s Codex or ChatGPT subscription access. Browser credentials, session state, internal endpoints, or Codex login artifacts must not be harvested or repurposed.

Risks/missing evidence:

Option B will not produce complete Codex UX parity immediately. Session ergonomics, app-server surfaces, plugin behavior, MCP integration, and terminal details must be implemented and tested incrementally.

A Thread/Turn/Item-shaped API can also drift into accidental protocol-compatibility claims. The project should describe it as an SEH event model inspired by observed Codex interaction patterns unless exact compatibility is deliberately specified and tested.

The current product path is not yet fully bound to the persistent HarnessComponentRegistry. Until that vertical integration exists, the research architecture and the user-facing runtime can still diverge. That is the most important remaining implementation risk.

Ported widgets or snippets may introduce dependencies and assumptions from the larger Codex workspace. Each reuse must be bounded enough that it does not drag in login, state, provider, telemetry, plugin, or sandbox authority unintentionally.

Option C would create substantial maintenance cost across two languages and products. It should remain deferred until:

independent runtime integration is complete
research protocol is frozen
standalone evaluation boundaries are executable
evidence separation is machine-enforced

The empirical research state remains unchanged:

B0–B6 execution              = NOT RUN
held-out improvement         = NOT TESTED
attribution benefit          = NOT TESTED
evidence efficiency          = NOT TESTED
cross-model transfer         = NOT TESTED
self-improvement claim       = NOT ESTABLISHED

Next packet request:

Submit one narrow Packet 07R, SEH-native harness-bound session facade, containing:

ADR selecting Option B
explicit prohibition on Codex runtime/backend use
product-config-to-component mapping
HarnessVersion materialization and content identity
session start/resume/fork pinning rules
WorkflowPolicy execution path
RoutingPolicy execution path
SubagentPrompt execution path
Thread/Turn/Item projection schema
authoritative-versus-projection boundary
local API or CLI surface
Codex source-provenance ledger
license and modified-file disposition
dependency and security review
deterministic tests
clean candidate commit/tree

Required tests should prove:

a product session uses the exact persisted HarnessVersion;

changing product configuration creates a new version rather than mutating an existing session;

resume preserves the original version;

fork records explicit parentage and a frozen version choice;

workflow, routing, and subagent-prompt components causally affect execution;

Thread/Turn/Item records reconstruct from SEH events;

projections cannot satisfy completion, promotion, or audit gates;

no Codex binary, app-server, crate, package, session, or runtime process is invoked; and

no provider-bound history crosses provider or session boundaries incorrectly.

A full Codex fork as the SEH core is not authorized. A separately governed Option C proposal may be reconsidered only after the independent artifact and its evaluation protocol are frozen.
