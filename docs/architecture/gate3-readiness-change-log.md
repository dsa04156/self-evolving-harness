# Gate 2R → Gate 3 Readiness Change Log and Open Fields

Status: implementation-complete checkpoint; real-provider call pending credential availability

## Closed Gate 2R follow-ups

| Follow-up | Implementation | Evidence |
|---|---|---|
| complete session-definition coverage | operations-owned schema-v2 definition signs the complete `SessionPins`, session ID, creator, and time; hash/signature/schema/protocol and canonical dataset permissions revalidate on load | `0eab979`; deterministic tamper and persistence tests |
| executable matched-budget B0–B6 machinery | signed one-protocol `BudgetFreezeManifest`; phase accounts reserve before calls, charge failures/cancellations, prevent borrowing/overcommit, persist semantic ledgers, and seal exhaustion; scheduler fixes B0 at one slot and matched arms at equal slot/cap pins | `907f804`; four deterministic matched-budget tests |
| provider credential custody | provider proxy owns credential and signing authority; runtime reaches it only over a signed, replay-protected, peer-credential-checked Unix protocol | `e36ecba`; fake-provider proxy, failure, overage, replay, and Unix boundary tests |
| actual OS principal separation | runtime UID 1102 and provider UID 1106 have different subordinate host UIDs, 0600 keys, no direct network, zero capabilities, `NoNewPrivs`, and denied cross-read/write/signal/ptrace | `683b14a`; retained Gate 3 fake-provider OS evidence |
| preregistered real-provider plan | exact synthetic request, alias/service tier/reasoning/store/tools, pricing observation, one-call token/cost/time/byte caps, exact CONNECT destination, broker bytes, and egress policy are closed by schema and hashes | `d14685a`; validation and drift-negative tests |
| credential-blind real egress | provider/runtime remain networkless; UID 1107 alone retains network, accepts provider UID over one Unix socket, connects only to `api.openai.com:443`, and never terminates TLS | `d14685a`; CONNECT allowlist test and three-principal runner |
| provider-reported model evidence | adapter records both requested alias and `response.model`; proxy admits the alias or a dated snapshot of it, otherwise returns a signed protocol-mismatch receipt | `3588ef6`; adapter, accepted-snapshot, and rejected-model tests |

## Frozen real-smoke contract

- Purpose: `synthetic_non_benchmark_provider_smoke`.
- Dataset permission: only `deterministic`.
- Provider: OpenAI Responses API.
- Requested API model: `gpt-5.6-luna`.
- Reproducibility tier: `provider_alias_non_snapshot_smoke_only`.
- Service tier: `default`; reasoning effort: `none`; `store=false`; tools: none.
- Attempts: 1.
- Charged-token ceiling: 256.
- Provider-cost ceiling: 1,000 micro-USD.
- Wall-clock ceiling: 60,000 ms.
- Request/response byte ceilings: 32,768 / 262,144.
- Tunnel ceiling: 2,097,152 bytes.
- Expected output: exactly `SYNTHETIC_PROVIDER_OK`.
- Harness mutation, benchmark access, retry, candidate selection, and promotion: forbidden.

Changing any frozen field requires a new plan hash and a new source commit before the first call.

## Intentionally unresolved

1. **Real-provider result:** `OPENAI_API_KEY` is absent. No API call, cost, provider response, or
   real-provider receipt exists.
2. **Snapshot identity:** the public model identifier is an alias. A successful smoke must preserve the
   provider-reported model; it does not make the alias reproducible.
3. **Pilot numeric freeze:** synthetic budget machinery exists, but research-task pilot values, precision
   outcomes, and any protocol-v1 research budget remain unfrozen.
4. **Research data authorization:** mine/gate/withheld-public/temporal task access remains disabled.
5. **Empirical claims:** there is no B0–B6 task result, evolution result, held-out result, performance
   claim, generalization claim, or self-improvement claim.
6. **Containment scope:** evidence supports the reported local Linux/rootlesskit/bubblewrap configuration
   only; malicious host root/kernel, CA compromise, and provider-side identity misreporting remain outside
   the claim.
7. **Production lifecycle:** no push, release, live deployment, or publication is authorized.

## Next irreversible gates

1. Start from a clean commit and a newly absent output directory.
2. Provision an API key through `OPENAI_API_KEY`; never through a browser session.
3. Execute exactly `npm run smoke:real -- --run`.
4. Preserve the pre-call bundle even if the call fails.
5. Require the signed receipt, exact output, three-principal isolation evidence, and public secret scan.
6. Resubmit to the Architect before any research-task pilot or benchmark evolution.
