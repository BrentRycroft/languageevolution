# G4 — Synonymy + Register/Frequency — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Add commonness/markedness-aware synonym selection (common/unmarked default, rare/marked gated to register) + geometric near-synonym candidates, building on the Phase-37 synonymy.

**Reference spec:** `docs/superpowers/specs/2026-06-13-g4-synonymy-register-frequency-design.md`
**Depends on:** G1 (corpus rank/frequency), G2 (geometric resolution). **Defer execution to a subagent.**

---

## Task 1: Markedness signal

**Files:** `src/engine/lexicon/synonyms.ts` (or a new `synonymSelect.ts`).

- [ ] **Step 1 (test):** Write a unit test: `markednessOf(lang, meaning, form)` returns lower for a high-in-language-frequency / low-corpus-rank form (`black`) than for a rare one (`swarthy`). Run → FAIL.
- [ ] **Step 2 (impl):** Implement `markednessOf` blending the form's `wordFrequencyHints` usage frequency with `rankOf(meaning)` (G1) as a prior for English-keyed meanings. Deterministic. Run → PASS. `tsc` clean. Commit.

## Task 2: Broaden synonym candidates geometrically

- [ ] **Step 1:** Where synonym candidates for a meaning are gathered, add tight geometric near-synonyms (`geometricNeighbors(meaning)` above a high cosine threshold) + recorded colexification partners to the candidate set (deduped). Keep Phase-37 spawned synonyms. `tsc` clean. Commit.

## Task 3: Register + commonness-weighted selection

**Files:** `src/engine/translator/realise.ts` (the synonym-pick at ~line 399).

- [ ] **Step 1 (LOCK test, failing):** A language with a common + a rare synonym for one meaning realises the common one under neutral register and the rare one under a marked (literary) register. Run → FAIL.
- [ ] **Step 2 (impl):** Extend the synonym-pick to: neutral register → lowest-markedness candidate; marked register/genre → allow higher-markedness; keep the rotation tracker. Run LOCK test → PASS. `RUN_SLOW=1 npx vitest run --dir src reproducibility` → green. `tsc` clean. Commit.

## Task 4: Verify + re-bake

- [ ] **Step 1:** `npx vitest run --dir src translator narrative realism_scorecard` — inspect for natural neutral text (unmarked words) and marked-register variation. Deliberately re-bake narrative snapshots / metric bands that shifted (dated note: "G4 commonness-weighted synonymy").
- [ ] **Step 2:** Full `npx vitest run --dir src` (FAST) green; once `RUN_SLOW=1` green; `tsc` clean.

---

## Self-review

**Coverage:** markedness signal (T1), geometric candidates (T2), register+commonness selection + LOCK (T3), reproducibility + re-bake (T4). **Placeholders:** none. **Consistency:** `markednessOf`, `rankOf` (G1), `geometricNeighbors` names consistent. **Agnosticism:** markedness from the language's own frequencies + corpus-rank prior.
