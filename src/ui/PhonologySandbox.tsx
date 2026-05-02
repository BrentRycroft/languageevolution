import { useState, useMemo } from "react";
import { useSimStore } from "../state/store";
import { applyGeneratedRule } from "../engine/phonology/generated";
import { formToString, textToIpa } from "../engine/phonology/ipa";
import { formatForm } from "../engine/phonology/display";
import { makeRng } from "../engine/rng";
import { ListSearch } from "./ListSearch";
import { CopyButton } from "./CopyButton";

/**
 * Phonology sandbox.
 *
 * Pick the selected language's active rules and apply them deterministically
 * to a chosen word from the lexicon (or any IPA string typed by the user).
 * Useful for understanding what each rule actually does, debugging unexpected
 * outputs, and exploring chain effects by replaying the active rule list in
 * sequence.
 */
export function PhonologySandbox() {
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const lang = useSimStore((s) =>
    selectedLangId ? s.state.tree[selectedLangId]?.language : undefined,
  );
  const script = useSimStore((s) => s.displayScript);

  const [filter, setFilter] = useState("");
  const [meaning, setMeaning] = useState<string>("");
  const [customIpa, setCustomIpa] = useState("");
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());

  const sortedMeanings = useMemo(() => {
    if (!lang) return [];
    return Object.keys(lang.lexicon).sort();
  }, [lang]);

  const baseForm = useMemo(() => {
    if (!lang) return [];
    if (customIpa.trim()) return textToIpa(customIpa.trim());
    if (meaning && lang.lexicon[meaning]) return lang.lexicon[meaning]!.slice();
    return [];
  }, [lang, meaning, customIpa]);

  const filteredRules = useMemo(() => {
    if (!lang) return [];
    const all = lang.activeRules ?? [];
    if (!filter.trim()) return all;
    const q = filter.trim().toLowerCase();
    return all.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.family.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }, [lang, filter]);

  // Apply each selected rule sequentially with strength=1.0 (force-fire)
  // so the sandbox is deterministic regardless of the rule's natural rate.
  const stages = useMemo(() => {
    if (!lang || baseForm.length === 0) return [];
    const out: Array<{ ruleId: string; description: string; result: string[] }> = [];
    let cur = baseForm.slice();
    for (const r of filteredRules) {
      if (!selectedRuleIds.has(r.id)) continue;
      const forced = { ...r, strength: 1 };
      const next = applyGeneratedRule(forced, cur, makeRng("sandbox"));
      out.push({ ruleId: r.id, description: r.description, result: next });
      cur = next;
    }
    return out;
  }, [lang, baseForm, filteredRules, selectedRuleIds]);

  const finalForm = stages.length > 0 ? stages[stages.length - 1]!.result : baseForm;

  if (!lang) {
    return (
      <div className="t-muted" style={{ padding: 12 }}>
        Select a language to explore its rules.
      </div>
    );
  }

  const renderForm = (f: string[]) =>
    script === "ipa" ? formToString(f) : formatForm(f, lang, script, meaning || undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 4 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>{lang.name}</h4>
        <span className="label-line">
          {(lang.activeRules ?? []).length} active rules · sandbox is deterministic (rules fire at strength = 1.0)
        </span>
      </header>

      <section>
        <div className="label-line" style={{ marginBottom: 4 }}>
          word
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={meaning}
            onChange={(e) => {
              setMeaning(e.target.value);
              setCustomIpa("");
            }}
            aria-label="Pick a meaning from the lexicon"
            style={{ minWidth: 160 }}
          >
            <option value="">—</option>
            {sortedMeanings.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="t-muted" style={{ fontSize: 11 }}>
            or
          </span>
          <input
            type="text"
            value={customIpa}
            onChange={(e) => {
              setCustomIpa(e.target.value);
              if (e.target.value.trim()) setMeaning("");
            }}
            placeholder="custom IPA (e.g. pater)"
            aria-label="Custom IPA input"
            style={{
              flex: 1,
              minWidth: 140,
              padding: "3px 6px",
              fontSize: 12,
              border: "1px solid var(--border)",
              borderRadius: "var(--r-1)",
              background: "var(--panel-2)",
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>
      </section>

      {baseForm.length > 0 && (
        <section
          style={{
            padding: 10,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-2)",
          }}
        >
          <div className="label-line" style={{ marginBottom: 4 }}>
            input → output
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-3)",
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>/{renderForm(baseForm)}/</span>
            <span className="t-muted" style={{ fontSize: 14 }}>
              →
            </span>
            <span>/{renderForm(finalForm)}/</span>
            <CopyButton text={() => renderForm(finalForm)} title="Copy output" />
          </div>
          {stages.length === 0 && (
            <div className="t-muted" style={{ fontSize: 11, marginTop: 4 }}>
              Select one or more rules below to apply. With no rules selected, output equals input.
            </div>
          )}
        </section>
      )}

      {stages.length > 0 && (
        <section>
          <div className="label-line" style={{ marginBottom: 4 }}>
            stage by stage
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {stages.map((s, i) => (
              <div
                key={`${s.ruleId}-${i}`}
                style={{ borderBottom: "1px solid var(--border)", paddingBottom: 4 }}
              >
                <span className="t-muted">{i + 1}. {s.ruleId}</span>
                <span style={{ color: "var(--accent)", marginLeft: 8 }}>
                  /{renderForm(s.result)}/
                </span>
                <div className="t-muted" style={{ fontSize: 11 }}>{s.description}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div
          className="label-line"
          style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
        >
          <span style={{ flex: 1 }}>active rules ({filteredRules.length})</span>
          <ListSearch
            value={filter}
            onChange={setFilter}
            placeholder="Filter rules…"
            label="Filter active rules"
            style={{ flex: 1, minWidth: 160, maxWidth: 240 }}
          />
          {selectedRuleIds.size > 0 && (
            <button
              type="button"
              className="ghost"
              style={{ fontSize: 11, padding: "2px 8px" }}
              onClick={() => setSelectedRuleIds(new Set())}
              title="Clear selection"
            >
              clear
            </button>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            maxHeight: 320,
            overflowY: "auto",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-1)",
          }}
        >
          {filteredRules.map((r) => {
            const checked = selectedRuleIds.has(r.id);
            return (
              <label
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "20px 1fr",
                  gap: 6,
                  padding: "4px 6px",
                  borderBottom: "1px solid var(--border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  cursor: "pointer",
                  background: checked ? "var(--accent-soft)" : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setSelectedRuleIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      return next;
                    });
                  }}
                />
                <div>
                  <div>
                    <span className="t-muted">[{r.family}]</span> {r.description}
                  </div>
                  <div className="t-muted" style={{ fontSize: 10 }}>
                    str {r.strength.toFixed(2)} · {r.id}
                  </div>
                </div>
              </label>
            );
          })}
          {filteredRules.length === 0 && (
            <div className="t-muted" style={{ padding: 8, fontSize: 11 }}>
              No active rules{filter.trim() ? " match the filter" : ""}.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
