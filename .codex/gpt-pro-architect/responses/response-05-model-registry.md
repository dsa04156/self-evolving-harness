Decision: REVISE

Rationale:

The model-registry increment is architecturally sound and, on the packet’s evidence, closes the original “too few models / provider-fixed picker” defect at the deterministic implementation level.

The runtime remains independently owned by SEH. OpenRouter supplies a model transport and catalog, not an external agent loop. SEH still owns:

context construction
model/tool iteration
tool execution
verification
sessions and evidence
HarnessVersion evolution

The implementation also preserves the important provider boundaries:

/model selects an explicit (provider, model) pair.

OpenRouter has an executable native Chat Completions adapter rather than a decorative catalog row.

Hidden SDK retries are disabled.

Usage, cancellation, tool calls, and provider-reported model identity are handled by SEH.

Provider-producing history is identified and cross-provider replay is rejected.

The OpenRouter endpoint is fixed.

Credentials remain environment-only.

Catalog redirects fail closed.

Response bytes and row counts are bounded.

Live discovery failure falls back to bundled examples.

Catalog visibility is not represented as entitlement.

No first-party Anthropic or Google adapter, GUI, persistent catalog cache, or paid inference is necessary to approve this increment. OpenRouter-backed execution is sufficient for the stated feature boundary.

Two release blockers remain.

First, the final candidate has no immutable identity. It is described as an uncommitted worktree diff, with no candidate commit, tree, canonical patch hash, package-lock identity, or complete changed-path inventory. The exact bytes reviewed therefore cannot be distinguished from bytes edited five minutes later because someone noticed a comma and decided civilization depended on it.

Second, the reported full release gate predates the final bounded-stream and redirect hardening and the fast-uri dependency update. The current bytes received:

TypeScript check
33 focused tests
schema compilation
live catalog observation
npm audit

but not the complete npm run verify:release run. The earlier 244/244 result cannot be attributed to the final candidate after source and dependency bytes changed.

The increment is therefore not rejected on architecture. It is REVISE because the exact release candidate and its full regression evidence are not yet sealed.

Required changes:

Commit the exact final candidate before any push. Record:

parent commit
candidate commit
candidate tree
canonical parent-to-candidate binary diff SHA-256
complete changed-path inventory
diffstat
package-lock.json SHA-256

Ensure the committed candidate includes the final:

bounded catalog streaming
redirect rejection
OpenRouter adapter behavior
provider registry and configuration
model-picker behavior
fast-uri 3.1.5 dependency resolution
version/package changes

No source, lockfile, test, or documentation byte may change after the verification run without creating a new candidate identity.

From a clean worktree at that exact commit, rerun:

npm run verify:release

The full release gate must pass after all final hardening and dependency changes. Report the resulting test and schema totals rather than assuming they remain 244 and 131.

On the same committed candidate, rerun and report:

OpenRouter/product/TTY focused deterministic suite
npm audit --omit=dev
npm pack --dry-run
seh --version
git diff --check
git status --porcelain

The audit result is a point-in-time dependency observation, but it must at least correspond to the lockfile being proposed for release.

Seal one explicit transition test for /model and provider-bound history. When an existing session contains assistant or tool-call history produced by another provider, provider selection must do exactly one documented thing:

apply only to a newly created session
defer until the next session
or reject the switch with a clear state-preserving error

It must never silently replay provider-bound assistant/tool history into the newly selected provider. A deterministic fake transport is sufficient; no paid call is required.

Include a deterministic execution test proving that a selected OpenRouter registry row or custom OpenRouter ID resolves through:

registry
→ validated fixed-endpoint configuration
→ OpenRouter adapter
→ SEH-owned model/tool loop
→ verifier completion

The test must use a fake transport and must not require an OpenRouter credential.

After all checks, record:

HEAD = declared candidate commit
HEAD^{tree} = declared candidate tree
git status --porcelain = empty
git diff --check = PASS

Do not push before this release-sealing evidence is reviewed.

Risks/missing evidence:

A passing deterministic adapter suite will establish implementation semantics, not live inference interoperability. No paid provider request was made, so the following remain unproven:

account entitlement to any discovered model;

actual tool-call behavior for every OpenRouter route;

stable provider aliases or serving backends;

accurate provider-side capability metadata;

provider-side cancellation timing;

reproducibility of opaque routed inference.

The live counts:

258 tool-capable OpenRouter routes
293 displayed registry routes
17 “claude” matches

are operational observations, not frozen acceptance thresholds. They may drift without constituting a regression, provided the bounded discovery, validation, fallback, and search contracts remain intact.

The absence of a cross-process TTL cache is not a release blocker. It is a latency and availability limitation.

OpenRouter-backed access to Anthropic, Google, and other vendors must continue to be described as OpenRouter execution, not as first-party SDK integration.

No evidence in this packet supports performance, model quality, research generalization, harness evolution, or self-improvement claims.

Next packet request:

Submit one narrow clean-commit model-registry release-seal packet containing:

base commit
candidate commit and tree
complete changed-path inventory
canonical binary diff hash
package-lock hash
full post-hardening npm run verify:release output
focused deterministic OpenRouter/model-picker results
provider-switch history test result
fake-transport registry-to-runtime execution result
npm audit --omit=dev result
package dry-run and version result
clean-worktree and diff-check evidence
remote ref before push

No new provider SDK, GUI, persistent cache, paid inference, benchmark access, architecture expansion, or empirical claim is required for that resubmission.
