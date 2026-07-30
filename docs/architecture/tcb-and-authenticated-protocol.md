# Trusted Computing Base and Authenticated Protocol

Status: Gate 1R design contract

## Trusted computing base

The MVP TCB is intentionally explicit:

- Linux kernel, namespace/cgroup/seccomp enforcement, filesystem and container runtime;
- bootstrapping host administrator for creating distinct identities and read-only mounts;
- protocol author key and protocol/type-registry manifests;
- operations supervisor, tool broker, provider proxy, evaluator, promoter, deployment registry, audit
  verifier/store, and their pinned executable/environment digests;
- permission, safety, budget, redaction, network, promotion, split, and verifier policies;
- cryptographic library, key store, canonicalizer, JSON Schema validator, locked language runtimes, and
  dependency lockfiles.

Git, worktrees, prompts, candidate content, model outputs, task text, mutable memory, proposer output,
runtime workspaces, and database projections are outside the TCB.

The host root/kernel/container runtime are trusted for isolation. A malicious host administrator or
kernel can read secrets, forge processes, roll back storage, or replace binaries and is outside the MVP
containment claim. The design provides tamper evidence against unprivileged principals and accidental
operator changes, not protection from a fully compromised host.

## External trust assumptions

- The model provider is trusted to return the bytes and usage metadata associated with a request ID, but
  not assumed to expose a model-weight digest or remain behaviorally stationary. Drift is a measured
  reproducibility risk.
- The audit-store operator is trusted for availability. Integrity depends on signatures, protocol-pinned
  keys, read-only published heads, and optional external checkpoints; a privileged operator controlling
  all keys and checkpoints can rewrite history.
- The benchmark author is trusted to follow blinding and authorship rules. Independent review and
  timestamped hashes reduce but do not eliminate tailoring or contamination.
- Evaluator and promoter binaries are trusted protocol inputs. They do not share candidate code or keys.
- The user/operator is authorized to start and stop work but cannot silently redefine a frozen protocol.

## OS-level separation

Conformant evaluation uses distinct host UIDs and fresh containers or equivalent namespaces for runtime,
proposer, evaluator, promoter, audit service, and provider proxy. Mounts, Linux capabilities, seccomp,
process limits, and egress rules are generated from the principal matrix and attested at process start.

Development process emulation may test deterministic logic but is labelled `isolation_emulated` and
cannot satisfy Gate 2 security acceptance or support a security claim.

## Framing and transport

Inter-principal messages use an authenticated local Unix socket. Each message is one frame:

```text
4-byte unsigned big-endian length || canonical UTF-8 JSON envelope
```

The maximum inline envelope is 1 MiB. The receiver reads exactly the declared length with a deadline;
short reads, trailing bytes, extra frames, stdout logging, or invalid UTF-8 fail the request. Large
payloads travel through the content-addressed artifact broker and appear only as hash/size/media
references.

The process boundary is language-neutral. TypeScript versus Python provides implementation diversity and
prevents accidental imports, but it is not an authentication or isolation control.

## Authentication and authorization

The receiver verifies, in order:

1. Unix peer credentials match the protocol's principal-to-UID map;
2. wire protocol and protocol IDs match;
3. message type is permitted for sender and receiver roles;
4. payload length and expiry are valid;
5. `(sender, senderSequence, nonce, messageId)` is fresh;
6. the Ed25519 signature verifies against the sender's protocol-pinned key;
7. payload bytes match `payloadHash` and `payloadSizeBytes`;
8. envelope and payload validate against pinned JSON Schemas;
9. all artifact hashes, sizes, media types, and capability references resolve;
10. the requested operation fits the sender capability and host-side resource budget.

The signature covers JCS bytes of the envelope with `attestation.signature` omitted. Private keys are
principal-scoped, non-exported where practical, absent from child environments, and never carried in
messages.

## Correlation, deadlines, errors, and retries

- Every request has unique `messageId` and `correlationId`; responses retain the correlation and name the
  request as `causationId`.
- Sender sequence is monotonic per principal instance. Nonces are retained through the maximum message
  lifetime.
- `expiresAt` is a hard deadline. The receiver does not start work after it.
- Errors use the closed codes in `wire-envelope.schema.json`; `safeDetail` is redacted and bounded.
- A timeout, crash, invalid frame, or missing usage record produces no successful result. The supervisor
  records a failure and cancels the process group.
- Retrying creates a new signed message, consumes retry/model/tool/time budget as applicable, and links
  the prior failure. A transport retry is not free and is not harness evolution.
- Duplicate idempotent audit/deployment requests return the prior signed result only when their complete
  request hash matches; conflicting reuse is rejected as replay.

## Artifact transport

The sender first uploads canonical bytes to the artifact broker under a phase-specific capability. The
broker returns a hash reference only after recomputation. The recipient opens an immutable descriptor,
verifies bytes again, and never resolves paths supplied by the sender. Mutable candidate artifacts cannot
be used as evaluator executables, schemas, policies, or verifiers.

## Environment and toolchain lock

Protocol manifests pin container image digests, OS/architecture, Node/Python exact patch versions,
dependency lockfiles with integrity hashes, compiler/build configuration, schema/canonicalizer versions,
and executable digests. Rebuilding yields a new artifact digest; replacing any pin creates a new
protocol. Confirmatory results from different protocol IDs are never pooled.
