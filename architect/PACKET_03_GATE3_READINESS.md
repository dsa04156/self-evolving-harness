# Architect Packet 3 — Gate 3 Readiness, Real Provider Pending

Status: **READY FOR READINESS REVIEW; NOT CLAIMING GATE 3 COMPLETE**

## Metadata

- Repo: `self-evolving-harness`
- Branch: `main`
- Runtime source commit under test: `3588ef6d2d6d743bd0d831cf847210c7e836ed31`
- Runtime source tree: `2c4e009af7f5fa56f221aa90a793974a91eca369`
- Packet date: 2026-07-31
- Prior Architect decision: Gate 2R `APPROVE`
- Prior response SHA-256:
  `f1fafea24cd2a87722e9ec87e2b796d4fa40b62ab1dfa76780158065727b442c`
- Existing Architect conversation target:
  `https://chatgpt.com/c/6a6b1847-22c8-83e8-9558-8297a43979e0`
- Requested decision: identify whether any implementation blocker remains before the already authorized
  one-call real-provider smoke. Do not approve Gate 3 as complete without that result.

## External disclosure scope

- Destination: the existing project-specific ChatGPT.com Pro architect conversation only.
- Transport: exact-tab continuation at the recorded local Chrome CDP endpoint; no new tab/window.
- Data: architecture summary, synthetic plans, aggregate deterministic results, local toolchain versions,
  source/evidence hashes, synthetic UIDs, and open limitations.
- Excluded: repository/source upload, `.env`, credential values, provider tokens, private-key bytes, raw
  benchmark traces, task content, customer/personal data, and all research splits.
- No provider API call or paid action is performed by this Architect transmission.

## Scope and claim discipline

This packet covers only the bounded scope authorized at Gate 2R:

1. complete signed session definitions;
2. deterministic matched-budget B0–B6 scheduler and numeric-freeze machinery on synthetic tasks;
3. isolated provider credential custody and authenticated invocation;
4. frozen real-provider smoke plan and fail-closed runner;
5. deterministic and fake-provider OS evidence.

It does **not** report a real-provider result. `OPENAI_API_KEY` is absent. No provider request was
transmitted and no cost was incurred.

It also does not access or report benchmark evolution, `D_mine`, `D_gate`, withheld-public, final,
temporal, candidate selection, promotion, canary, empirical B0–B6 comparison, performance,
generalization, security containment, self-improvement, live deployment, push, release, or publication.

The task/evolution distinction remains unchanged:

```text
Task retry/recovery:
  same HarnessVersion + same SessionLifecycle

Harness evolution:
  multiple traces → weakness mining → attribution
  → bounded declarative mutation → new HarnessVersion
  → independent evaluation → recorded promotion/rejection/rollback
```

Nothing in this packet is called evolution.

## Gate 2R follow-up closure

| Gate 2R follow-up | Implemented enforcement | Result |
|---|---|---|
| complete session definition | operations-owned schema-v2 signed definition binds every `SessionPins` field, session ID, creator, and creation time; protocol/hash/signature/schema and canonical dataset permissions revalidate on load | closed |
| one budget freeze | protocol author signs one content-addressed manifest over model/tool/environment/permission pins, method/seed/slot vector, every phase cap, request caps, and source config; changing bytes requires a new protocol | closed for synthetic readiness |
| executable B0–B6 scheduling | B0 has one slot; B1 parallelizes independent slots; remaining arms execute their fixed sequential semantics; matched arms share the exact cap vector and pin set | closed for deterministic synthetic work |
| complete accounting | reserve-before-call, exact attempt/status/token/cost/tool/feedback/process/output/time fields, full reservation for missing usage, no borrowing/overcommit, durable semantic replay, exhaustion and seal | closed for deterministic synthetic work |
| provider credential principal | proxy owns its key/credential and signs receipts; runtime owns neither and invokes only via signed, replay-protected, deadline/correlation-bound Unix frames with bidirectional identity checks | closed |
| OS separation | runtime UID 1102 and provider UID 1106 map to distinct subordinate host UIDs; own 0600 keys, zero capabilities, `NoNewPrivs`, no direct network, denied cross-read/write/signal/ptrace | closed for reported local environment |
| bounded real plan | exact provider/model alias/tier/parameters, pricing observation, request, expected output, attempts/tokens/cost/time/bytes, credential slot, egress destination, broker implementation, and policy hashes | frozen before any call |
| credential-blind egress | planned live path adds UID 1107 as the only networked role; it mounts no credential, authenticates provider UID, permits only `api.openai.com:443`, and relays TLS without termination | implemented; live result pending |
| provider model observation | adapter records both requested alias and provider-reported `response.model`; only the alias or its dated snapshot form is admitted | closed deterministically |

## Session-definition boundary

`SessionDefinition` schema version 2 signs the whole definition:

```text
sessionId
pins:
  protocolId
  harnessVersionId
  runtimeStateSnapshotId
  modelIdentityHash
  toolSetHash
  permissionPolicyHash
  budgetAccountId
  datasetPermissions
createdAt
createdBy
sessionDefinitionHash
attestation
```

