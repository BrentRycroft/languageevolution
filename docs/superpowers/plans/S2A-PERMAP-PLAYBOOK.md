# S2a per-map re-key — execution playbook (read in full before starting)

You are re-keying ONE per-meaning satellite map (or a small named pair) from gloss-keyed
(`Record<Meaning, X>`) to LexemeId-keyed (`Record<LexemeId, X>`) behind the accessor seam
`src/engine/lexicon/satellites.ts`. This playbook is the distilled procedure from Task 3
(`wordFrequencyHints`, already shipped). Your map's exact file list + iteration-site callouts are
in the master plan `docs/superpowers/plans/2026-06-07-storage-step5-s2a-satellite-rekey.md` (find
your task). Follow BOTH. **Determinism is the hard gate — see §6.**

## 0. The seam (already built; do NOT modify satellites.ts)
`satGet/satSet/satHas/satDelete/satKeys/satEntries(lang, "FIELD", key)` and
`glossKeyedView(lang, "FIELD")`. Key resolution is **symmetric and NEVER mints**: a gloss with an
id resolves to it; a gloss with no id passes through gloss-keyed; a record id passes through. So
you never have to worry about mint-order — the seam can't shift `conceptIdSeq`.

## 1. Flip the type + registry
- `src/engine/types.ts`: change your field `FIELD…: Record<Meaning, X>` → `Record<LexemeId, X>`
  (value `X` unchanged). `LexemeId` is already imported in types.ts. (A pair-task flips both.)
- `src/engine/perMeaningFields.ts`: your field's registry entry `keyedBy: "gloss"` → `"lexemeId"`.
  Leave every other entry alone.

## 2. Let tsc drive the worklist
`npx tsc --noEmit` now reports every gloss-keyed access of your field as an error (`Meaning`/string
not assignable to `Record<LexemeId, …>`). That error list IS your worklist. Route each per §3.

## 3. Routing recipe (per site)
| Old | New |
|---|---|
| `lang.FIELD[m]` (read) | `satGet(lang, "FIELD", m)` |
| `lang.FIELD[m] ?? D` | `satGet(lang, "FIELD", m) ?? D` |
| `lang.FIELD[m] = v` | `satSet(lang, "FIELD", m, v)` |
| `lang.FIELD[m] !== undefined` / `m in lang.FIELD` | `satHas(lang, "FIELD", m)` |
| `delete lang.FIELD[m]` | `satDelete(lang, "FIELD", m)` |
| `Object.keys(lang.FIELD)` | `satKeys(lang, "FIELD")` → **LexemeId[]** |
| `Object.entries(lang.FIELD)` | `satEntries(lang, "FIELD")` → **[id, value][]** |

Import only the helpers you use, correct relative path (`./satellites` from `lexicon/`,
`../lexicon/satellites` elsewhere). The receiver may be `recipient`/`substrate`/`child`, not `lang`.

## 4. DON'T touch these (key-agnostic — stay correct after the flip)
`src/engine/tree/split.ts` and `src/engine/utils/clone.ts` spread/`Object.entries` the maps
wholesale; leave their lines exactly as-is. If `git status` shows them changed, revert them.

## 5. The two patterns that bite (from T3)
**(a) Engine boundary — the #1 cause of GENN divergence.** The phonology engine
(`phonology/apply.ts`) indexes some of these maps **by gloss** (it resolves the store key →
gloss via `glossOf`, then `map[gloss]`). If your field is passed **raw** into the engine — look in
`steps/phonology.ts` for `FIELD: lang.FIELD` inside the `applyChangesToLexicon`/ApplyOptions object
(e.g. `registerOf: lang.registerOf`) — you MUST wrap it: `FIELD: glossKeyedView(lang, "FIELD")`.
That rebuilds the gloss-keyed view the engine expects, byte-identical. (Derived locals like `ages`
/ `neighbourMomentum` that are *built from* your map are fine — just route their construction reads
via `satGet`; only RAW map pass-throughs need `glossKeyedView`.)

**(b) Iteration loop-body uses the key as a gloss.** After `satKeys`/`satEntries` the loop var is a
**LexemeId**. Any body use that treated it as a gloss must convert:
- needs the word's form → `lang.lexemes[id]?.form`
- needs the gloss string → `meaningForLexemeId(lang, id)` (import from `../lexicon/lexemeIdentity`)
  or `keylessGloss(lang.lexemes[id]!)` for keyless.
