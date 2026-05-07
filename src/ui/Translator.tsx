import { useEffect, useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import {
  translate,
  translateBetween,
  type TranslationResult,
} from "../engine/translator/translate";
import {
  translateSentence,
  reverseParseToTokens,
  type SentenceTranslation,
} from "../engine/translator/sentence";
import { findCognates, traceEtymology } from "../engine/translator/cognates";
import { glossToEnglish } from "../engine/translator/glossToEnglish";
import { formatForm } from "../engine/phonology/display";
import type { MorphCategory } from "../engine/morphology/types";
import { ScriptPicker } from "./ScriptPicker";
import { useDebounced } from "./hooks/useDebounced";
import { EmptyState } from "./components/EmptyState";

// Phase 50 T4: per-token resolution chip (lifted from EventsLog's KIND
// palette). Each rung gets a colour, label, and tooltip explaining how
// the form was found — `direct` means it was in the lexicon already,
// `synth-fallback` means the translator coined it on the spot.
const RESOLUTION_LABEL: Record<string, string> = {
  direct: "lex",
  concept: "cncp",
  colex: "↔",
  "reverse-colex": "↔",
  fallback: "?",
  "synth-affix": "+aff",
  "synth-neg-affix": "+neg",
  "synth-concept": "decom",
  "synth-cluster": "clust",
  "synth-fallback": "✦coin",
};
const RESOLUTION_COLOR: Record<string, string> = {
  direct: "var(--muted)",
  concept: "#a0d8ff",
  colex: "#c88dff",
  "reverse-colex": "#c88dff",
  fallback: "#ff6363",
  "synth-affix": "#7be0b5",
  "synth-neg-affix": "#ff8fd4",
  "synth-concept": "#9bdcff",
  "synth-cluster": "#80ffd4",
  "synth-fallback": "#ffd166",
};
const RESOLUTION_TOOLTIP: Record<string, string> = {
  direct: "looked up directly in the lexicon",
  concept: "concept-level lookup",
  colex: "colexified with another meaning",
  "reverse-colex": "reverse-colexified",
  fallback: "no resolution; placeholder",
  "synth-affix": "synthesized via stem + productive affix",
  "synth-neg-affix": "synthesized via negational affix",
  "synth-concept": "synthesized via concept decomposition",
  "synth-cluster": "synthesized via cluster composition",
  "synth-fallback":
    "translator coined this form on the fly; it is now in the language's lexicon and will evolve under sound change",
};

type Mode = "sentence" | "word" | "lang-to-lang" | "cognates" | "etymology";

export function Translator() {
  const state = useSimStore((s) => s.state);
  const script = useSimStore((s) => s.displayScript);
  const leaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const alive = useMemo(
    () => leaves.filter((id) => !state.tree[id]!.language.extinct),
    [leaves, state.tree],
  );

  const [mode, setMode] = useState<Mode>("sentence");
  const [langId, setLangId] = useState<string>(alive[0] ?? "");
  const [langIdB, setLangIdB] = useState<string>(alive[1] ?? alive[0] ?? "");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<MorphCategory | "">("");
  const [reverseDirection, setReverseDirection] = useState(false);
  const debouncedText = useDebounced(text, 250);

  useEffect(() => {
    if (alive.length === 0) return;
    if (!alive.includes(langId)) setLangId(alive[0]!);
  }, [alive, langId]);

  useEffect(() => {
    if (alive.length === 0) return;
    if (!alive.includes(langIdB)) {
      setLangIdB(alive.find((id) => id !== langId) ?? alive[0]!);
    }
  }, [alive, langId, langIdB]);

  const lang = langId ? state.tree[langId]?.language : undefined;
  const langB = langIdB ? state.tree[langIdB]?.language : undefined;
  const paradigmCats = lang
    ? (Object.keys(lang.morphology.paradigms) as MorphCategory[])
    : [];

  /**
   * As-you-type translation results, recomputed on debounced input change.
   * Memoised by [lang.id, generation, lang-to-lang lang.id, mode, debouncedText, category]
   * so identical input doesn't re-run the engine pipeline. translateSentence /
   * translate / translateBetween are deterministic for fixed lang+text, so
   * the memo is correct.
   */
  /**
   * Multi-sentence: split input on terminal punctuation (. ! ?) and
   * translate each piece independently. Each row gets its own
   * SentenceTranslation so the panel can show them stacked, like
   * Google Translate when you paste a paragraph.
   */
  const sentenceResults: SentenceTranslation[] = useMemo(() => {
    if (mode !== "sentence" || !lang || !debouncedText.trim()) return [];
    const trimmed = debouncedText.trim();
    const pieces = splitSentences(trimmed);
    if (reverseDirection) {
      return pieces.map((piece) => {
        const tokens = reverseParseToTokens(lang, piece);
        return {
          english: piece,
          englishTokens: [],
          targetTokens: tokens,
          arranged: tokens.map((t) => t.targetSurface),
          missing: tokens.filter((t) => t.englishLemma === "?").map((t) => t.targetSurface),
          notes: "",
        };
      });
    }
    return pieces.map((piece) => translateSentence(lang, piece));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang?.id, state.generation, mode, debouncedText, reverseDirection]);

  const wordResult: TranslationResult | null = useMemo(() => {
    if (mode === "sentence") return null;
    if (!lang || !debouncedText.trim()) return null;
    if (mode === "lang-to-lang") {
      if (!langB) return null;
      return translateBetween(lang, langB, debouncedText.trim());
    }
    if (mode === "word") {
      const opts = category ? { inflect: category } : {};
      return translate(lang, debouncedText.trim(), opts);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lang?.id,
    langB?.id,
    state.generation,
    mode,
    debouncedText,
    category,
  ]);

  // Legacy callers used `run()` (Enter / button click) — keep as a no-op
  // so existing call sites still compile, but the result is now driven by
  // debounced text changes automatically.
  const run = () => {
    /* deprecated: results are recomputed automatically via useMemo */
  };

  if (alive.length === 0) {
    return (
      <EmptyState
        icon="🗣️"
        title="No language to translate yet"
        hint="Step the simulation to bring at least one language into existence."
      />
    );
  }

  return (
    <div style={{ fontSize: 13, maxWidth: 760 }}>
      <div className="toolbar">
        {(["sentence", "word", "lang-to-lang", "cognates", "etymology"] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? "primary" : ""}
            onClick={() => {
              setMode(m);
            }}
          >
            {label(m)}
          </button>
        ))}
        {mode === "sentence" && (
          <button
            type="button"
            onClick={() => setReverseDirection((v) => !v)}
            title={
              reverseDirection
                ? "Reverse mode: type the target language, see English"
                : "English → target. Click to flip."
            }
            aria-label={
              reverseDirection ? "Switch to English to target" : "Switch to target to English"
            }
            className={reverseDirection ? "active" : ""}
            style={{ fontSize: 11 }}
          >
            {reverseDirection ? "← English" : "↕ Reverse"}
          </button>
        )}
        <span className="ml-auto">
          <ScriptPicker />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mode === "sentence" ? "1fr" : "1fr 1fr", gap: 8 }}>
        <select
          aria-label="Source language"
          value={langId}
          onChange={(e) => {
            setLangId(e.target.value);
          }}
        >
          {alive.map((id) => (
            <option key={id} value={id}>
              {state.tree[id]!.language.name}
            </option>
          ))}
        </select>
        {mode === "lang-to-lang" && (
          <select
            aria-label="Target language"
            value={langIdB}
            onChange={(e) => setLangIdB(e.target.value)}
          >
            {alive.map((id) => (
              <option key={id} value={id}>
                {state.tree[id]!.language.name}
              </option>
            ))}
          </select>
        )}
        {(mode === "word" || mode === "etymology" || mode === "cognates") && (
          <input
            type="text"
            placeholder={
              mode === "etymology" || mode === "cognates"
                ? "meaning (e.g. water)"
                : "English word"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Input"
          />
        )}
      </div>

      {mode === "sentence" && (
        <div className="mt-8">
          <textarea
            placeholder="Enter an English sentence (e.g. The dog sees the mother by the water)."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            aria-label="English sentence"
            style={{
              width: "100%",
              fontFamily: "inherit",
              fontSize: "var(--fs-2)",
              padding: 8,
              background: "var(--panel-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              resize: "vertical",
            }}
          />
        </div>
      )}

      {mode === "lang-to-lang" && (
        <div className="mt-8">
          <input
            type="text"
            placeholder="form in source language (e.g. vaθar)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Source form"
            style={{ width: "100%" }}
          />
        </div>
      )}

      {mode === "word" && paradigmCats.length > 0 && (
        <div className="mt-6">
          <label style={{ fontSize: 11, color: "var(--muted)", marginRight: 6 }}>
            Inflect as:
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MorphCategory | "")}
            aria-label="Morphology category"
          >
            <option value="">(bare form)</option>
            {paradigmCats.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {(mode === "sentence" || mode === "word" || mode === "lang-to-lang") &&
        text.trim() !== debouncedText.trim() && (
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 6,
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            translating…
          </div>
        )}

      {mode === "sentence" && lang && sentenceResults.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sentenceResults.map((result, i) => (
            <SentenceOutput
              key={i}
              result={result}
              lang={lang}
              script={script}
            />
          ))}
        </div>
      )}

      {wordResult && (mode === "word" || mode === "lang-to-lang") && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontFamily: "'SF Mono', Menlo, monospace",
              color: "var(--accent)",
            }}
          >
            {mode === "lang-to-lang" && langB
              ? wordResult.phonemes.length > 0
                ? formatForm(wordResult.phonemes, langB, script, text.trim().toLowerCase())
                : wordResult.form
              : lang && wordResult.phonemes.length > 0
                ? formatForm(wordResult.phonemes, lang, script, text.trim().toLowerCase())
                : wordResult.form}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            source: {wordResult.source} — {wordResult.notes}
          </div>
          {(() => {
            const targetLang = mode === "lang-to-lang" ? langB : lang;
            const meaning = text.trim().toLowerCase();
            const alts = targetLang?.altForms?.[meaning] ?? [];
            if (!targetLang || alts.length === 0) return null;
            const altSurfaces = alts.map((alt) =>
              formatForm(alt, targetLang, script, meaning),
            );
            return (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  marginTop: 4,
                  fontFamily: "'SF Mono', Menlo, monospace",
                }}
                title="Alternative forms (lexical doublets / synonyms)"
              >
                also: {altSurfaces.join(", ")}
              </div>
            );
          })()}
          {lang && lang.wordOriginChain?.[text.trim().toLowerCase()] && (
            <div
              style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
              title="Derivation chain"
            >
              ←{" "}
              {lang.wordOriginChain[text.trim().toLowerCase()]?.from}{" "}
              {"+ "}
              {lang.wordOriginChain[text.trim().toLowerCase()]?.via}
            </div>
          )}
        </div>
      )}

      {mode === "cognates" && text.trim() && (
        <CognatesTable meaning={text.trim().toLowerCase()} tree={state.tree} />
      )}

      {mode === "etymology" && lang && text.trim() && (
        <EtymologyTrace leafId={lang.id} meaning={text.trim().toLowerCase()} />
      )}
    </div>
  );
}

