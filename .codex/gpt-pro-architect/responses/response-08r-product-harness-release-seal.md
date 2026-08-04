Decision: APPROVE

Rationale:

The Packet 08 release-sealing requirements are satisfied for the exact committed candidate:

expected parent / current public remote:
e816af35dc2abdb61ede5a5403723cc2d76a1827

candidate commit:
9c13755aca6028b352ce5d1390675686b0ab7d83

candidate tree:
76010b3b08f3ce1cc7fa1e16cbad12e36df74a3c

parent-to-candidate binary diff SHA-256:
ad11345327e204496083b8f0050c503b427b2f1492280f8516ad3207e5b1cb2d

package-lock.json SHA-256:
30a10f72d37da039ac1295cc11ded3e04c64cf05ffc6668cc5d8796ee8584043

The complete 39-path inventory is supplied. The candidate is one ordinary commit directly ahead of the observed public remote, with no merge, rebase, squash, amendment, or history rewrite.

The earlier candidate was correctly invalidated when the clean release gate exposed a stale provider-switch expectation. The corrected behavior now matches the accepted contract:

execution-affecting configuration change
→ detach from prior pinned thread
→ create a new root thread

The invalidated candidate was neither pushed nor presented as final release evidence. The corrected source and test bytes received a new commit identity and were fully reverified. That is exactly how a failed release candidate should be handled, rather than being cosmetically encouraged until the test turns green out of embarrassment.

The release gate was run from a separate detached worktree at the exact committed candidate, using dependencies from the committed lockfile. It passed with:

TypeScript strict check: PASS
build: PASS
tests: 265/265
JSON Schemas compiled: 132
fake-provider demo: completed → retired
verification passed: true
development process boundary: verified
provider used: false
promotion authorized: false
research evidence authorized: false
publication governance: PASS
historical publication governance: PASS
post-corrective secrets: 0
post-corrective environment paths: 0
trust-plane conformance: verified
authorities granted: 0
outstanding empirical obligations: 7

The focused 15-test product/runtime boundary suite directly covers the material Packet 08 requirements:

identical execution configurations resolve to the same content-addressed HarnessVersion;

an execution-affecting configuration change creates a different version;

provider, model, reasoning effort, and service tier are recovered from the pinned version;

resume and fork retain the exact pinned version and behavior closure despite current configuration drift;

fork lineage remains explicit;

the legacy bridge remains a separately identified compatibility path, not an exact historical replay claim;

tool-description and immutable implementation/schema misbinding is rejected;

runtime-contract mismatch is rejected;

workflow transitions causally control execution;

routing and pinned subagent prompts causally control child-agent behavior;

high-risk routes remain on the primary agent;

Thread/Turn/Item projections reconstruct from source events and are rejected as authority;

provider switching creates a detached root without replaying provider-bound history; and

no Codex, Gajae-Code, or OpenCode runtime dependency, import, or process invocation enters the product path.

The Round 07 authority path is therefore represented in the sealed release candidate:

ProductExecutionConfig
→ persistent typed HarnessComponents
→ content-addressed HarnessVersion
→ immutable session pin and lineage
→ SEH-owned runtime execution
→ projection-only Thread / Turn / Item surface

The Codex boundary remains intact. Codex is used as a source-provenance-controlled interaction-pattern reference, not as the executor, app-server backend, provider, login service, session store, or runtime authority.

The package checks also correspond to the exact candidate:

npm audit --omit=dev: 0 vulnerabilities
npm pack --dry-run: PASS
package version: 0.8.0
installed seh --version: 0.8.0
git diff --check: PASS
git status --porcelain: empty

The final observed commit and tree match the declared release identity, and the candidate did not change after verification.

Required changes:

None to the exact release object:

commit:
9c13755aca6028b352ce5d1390675686b0ab7d83

tree:
76010b3b08f3ce1cc7fa1e16cbad12e36df74a3c

It is approved for one unchanged expected-old guarded fast-forward from:

e816af35dc2abdb61ede5a5403723cc2d76a1827

Immediately before pushing, the remote must still equal that expected old head. The push should use an atomic lease or equivalent server-enforced expected-old check.

If the remote has moved, stop. Do not merge, rebase, amend, squash, cherry-pick, or force-rewrite this candidate. Any byte or ancestry change creates a new release identity and does not inherit this approval.

After publication, rerun:

npm run verify:release

from exact commit 9c13755... and verify:

remote main = local HEAD = 9c13755aca6028b352ce5d1390675686b0ab7d83
HEAD^{tree} = 76010b3b08f3ce1cc7fa1e16cbad12e36df74a3c
git status --porcelain = empty
git diff --check = PASS

Risks/missing evidence:

This approval establishes deterministic product-to-HarnessVersion integration and release integrity. It does not establish:

live-provider interoperability;

account entitlement or provider-side model availability;

exact reproduction of legacy sessions whose original product configuration was never recorded;

protocol compatibility with the Codex app server;

B0–B6 matched-budget performance;

held-out or temporal improvement;

attribution-guided regression reduction;

evidence-token efficiency;

cross-model transfer;

empirical harness evolution;

self-improvement;

production containment; or

security certification.

The legacy-current bridge remains a compatibility mechanism. It must not be described as exact reconstruction of an unknown historical harness or admitted as reproducible research evidence.

The Thread/Turn/Item interface remains an SEH-native projection inspired by observed interaction patterns. It is not automatically wire-compatible with Codex and cannot satisfy runtime completion, audit, evaluation, promotion, or rollback authority.

The static no-Codex ownership test is an important regression check, but it remains bounded to the imports, dependencies, and process-launch paths it inspects. The authoritative architectural requirement remains that no Codex runtime or app-server backend may enter the SEH execution path.

The bounded verdict is:

product HarnessVersion integration = PASS
workflow/routing/subagent causality = PASS
session resume/fork pinning         = PASS
projection non-authority            = PASS
Codex runtime independence          = PASS
release identity                    = PASS

empirical research claims           = NOT TESTED
overall self-improvement claim      = NOT ESTABLISHED

Next packet request:

After the unchanged fast-forward publication, submit only a minimal Packet 08S post-publication closure containing:

expected old remote head
observed new remote head
local HEAD and candidate tree
proof remote = local = 9c13755aca6028b352ce5d1390675686b0ab7d83
post-push npm run verify:release result
test and schema totals
publication and historical continuity results
secret and environment-path scan totals
trust-plane authority state
git status --porcelain
git diff --check

No new feature, Codex integration, provider call, benchmark access, empirical experiment, promotion, deployment, or research-claim expansion is required for that closure.
