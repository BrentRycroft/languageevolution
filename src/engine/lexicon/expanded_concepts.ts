import type { Meaning } from "../types";
import type { POS } from "./pos";

/**
 * Expanded concept registry — adds tier-1 (agricultural), tier-2
 * (iron-age), and tier-3 (modern) vocabulary to what BASIC_240 ships.
 *
 * Kept separate from `BASIC_240` (in `basic240.ts`) on purpose:
 *
 *   - `BASIC_240` is the **proto-seed pool** that every preset's
 *     `fillMissing` populates at gen 0. Adding a tier-3 concept like
 *     "telegraph" there would cause Proto-Indo-European to ship with
 *     a word for "telegraph" — absurd.
 *   - This module is consumed only by `concepts.ts::CONCEPTS` so it
 *     enters the dictionary at concept-registry level. The tier
 *     gate in `genesis/need.ts::lexicalNeed` then prevents
 *     low-tier languages from coining for tier-2/3 concepts until
 *     they advance.
 *
 * Each concept here ships with explicit POS + cluster + tier so we
 * don't have to thread the new vocabulary through `pos.ts`,
 * `clusters.ts`, and `TIER_OVERRIDES` separately.
 */

export interface ExpandedConcept {
  id: Meaning;
  pos: POS;
  cluster: string;
  tier: 0 | 1 | 2 | 3;
}

// Helpers so the per-tier arrays below stay readable.
function noun(id: string, cluster: string, tier: 0 | 1 | 2 | 3): ExpandedConcept {
  return { id, pos: "noun", cluster, tier };
}
function verb(id: string, cluster: string, tier: 0 | 1 | 2 | 3): ExpandedConcept {
  return { id, pos: "verb", cluster, tier };
}
function adj(id: string, cluster: string, tier: 0 | 1 | 2 | 3): ExpandedConcept {
  return { id, pos: "adjective", cluster, tier };
}

// ---------------------------------------------------------------------------
// Tier 1 — agricultural / neolithic
// ---------------------------------------------------------------------------

