import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { levenshtein } from "../engine/phonology/ipa";
import { TIER_LABELS, type Tier } from "../engine/lexicon/concepts";
import { formatElapsed } from "../engine/time";
import { YEARS_PER_GENERATION } from "../engine/constants";

function tempoBadge(conservatism: number): { icon: string; label: string; hue: number } {
  if (conservatism >= 1.3) return { icon: "🐢", label: "conservative", hue: 200 };
  if (conservatism <= 0.7) return { icon: "🐇", label: "innovative", hue: 30 };
  return { icon: "⏱", label: "balanced", hue: 120 };
}

function tierBadge(tier: Tier): { icon: string; label: string } {
  switch (tier) {
    case 0: return { icon: "🌿", label: TIER_LABELS[0] };
    case 1: return { icon: "🌾", label: TIER_LABELS[1] };
    case 2: return { icon: "🛕", label: TIER_LABELS[2] };
    case 3: return { icon: "🏭", label: TIER_LABELS[3] };
  }
}

export function StatsPanel() {
  const state = useSimStore((s) => s.state);
  const seed = useSimStore((s) => s.seedFormsByMeaning);
  const yearsPerGen = useSimStore(
    (s) => s.config.yearsPerGeneration ?? YEARS_PER_GENERATION,
  );

  const leaves = leafIds(state.tree);
  const alive = leaves.filter((id) => !state.tree[id]!.language.extinct);
  const extinct = leaves.filter((id) => state.tree[id]!.language.extinct);

  const meanings = Object.keys(seed);
  const stats = alive.map((id) => {
    const lang = state.tree[id]!.language;
    let total = 0;
    let count = 0;
    for (const m of meanings) {
      const form = lang.lexicon[m];
      const original = seed[m];
      if (form && original) {
        total += levenshtein(form, original);
        count++;
      }
    }
    // Phase 20 additions: visible counts for synonyms, frozen
    // orthography, and derivation chains.
    const altCount = lang.altForms
      ? Object.keys(lang.altForms).reduce(
          (s, k) => s + (lang.altForms![k]?.length ?? 0),
          0,
        )
      : 0;
    const frozenSpellings = lang.lexicalSpelling
      ? Object.keys(lang.lexicalSpelling).length
      : 0;
    const derivationChains = lang.wordOriginChain
      ? Object.keys(lang.wordOriginChain).length
      : 0;
    // Phase 21e: count polysemous words (≥2 senses) — homonyms like
    // English "bank" / "light" / "bear".
    const homonyms = lang.words
      ? lang.words.filter((w) => w.senses.length >= 2).length
      : 0;
    return {
      id,
      name: lang.name,
      age: state.generation - lang.birthGeneration,
      changes: lang.enabledChangeIds.length,
      mean: count > 0 ? total / count : 0,
      words: Object.keys(lang.lexicon).length,
      conservatism: lang.conservatism,
      tier: (lang.culturalTier ?? 0) as Tier,
      speakers: lang.speakers ?? 0,
      altCount,
      frozenSpellings,
      derivationChains,
      homonyms,
    };
  });

  return (
    <div style={{ fontSize: 11, color: "var(--muted)" }}>
      <div>
        gen {state.generation} · {alive.length} alive
        {extinct.length > 0 ? ` · ${extinct.length} extinct` : ""}
      </div>
      <table className="stats-table">
        <thead>
          <tr>
            <th>lang</th>
            <th className="text-center">tempo</th>
            <th className="text-center">tier</th>
            <th className="text-right">age</th>
            <th className="text-right">words</th>
            <th className="text-right" title="Alternate forms (synonyms / lexical doublets)">
              alts
            </th>
            <th className="text-right" title="Frozen lexical spellings (Phase 20a)">
              spell❄
            </th>
            <th
              className="text-right"
              title="Words coined via targeted derivation (e.g. freedom ← free + -dom)"
            >
              deriv
            </th>
            <th
              className="text-right"
              title="Homonyms — words carrying ≥2 senses (Phase 21, e.g. bank = financial / river)"
            >
              homo
            </th>
            <th className="text-right">δ</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => {
            const tempo = tempoBadge(s.conservatism);
            const tier = tierBadge(s.tier);
            return (
              <tr key={s.id}>
                <td className="t-text">{s.name}</td>
                <td
                  className="text-center"
                  title={`${tempo.label} (conservatism ${s.conservatism.toFixed(2)})`}
                >
                  {tempo.icon}
                </td>
                <td
                  className="text-center"
                  title={`${tier.label} — ${s.speakers.toLocaleString()} speakers`}
                >
                  {tier.icon}
                </td>
                <td
                  className="text-right"
                  title={`${s.age} generations · ${formatElapsed(s.age, yearsPerGen)}`}
                >
                  {formatElapsed(s.age, yearsPerGen)}
                </td>
                <td className="text-right">{s.words}</td>
                <td className="text-right">{s.altCount || ""}</td>
                <td className="text-right">{s.frozenSpellings || ""}</td>
                <td className="text-right">{s.derivationChains || ""}</td>
                <td className="text-right">{s.homonyms || ""}</td>
                <td className="text-right">{s.mean.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
