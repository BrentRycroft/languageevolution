import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { TEMPLATES } from "../engine/phonology/templates";
import { formToString } from "../engine/phonology/ipa";

interface Question {
  langId: string;
  meaning: string;
  protoForm: string;
  currentForm: string;
  correctTemplateId: string;
  correctDescription: string;
  options: Array<{ templateId: string; description: string; family: string }>;
}

function shuffled<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(((seed = (seed * 9301 + 49297) % 233280) / 233280) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function ReconstructionQuiz() {
  const state = useSimStore((s) => s.state);
  const seedForms = useSimStore((s) => s.seedFormsByMeaning);
  const [tick, setTick] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ right: 0, wrong: 0 });

  const question = useMemo<Question | null>(() => {
    const leaves = leafIds(state.tree).filter(
      (id) => (state.tree[id]!.language.activeRules?.length ?? 0) > 0,
    );
    if (leaves.length === 0) return null;
    const seed = tick + leaves.length * 7;
    const lid = leaves[seed % leaves.length]!;
    const lang = state.tree[lid]!.language;
    const meanings = Object.keys(lang.lexicon).filter(
      (m) => seedForms[m] && formToString(seedForms[m]!) !== formToString(lang.lexicon[m]!),
    );
    if (meanings.length === 0) return null;
    const m = meanings[seed % meanings.length]!;
    const proto = formToString(seedForms[m]!);
    const current = formToString(lang.lexicon[m]!);

    // Correct answer: one of the language's active rules.
    const rule = lang.activeRules![seed % lang.activeRules!.length]!;

    // Distractors: two other templates the language does NOT currently have.
    const heldTemplateIds = new Set(lang.activeRules!.map((r) => r.templateId));
    const distractors = TEMPLATES.filter((t) => !heldTemplateIds.has(t.id));
    const pickedDistractors = shuffled(distractors, seed).slice(0, 2);

    const options = shuffled(
      [
        {
          templateId: rule.templateId,
          description: rule.description,
          family: rule.family,
        },
        ...pickedDistractors.map((t) => ({
          templateId: t.id,
          description: describeTemplate(t.id),
          family: t.family,
        })),
      ],
      seed + 11,
    );

    return {
      langId: lid,
      meaning: m,
      protoForm: proto,
      currentForm: current,
      correctTemplateId: rule.templateId,
      correctDescription: rule.description,
      options,
    };
  }, [state, seedForms, tick]);

  if (!question) {
    return (
      <div style={{ color: "var(--muted)", padding: 12 }}>
        No language has invented a procedural rule yet — run the simulation a
        few more generations.
      </div>
    );
  }

  const lang = state.tree[question.langId]!.language;
  const submit = (templateId: string) => {
    if (revealed) return;
    setChoice(templateId);
    setRevealed(true);
    if (templateId === question.correctTemplateId) {
      setScore((s) => ({ ...s, right: s.right + 1 }));
    } else {
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    }
  };

  const next = () => {
    setChoice(null);
    setRevealed(false);
    setTick((t) => t + 1);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <h4 style={{ margin: 0 }}>Reconstruction quiz</h4>
        <span style={{ color: "var(--muted)", fontSize: "var(--fs-1)" }}>
          {score.right} right · {score.wrong} wrong
        </span>
      </div>
      <p style={{ fontSize: "var(--fs-2)", color: "var(--muted)" }}>
        Which sound law most plausibly derived this form in{" "}
        <strong>{lang.name}</strong>?
      </p>
      <div className="quiz-form">
        <span className="proto">{question.protoForm}</span>
        <span className="arrow">→</span>
        <span className="current">{question.currentForm}</span>
        <span className="meaning">&ldquo;{question.meaning}&rdquo;</span>
      </div>
      <div className="quiz-options">
        {question.options.map((opt) => {
          const isCorrect = opt.templateId === question.correctTemplateId;
          const chosen = choice === opt.templateId;
          const cls = revealed
            ? isCorrect
              ? "quiz-option correct"
              : chosen
                ? "quiz-option wrong"
                : "quiz-option"
            : "quiz-option";
          return (
            <button
              key={opt.templateId}
              className={cls}
              disabled={revealed}
              onClick={() => submit(opt.templateId)}
            >
              <span className="fam">{opt.family}</span>
              <span>{opt.description}</span>
            </button>
          );
        })}
      </div>
      {revealed && (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button onClick={next} className="primary">
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function describeTemplate(templateId: string): string {
  const t = TEMPLATES.find((tpl) => tpl.id === templateId);
  if (!t) return templateId;
  // Call propose on a placeholder to get a description; many templates return
  // null for an empty inventory. We fall back to the id if so.
  return t.id.replace(/_/g, " ").replace(/\./g, " — ");
}
