# Geometry-Native Program — Overarching Roadmap

**Date:** 2026-06-13
**Branch:** `auto/storage-pointnative` (= `auto/realism`, both at `8307a08`, pushed to origin)
**Status:** Approved decomposition. Each sub-project below gets its own brainstorm → spec → plan → execute cycle.

## North star

A **geometry-native**, **performant**, **typologically-real**, **immersive** language-evolution
simulator. Meaning lives in a continuous embedding space; the discrete hand-maintained
scaffolding is retired in favour of geometry; translation/narrative/synonymy all resolve
geometrically; the simulation surfaces real typology; computation runs on the user's machine
(GPU-accelerated); and presets carry authentic forms and evolving orthography.

## Foundational decisions (locked this session)

1. **Determinism relaxes to per-machine reproducibility.** Cross-machine byte-identical
   hashing (the `meaning_layer_baseline` fixed-hash gate) is retired in favour of *same-machine*
   reproducibility + statistical/realism gates. This unblocks GPU engine math and frees the
   geometric reworks from the byte-identity straitjacket. **G0 builds the replacement gates
   before the old net is removed** (run new gates alongside the hashes, prove, then retire).
2. **Vocabulary authoring folds into the post-geometric world.** The in-flight E1–E6 authentic-
   form expansion is paused; it becomes **G5**, done after the geometric inventory (G1) settles
   what the meaning targets are. (Sub-project **M** already landed — the random 1000-word floor
   and the synthetic `default` preset are gone, so presets currently show only authentic curated
   words.)
3. **Parallel worktree subagents are the execution vehicle and are reliable.** The earlier
   failure was a wrong-base bug (a stale branch label was pushed), not a worktree limitation;
   proven reliable once the correct HEAD is pushed. See the dispatch protocol below.

## Execution model

Each sub-project runs the full **brainstorm → spec → plan** cycle (controller + user). The plan
is then executed by subagent(s):

- **Independent tasks** within a sub-project (e.g. G5's six languages), or independent
  sub-projects that can overlap, fan out to **parallel worktree subagents**.
- **Cohesive/sequential** work is carried out by a single subagent.
- The controller **reconciles** (merge branches sequentially, run the gates on the merged tree)
  and reviews between stages.

### Parallel-worktree dispatch protocol (required)

1. Controller pushes the exact HEAD to the base branch and **verifies via `git ls-remote origin`**
   before dispatching. Confirm which branch actually holds the work (watch for stale labels).
2. Agent prompts are **self-contained** (essential instructions embedded), not dependent on a doc
   file that may be absent on the base.
3. Each agent **base-guards**: verify expected marker file(s); if absent `git fetch && reset --hard
   origin/<branch>`; if still wrong, abort with "WRONG BASE" — never improvise.
4. Agents use `npx` (resolves `node_modules` from the parent repo — worktrees are nested inside it).
5. Controller merges sequentially, runs gates on the merged tree, then cleans up agent
   branches/worktrees.

## Sub-projects

### G0 — Determinism model migration (Phase A, foundation)
- **Goal:** Replace cross-machine byte-identity with a **per-machine reproducibility harness**
  (run a sim twice on this machine → identical) plus **statistical/realism gates** promoted to the
  primary correctness signal (realism scorecard, divergence regression, etc.).
- **Scope:** Add the new gates; run them alongside the existing `meaning_layer_baseline` hashes to
  prove equivalence/coverage; then retire the fixed cross-machine hashes.
- **Depends on:** nothing. **Unblocks:** G1, G7 (and de-risks every later re-bake).
- **Risk:** Removing the byte-identity net is the project's biggest safety change — mitigate by
  proving the new gates *before* removing the hashes.

### G1 — Geometric meaning inventory (Phase B)
- **Goal:** Derive the meaning space from embedding geometry instead of the hand-maintained
  ~1,800-concept list (`concepts.ts` / `basic240.ts` / `expanded_concepts.ts`). Concepts and their
  tier/POS/cluster metadata become geometry-derived.
- **Scope:** Define how meanings are enumerated/anchored from the embedding space; migrate every
  `CONCEPT_IDS` consumer (drift, coinage, frequency, neighbors, clusters, translator). Likely keep a
  materialised view for performance, generated from geometry rather than hand-curated.
- **Depends on:** G0. **Unblocks:** G2, G4, G5.
- **Risk:** Highest-ripple, most research-y. Must still yield sensible, typologically-real meanings;
  guard with G0's realism gates.

### G2 — Geometric translator + narrative (Phase B)
- **Goal:** Translation and narrative resolve geometrically end-to-end; remove remaining
  discrete-table fallbacks.
- **Depends on:** G1. **Unblocks:** G3, G4.
- **Risk:** Output-quality regressions; lock behaviour with realism/snapshot gates.

### G3 — Surface display-only typology (Phase C)
- **Goal:** Make typological features that are currently display-only (e.g. polysynthesis) actually
  *realize* in translator/narrative output.
- **Scope:** Audit display-only typology flags; wire each into the realiser so it surfaces.
- **Depends on:** G2.

### G4 — Synonymy + register/frequency (Phase C)
- **Goal:** Richer synonymy and word register/commonness (e.g. *swarthy* vs *black*) driving word
  selection + realisation.
- **Depends on:** G1 (geometric semantic relations) + G2.

### G5 — Authentic vocabulary, post-geometric (Phase C)
- **Goal:** The folded-in E1–E6 — author authentic *forms* for the geometric inventory's meanings,
  per language.
- **Scope:** Per-language web-sourced authentic forms (the existing E charter/spec inform this), now
  targeting the geometric inventory's meanings. **Natural parallel-worktree batch (6 languages).**
- **Depends on:** G1.

### G6 — Evolving orthography (Phase D, cross-cutting)
- **Goal:** Per-preset spelling systems (esp. Latin + Modern English) that themselves change over time.
- **Scope:** An orthography layer mapping evolving phonological forms → spelling, with its own
  evolution rules; surfaced in display/translator.
- **Depends on:** G0 (gate model). Otherwise independent — flexible timing.

### G7 — GPU / client offload (Phase D, cross-cutting)
- **Goal:** All computation client-side; **WebGPU** acceleration of the vector math.
- **Scope:** Move the geometric/vector math to WebGPU compute (with a CPU fallback); per-machine
  reproducibility (from G0) makes GPU float acceptable.
- **Depends on:** G0; best **after** G1/G2 so we accelerate the final math shape rather than
  re-porting a moving target.
- **Risk:** WebGPU availability/fallback; reproducibility must be solid (G0) first.

## Sequencing

```
Phase A:  G0
Phase B:  G1 → G2
Phase C:  G3 + G4 + G5   (largely independent → parallel-worktree batch after Phase B)
Phase D:  G6 (any time after G0) ; G7 (after G0, ideally after G1/G2)
```

## Already done / not in scope here

- **M (done):** floor + `default` preset removed; catalog authored-only; boots into PIE.
- Per-sub-project designs are **deferred** — each `Gx` gets its own `docs/superpowers/specs/...` and
  `docs/superpowers/plans/...` when we reach it.
- The first sub-project to design next is **G0**.
