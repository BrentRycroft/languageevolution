# G3 — Surface Display-Only Typology — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Make declared-but-display-only typological axes (esp. polysynthesis) actually realize in translator + narrative output, agnostically, each locked by a behaviour test.

**Reference spec:** `docs/superpowers/specs/2026-06-13-g3-surface-display-only-typology-design.md`
**Depends on:** G2 (geometric resolution end-to-end). **Defer execution to a subagent.**

---

## Task 1: Audit realised vs display-only

- [ ] **Step 1:** For each declared axis (`voice`, `aspectMarking`, `incorporates`, `evidentialMarking`, `serialVerbConstructions`, `politenessRegister`, `classifierSystem`, `harmony`, `alignment`, and the `synthesisIndex` polysynthesis dimension), write a tiny probe: build a minimal language with the axis set, run `translate()`/narrative on a fixed sentence, and record whether the feature appears in output.
- [ ] **Step 2:** Produce `docs/planning/notes/g3-typology-audit.md` — a realised-vs-display-only table. Commit (audit only; drives the rest).

## Task 2: Wire each display-only axis (one axis per sub-task, TDD)

For EACH axis found display-only, in order of impact (polysynthesis first):

- [ ] **Step 1 (LOCK test, failing):** Write a behaviour test: a language with the axis set produces output containing the feature (e.g. `evidential`: the verb carries the evidential affix; `polysynthesis`: a high-`synthesisIndex` clause realises subject+object+TAM+root as one word). Run → FAIL.
- [ ] **Step 2 (realise):** Wire the axis into `translator/realise.ts` (and/or narrative `composer.ts`), reading the language's own parameters (agnostic — no English template). For polysynthesis: extend the incorporation path to also stack pronominal agreement + TAM affixes when `synthesisIndex` is high, capped by `phonotacticProfile`.
- [ ] **Step 3:** Run the LOCK test → PASS. `npx tsc --noEmit` → clean.
- [ ] **Step 4:** `RUN_SLOW=1 npx vitest run --dir src reproducibility` → green. Commit (one axis per commit).

## Task 3: Integration + re-bake

- [ ] **Step 1:** Run `npx vitest run --dir src translator narrative realism_scorecard` — inspect output for the newly-surfaced features; deliberately re-bake narrative snapshots / metric bands that shifted (dated note: "G3 <axis> now surfaces").
- [ ] **Step 2:** Full `npx vitest run --dir src` (FAST) green; once `RUN_SLOW=1` green; `tsc` clean. Confirm all per-axis LOCK tests pass.

---

## Self-review

**Coverage:** audit (T1), per-axis wire + LOCK (T2), polysynthesis prioritised (T2), reproducibility + re-bake (T3). **Placeholders:** the exact axis list to wire is determined by T1's audit (data-driven, like a capture step). **Agnosticism:** each axis realised from the language's own parameters (standing invariant), locked by tests.
