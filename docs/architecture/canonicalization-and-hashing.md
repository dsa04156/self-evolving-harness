# Canonicalization and Hashing Contract

Status: Gate 1R design contract  
Profile identifier: `seh-jcs-v1`

This contract removes ambiguity from component, harness, artifact, protocol, and audit identities. Git
commits, worktree paths, file timestamps, database row IDs, lifecycle state, evaluation results, and
activation pointers never contribute to a content identity.

## Primitive rules

- Digest: SHA-256, rendered as lowercase hexadecimal with the object-specific prefix.
- JSON: RFC 8785 JSON Canonicalization Scheme (JCS), encoded as UTF-8 without BOM.
- Accepted JSON is I-JSON: duplicate object keys, invalid Unicode scalar values, `NaN`, infinities,
  negative zero, and integers outside `[-9007199254740991, 9007199254740991]` are rejected before JCS.
- Schema validation occurs before hashing. Unknown properties are rejected by all identity schemas.
- A claimed ID is compared in constant time with the recomputed digest.
- Lists whose semantics are sets are sorted before hashing and rejected if the submitted order differs
  from canonical order. Lists whose order changes behavior, such as prompt blocks or workflow steps,
  preserve order.

## Text payload normalization

Mutable textual payloads are ingested, normalized once, and stored only in canonical form:

1. decode strict UTF-8;
2. reject BOM, NUL, noncharacters, and ASCII control characters other than LF and TAB;
3. normalize Unicode to NFC;
4. convert CRLF and lone CR to LF;
5. preserve all other whitespace and preserve the exact number of terminal LF bytes;
6. encode UTF-8 and hash those bytes.

Normalization is never performed silently at evaluation time. If submitted bytes are not already the
canonical bytes, candidate admission fails and reports the first mismatch.

## Paths and filesystem objects

Behavior-bearing multi-file artifacts use a canonical JSON file-set manifest rather than an archive.
Every entry contains `path`, `mediaType`, `sizeBytes`, and `contentHash`.

- paths are relative POSIX paths, NFC-normalized UTF-8, with `/` separators;
- empty components, `.`, `..`, leading `/`, trailing `/`, backslash, NUL, and control characters are
  rejected;
- entries are sorted by the unsigned UTF-8 bytes of normalized path;
- exact, NFC, case-folded, and platform-normalized path collisions are rejected;
- symlinks, hard links, devices, sockets, FIFOs, sparse files, alternate data streams, and executable
  permission bits are rejected from candidate-controlled artifacts;
- ZIP, TAR, compression, base64-wrapped files, data URLs, and nested encoded payloads are forbidden;
- executable immutable artifacts are admitted only by protocol authors, never by a candidate.

Filesystem traversal must use descriptor-relative APIs with no symlink following. A post-materialization
walk recomputes every file hash and rejects unexpected entries.

## Artifact identity

An artifact reference has only an internal `contentHash`, `mediaType`, and `sizeBytes`. URLs, host paths,
Git references, environment variables, package coordinates, and mutable object-store keys are invalid.
The artifact store retrieves by digest and verifies size and bytes before release.

For a byte artifact:

```text
artifact hash = "sha256:" + hex(SHA256(canonical artifact bytes))
```

For a file set, the artifact bytes are the JCS bytes of its canonical file-set manifest; every member is
itself addressed by a byte-artifact hash.

## Component identity

`ComponentManifest.componentManifestId` is derived from the `identity` object only:

```text
component digest = SHA256(JCS(component.identity))
componentManifestId = "cm-sha256:" + hex(component digest)
manifestHash = "sha256:" + hex(component digest)
```

The trusted validator resolves `typeRegistryRef`, validates the payload language and capabilities against
that registry entry, verifies the payload artifact, resolves all dependencies, and recomputes the
component closure before accepting the claimed ID.

The component closure document is:

```json
{
  "profile": "seh-jcs-v1",
  "rootPayload": {"contentHash": "sha256:…", "sizeBytes": 0},
  "components": [
    {
      "componentManifestId": "cm-sha256:…",
      "identityHash": "sha256:…",
      "payloadHash": "sha256:…",
      "dependencyIds": ["cm-sha256:…"]
    }
  ],
  "artifacts": [
    {"contentHash": "sha256:…", "mediaType": "…", "sizeBytes": 0}
  ]
}
```

Components are deduplicated and sorted by `componentManifestId`; dependency IDs and artifacts are sorted
by digest. Cycles, missing objects, duplicate stable `componentId` definitions, type mismatches, and
undeclared artifacts are rejected. `behaviorClosure.closureHash` is SHA-256 of this closure document's
JCS bytes. Counts and byte totals are recomputed, not trusted.

## Harness identity

`HarnessVersionManifest.harnessVersionId` is derived from its `identity` object only:

```text
harness digest = SHA256(JCS(harness.identity))
harnessVersionId = "hv-sha256:" + hex(harness digest)
manifestHash = "sha256:" + hex(harness digest)
```

The harness closure expands every root binding transitively and uses the same sorted closure-document
algorithm. Slot IDs are unique and sorted. The same component may occupy multiple declared slots, but is
counted once in the closure. The validator requires exactly one authoritative root for every required
runtime slot. Lifecycle, lineage, provenance, evaluation, promotion, rollback, and deployment records
reference this ID and cannot change it.

## Protocol and type-registry identity

The type registry and protocol manifest use the same envelope rule:

```text
registry digest = SHA256(JCS(typeRegistry.identity))
typeRegistryId = "ctr-sha256:" + hex(registry digest)

protocol digest = SHA256(JCS(protocol.identity))
protocolId = "protocol-sha256:" + hex(protocol digest)
```

Any change to an identity member creates a different ID. Confirmatory records from different protocol
IDs cannot be pooled.

## Mutation closure and size

The validator materializes complete parent and candidate closures before calculating mutation scope.
For each stable component family and behavior-bearing artifact it records:

- added and removed component-manifest IDs;
- added and removed artifact hashes;
- normalized text token insertions/deletions using the frozen tokenizer;
- canonical JSON Patch operations for structured payloads;
- added and removed capability IDs;
- `expandedClosureEditBytes`: byte length of deterministic patches plus full canonical bytes for
  unpaired additions/removals;
- `replacementSurfaceBytes`: canonical size of every changed candidate payload and manifest.

All transitively changed component families count toward the one-component or two-component limit. A
single reference edit that swaps several dependencies is therefore a multi-component mutation.
`expandedClosureEditBytes <= 8192` is only a defense-in-depth admission ceiling; scientific matching uses
the complete size vector and never treats that ceiling as causal control.

## Audit records

Audit `recordHash` is SHA-256 of JCS bytes of the record with the signature value omitted but with
`previousRecordHash`, `protocolId`, `logId`, and sequence included. The record is then signed. A hash
chain is tamper-evident only under the trust assumptions in `trust-boundary.md`; it is not called
tamper-proof or immutable storage.

## Required golden and adversarial vectors

Before Gate 2, deterministic tests must cover:

- different JSON key orders yielding one digest;
- duplicate keys, non-NFC text, CRLF, BOM, invalid numbers, and invalid UTF-8 rejection;
- set-order rejection and behavior-order preservation;
- symlink/hardlink/path traversal/case-fold collision rejection;
- artifact size/hash mismatch and time-of-check/time-of-use substitution;
- transitive dependency swaps changing closure hashes and mutation counts;
- lifecycle/evaluation append operations leaving component and harness IDs unchanged;
- cross-protocol record mixing rejection.
