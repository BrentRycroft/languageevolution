import { CATALOG_BY_ID } from "./src/engine/phonology/catalog.ts";
import { applyChangesToWord } from "./src/engine/phonology/apply.ts";
import { makeRng } from "./src/engine/rng.ts";

function fireRule(id, word, seed = "s", trials = 200) {
  const rule = CATALOG_BY_ID[id];
  if (!rule) { console.log(`MISSING RULE ${id}`); return; }
  const outcomes = {};
  for (let t = 0; t < trials; t++) {
    const rng = makeRng(seed + t);
    const opts = { globalRate: 1, weights: { [id]: 1 }, rateMultiplier: 1 };
    const out = applyChangesToWord(word.slice(), [rule], rng, opts, "test");
    const key = out.join("");
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
  console.log(`\n[${id}]  in: /${word.join("")}/`);
  for (const [k, n] of Object.entries(outcomes).sort((a,b)=>b[1]-a[1])) {
    console.log(`   /${k}/  ×${n}`);
  }
}

// Vocalisation: coda glide → vowel.  /aj/ -> /ai/, /aw/ -> /au/
fireRule("vocalization.glide_to_vowel_coda", ["a", "j"]);
fireRule("vocalization.glide_to_vowel_coda", ["k", "a", "w", "t"]);
// gliding: hiatus high vowel -> glide. /fi.a/ (f i a) -> /fja/ ; here /j/ romanises "y"
fireRule("gliding.vowel_to_glide_prevocalic", ["f", "i", "a"]);
fireRule("gliding.vowel_to_glide_prevocalic", ["d", "u", "a"]);
// dissimilation: r...r -> l...r
fireRule("dissimilation.liquid", ["p", "e", "r", "e", "g", "r", "i"]);
// regressive voicing
fireRule("assimilation.regressive_voicing", ["a", "t", "b", "a"]);
// yod coalescence  /tja/ -> /tʃa/
fireRule("assimilation.yod_coalescence", ["t", "j", "a"]);
// intervocalic spirantisation b->β
fireRule("lenition.intervocalic_voiced_stop_to_fricative", ["a", "b", "a"]);
// initial glide fortition  j-> dʒ
fireRule("fortition.glide_to_obstruent_initial", ["j", "a", "m"]);