const TIER_1: ExpandedConcept[] = [
  // Crops + cultivars (most field crops are already in BASIC_240,
  // these add the cultivar diversity that any agriculturally-aware
  // language eventually develops vocabulary for)
  noun("rye", "plants", 1),
  noun("oat", "plants", 1),
  noun("millet", "plants", 1),
  noun("sorghum", "plants", 1),
  noun("yam", "plants", 1),
  noun("taro", "plants", 1),
  noun("cassava", "plants", 1),
  noun("lentil", "plants", 1),
  noun("chickpea", "plants", 1),
  noun("flax", "plants", 1),
  noun("hemp", "plants", 1),
  noun("cotton", "plants", 1),
  noun("orchard", "environment", 1),
  noun("vineyard", "environment", 1),
  noun("garden", "environment", 1),
  noun("furrow", "environment", 1),
  noun("granary", "tools", 1),
  noun("barn", "tools", 1),
  noun("stable", "tools", 1),
  noun("pen", "tools", 1),
  noun("fence", "tools", 1),
  noun("well-water", "tools", 1),

  // Animal husbandry
  noun("herd", "animals", 1),
  noun("flock", "animals", 1),
  noun("yoke-pair", "tools", 1),
  noun("bridle-rein", "tools", 1),
  noun("shepherd", "kinship", 1),
  noun("herder", "kinship", 1),
  noun("milkmaid", "kinship", 1),
  noun("dairy", "tools", 1),

  // Food preparation + cuisine
  noun("yoghurt", "food", 1),
  noun("curds", "food", 1),
  noun("whey", "food", 1),
  noun("mead", "food", 1),
  noun("vinegar", "food", 1),
  noun("salt-pork", "food", 1),
  noun("dried-fruit", "food", 1),
  noun("preserve", "food", 1),
  noun("ferment", "food", 1),
  noun("oven", "tools", 1),
  noun("hearth-stone", "tools", 1),
  noun("kettle", "tools", 1),
  noun("cauldron", "tools", 1),
  noun("ladle", "tools", 1),
  noun("mortar-bowl", "tools", 1),
  noun("pestle", "tools", 1),
  noun("sieve", "tools", 1),
  noun("strainer", "tools", 1),
  verb("knead", "action", 1),
  verb("ferment-v", "action", 1),
  verb("brew", "action", 1),
  verb("smoke-meat", "action", 1),
  verb("salt-v", "action", 1),
  verb("dry-v", "action", 1),
  verb("grind", "action", 1),
  verb("churn", "action", 1),

  // Textiles + clothing
  noun("spindle", "tools", 1),
  noun("distaff", "tools", 1),
  noun("shuttle", "tools", 1),
  noun("yarn", "clothing", 1),
  noun("dye", "clothing", 1),
  noun("tunic", "clothing", 1),
  noun("cloak", "clothing", 1),
  noun("mantle", "clothing", 1),
  noun("apron", "clothing", 1),
  noun("buckle", "tools", 1),
  noun("buttonhole", "clothing", 1),
  verb("spin-thread", "action", 1),
  verb("weave-v", "action", 1),
  verb("dye-v", "action", 1),
  verb("sew-v", "action", 1),
  verb("knit", "action", 1),
  verb("embroider", "action", 1),

  // Pottery + crafts
  noun("kiln", "tools", 1),
  noun("clay-pot", "tools", 1),
  noun("jar", "tools", 1),
  noun("amphora", "tools", 1),
  noun("urn", "tools", 1),
  noun("brick", "tools", 1),
  noun("tile", "tools", 1),
  noun("wheel-potter", "tools", 1),
  verb("bake-pot", "action", 1),
  verb("mould", "action", 1),
  verb("glaze", "action", 1),

  // Settlement
  noun("hamlet", "abstract", 1),
  noun("road-stone", "environment", 1),
  noun("bridge", "tools", 1),
  noun("ford", "environment", 1),
  noun("market-square", "abstract", 1),
  noun("granary-house", "tools", 1),
  noun("well-shaft", "environment", 1),

  // Roles + ritual
  noun("elder-council", "abstract", 1),
  noun("priestess", "kinship", 1),
  noun("shaman", "kinship", 1),
  noun("healer", "kinship", 1),
  noun("midwife", "kinship", 1),
  noun("bard", "kinship", 1),
  noun("smith-village", "kinship", 1),
  noun("oath-stone", "abstract", 1),
  noun("blessing", "abstract", 1),
  noun("offering", "abstract", 1),
  noun("rite-passage", "abstract", 1),

  // Cooking adjectives + qualities
  adj("ripe-fruit", "quality", 1),
  adj("rotten-food", "quality", 1),
  adj("salted", "quality", 1),
  adj("smoked", "quality", 1),
  adj("fermented", "quality", 1),
  adj("freshly-baked", "quality", 1),
];

// ---------------------------------------------------------------------------
// Tier 2 — iron-age / classical
// ---------------------------------------------------------------------------

