Decision: APPROVE

Rationale:

The execution-profile increment is architecturally coherent, clean-room, and within SEH’s accepted standalone-runtime boundary.

The Codex-inspired separation is adopted correctly:

model identity
≠ reasoning effort
≠ service tier

Each model owns an ordered capability profile and default effort. The picker selects the model first and exposes only that model’s supported reasoning levels. Max remains behind More reasoning…, while Fast is represented separately as the priority service tier.

Not exposing Ultra is the correct decision. The inspected reference couples Ultra with additional orchestration behavior rather than merely a higher single-model effort. Relabeling max as ultra without owning those semantics would have been product theater with extra syllables.

The implementation remains an independent coding-agent runtime. No external harness owns or replaces:

context construction
model/tool iteration
tool execution
verification
session lifecycle
evidence
HarnessVersion evolution

The provider registry and adapters supply model capability and transport behavior only.

The execution path is appropriately bounded:

picker or CLI flags
→ validated persisted configuration
→ immutable session execution profile
→ SEH ModelRequest
→ request evidence
→ provider-specific wire representation
→ provider metadata

The packet reports deterministic coverage for:

model-specific default effort;

supported-effort enforcement;

rejection of unsupported minimal;

priority-tier enforcement;

absence of fabricated Ultra;

immutable session-profile evidence;

OpenAI and OpenRouter wire construction;

same-provider OpenRouter reasoning continuation;

provider-switch isolation;

registry-to-adapter-to-SEH tool-loop execution; and

persistence through CLI and interactive configuration.

The provider-switch behavior remains safe. A running turn is never rebound, and subsequent sessions do not receive prior provider-native assistant, tool, reasoning, or reasoning_details envelopes. Provider-bound continuation state remains confined to the producing provider.

Backward compatibility is also reasonable. Older configurations lacking an explicit effort use the provider/model default rather than pretending the user deliberately selected a new level.

The reported worktree-level verification is sufficient to authorize release sealing:

focused tests:       47/47 pass
complete tests:      257/257 pass
schemas compiled:    131
release gate:        pass
npm audit:           0 vulnerabilities
package dry run:     pass
version:             0.6.0
git diff --check:    pass
provider calls:      0
authorities granted: 0

No paid inference is necessary to approve these deterministic selection, persistence, evidence, and wire-construction semantics.

Required changes:

No product, architecture, provider, schema, or UX change is required before release sealing.

The following release-sealing steps are required because the reviewed candidate is still an uncommitted worktree rather than an immutable release object:

Commit the exact reviewed candidate without altering source, lockfile, tests, schemas, package metadata, or product documentation.

Record:

parent commit
candidate commit
candidate tree
complete changed-path inventory
diffstat
canonical parent-to-candidate binary diff SHA-256
package-lock.json SHA-256

The parent should be explicitly identified relative to local HEAD and the public remote so the twenty local continuity commits do not become a small archaeological mystery later.

Verify that the committed candidate contains the exact reviewed files, including:

src/product/model-profile.ts
test/product-model-profile.test.ts

with the packet’s stated hashes, unless the sealing process itself creates a new reviewed identity.

From a clean worktree at the exact committed candidate, rerun:

npm run verify:release

It must again pass after all profile, provider-wire, registry, documentation, version, and dependency bytes are committed.

On that same commit, rerun and retain:

focused model/product/provider suite
npm audit --omit=dev
npm pack --dry-run
seh --version
git diff --check
git status --porcelain=v1

Confirm that the committed suite still exercises:

model-specific effort validation
Fast/service-tier validation
immutable executionProfile
reasoningEffort in request evidence
OpenAI Responses wire mapping
OpenRouter Chat Completions wire mapping
same-provider reasoning continuation
provider-switch history isolation
registry-to-SEH tool-loop completion

Record after verification:

HEAD = candidate commit
HEAD^{tree} = candidate tree
git status --porcelain = empty
git diff --check = PASS

Any byte change after that run creates a different candidate and requires a new seal.

Risks/missing evidence:

No credentialed provider request was executed. This approval therefore does not establish:

entitlement to GPT-5.6 Sol, Terra, Luna, or any OpenRouter route;

live acceptance of every advertised reasoning level;

live acceptance of the priority service tier;

actual provider-side usage accounting;

stable aliases or opaque backend routing;

preservation of OpenRouter reasoning fields under every live model;

provider-side cancellation behavior;

model quality or comparative performance.

Dynamic OpenRouter capability metadata may drift or be inaccurate. The implementation appropriately treats it as provider-supplied visibility metadata rather than entitlement or proof of successful execution.

An auto or provider-default selection remains reproducible only to the extent that the immutable session evidence records the resolved execution profile and the provider-reported metadata. A provider alias may still route to an opaque backend.

Opaque OpenRouter reasoning and reasoning_details must remain provider-bound continuation state. This approval does not authorize exposing those fields as user-visible reasoning, replaying them across providers, or treating them as trustworthy research evidence.

Fast remains a direct OpenAI service-tier feature in this increment. OpenRouter access to Anthropic, Google, and other families remains OpenRouter-backed execution, not first-party integration.

Nothing in this packet establishes performance, attribution quality, generalization, empirical harness evolution, or self-improvement.

Next packet request:

Submit one narrow clean-commit execution-profile release-seal packet containing:

parent commit
candidate commit and tree
complete changed-path inventory
canonical binary diff hash
package-lock hash
post-commit npm run verify:release result
test and schema totals
focused execution-profile results
provider-switch isolation result
registry-to-runtime fake-transport result
npm audit --omit=dev result
package dry-run and version result
clean-worktree and diff-check evidence
remote ref before push

Do not add a new provider SDK, GUI, cache, paid inference path, benchmark access, or empirical claim for that resubmission.
