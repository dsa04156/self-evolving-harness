# Gate 3 Readiness Validation

Status: deterministic and OS-boundary controls pass; real-provider result not executed

## Source under validation

```text
runtime source commit:
  3588ef6d2d6d743bd0d831cf847210c7e836ed31

runtime source tree:
  2c4e009af7f5fa56f221aa90a793974a91eca369
```

During the runtime OS-evidence generation itself, the only untracked paths were evidence outputs under
`architect/evidence/gate3/`. Packet and validation documents were authored afterward. No source
modification is included in the runtime evidence commit.

## Deterministic validation

```text
npm run check
  pass

npm run build
  pass

npm run cli -- check-schemas
  {"compiledSchemas":53}

SEH_REQUIRE_OS_BOUNDARY=1 \
  npx -y node@24.18.1 --import tsx --test \
  --experimental-test-coverage \
  --test-reporter=./scripts/summary-test-reporter.mjs \
  test/**/*.test.ts

result:
  tests=59
  passed=59
  failed=0
  cancelled=0
  skipped=0
  todo=0
  line=90.8724%
  branch=85.2876%
  function=88.7681%
```

The suite includes:

- signed complete session definitions;
- signed budget freeze and semantic phase-ledger replay;
- deterministic B0–B6 plan pins, equal matched-arm slots/caps, no budget borrowing, full-reservation
  failure accounting, exhaustion, and sealing;
- provider freeze, pricing/cost recomputation, response normalization, redaction, failure, overage,
  replay, Unix peer authentication, and distinct-UID credential custody;
- exact CONNECT allowlist behavior;
- closed real-smoke request/model/cap/price/broker/policy plan validation;
- symlink and post-freeze drift rejection;
- validation-mode credential non-inspection and no-call behavior;
- missing-credential fail-closed behavior;
- OpenAI Responses request construction and provider-reported model capture;
- dated requested-model snapshot admission and unrelated-model rejection.

## Provider principal OS evidence

This is a fake-provider transport/secret-injection test. It is not a real-provider result.

```text
test:
  provider credential and signing authority live under a distinct subordinate UID

result:
  tests=1 pass=1 fail=0 cancelled=0 skipped=0 todo=0
  isolationClass=os_enforced_provider_proxy
  runtime UID/GID=1102/1102
  provider UID/GID=1106/1106
  mapped host UIDs are distinct
  runtime credential read denied=true
  runtime/provider direct network denied=true
  provider key and credential owner=1106
  receipt status=completed
  known synthetic secret redacted=true
```

Retained artifacts:

```text
architect/evidence/gate3/provider-os-evidence.json
architect/evidence/gate3/provider-smoke-manifest.json
architect/evidence/gate3/provider-budget-freeze.json
architect/evidence/gate3/provider-synthetic-request.json
```

## Real-provider pre-call validation

```text
npm run smoke:real -- --validate-plan

status=validated_no_call
planHash=sha256:0e51e4b743af62bd8249349df6bb27e288fb2f934286503eea202d8b1e74cbd0
pricingSourceHash=sha256:264ac32014b845baa24a3134826d4577c052ac21d90742df59f124e55417348d
brokerImplementationHash=sha256:d696aee6582ebdf74c9adf48e1cc69254fb49cc2c5adcfc05f5e9fb46fa36fdd
egressPolicyHash=sha256:99dc5a00135e06d890799c9ea39f4f3c5c8cacce3dfe0187b8fa29e480207229
credentialInspected=false
networkCallAttempted=false
```

`OPENAI_API_KEY` was absent. Consequently:

- no provider request was transmitted;
- no paid token or provider cost was incurred;
- no real-provider response, reported model, usage, receipt, or three-principal live egress evidence
  exists;
- no benchmark, mine, gate, withheld-public, temporal, candidate, harness mutation, or promotion path
  was accessed.

## Toolchain

```text
Node.js test/runtime: v24.18.1
npm:                  11.18.0
Python gate:          3.12.3
bubblewrap:           0.9.0
rootlesskit:          2.3.6
kernel:               Linux 7.0.0-28-generic x86_64 GNU/Linux
package-lock SHA-256: 6067e8a69a6adfbf2f0f5eb7f395b5afb6dd114b74c131e55cd3f3c8986d3ed2
```

## Disposition

The deterministic runtime, matched-budget machinery, provider credential boundary, exact plan, and
fail-closed runner are ready for review. Gate 3 itself is not claimed complete because the one authorized
real-provider smoke has not run and pilot numeric research budgets remain unfrozen.
