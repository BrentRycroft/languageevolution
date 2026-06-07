# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

## Project map (read first to re-orient)

- **Working backlog + state + decision log:** [docs/planning/ROADMAP.md](docs/planning/ROADMAP.md) — the live task list. Start here each session.
- **Architecture:** `ARCHITECTURE.md` (subsystem / data-flow map) + `docs/ARCHITECTURE.md` (dependency layers, data model, conventions).
- **Historical planning docs** (superseded designs, kept for rationale): `docs/planning/archive/`.

## 0. Use your skills

When in doubt, **check for an applicable skill and use it** — don't improvise a process a skill already encodes. In particular: `superpowers:brainstorming` (turn an idea into an approved design *before* coding), `superpowers:writing-plans` (break a design into bite-sized task plans), `superpowers:subagent-driven-development` (execute a plan task-by-task via fresh subagents with two-stage review), `superpowers:dispatching-parallel-agents` (fan out independent work). Default to **subagent-driven execution** for plan work (saved preference). Invoke the skill at the start of the matching activity, not after you've already winged it.

**Subagents work in worktrees when applicable (saved preference).** When dispatching agents to do real edits — especially several in parallel, one per task — give each its own git worktree (`isolation: "worktree"`, or the `superpowers:using-git-worktrees` skill) so they don't collide on disk. Each agent works on an isolated checkout off the current HEAD, commits there, and the controller reconciles by merging the branches sequentially (re-running the determinism baseline on the merged result). Don't dismiss parallel-per-task as unsafe just because tasks share files — worktrees plus a merge step are exactly how that's handled; only fall back to sequential when the merge/interaction cost genuinely outweighs the parallelism. Read-only agents (search/review) don't need a worktree.

**Plan thoroughly first, then implement without deviating (saved preference).** Front-load every decision into the design + plan (via `superpowers:brainstorming` then `superpowers:writing-plans`) so the plan is complete enough to execute mechanically. Surface assumptions, ambiguities, and tradeoffs *during planning* and resolve them then — that is when to ask. Once the plan is approved, execute it exactly as written; do not stop mid-flight to ask implementation questions the plan should have already answered. If something genuinely can't be resolved without the user, the right move is to fix the plan, not to improvise a deviation. The goal: no mid-implementation interruptions, because the thinking already happened up front.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**Plan across subsystem seams so "surgical" is truly surgical.** Before editing, map how the change crosses boundaries — frontend ↔ backend/engine, and subsystem ↔ subsystem. A backend change that leaves a frontend feature reading a field you renamed, re-keyed, or removed is not surgical; it is a half-done change with a hidden orphan one seam over. During planning, trace each touched data contract to *every* consumer (UI views, other engine steps, serialization/restore) and decide per consumer: update it or retire it. When a backend change makes a frontend feature outdated or dead, update or remove that feature in the same change — don't strand it.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**Verify against *current* tests.** Before treating a test as proof, confirm it is up to date — that what it asserts is something your change is *expected* to affect. Many tests were authored long ago and may not account for recent changes. When a test fails after a mechanical or byte-identical change, it is often a stale expectation predating recent work, not evidence of a regression. Distinguish "my change broke this" from "this test was already out of date" before contorting code to satisfy it. For determinism work, the real proof of byte-identity is the `meaning_layer_baseline` GEN0/GENN baseline — trust it over individual aged assertions.

**Run tests efficiently — batch, don't repeat.** Get the verification you need in one or two runs, not forty. Pass multiple files / name filters to a single `vitest run` (e.g. `vitest run --dir src fileA fileB`) instead of launching it once per file; reserve the full suite for milestones and the occasional safety net. Re-running the same test repeatedly — or the whole suite when a targeted file would prove it — burns minutes per cycle. Pick the narrowest command that actually proves the thing, run it once, move on.

**Decide the test plan up front; defer the full suite to the merge.** During planning, name *which* existing tests gate each task and *which* new tests must be written (with their assertions) — don't discover test scope mid-implementation. While executing per-task in parallel worktrees, each task runs only its own targeted tests (+ a fast determinism canary where relevant); the **full suite + RUN_SLOW baseline is reserved for once, after all worktree branches are merged back**. Running the whole suite inside every worktree is wasted minutes and can't catch cross-branch interactions anyway — those only exist on the merged result. The merge step is the single full-verification gate.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
