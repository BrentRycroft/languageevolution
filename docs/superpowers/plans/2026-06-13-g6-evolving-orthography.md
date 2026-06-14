# G6 — Evolving Orthography — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Per-preset orthographies for English + Latin that evolve (spelling lag/opacity), built on the existing `orthography.ts` machinery.

**Reference spec:** `docs/superpowers/specs/2026-06-13-g6-evolving-orthography-design.md`
**Depends on:** G0. **Defer execution to a subagent.**

---

## Task 1: `seedOrthography` config hook

- [ ] **Step 1 (test):** Unit test — a config carrying `seedOrthography` (a `Record<Phoneme,string>` + options) causes `romanize` to use it instead of `DEFAULT_ORTHOGRAPHY`. Run → FAIL.
- [ ] **Step 2 (impl):** Add `seedOrthography` to `SimulationConfig` + `Language`, threaded at language birth; `romanize` reads `lang.orthography ?? DEFAULT_ORTHOGRAPHY`. Run → PASS. `tsc` clean. Commit.

## Task 2: English orthography profile

- [ ] **Step 1 (LOCK test, failing):** With the English preset, a set of words renders with English-like conventions (e.g. /ʃ/→"sh", /tʃ/→"ch", silent-e, /k/→"c/k"). Run → FAIL.
- [ ] **Step 2 (impl):** Author `seedOrthography` for `english.ts` — a grapheme **rule set** (digraphs, silent letters, polyvalence), not a per-word dictionary. Run LOCK test → PASS. `tsc` clean. Commit.

## Task 3: Latin orthography profile

- [ ] **Step 1 (LOCK test, failing):** With the Romance/Latin preset, words render near-phonemically (classical Latin conventions: c=/k/, u/v, no silent letters). Run → FAIL.
- [ ] **Step 2 (impl):** Author `seedOrthography` for `romance.ts`. Run LOCK test → PASS. `tsc` clean. Commit.

## Task 4: Calibrate evolution (opacity vs lag)

- [ ] **Step 1 (LOCK test, failing):** Over a long run, English spelling **lags** sound change (opacity accrues — divergence between phonological form and frozen spelling grows), while Latin spelling shifts. Use the existing `OrthographyShift` + frozen-spelling + `tierOrthographyMultiplier`. Run → FAIL.
- [ ] **Step 2 (impl):** Calibrate the existing drift/freeze parameters per preset so English accrues opacity and Latin shifts. Run LOCK test → PASS. `RUN_SLOW=1 npx vitest run --dir src reproducibility` → green. `tsc` clean. Commit.

## Task 5: Verify + re-bake

- [ ] **Step 1:** `npx vitest run --dir src` (FAST) green; once `RUN_SLOW=1` green. Re-bake metric bands only if `literaryStabilityFor` feedback shifted forms (dated note). `tsc` clean.

---

## Self-review

**Coverage:** config hook (T1), English profile (T2), Latin profile (T3), evolution calibration (T4), verify (T5). **Placeholders:** none — the orthography rule sets are authored in T2/T3 with LOCK tests defining acceptance. **Reuse:** builds on existing `romanize`/`OrthographyShift`/`tierOrthographyMultiplier`, no new evolution engine.