/**
 * Split a paragraph on terminal punctuation (. ! ?) so multi-sentence
 * input renders as stacked rows like Google Translate. Trailing
 * punctuation is dropped from each piece since translateSentence /
 * tokeniseEnglish already handle their own punctuation. Empty pieces
 * (consecutive punctuation, whitespace) are filtered.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function SentenceOutput({
  result,
  lang,
  script,
}: {
  result: SentenceTranslation;
  lang: import("../engine/types").Language;
  script: import("../engine/phonology/display").DisplayScript;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: "var(--fs-3)",
          fontFamily: "var(--font-mono)",
          color: "var(--accent)",
          marginBottom: 6,
        }}
      >
        {result.targetTokens.length === 0
          ? "—"
          : result.arranged
              .map((_, i) => {
                const tok = result.targetTokens[i]!;
                if (tok.targetForm.length === 0) return tok.targetSurface;
                return formatForm(tok.targetForm, lang, script, tok.englishLemma);
              })
              .join(" ")}
      </div>
      <div
        className="token-row"
      >
        {result.targetTokens.map((t, i) => (
          <div
            key={`${t.englishLemma}-${t.englishTag}-${i}`}
            className={`token-card token-card--${t.resolution}`}
            data-resolution={t.resolution}
            title={`${t.englishLemma} (${t.englishTag})${t.glossNote ? " · " + t.glossNote : ""} · ${RESOLUTION_TOOLTIP[t.resolution] ?? t.resolution}`}
          >
            <span className="token-form">
              {t.targetForm.length > 0 ? formatForm(t.targetForm, lang, script, t.englishLemma) : t.targetSurface}
            </span>
            <span className="token-gloss">
              {t.englishLemma}
              {t.glossNote && <> · {t.glossNote}</>}
            </span>
            <span
              className="token-chip"
              style={{ color: RESOLUTION_COLOR[t.resolution] ?? "var(--muted)" }}
            >
              {RESOLUTION_LABEL[t.resolution] ?? t.resolution}
            </span>
          </div>
        ))}
      </div>
      <div
        className="footer-note"
        style={{ marginTop: 8, fontStyle: "italic", color: "var(--muted)" }}
        title="Synthesized English from the target tokens' gloss metadata. SVO order, morphology applied (irregular pasts, plurals, 3sg, progressive)."
      >
        ← {glossToEnglish(result.targetTokens) || "(empty)"}
      </div>
      {(() => {
        // Phase 21e: surface disambiguation alternates as a one-line
        // footer when any token came from a polysemous form. The
        // "↔ X" annotations already appear inline on each token; this
        // footer summarises them for at-a-glance UX.
        const ambiguous = result.targetTokens
          .filter((t) => /^↔ /.test(t.glossNote))
          .map((t) => `${t.englishLemma} ${t.glossNote}`);
        if (ambiguous.length === 0) return null;
        return (
          <div
            className="footer-note"
            style={{ marginTop: 4, color: "var(--muted)" }}
            title="A homophone was disambiguated by sentence context. Click a token for the alternate sense."
          >
            ↔ disambiguated: {ambiguous.join(" · ")}
          </div>
        );
      })()}
      {result.missing.length > 0 && (
        <div className="footer-note warn">
          Unresolved: {result.missing.join(", ")}
        </div>
      )}
      <div className="footer-note">
        {result.notes}
      </div>
    </div>
  );
}

function label(m: Mode): string {
  switch (m) {
    case "sentence": return "English → Language";
    case "word": return "Single word";
    case "lang-to-lang": return "Language → Language";
    case "cognates": return "Cognates";
    case "etymology": return "Etymology";
  }
}

function CognatesTable({ meaning, tree }: { meaning: string; tree: import("../engine/types").LanguageTree }) {
  const script = useSimStore((s) => s.displayScript);
  const rows = useMemo(
    () => findCognates(tree, meaning, script),
    [tree, meaning, script],
  );
  return (
    <table
      style={{
        width: "100%",
        marginTop: 12,
        borderCollapse: "collapse",
        fontFamily: "'SF Mono', Menlo, monospace",
        fontSize: 12,
      }}
    >
      <thead>
        <tr className="t-muted">
          <th style={{ textAlign: "left", padding: "4px 6px" }}>language</th>
          <th style={{ textAlign: "left", padding: "4px 6px" }}>form</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.languageId} style={{ opacity: r.extinct ? 0.5 : 1 }}>
            <td style={{ padding: "3px 6px" }}>
              {r.languageName}
              {r.extinct && <span style={{ marginLeft: 4, color: "var(--danger)" }}>×</span>}
            </td>
            <td style={{ padding: "3px 6px", color: "var(--accent)" }}>{r.form}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EtymologyTrace({ leafId, meaning }: { leafId: string; meaning: string }) {
  const state = useSimStore((s) => s.state);
  const script = useSimStore((s) => s.displayScript);
  const steps = useMemo(
    () => traceEtymology(state.tree, leafId, meaning, script),
    [state.tree, leafId, meaning, script],
  );
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {steps.map((s, i) => (
        <div key={s.languageId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              padding: "4px 8px",
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontFamily: "'SF Mono', Menlo, monospace",
              fontSize: 12,
            }}
          >
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              {s.languageName} @ g{s.generation}
            </div>
            <div className="t-accent">{s.form}</div>
          </div>
          {i < steps.length - 1 && <span className="t-muted">→</span>}
        </div>
      ))}
    </div>
  );
}
