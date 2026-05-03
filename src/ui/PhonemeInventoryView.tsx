import { useMemo } from "react";
import { useSimStore } from "../state/store";
import { featuresOf } from "../engine/phonology/features";
import { isVowel, isSyllabic } from "../engine/phonology/ipa";
import { profileBadge } from "../engine/phonology/phonotactics";
import { functionalLoadMap } from "../engine/phonology/functionalLoad";
import type { Phoneme } from "../engine/types";

export function PhonemeInventoryView() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const lang = selectedLangId ? state.tree[selectedLangId]?.language : undefined;
  const proto = state.tree[state.rootId]?.language;

  const sections = useMemo(() => {
    if (!lang) return [];
    const inv = lang.phonemeInventory.segmental;
    const buckets: Record<string, Phoneme[]> = {
      "Stops": [],
      "Fricatives": [],
      "Affricates": [],
      "Nasals": [],
      "Liquids & trills": [],
      "Glides": [],
      "Vowels": [],
      "Other": [],
    };
    for (const p of inv) {
      const f = featuresOf(p);
      if (!f) {
        buckets["Other"]!.push(p);
        continue;
      }
      if (f.type === "vowel") {
        buckets["Vowels"]!.push(p);
        continue;
      }
      switch (f.manner) {
        case "stop":
          buckets["Stops"]!.push(p);
          break;
        case "affricate":
          buckets["Affricates"]!.push(p);
          break;
        case "fricative":
          buckets["Fricatives"]!.push(p);
          break;
        case "nasal":
          buckets["Nasals"]!.push(p);
          break;
        case "liquid":
        case "trill":
        case "tap":
        case "approximant":
          buckets["Liquids & trills"]!.push(p);
          break;
        case "glide":
          buckets["Glides"]!.push(p);
          break;
        default:
          buckets["Other"]!.push(p);
      }
    }
    for (const key of Object.keys(buckets)) {
      buckets[key]!.sort();
    }
    return Object.entries(buckets).filter(([, v]) => v.length > 0);
  }, [lang]);

  if (!lang) {
    return (
      <div style={{ color: "var(--muted)", padding: 12, fontSize: "var(--fs-2)" }}>
        Pick a language to see its phoneme inventory.
      </div>
    );
  }

  const protoSet = new Set(proto?.phonemeInventory.segmental ?? []);
  const usesTones = lang.phonemeInventory.usesTones;
  const tones = lang.phonemeInventory.tones;

  // Phase 27b UI: per-phoneme functional load (homophones-on-merger
  // proportion). Used to tint inventory cells — high load = saturated,
  // low load = faded merger candidate.
  const loadMap = functionalLoadMap(lang, state.generation);

  const innovative = lang.phonemeInventory.segmental.filter(
    (p) => !protoSet.has(p),
  );
  const lost = (proto?.phonemeInventory.segmental ?? []).filter(
    (p) => !lang.phonemeInventory.segmental.includes(p),
  );

  return (
    <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
          fontSize: "var(--fs-2)",
        }}
      >
        <span className="t-muted">
          {lang.name} · {lang.phonemeInventory.segmental.length} segmental
          {usesTones ? ` + ${tones.length} tones` : ""}
          {" · "}stress {lang.stressPattern ?? "penult"}
          {lang.stressPattern === "lexical" && lang.lexicalStress
            ? ` (${Object.keys(lang.lexicalStress).length} overrides)`
            : ""}
          {/* Phase 27a: syllable-shape badge */}
          {lang.phonotacticProfile
            ? ` · syllable ${profileBadge(lang.phonotacticProfile)}`
            : ""}
        </span>
        <span className="label-line">
          <span style={{ color: "var(--accent-2)" }}>●</span> innovative vs proto · 🤝 areal · 🔧 internal rule · faded = low functional load
        </span>
      </div>

      {sections.map(([label, items]) => (
        <section key={label} style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: "var(--fs-1)",
              color: "var(--muted)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {label} ({items.length})
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              fontFamily: "var(--font-mono)",
            }}
          >
            {items.map((p) => {
              const isNew = !protoSet.has(p);
              const isNucleus = isVowel(p) || isSyllabic(p);
              const prov = lang.inventoryProvenance?.[p];
              const provIcon =
                prov?.source === "areal"
                  ? "🤝"
                  : prov?.source === "internal-rule"
                    ? "🔧"
                    : "";
              const provText =
                prov?.source === "areal"
                  ? prov.sourceLangName
                    ? `Areal — borrowed from ${prov.sourceLangName}`
                    : "Areal — borrowed from a sister"
                  : prov?.source === "internal-rule"
                    ? `Internal rule${prov.generation ? ` (gen ${prov.generation})` : ""}`
                    : "Native (inherited from proto)";
              const load = loadMap[p] ?? 0;
              const loadLabel =
                load >= 0.2
                  ? "high (essential — many minimal pairs)"
                  : load >= 0.05
                    ? "moderate"
                    : "low (merger candidate — few minimal pairs)";
              const loadOpacity = 0.45 + 0.55 * Math.min(1, load * 4);
              return (
                <span
                  key={p}
                  title={`${p} — ${provText}${isNew ? " · new since proto" : ""} · functional load: ${loadLabel}`}
                  style={{
                    minWidth: 28,
                    padding: "2px 8px",
                    textAlign: "center",
                    borderRadius: "var(--r-1)",
                    border: `1px solid ${
                      isNew ? "var(--accent-2)" : "var(--border)"
                    }`,
                    background: isNucleus
                      ? "var(--panel-2)"
                      : "var(--panel)",
                    color: "var(--text)",
                    opacity: loadOpacity,
                    fontSize: "var(--fs-2)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  {p}
                  {provIcon && (
                    <span style={{ fontSize: 9, opacity: 0.85 }}>{provIcon}</span>
                  )}
                </span>
              );
            })}
          </div>
        </section>
      ))}

      {usesTones && tones.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: "var(--fs-1)",
              color: "var(--muted)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Tones ({tones.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tones.map((t) => (
              <span
                key={t}
                style={{
                  minWidth: 28,
                  padding: "2px 8px",
                  textAlign: "center",
                  borderRadius: "var(--r-1)",
                  border: "1px solid var(--border)",
                  background: "var(--panel)",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-2)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {(innovative.length > 0 || lost.length > 0) && proto && (
        <section
          style={{
            marginTop: 20,
            padding: 8,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-2)",
            fontSize: "var(--fs-1)",
          }}
        >
          <div style={{ color: "var(--muted)", marginBottom: 4 }}>
            Changes since {proto.name}
          </div>
          {innovative.length > 0 && (
            <div>
              <span style={{ color: "var(--accent-2)" }}>+</span>{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {innovative.join(" ")}
              </span>
            </div>
          )}
          {lost.length > 0 && (
            <div>
              <span style={{ color: "var(--muted-2)" }}>−</span>{" "}
              <span style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}>
                {lost.join(" ")}
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
