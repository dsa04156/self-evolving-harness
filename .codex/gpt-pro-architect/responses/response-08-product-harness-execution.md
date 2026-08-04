Decision: APPROVE

Findings, ordered by severity:

Critical / release-blocking architecture defects: none.

The implementation closes the Round 07 authority path:

ProductExecutionConfig
→ typed persistent HarnessComponents
→ content-addressed HarnessVersionManifest
→ immutable session pin
→ SEH-owned runtime execution
→ non-authoritative Thread / Turn / Item projection

Product execution no longer relies on an ad hoc hash pretending to be a harness version. The actual prompt, context, memory, skills, tools, workflow, routing, subagent prompt, model identity, permissions, budgets, verification, recovery, audit, middleware, and immutable tool implementations are represented through the existing component registry and behavior closure.

High: HarnessVersion materialization and runtime ownership are correct.

ProductExecutionConfig is materialized into the persistent registry before provider construction. The resulting session binds:

harnessVersionId
manifest hash
behavior-closure hash
runtime-contract hash
selection reason

Resolution validates the pinned runtime contract and immutable tool implementation/schema hashes. That closes the main gap identified in Round 07: the product path now executes the versioned harness architecture rather than merely displaying harness metadata beside an unrelated runtime configuration.

Constructing the provider only after the version and session pins are durable is also the correct ordering. A provider initialization failure may leave a failed or incomplete session, but it cannot silently select a different harness after execution authority begins.

High: Resume and fork semantics preserve immutable execution identity.

The stated rules are accepted:

root   → selected exact HarnessVersion
resume → inherit exact parent HarnessVersion
fork   → inherit exact source HarnessVersion with explicit parentage

A conflicting explicit pin fails instead of rebasing the session. Interactive changes to model, effort, service tier, permission, or skills detach from the existing thread and create a new root rather than mutating the meaning of an existing session.

The one-time legacy-current bridge is acceptable as a compatibility mechanism only because it is explicit and separately identified. It must never be described as exact replay of the original legacy execution environment or used as reproducible research evidence. A missing historical configuration cannot be recovered by assigning current bytes a nostalgic label. That would be archaeology by optimism.

High: Workflow, routing, and subagent-prompt components are causally connected.

The packet reports actual runtime enforcement rather than decorative registry entries:

workflow actions gate context construction, model calls, tools, verification, retry, completion, and blocking;

transitions emit authoritative workflow_transitioned evidence;

the pinned routing policy and deterministic classifier determine primary versus bounded-child routing;

high-risk primary routes cannot spawn a child;

successful child creation requires the pinned bounded-child-v1 route; and

the child receives the pinned SubagentPrompt, not a hard-coded substitute.

This is sufficient to close the Round 07 requirement that these component families affect execution behavior.

Medium: The Thread / Turn / Item projection is sufficiently non-authoritative.

The projection is reconstructed from validated append-only runtime events, event hashes, and session pins. It receives its own deterministic projection hash and carries:

authority = projection_only

The explicit guard preventing its use as runtime, evaluator, promotion, or rollback authority is the essential control.

The projection may improve product ergonomics, resume inspection, and local API design. It cannot satisfy completion, audit, qualification, promotion, or rollback gates. Those continue to depend on the underlying session records, RuntimeEvents, lifecycle records, receipts, and other authoritative SEH evidence.

Medium: The Codex boundary is preserved.

The packet provides:

an ADR selecting bounded pattern reuse rather than a Codex runtime;

an exact-SHA source-observation ledger;

a clean-room disposition;

a runtime-contract hash naming forbidden backends; and

a static ownership test over imports, dependencies, and process-launch sites.

No Codex binary, app server, crate, provider, login, session store, or execution process is reported in the SEH authority path. The Thread / Turn / Item shape is an SEH projection inspired by an observed interaction pattern, not a Codex-backed protocol service.

Current source reuse is described as observation and clean-room reimplementation, so no copied-code modification notice is required on the evidence presented. Any later copied or adapted Apache-2.0 code must enter the provenance ledger with its exact source revision, local destination, attribution, and modified-file disposition.

Medium: Deterministic architecture evidence is adequate for this gate, but release sealing remains outstanding.

The packet reports successful strict checking, complete tests, registry tests, ownership tests, workflow/routing tests, schema compilation, and the focused root/resume/fork scenario.

Full release verification, package construction, secret scans, immutable candidate identity, and hosted CI are intentionally deferred until after this ruling. That does not block the architecture decision, but it means this packet does not yet approve a specific 0.8.0 release object.

Low: Claim discipline remains correct.

This decision accepts the product/runtime integration and the Codex boundary only. It does not establish:

B0–B6 performance
held-out improvement
attribution benefit
evidence efficiency
cross-model transfer
empirical harness evolution
self-improvement
production security

Those obligations remain open.

Required before releasing 0.8.0:

Commit the exact candidate without modifying behavior after the final test run.

Record:

parent commit
candidate commit
candidate tree
complete changed-path inventory
diffstat
canonical parent-to-candidate binary diff SHA-256
package-lock.json SHA-256

From a separate clean or detached worktree at that exact commit, run the complete release gate, including:

npm run verify:release
npm audit --omit=dev
npm pack --dry-run
seh --version
git diff --check
git status --porcelain=v1

The committed regression suite must retain explicit coverage for:

identical product configurations resolving to the same content-addressed version;

changed execution configuration producing a new version;

provider/model/reasoning/service-tier identity being recovered from the pinned version;

resume preserving the exact version despite current configuration drift;

fork preserving the selected frozen version and explicit source-thread lineage;

the one-time legacy bridge remaining explicit and non-equivalent to exact replay;

tool-description-to-implementation/schema binding rejection;

runtime-contract mismatch rejection;

causal workflow transitions;

causal routing and subagent-prompt behavior;

projection reconstruction and authority rejection;

provider-history isolation; and

absence of Codex, Gajae, or OpenCode runtime invocation.

No file may change after the clean committed-candidate release run. Any change creates a new candidate identity.

Risks / missing evidence:

The legacy compatibility bridge cannot reproduce execution configuration that was never persistently recorded. Its output must remain explicitly marked as a bridge rather than a faithful historical resume.

A local Thread / Turn / Item surface may resemble Codex ergonomics but is not automatically protocol-compatible with Codex app-server. Compatibility must not be claimed without a separate contract and tests.

Static ownership scans are regression controls, not a general proof against every possible future dynamic backend invocation. They should remain paired with runtime integration tests and dependency review.

The product-bound harness path is now represented as integrated, but no empirical result shows that versioning, workflow, routing, or evolution improves task performance.

No live provider, protected benchmark, held-out, temporal, or B0–B6 execution is authorized or evidenced here.

Next authorized scope:

Prepare one narrow Packet 08R clean-commit release seal containing:

parent commit
candidate commit and tree
complete changed-path inventory
canonical binary diff hash
lockfile hash
full post-commit release output
test and schema totals
focused HarnessVersion registry results
root/resume/fork pinning results
workflow/routing/subagent causal results
projection authority-rejection result
standalone-runtime ownership result
package dry run and version result
secret and dependency audit results
clean-worktree evidence
remote ref before push

No Codex runtime, app server, crate, login path, provider backend, new product feature, paid inference, benchmark access, empirical experiment, or research-claim expansion is required for that packet.
