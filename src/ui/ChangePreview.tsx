import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { CATALOG_BY_ID, CATALOG } from "../engine/phonology/catalog";
import { applyChangesToWord } from "../engine/phonology/apply";
import { formToString } from "../engine/phonology/ipa";
import { makeRng } from "../engine/rng";

export function ChangePreview() {
  const config = useSimStore((s) => s.config);
  const seed = useSimStore((s) => s.seedFormsByMeaning);
  const meanings = useMemo(() => Object.keys(seed).sort(), [seed]);
  const [meaning, setMeaning] = useState<string>(meanings[0] ?? "");
  const [changeId, setChangeId] = useState<string>(config.phonology.enabledChangeIds[0] ?? CATALOG[0]!.id);

  const form = seed[meaning];
  const change = CATALOG_BY_ID[changeId];

  const preview = useMemo(() => {
    if (!form || !change) return null;
    const prob = change.probabilityFor(form);
    // Force-apply (probability 1) to see the deterministic result.
    const applied = applyChangesToWord(form, [change], makeRng("preview"), {
      globalRate: 999,
      weights: { [change.id]: 999 },
    });
    return { prob, applied };
  }, [form, change]);

  if (!form || !change || !preview) {
    return (
      <div style={{ fontSize: 11, color: "var(--muted)" }}>Select a word and a change.</div>
    );
  }

  return (
    <div style={{ fontSize: 11, display: "grid", gap: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <select value={meaning} onChange={(e) => setMeaning(e.target.value)} style={{ fontSize: 11 }}>
          {meanings.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select value={changeId} onChange={(e) => setChangeId(e.target.value)} style={{ fontSize: 11 }}>
          {CATALOG.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div
        style={{
          fontFamily: "'SF Mono', Menlo, monospace",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 6,
          padding: 4,
          background: "var(--panel-2)",
          borderRadius: 3,
        }}
      >
        <span>{formToString(form)}</span>
        <span style={{ color: "var(--muted)" }}>→</span>
        <span style={{ color: "var(--accent)" }}>{formToString(preview.applied)}</span>
      </div>
      <div style={{ color: "var(--muted)" }}>
        natural p = {preview.prob.toFixed(3)} per generation for this word
      </div>
    </div>
  );
}
