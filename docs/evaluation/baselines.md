# Baselines B0–B6

The authoritative executable definitions, mandatory B5 size-matched control, bounded
attribution-ablated `B6-ABL` control, Track A/Track B `K` meanings, feedback visibility, and claim
mapping are in [baseline-matrix.md](baseline-matrix.md).

Headline arms remain B0 through B6:

- B0 static direct pass@1;
- B1 parallel sampling;
- B2 sequential refinement;
- B3 task-specific harness scaling;
- B4 prompt-only evolution;
- B5 free-form mutable-bundle rewrite, with mandatory B5-SM;
- B6 attribution-guided bounded mutation, with mandatory B6-ABL.

No result from B3 is called reusable harness evolution. No result from B5-U alone is used to attribute an
effect to component attribution. B0 is a low-development-cost anchor, not an equal-development-budget
claim.