Order is preserved (insertion order), so RNG-coupled iterations stay byte-identical **if** the body
doesn't hash/seed from the key string (none of these do).

## 6. THE GATE — run all of it; commit only when all green
1. `npx tsc --noEmit` → **0 errors** (whole project).
2. Your map's owning FAST tests (see the master plan's task) + `npx vitest run --dir src lexical_diffusion`.
3. **Determinism (non-negotiable):**
   `RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline`
   Expect **all 6 presets GEN0+GENN byte-identical** (12 passed). The fast canary does NOT catch
   engine-boundary divergence — only this does.
   - If a preset's GENN FAILS: you have a gloss-read against id-keyed storage. 99% it's §5(a) — wrap
     the raw engine pass with `glossKeyedView`. Re-check every routed iteration body for §5(b).
   - **NEVER edit the expected hashes in meaning_layer_baseline.test.ts.** This sub-project is
     byte-identical by construction; a diff means a bug in your routing, not a real re-bake.
4. `git status`: only your map's source files + `types.ts` + `perMeaningFields.ts` changed
   (NOT tree/split.ts, NOT utils/clone.ts).

## 7. Test fixtures (the long tail — same split as T3)
Flipping the type also breaks test fixtures that set your field by gloss. Fix each:
- **Object-literal fixtures on a *minimal* hand-built lang** (no/empty `lexemeIds`): cast the
  literal `as Record<string, X>` (where X is the value type, e.g. `number`, `string`,
  `"high" | "low"`, `Meaning[]`). The seam passes through to gloss for ids-less langs, so the test
  stays consistent. BUT if the fixture's lang mints ids (its builder calls `lexSet` /
  `rekeyLexiconToLexemeIds`), add a re-key loop at the END of that builder (before `return lang`):
  ```ts
  const _f = lang.FIELD as Record<string, X>;
  for (const _g of Object.keys(_f)) { const _id = lang.lexemeIds?.[_g]; if (_id && _id !== _g) { _f[_id] = _f[_g]!; delete _f[_g]; } }
  ```
- **Statement accesses on a *sim* lang** (`createSimulation`/preset — populated `lexemeIds`): route
  through the seam (`satGet`/`satSet`/`satHas`), because production reads them by id.
- **Reads** anywhere → `satGet` is always safe (resolves correctly for both minimal and sim langs).
- Run the touched test files to confirm; the suite is the arbiter.

## 8. Mechanics that save you (from T3)
- Files are **CRLF**, and `String.split(find)` matches **substrings**, so a 4-space line nests
  inside a 6-space line. If you script the edits, use a **self-checking codemod**: assert each
  `find` matches its expected count BEFORE writing anything; anchor line-leading finds with a
  preceding `\n`; convert `\n`→`\r\n` for CRLF files. (Template below.) Put throwaway codemods in
  `scripts/` and DELETE them before committing.
- Prefer letting tsc enumerate sites over grepping.

```js
// scripts/_codemod-template.cjs — self-checking, buffered (writes only if all counts pass)
const fs=require("fs"),path=require("path"),ROOT=path.join(__dirname,"..","src","engine");
let failed=false;const cache=new Map();
const load=r=>{if(!cache.has(r))cache.set(r,fs.readFileSync(path.join(ROOT,r),"utf8"));return cache.get(r);};
function edit(r,find,rep,n=1){let s=load(r),f=find,p=rep;if(/^\s/.test(find)){f="\n"+f;p="\n"+p;}if(s.includes("\r\n")){f=f.replace(/\n/g,"\r\n");p=p.replace(/\n/g,"\r\n");}const c=s.split(f).length-1;if(c!==n){console.error(`MISCOUNT ${r}: want ${n} got ${c}`);failed=true;return;}cache.set(r,s.split(f).join(p));}
// ... edit(...) calls ...
if(failed){console.error("NOTHING WRITTEN");process.exit(1);}for(const[r,c]of cache)fs.writeFileSync(path.join(ROOT,r),c);console.log("ok "+cache.size);
```

## 9. Commit (in your worktree)
```
git add -A   # after confirming tree/split.ts + clone.ts are NOT staged
git commit -m "refactor(storage): re-key FIELD to LexemeId via satellite seam (S2a task N)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Local commit only. Do NOT push/PR. Report: task, files changed, the gate results (paste the
baseline `12 passed`), and any glossKeyedView/iteration-body conversions you made (the controller
needs these to reconcile the merge).