Only `operations_owner` may create it. Load verifies the expected protocol, schema, canonical
permissions, core hash, claimed principal identity, public-key identity digest, and Ed25519 signature.
Control-plane start consumes the signed definition rather than accepting separately supplied mutable
pins.

## Deterministic matched-budget machinery

The implemented method identifiers are:

```text
B0
B1
B2
B3
B4
B5-U
B5-SM
B6-ABL
B6-RAW
B6
```

The readiness freeze remains synthetic-only. It cannot read a research split. `B0` remains the
one-direct-slot anchor, while matched Track A arms share the same five-slot ceiling and the same signed:

```text
model identity
tool set
environment
permission policy
rollout seeds
phase caps
per-request token cap
per-request cost cap
```

Each method/task receives a separate phase account, so unused budget cannot be lent across methods.
Reservations include both tokens and cost before dispatch. Failed/cancelled/no-usage calls settle with
their frozen full reservation. Semantic sequence validation reconstructs every signed ledger after
restart and rejects unauthorized dimension changes. A sealed or exhausted account cannot start new
work.

This implementation demonstrates accounting/scheduling conformance only. It contains no empirical
method outcome and does not freeze research pilot numbers.

## Provider proxy and evidence path

The deterministic OS path actually exercised is:

```text
runtime uid/gid 1102
  └─ authenticated Unix request
       └─ provider proxy uid/gid 1106
            ├─ owns Ed25519 key (0600)
            ├─ owns synthetic credential (0600)
            ├─ no direct network
            └─ signed redacted response/usage receipt
```

The preregistered real path is:

```text
runtime uid/gid 1102 (no network, no provider key)
  └─ SO_PEERCRED + signed framed Unix protocol
       └─ provider uid/gid 1106 (credential owner, no direct network)
            ├─ exact request and one-call budget
            ├─ TLS validation and API authorization header
            └─ canonical CONNECT
                 └─ egress uid/gid 1107 (network, no vault/config/key)
                      └─ exact api.openai.com:443 opaque-byte relay
```

The egress broker neither receives the API key nor terminates TLS. The runtime cannot open the egress
socket because its UID is not the provider socket group. Sticky IPC directories prevent a foreign role
from replacing another role's socket. Provider/runtime sandboxes mount only role-specific state and
keys; the egress sandbox mounts no project vault or provider config.

## Frozen real-provider smoke

Canonical plan:

```text
purpose:             synthetic_non_benchmark_provider_smoke
dataset permission:  deterministic only
provider API:        OpenAI Responses
requested model:     gpt-5.6-luna
local model identity:
  openai:gpt-5.6-luna@alias-observed-2026-07-31
reproducibility:     provider_alias_non_snapshot_smoke_only
service tier:        default
reasoning effort:    none
store:               false
parallel tools:      false
tools:               []
max output tokens:   32
attempts:            1
charged-token cap:   256
provider-cost cap:   1,000 micro-USD
wall time:           60,000 ms
request bytes:       32,768
response bytes:      262,144
tunnel bytes:        2,097,152
egress:              api.openai.com:443
expected output:     SYNTHETIC_PROVIDER_OK
harness mutation:    forbidden
```

Observed pricing is frozen as USD 1.00/M uncached input, USD 0.10/M cached input, USD 1.25/M cache
write, and USD 6.00/M output. The observation is not represented as a permanent provider guarantee.
The recorded official-documentation observations are:

- `https://developers.openai.com/api/docs/models/gpt-5.6-luna`
- `https://developers.openai.com/api/docs/guides/latest-model`

Hashes:

```text
canonical plan:
  sha256:0e51e4b743af62bd8249349df6bb27e288fb2f934286503eea202d8b1e74cbd0

canonical pricing source:
  sha256:264ac32014b845baa24a3134826d4577c052ac21d90742df59f124e55417348d

raw egress broker bytes:
  sha256:d696aee6582ebdf74c9adf48e1cc69254fb49cc2c5adcfc05f5e9fb46fa36fdd

canonical egress policy:
  sha256:99dc5a00135e06d890799c9ea39f4f3c5c8cacce3dfe0187b8fa29e480207229
```

The runner:

- validates schema, model/request/caps, pricing projection, and every hash without reading credentials;
- requires a clean exact source commit and rechecks source status before, during, and after the call;
- rejects symlinked source artifacts and refuses to overwrite an existing evidence directory;
- deletes `OPENAI_API_KEY` from its environment before spawning any child;
- writes the key only to a provider-owned protected file inside a temporary root;
- passes a cleared environment to rootlesskit and all sandboxes;
- preserves a signed public pre-call bundle before invocation;
- permits one request only and emits a signed completed/failed/cancelled/budget-exhausted receipt;
- charges the full reservation if usage is missing;
- requires exact expected output, three-principal OS evidence, and no known secret in subprocess output
  or retained evidence;
- deletes the temporary secret root after termination.

## Provider-reported model correction

The initial adapter only recorded the requested alias. That was insufficient. The source-under-test now:

