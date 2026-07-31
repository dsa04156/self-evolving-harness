# No-Paid-Provider Development Profile (`NP-1`)

Status: active deterministic-development profile

Date: 2026-07-31

## Resource fact

The available OpenAI entitlement is Codex CLI subscription access. No OpenAI Platform API credential
is provisioned for this project. A browser or Codex login is not copied, exported, or repurposed as a
provider credential.

## Allowed work

- source-level prior-art analysis with exact provenance;
- standalone runtime, component, operations, evidence, evolution, and trust-plane implementation;
- deterministic `FakeProvider` and fake-tool execution;
- synthetic non-research fixtures;
- schema, type, build, unit, integration, crash-recovery, and OS-boundary tests;
- documentation, threat-model refinement, negative-result preservation, and external architecture
  review that does not transmit secrets or sealed data.

## Disallowed substitutions

- spawning Codex CLI as the model-provider adapter;
- importing Codex as the core runtime;
- extracting Codex or browser authentication material;
- describing Codex-authenticated development work as a run of the new harness;
- treating fake-provider success as provider interoperability or model-quality evidence.

## Deferred work

The preregistered OpenAI Responses smoke remains retained but unexecuted. It may be run only if a
separate Platform API credential is deliberately provisioned later. Until then:

- Gate 3 provider interoperability remains `REVISE`;
- no research-task pilot, benchmark evolution, held-out evaluation, or performance comparison runs;
- no provider reproducibility, empirical improvement, generalization, or self-improvement claim.

## Exit criteria

Leaving `NP-1` requires a new explicit resource decision, verification that the credential belongs to
the intended provider account, and reuse or versioning of the frozen smoke protocol as required by its
audit history. Codex CLI subscription access alone does not satisfy that criterion.