const TIER_2: ExpandedConcept[] = [
  // Metallurgy
  noun("smelter", "tools", 2),
  noun("forge", "tools", 2),
  noun("bellows", "tools", 2),
  noun("crucible", "tools", 2),
  noun("ingot", "tools", 2),
  noun("ore", "environment", 2),
  noun("slag", "environment", 2),
  noun("nail-iron", "tools", 2),
  noun("rivet", "tools", 2),
  noun("chain", "tools", 2),
  noun("lock", "tools", 2),
  noun("key", "tools", 2),
  noun("hinge", "tools", 2),
  noun("blade", "tools", 2),
  noun("dagger", "tools", 2),
  noun("scabbard", "tools", 2),
  noun("helmet", "tools", 2),
  noun("breastplate", "tools", 2),
  noun("shield-iron", "tools", 2),
  noun("bow-composite", "tools", 2),
  noun("crossbow", "tools", 2),
  noun("javelin", "tools", 2),
  verb("smelt", "action", 2),
  verb("forge-v", "action", 2),
  verb("temper", "action", 2),
  verb("hammer-v", "action", 2),
  verb("cast-metal", "action", 2),
  verb("polish", "action", 2),

  // City-states + governance
  noun("citadel", "abstract", 2),
  noun("acropolis", "abstract", 2),
  noun("city-wall", "abstract", 2),
  noun("gate", "tools", 2),
  noun("watchtower", "tools", 2),
  noun("harbour", "environment", 2),
  noun("dock", "tools", 2),
  noun("warehouse", "tools", 2),
  noun("treasury", "abstract", 2),
  noun("granary-state", "tools", 2),
  noun("council-hall", "abstract", 2),
  noun("forum", "abstract", 2),
  noun("agora", "abstract", 2),
  noun("court-of-law", "abstract", 2),
  noun("jury", "abstract", 2),
  noun("witness", "kinship", 2),
  noun("judge", "kinship", 2),
  noun("magistrate", "kinship", 2),
  noun("governor", "kinship", 2),
  noun("emperor", "kinship", 2),
  noun("queen", "kinship", 2),
  noun("noble", "kinship", 2),
  noun("knight", "kinship", 2),
  noun("commoner", "kinship", 2),
  noun("citizen", "kinship", 2),
  noun("subject", "kinship", 2),
  noun("vassal", "kinship", 2),
  noun("peasant", "kinship", 2),
  noun("serf", "kinship", 2),
  noun("slave-bond", "kinship", 2),
  noun("steward", "kinship", 2),
  noun("herald", "kinship", 2),
  noun("messenger", "kinship", 2),
  noun("ambassador", "kinship", 2),

  // Law + administration
  noun("statute", "abstract", 2),
  noun("decree", "abstract", 2),
  noun("edict", "abstract", 2),
  noun("treaty", "abstract", 2),
  noun("oath-state", "abstract", 2),
  noun("verdict", "abstract", 2),
  noun("crime", "abstract", 2),
  noun("punishment", "abstract", 2),
  noun("fine", "abstract", 2),
  noun("ransom", "abstract", 2),
  noun("tribute", "abstract", 2),
  noun("toll", "abstract", 2),
  noun("inheritance", "abstract", 2),
  noun("contract", "abstract", 2),
  verb("decree-v", "action", 2),
  verb("rule-v", "action", 2),
  verb("judge-v", "action", 2),
  verb("punish", "action", 2),
  verb("pardon", "action", 2),
  verb("convict", "action", 2),
  verb("acquit", "action", 2),

  // Writing + literacy + accounting
  noun("scribe", "kinship", 2),
  noun("scroll", "tools", 2),
  noun("tablet", "tools", 2),
  noun("seal-stamp", "tools", 2),
  noun("ink", "tools", 2),
  noun("quill", "tools", 2),
  noun("stylus", "tools", 2),
  noun("parchment", "tools", 2),
  noun("papyrus", "tools", 2),
  noun("manuscript", "tools", 2),
  noun("library", "abstract", 2),
  noun("archive", "abstract", 2),
  noun("ledger", "tools", 2),
  noun("tally", "tools", 2),
  noun("abacus", "tools", 2),
  verb("inscribe", "action", 2),
  verb("copy-v", "action", 2),
  verb("seal-v", "action", 2),
  verb("count-tally", "action", 2),

  // Trade + commerce
  noun("market-day", "abstract", 2),
  noun("merchant", "kinship", 2),
  noun("trader", "kinship", 2),
  noun("caravan", "tools", 2),
  noun("ship-trade", "tools", 2),
  noun("port", "environment", 2),
  noun("warehouse-trade", "tools", 2),
  noun("coin", "tools", 2),
  noun("silver-coin", "tools", 2),
  noun("gold-coin", "tools", 2),
  noun("scale-balance", "tools", 2),
  noun("weight-stone", "tools", 2),
  noun("measure", "tools", 2),
  noun("price", "abstract", 2),
  noun("value", "abstract", 2),
  noun("debt", "abstract", 2),
  noun("loan", "abstract", 2),
  noun("interest", "abstract", 2),
  noun("profit", "abstract", 2),
  noun("loss", "abstract", 2),
  noun("bargain", "abstract", 2),
  noun("guild", "abstract", 2),
  verb("trade-v", "action", 2),
  verb("barter", "action", 2),
  verb("haggle", "action", 2),
  verb("import-v", "action", 2),
  verb("export-v", "action", 2),
  verb("ship-v", "action", 2),

  // Trade goods
  noun("silk", "clothing", 2),
  noun("linen", "clothing", 2),
  noun("velvet", "clothing", 2),
  noun("ivory", "tools", 2),
  noun("amber", "tools", 2),
  noun("pearl", "tools", 2),
  noun("gem", "tools", 2),
  noun("ruby", "tools", 2),
  noun("sapphire", "tools", 2),
  noun("emerald", "tools", 2),
  noun("incense", "food", 2),
  noun("myrrh", "food", 2),
  noun("perfume", "food", 2),
  noun("dye-purple", "clothing", 2),

  // Warfare + military
  noun("army", "abstract", 2),
  noun("legion", "abstract", 2),
  noun("regiment", "abstract", 2),
  noun("phalanx", "abstract", 2),
  noun("cavalry", "abstract", 2),
  noun("infantry", "abstract", 2),
  noun("archer", "kinship", 2),
  noun("captain", "kinship", 2),
  noun("general", "kinship", 2),
  noun("commander", "kinship", 2),
  noun("scout", "kinship", 2),
  noun("siege", "abstract", 2),
  noun("battle", "abstract", 2),
  noun("campaign", "abstract", 2),
  noun("retreat", "abstract", 2),
  noun("victory", "abstract", 2),
  noun("defeat", "abstract", 2),
  noun("conquest", "abstract", 2),
  noun("garrison", "abstract", 2),
  noun("fortress", "tools", 2),
  noun("rampart", "tools", 2),
  noun("moat", "tools", 2),
  noun("battering-ram", "tools", 2),
  noun("catapult", "tools", 2),
  noun("siege-tower", "tools", 2),
  noun("chariot", "tools", 2),
  verb("march-v", "action", 2),
  verb("charge-v", "action", 2),
  verb("retreat-v", "action", 2),
  verb("besiege", "action", 2),
  verb("conquer", "action", 2),
  verb("surrender", "action", 2),
  verb("rebel", "action", 2),

  // Religion + ritual + temples
  noun("temple-grand", "abstract", 2),
  noun("altar", "abstract", 2),
  noun("shrine", "abstract", 2),
  noun("sanctuary", "abstract", 2),
  noun("pilgrim", "kinship", 2),
  noun("pilgrimage", "abstract", 2),
  noun("monk", "kinship", 2),
  noun("nun", "kinship", 2),
  noun("priest-high", "kinship", 2),
  noun("oracle", "kinship", 2),
  noun("prophet", "kinship", 2),
  noun("scripture", "abstract", 2),
  noun("psalm", "abstract", 2),
  noun("hymn", "abstract", 2),
  noun("vow", "abstract", 2),
  noun("creed", "abstract", 2),
  noun("heresy", "abstract", 2),
  noun("sacred", "abstract", 2),
  noun("profane", "abstract", 2),
  verb("pray", "action", 2),
  verb("worship", "action", 2),
  verb("bless-v", "action", 2),
  verb("curse-v", "action", 2),
  verb("anoint", "action", 2),
  verb("baptise", "action", 2),

  // Education + scholarship
  noun("scholar", "kinship", 2),
  noun("philosopher", "kinship", 2),
  noun("astronomer", "kinship", 2),
  noun("physician", "kinship", 2),
  noun("apothecary", "kinship", 2),
  noun("school-academy", "abstract", 2),
  noun("academy", "abstract", 2),
  noun("treatise", "abstract", 2),
  noun("commentary", "abstract", 2),
  noun("lesson", "abstract", 2),
  noun("disciple", "kinship", 2),
  noun("master-teacher", "kinship", 2),
  verb("study", "action", 2),
  verb("debate", "action", 2),
  verb("teach-v", "action", 2),
  verb("lecture", "action", 2),
  verb("tutor", "action", 2),

  // Astronomy + measurement of time
  noun("zodiac", "abstract", 2),
  noun("eclipse", "environment", 2),
  noun("planet", "environment", 2),
  noun("comet", "environment", 2),
  noun("constellation", "environment", 2),
  noun("calendar", "abstract", 2),
  noun("century", "time", 2),
  noun("decade", "time", 2),
  noun("hour-clock", "time", 2),
  noun("week-named", "time", 2),
  noun("season-marker", "time", 2),

  // Civic professions + crafts
  noun("baker", "kinship", 2),
  noun("butcher", "kinship", 2),
  noun("brewer", "kinship", 2),
  noun("carpenter", "kinship", 2),
  noun("mason", "kinship", 2),
  noun("blacksmith", "kinship", 2),
  noun("goldsmith", "kinship", 2),
  noun("tailor", "kinship", 2),
  noun("cobbler", "kinship", 2),
  noun("weaver-prof", "kinship", 2),
  noun("dyer", "kinship", 2),
  noun("tanner", "kinship", 2),
  noun("potter-prof", "kinship", 2),
  noun("miller", "kinship", 2),
  noun("fisher-prof", "kinship", 2),
  noun("hunter-prof", "kinship", 2),
  noun("farmer-prof", "kinship", 2),
  noun("artisan", "kinship", 2),
  noun("apprentice", "kinship", 2),

  // Built environment
  noun("palace", "abstract", 2),
  noun("mansion", "abstract", 2),
  noun("courtyard", "abstract", 2),
  noun("garden-formal", "abstract", 2),
  noun("aqueduct", "tools", 2),
  noun("fountain", "tools", 2),
  noun("statue", "tools", 2),
  noun("monument", "tools", 2),
  noun("column", "tools", 2),
  noun("dome", "tools", 2),
  noun("vault", "tools", 2),
  noun("arch", "tools", 2),
  noun("mosaic", "tools", 2),
  noun("fresco", "tools", 2),

  // Abstract notions
  noun("freedom", "abstract", 2),
  noun("tyranny", "abstract", 2),
  noun("equality", "abstract", 2),
  noun("liberty", "abstract", 2),
  noun("philosophy", "abstract", 2),
  noun("logic", "abstract", 2),
  noun("rhetoric", "abstract", 2),
  noun("ethics", "abstract", 2),
  noun("destiny", "abstract", 2),
  noun("providence", "abstract", 2),
  noun("revelation", "abstract", 2),
  adj("noble-quality", "quality", 2),
  adj("base-quality", "quality", 2),
  adj("just-quality", "quality", 2),
  adj("unjust-quality", "quality", 2),
  adj("eloquent", "quality", 2),
  adj("learned", "quality", 2),
  adj("ignorant", "quality", 2),
];

// ---------------------------------------------------------------------------
// Tier 3 — modern (industrial / civic / scientific / digital)
// ---------------------------------------------------------------------------
//
// Populated in the next chunk so the file diff stays reviewable.

const TIER_3: ExpandedConcept[] = [];

export const EXPANDED_CONCEPTS: readonly ExpandedConcept[] = [
  ...TIER_1,
  ...TIER_2,
  ...TIER_3,
];
