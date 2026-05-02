/**
 * Single source of truth for the tab bar. Used by App.tsx (rendering) and
 * useKeyboardShortcuts (number-key bindings). Keep in sync — changing the
 * order here changes what the 1-9 shortcuts jump to.
 */

export type TabId =
  | "tree"
  | "map"
  | "dictionary"
  | "timeline"
  | "grammar"
  | "phonemes"
  | "laws"
  | "events"
  | "translate"
  | "compare"
  | "cognates"
  | "sandbox"
  | "stats"
  | "wordmap"
  | "glossary";

export interface TabSpec {
  id: TabId;
  label: string;
  title: string;
}

export const TABS: TabSpec[] = [
  { id: "tree", label: "Tree", title: "Phylogenetic tree of languages" },
  { id: "map", label: "Map", title: "2-D map of where languages live" },
  {
    id: "dictionary",
    label: "Dictionary",
    title: "Lexicon + grammar profile of the selected language",
  },
  { id: "timeline", label: "Timeline", title: "Form changes + sound-law lifecycles over time" },
  { id: "grammar", label: "Grammar", title: "Grammar features of the selected language" },
  { id: "phonemes", label: "Phonemes", title: "Segmental + tonal inventory for the selected language" },
  { id: "laws", label: "Sound laws", title: "Procedurally-invented sound laws per language" },
  { id: "events", label: "History", title: "Event log for the selected language" },
  {
    id: "translate",
    label: "Translate",
    title: "Word + sentence translation tools (AI-assisted)",
  },
  {
    id: "compare",
    label: "Compare",
    title: "Side-by-side comparison of two languages — lexicon, narrative, cognates",
  },
  {
    id: "cognates",
    label: "Cognates",
    title: "Cognate-set explorer: every daughter's form for one meaning + MSA-reconstructed proto-form",
  },
  {
    id: "sandbox",
    label: "Sandbox",
    title: "Phonology sandbox: pick rules and apply them to a chosen word, deterministically",
  },
  { id: "stats", label: "Stats", title: "Per-language stats dashboard" },
  {
    id: "wordmap",
    label: "Words",
    title: "Word-centric view: each word and the meaning(s) it carries (Phase 21)",
  },
  { id: "glossary", label: "Glossary", title: "Reference for rule families, shift taxa, register" },
];
