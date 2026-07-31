# Candidate Bundle Isolation

Status: deterministic end-to-end integration; `NP-1`

## Purpose

A `HarnessVersion` is a content-addressed component graph, not a source checkout. Evaluation needs an
exact bridge from that graph to immutable filesystem bytes without allowing a proposer to modify tool
implementations, evaluator code, policy, or unrelated repository files.

## Canonical bundle

`CandidateBundleIsolationService` resolves the candidate from the trusted component registry and exports
the complete transitive closure:

```text
HarnessVersion manifest
→ sorted component manifests
→ canonical payload for every component
→ dependency-complete CandidateHarnessBundle
```

The `bundle-sha256` ID covers:

- protocol, parent, candidate, and type-registry pins;
- the source base commit;
- harness manifest and behavior-closure hash;
- sorted component manifest IDs;
- every component manifest and payload.

The schema is `schemas/candidate-harness-bundle.schema.json`. The trusted materializer revalidates every
detached component and compares the export with the registered closure before writing a worktree.

## Git and filesystem binding

The worktree manager:

1. resolves one committed base revision and creates a detached worktree;
2. refuses any pre-existing dirty, ignored, linked, or special path;
3. writes only `.seh-candidate-bundle.json` with exclusive/no-follow semantics;
4. validates canonical bytes and the bundle content ID;
5. writes the Git blob with `hash-object --no-filters`;
6. updates the index for that one fixed path;
7. creates a deterministic commit with the exact base as its single parent;
8. verifies that the commit changes exactly one path;
9. freezes base commit, candidate commit, tree, complete entries, Git object IDs, modes, sizes, and
   content hashes;
10. materializes committed blobs into a separate read-only directory.

Repository clean/smudge filters and commit hooks are not part of this path.

## External evaluator checks

The evaluator receives a read-only snapshot root and canonical descriptor through its launch boundary.
Before accepting an evaluation request, it:

1. verifies descriptor canonicalization and hash;
2. enumerates the complete mounted filesystem and rejects extra/missing paths or directories;
3. recomputes file, Git-blob, size, and mode identities;
4. parses the canonical candidate bundle;
5. verifies bundle, HarnessVersion, component, payload, dependency, and behavior-closure identities;
6. verifies that bundle source base equals the descriptor base;
7. verifies configured snapshot, bundle, and candidate IDs;
8. rejects a signed request whose candidate ID differs from the mounted bundle.

The isolation receipt binds the evolution run, parent, candidate, proposal, static validation, bundle,
Git commit, filesystem snapshot, bundle artifact, and descriptor artifact.

## OS-principal evidence

The fast integration launches the separately keyed Python evaluator under `isolation_emulated`. The
required OS track repeats the full path with:

- registry-generated parent and candidate HarnessVersions;
- the canonical candidate bundle committed and mounted read-only;
- operations UID 1101 and evaluator UID 1103;
- authenticated Unix peer credentials and signatures;
- no-network namespaces and role-private keys;
- twelve adversarial cases, including signed candidate-ID and snapshot substitutions.

The evidence and complete filesystem descriptor are stored in
`architect/evidence/candidate-bundle-os/`. The artifact includes the five public principals and keys
needed to verify its challenge signatures; no private key is retained. This closes the earlier
combined-path gap for the local Linux/rootless threat model. Host root/kernel compromise, distributed
storage, and public-provider behavior remain outside the claim.
