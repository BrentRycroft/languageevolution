# G2 — Geometric Translator + Narrative — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Finish S6's geometric conversion — content resolution via `idForConcept` end-to-end in translator + narrative; remove vestigial `idForGloss`; keep closed-class exact.

**Reference spec:** `docs/superpowers/specs/2026-06-13-g2-geometric-translator-narrative-design.md`
**Depends on:** G1 (continuous inventory + `idForConcept`). **Defer execution to a subagent.**

---

## Task 1: Audit the resolution sites

- [ ] **Step 1:** `git grep -nE "idForGloss" -- src/engine/translator src/engine/narrative` and classify each hit: **content** (the lemma being realised is open-class content) vs **closed-class** (function word) vs **vestigial** (`const _id = idForGloss(...)` never read).
- [ ] **Step 2:** Record the classification as a checklist in the PR/commit body (drives Tasks 2-3).

## Task 2: Remove vestigial dead computations

- [ ] **Step 1:** Delete every `const _id = idForGloss(...)` / `const _mid = idForGloss(...)` that is computed but unused (`abstraction.ts`, `ast.ts`, `closedClass.ts`, `cognates.ts` showed these), plus the now-unused `idForGloss` import if a file no longer uses it.
- [ ] **Step 2:** `npx tsc --noEmit` → clean. Commit.

## Task 3: Convert content sites to `idForConcept`

- [ ] **Step 1:** For each **content** site, replace `idForGloss(lang, m)` with `idForConcept(lang, m)` (import from `../lexicon/conceptIndex`). Leave **closed-class** sites on exact resolution.
- [ ] **Step 2:** `npx tsc --noEmit` → clean. Commit per file/group.

## Task 4: Reconcile the input-validity gate with the continuous inventory

- [ ] **Step 1:** In `englishWordlist.ts`, confirm `isValidEnglishLemma` still composes correctly now that `isRegisteredConcept` reflects the GloVe vocabulary (G1). Keep the closed-class + affix branches; adjust only if the broadened registry changes behaviour. Update the stale "BASIC_240 + EXPANDED_CONCEPTS" comment.
- [ ] **Step 2:** `npx tsc --noEmit` → clean. Commit.

## Task 5: Verify + re-bake

- [ ] **Step 1:** `RUN_SLOW=1 npx vitest run --dir src reproducibility` → green.
- [ ] **Step 2:** Run translator + narrative tests (`npx vitest run --dir src translator narrative realism_scorecard`). Inspect the corpus phrases + narrative output for sensibility. Deliberately re-bake any narrative snapshot / metric band that shifted (dated note: "G2 geometric resolution"). Confirm closed-class realisation tests pass.
- [ ] **Step 3:** Full `npx vitest run --dir src` (FAST) green; once `RUN_SLOW=1` green. `tsc --noEmit` clean.

---

## Self-review

**Coverage:** vestigial removal (T2), content→geometric (T3), closed-class kept exact (T3), input gate (T4), reproducibility + snapshots/bands (T5). **Placeholders:** none — the audit (T1) enumerates exact sites at execution. **Consistency:** `idForConcept` import path (`../lexicon/conceptIndex`) matches S6.
