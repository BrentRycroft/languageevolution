import { useState } from "react";
import { useSimStore } from "../state/store";
import { formToString, isVowel, isConsonant, textToIpa } from "../engine/phonology/ipa";
import { toneOf, stripTone } from "../engine/phonology/tone";
import type { Lexicon, WordForm } from "../engine/types";

function phonemeIsKnown(p: string): boolean {
  const stripped = stripTone(p);
  if (isVowel(stripped) || isConsonant(stripped)) return true;
  // Tone-bearing vowel with tone mark.
  if (toneOf(p) && isVowel(stripped)) return true;
  return false;
}

/**
 * Parse a user-entered form. If the input already contains IPA-only
 * characters (θ, ð, ʃ, …) or a combining-diacritic cluster (m̩, á), it's
 * treated as authoritative and passed through grapheme-by-grapheme.
 * Plain ASCII letters run through `textToIpa` so users can type "think"
 * and have the engine receive /θ/ /i/ /n/ /k/.
 */
function parseForm(input: string): WordForm {
  return textToIpa(input);
}

export function SeedLexiconEditor({ onClose }: { onClose: () => void }) {
  const config = useSimStore((s) => s.config);
  const updateConfig = useSimStore((s) => s.updateConfig);

  const [draft, setDraft] = useState<Lexicon>(() => {
    const out: Lexicon = {};
    for (const m of Object.keys(config.seedLexicon)) out[m] = config.seedLexicon[m]!.slice();
    return out;
  });
  const [newMeaning, setNewMeaning] = useState("");
  const [newForm, setNewForm] = useState("");

  const sorted = Object.keys(draft).sort();

  const addEntry = () => {
    const m = newMeaning.trim().toLowerCase();
    if (!m) return;
    const f = parseForm(newForm.trim());
    if (f.length === 0) return;
    setDraft((d) => ({ ...d, [m]: f }));
    setNewMeaning("");
    setNewForm("");
  };

  const removeEntry = (m: string) => {
    setDraft((d) => {
      const copy = { ...d };
      delete copy[m];
      return copy;
    });
  };

  const updateForm = (m: string, value: string) => {
    const f = parseForm(value);
    setDraft((d) => ({ ...d, [m]: f }));
  };

  const showConfirm = useSimStore((s) => s.showConfirm);
  const apply = async () => {
    const unknown: string[] = [];
    for (const m of Object.keys(draft)) {
      for (const p of draft[m]!) {
        if (!phonemeIsKnown(p)) unknown.push(`${m}:${p}`);
      }
    }
    if (unknown.length > 0) {
      const sample = unknown.slice(0, 6).join(", ");
      const proceed = await showConfirm({
        title: `${unknown.length} unknown phoneme${unknown.length === 1 ? "" : "s"}`,
        message: `Some forms reference phonemes not in the IPA inventory (${sample}${unknown.length > 6 ? ", …" : ""}). Continue anyway?`,
        confirmLabel: "Continue",
      });
      if (!proceed) return;
    }
    const ok = await showConfirm({
      title: "Apply new seed lexicon?",
      message:
        "Applying a new seed lexicon resets the simulation to generation 0.",
      confirmLabel: "Apply & reset",
      danger: true,
    });
    if (!ok) return;
    updateConfig({ seedLexicon: draft });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: 16,
          maxWidth: 560,
          width: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Seed lexicon</h3>
          <span style={{ marginLeft: 8, color: "var(--muted)", fontSize: 11 }}>
            {sorted.length} entries — ASCII digraphs (th, sh, aa) are normalized to IPA
          </span>
          <button onClick={onClose} className="ml-auto">×</button>
        </div>

        <div
          style={{
            overflow: "auto",
            flex: 1,
            minHeight: 0,
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: 6,
          }}
        >
          {sorted.map((m) => (
            <div
              key={m}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 60px auto",
                gap: 6,
                padding: "3px 0",
                alignItems: "center",
                fontSize: 12,
              }}
            >
              <span className="t-muted">{m}</span>
              <input
                type="text"
                defaultValue={formToString(draft[m]!)}
                onBlur={(e) => updateForm(m, e.target.value)}
                style={{ fontFamily: "'SF Mono', Menlo, monospace" }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  fontFamily: "'SF Mono', Menlo, monospace",
                }}
              >
                {draft[m]!.length} phones
              </span>
              <button onClick={() => removeEntry(m)}>×</button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 6 }}>
          <input
            type="text"
            placeholder="meaning"
            value={newMeaning}
            onChange={(e) => setNewMeaning(e.target.value)}
          />
          <input
            type="text"
            placeholder="form (e.g. waater)"
            value={newForm}
            onChange={(e) => setNewForm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
            style={{ fontFamily: "'SF Mono', Menlo, monospace" }}
          />
          <button onClick={addEntry}>Add</button>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={apply}>
            Apply &amp; reset
          </button>
        </div>
      </div>
    </div>
  );
}
