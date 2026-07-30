# Non-Authoritative Python Contract Spike

Status: **ARCHIVED; NON-AUTHORITATIVE; NON-EXECUTABLE EVIDENCE**

This directory preserves a pre-contract Python experiment created before Architect Gate 1. The external
Architect required it to be removed from every runtime, package, test, import, and evidence path before
implementation. It is retained only to make provenance and negative engineering history auditable.

Rules:

- nothing in this directory is an approved implementation;
- repository-root package managers, test discovery, import paths, release artifacts, and evidence
  collectors must exclude `spikes/**`;
- no file may be copied or imported into the runtime;
- an idea may be reimplemented only after mapping it to an approved contract and writing a fresh
  implementation after Gate 1R approval;
- these files must never be cited as proof that a contract is implemented or a security boundary works;
- any edit to this archive requires new archived hashes and an audit note.

`ORIGINAL_SHA256SUMS` pins the bytes before quarantine. `ARCHIVED_SHA256SUMS` pins the quarantined bytes,
which differ only by an explicit non-authoritative header added during relocation.

