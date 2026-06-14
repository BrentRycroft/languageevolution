# G5 — Authentic Vocabulary (post-geometric) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Author authentic forms for each preset against the geometric inventory, via six parallel worktree subagents, gated by `validatePresetIpa` + per-machine reproducibility + re-baked metric bands.

**Reference:** spec `docs/superpowers/specs/2026-06-13-g5-authentic-vocabulary-postgeometric-design.md`; **per-language procedure: the E charter** `docs/superpowers/plans/2026-06-13-preset-vocab-E-execution-charter.md` (source map + IPA conventions + gates).
**Depends on:** G1 (geometric inventory). **Execution: parallel worktree subagents (controller-orchestrated).**

---

## Task 1: Refresh the E charter for the post-geometric world

- [ ] **Step 1:** Update the E charter's §6 re-bake protocol from the retired `meaning_layer_baseline` hashes to the **G0 gates** (per-machine reproducibility + re-bake the preset's metric bands in `metric_bands.snapshot.ts`). Update §2 ("which concepts to add") to target the **geometric inventory** (G1's `CONCEPT_IDS`) rather than `concepts.ts`/`basic240`. Commit the charter update.

## Task 2: Controller pre-flight (reliable parallel-worktree protocol)

- [ ] **Step 1:** Ensure HEAD (with G1 + the refreshed charter) is pushed to `origin/auto/storage-pointnative`; verify with `git ls-remote origin`.
- [ ] **Step 2:** Confirm `src/engine/lexicon/conceptRegistry.ts` exists on the base (G1 landed) — the agents' base-guard marker.

## Task 3: Dispatch six language agents (parallel worktrees)

- [ ] **Step 1:** Dispatch one worktree subagent per language (english, romance, pie, germanic, bantu, tokipona) with a **self-contained** prompt: base-guard (verify `conceptRegistry.ts` + charter present, else `reset --hard origin/...`, else abort "WRONG BASE"); follow the E charter for that language; target the geometric inventory; `validatePresetIpa` clean; re-bake the preset's metric bands; commit on `g5-<lang>`; report (words added, source, new band values, skips). Do NOT push.
- [ ] **Step 2:** Each agent works to a substantial first-pass target (charter §3); Toki Pona bounded to its real root set.

## Task 4: Reconcile + re-bake

- [ ] **Step 1:** Merge each `g5-<lang>` branch sequentially into the working branch; resolve the (line-disjoint) `metric_bands.snapshot.ts` edits; re-run `RUN_SLOW=1 npx vitest run --dir src realism_scorecard reproducibility` on the merged tree.
- [ ] **Step 2:** `npx vitest run --dir src preset_authenticity preset_ipa` green; per-machine reproducibility green; metric bands hold (all six presets) on the merged result.
- [ ] **Step 3:** Full `npx vitest run --dir src` (FAST) green; once `RUN_SLOW=1` green; `tsc` clean. Clean up `g5-*` branches + worktrees.

---

## Self-review

**Coverage:** charter refresh for new gates/inventory (T1), pre-flight (T2), 6-language parallel dispatch (T3), sequential merge + re-bake (T4). **Placeholders:** the per-language word lists are sourced by the agents (the charter governs) — a sourcing activity, not a placeholder. **Reliability:** uses the proven worktree protocol (push+verify base, self-contained prompts, base-guard, npx, merge+re-bake).
