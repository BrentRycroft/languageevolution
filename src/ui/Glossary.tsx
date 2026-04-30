
interface Entry {
  name: string;
  description: string;
  example?: string;
}

const RULE_FAMILIES: Entry[] = [
  {
    name: "lenition",
    description:
      "Weakening. Stops become fricatives, fricatives become /h/, voiceless consonants voice. Often triggered between vowels.",
    example: "Latin amīcus → Spanish amigo (intervocalic /k/ → /g/)",
  },
  {
    name: "fortition",
    description:
      "Strengthening. Approximants become fricatives, voiced obstruents devoice, especially word-finally.",
    example: "German Bund /bʊnt/ (underlying /d/ devoices at word end)",
  },
  {
    name: "place_assim",
    description:
      "Place assimilation. A segment takes on a neighbour's place of articulation.",
    example: "English in- + possible → impossible (n → m before labial)",
  },
  {
    name: "palatalization",
    description:
      "Consonants shift toward the palate near front vowels.",
    example: "Latin centum → Italian cento /tʃ/ (k before /e/)",
  },
  {
    name: "vowel_shift",
    description: "Vowels change height, backness, or rounding wholesale.",
    example: "Great Vowel Shift: Middle English /iː/ → Modern /aɪ/",
  },
  {
    name: "vowel_reduction",
    description: "Unstressed vowels collapse toward a central schwa, or delete.",
    example: "English photograph /oʊ/ vs. photography /ə/",
  },
  {
    name: "harmony",
    description:
      "Vowels or consonants agree with a neighbour across a word for a feature (height, backness, rounding).",
    example: "Turkish -ler/-lar plural suffix (front or back by harmony)",
  },
  {
    name: "deletion",
    description: "A segment drops outright, often at word edges or in clusters.",
    example: "Old English niht → Modern night (the /x/ is gone)",
  },
  {
    name: "metathesis",
    description: "Two adjacent sounds swap order.",
    example: "Old English brid → Modern bird",
  },
  {
    name: "tone",
    description:
      "Pitch becomes phonemic. Often born from coda voicing distinctions collapsing.",
    example: "Chinese qing ‘please’ vs. qìng ‘celebrate’ differ only by tone",
  },
];

const SHIFT_TAXA: Entry[] = [
  {
    name: "metonymy",
    description:
      "A word shifts to a meaning in the same conceptual neighbourhood (contiguity).",
    example: "crown (circlet) → the monarchy",
  },
  {
    name: "metaphor",
    description:
      "A word shifts across conceptual domains via analogy.",
    example: "head (body part) → head of a company",
  },
  {
    name: "narrowing",
    description:
      "A word's meaning becomes more specific over time.",
    example: "meat (any food) → flesh specifically",
  },
  {
    name: "broadening",
    description:
      "A word's meaning becomes more general over time.",
    example: "bird (young fowl) → any flying creature with feathers",
  },
];

const REGISTER_LABELS: Entry[] = [
  {
    name: "high",
    description:
      "Formal, literary, ritual, or prestigious usage. Often longer, borrowed, or archaic.",
    example: "English commence vs. start",
  },
  {
    name: "low",
    description:
      "Everyday, informal, colloquial. Typically shorter and native.",
    example: "English kid vs. child",
  },
];

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <h4 style={{ marginBottom: 8 }}>{title}</h4>
      <dl className="glossary-dl">
        {entries.map((e) => (
          <div key={e.name} className="glossary-row">
            <dt>{e.name}</dt>
            <dd>
              {e.description}
              {e.example && (
                <div className="glossary-example">e.g. {e.example}</div>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Glossary() {
  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ color: "var(--muted)", fontSize: "var(--fs-2)", marginBottom: 16 }}>
        Reference for terms the simulator uses in event logs and the Sound
        Laws panel. Descriptions are intentionally light — consult a proper
        historical-linguistics textbook for depth.
      </p>
      <Section title="Sound-rule families" entries={RULE_FAMILIES} />
      <Section title="Semantic-shift taxonomy" entries={SHIFT_TAXA} />
      <Section title="Register" entries={REGISTER_LABELS} />
    </div>
  );
}