1. records `requestedApiModel` and provider-returned `response.model`;
2. passes both through normalization and the signed result schema;
3. admits only `gpt-5.6-luna` or `gpt-5.6-luna-YYYY-MM-DD`;
4. emits a signed `PROTOCOL_MISMATCH` failure with no response release for another model.

This does not claim access to immutable weights. It makes the observed provider identifier auditable and
keeps the alias limitation explicit.

## Validation

Environment:

```text
Node.js runtime/test: v24.18.1
npm:                  11.18.0
Python gate:          3.12.3
bubblewrap:           0.9.0
rootlesskit:          2.3.6
kernel:               Linux 7.0.0-28-generic x86_64 GNU/Linux
```

Results on the source commit:

```text
npm run check
  pass

npm run build
  pass

npm run cli -- check-schemas
  compiledSchemas=53

full deterministic + required OS suite:
  tests=59
  pass=59
  fail=0
  cancelled=0
  skipped=0
  todo=0
  line coverage=90.8724%
  branch coverage=85.2876%
  function coverage=88.7681%

npm run smoke:real -- --validate-plan
  status=validated_no_call
  credentialInspected=false
  networkCallAttempted=false
```

Fake-provider OS evidence:

```text
isolationClass=os_enforced_provider_proxy
runtime UID=1102
provider UID=1106
host mapped UIDs distinct=true
runtime credential read denied=true
runtime/provider direct network denied=true
provider private key owner=1106
provider synthetic credential owner=1106
signed receipt status=completed
known synthetic credential redacted=true
```

Retained evidence:

```text
provider-os-evidence.json
  3ee26891e7ccd24b888af6608eaf2062a680be32f94aecd776ffbfe11cd00c34

provider-smoke-manifest.json
  3df39d5be1d2130aac2a7cb787399e00656f7af70d7aa8b1c02eb288442a4d77

provider-budget-freeze.json
  70754dc8ca684a8acbc4638e76dee62c17186e2b437ae2d4eeb09b763af813dd

provider-synthetic-request.json
  62a4d677d3ca6b8db6ce78b6fd8f78b1d2cd03cf0c8d81a253e163c95165d613
```

## Real-provider disposition

```text
OPENAI_API_KEY=absent
real provider attempts=0
real charged tokens=0
real provider cost=0
real response=none
real receipt=none
real three-principal egress evidence=none
```

A ChatGPT browser login is intentionally not treated as API authorization. No browser cookies, local
storage, session headers, or account tokens were extracted.

Therefore this packet must not be interpreted as a successful provider smoke or a completed Gate 3.

## Threat disposition

Closed for the reported deterministic/local boundary:

- credential ownership and runtime denial;
- peer authentication, signatures, replay/deadline/correlation checks;
- direct-network denial for credential-bearing provider and runtime roles;
- exact CONNECT admission and TLS retained by the provider role;
- one-call/token/cost/time/byte caps;
- provider usage/cost recomputation, redaction, failure, overage, and replay;
- source/plan/price/broker/policy drift checks;
- provider-reported model recording and admission.

Residual/out of claim:

- malicious host root/kernel or bootstrapping administrator;
- CA/private-key compromise, dependency compromise, or provider-side identity misreporting;
- DNS/traffic-analysis denial or leakage at the egress broker;
- semantic/encoded secret exfiltration beyond literal seeded-secret scanning;
- model alias drift and opaque serving implementation;
- actual live-path behavior until a real-provider receipt exists.

## Open fields and blockers

1. The one preregistered real-provider smoke has not executed because no API key is available.
2. The public model name is an alias, not a stable snapshot; the smoke remains smoke-only.
3. Research pilot numeric values and the research protocol ID remain unfrozen.
4. Research split capabilities remain disabled.
5. No empirical outcome supports H1/H2/H3/H4, B0–B6 superiority, generalization, or self-improvement.
6. No production containment, deployment, push, release, or publication claim is authorized.

## Decision requested

Apply the prior strict standard.

- Do **not** return Gate 3 complete/approved without a real-provider result.
- Return `REVISE` if the only mandatory remaining item is execution and verification of the already
  frozen one-call synthetic smoke.
- List a minimum ordered implementation correction first if another non-waivable defect exists.
- Return `BLOCK` if the provider/principal/budget design cannot satisfy the accepted boundary.

If no other implementation blocker exists, authorize only:

1. user provisioning of `OPENAI_API_KEY` through the protected runner input;
2. one execution of the exact frozen synthetic smoke;
3. preservation and verification of its signed receipt and three-principal evidence;
4. resubmission of replacement hashes/results.

Continue to prohibit benchmark/pilot/research split access, empirical comparison, harness mutation,
candidate selection, promotion, deployment, push, release, and all performance/generalization/
self-improvement/security claims.

## Required response format

```text
DECISION: APPROVE | REVISE | BLOCK

NOVELTY:
CORRECTNESS:
REPRODUCIBILITY:
SECURITY:
CLAIM DISCIPLINE:

REAL_PROVIDER_DISPOSITION:
BLOCKING FINDINGS:
DEFERRABLE FINDINGS:
MINIMUM ORDERED CORRECTIONS:
AUTHORIZED NEXT SCOPE:
```
