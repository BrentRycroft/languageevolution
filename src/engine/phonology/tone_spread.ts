import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { isToneBearing, stripTone, toneOf, capToneStacking } from "./tone";
import { setLexiconForm } from "../lexicon/mutate";

export function maybeSpreadTone(
  lang: Language,
  rng: Rng,
  probability: number,
): number {
  if (!lang.phonemeInventory.usesTones) return 0;
  let changed = 0;
  for (const m of Object.keys(lang.lexicon)) {
    const form = lang.lexicon[m]!;
    if (!rng.chance(probability)) continue;
    const next = spreadOnce(form, rng);
    if (next !== form) {
      // Phase 29 Tranche 1 round 2: route through chokepoint.
      setLexiconForm(lang, m, next, { bornGeneration: 0, origin: "tone-spread" });
      changed++;
    }
  }
  return changed;
}

function spreadOnce(form: WordForm, rng: Rng): WordForm {
  const sites: Array<{ from: number; to: number; tone: string }> = [];
  for (let i = 0; i < form.length; i++) {
    const t = toneOf(form[i]!);
    if (!t || !isToneBearing(form[i]!)) continue;
    for (const d of [-2, -1, 1, 2]) {
      const j = i + d;
      if (j < 0 || j >= form.length) continue;
      const target = form[j]!;
      if (!isToneBearing(target)) continue;
      if (toneOf(target)) continue;
      sites.push({ from: i, to: j, tone: t });
    }
  }
  if (sites.length === 0) return form;
  const site = sites[rng.int(sites.length)]!;
  const out = form.slice();
  const base = stripTone(out[site.to]!);
  // Phase 30 Tranche 30a: cap tone stacking on the spread target.
  out[site.to] = capToneStacking(base + site.tone);
  return out;
}
