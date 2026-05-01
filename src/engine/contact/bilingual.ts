import type { Language, LanguageTree } from "../types";
import { leafIds } from "../tree/leafIds";
import { geoDistance } from "../geo";
import type { WorldMap } from "../geo/map";
import { arealShareAffinity } from "../geo/territory";

const TERRITORY_TO_BILINGUAL_SCALE = 0.6;
const DISTANCE_HALF_LIFE = 180;
const POPULATION_BALANCE_FLOOR = 0.1;

export function computeBilingualLinks(
  recipient: Language,
  tree: LanguageTree,
  worldMap?: WorldMap,
): Record<string, number> {
  const out: Record<string, number> = {};
  const sisters = leafIds(tree).filter(
    (id) => id !== recipient.id && !tree[id]!.language.extinct,
  );
  const recipPop = recipient.speakers ?? 10000;

  for (const id of sisters) {
    const donor = tree[id]!.language;

    let geoOverlap: number;
    if (worldMap && recipient.territory && donor.territory) {
      geoOverlap = arealShareAffinity(worldMap, recipient, donor);
    } else if (recipient.coords && donor.coords) {
      const d = geoDistance(recipient.coords, donor.coords);
      geoOverlap = DISTANCE_HALF_LIFE / (DISTANCE_HALF_LIFE + d);
    } else {
      geoOverlap = 0;
    }

    if (geoOverlap < 0.05) continue;

    const donorPop = donor.speakers ?? 10000;
    const minPop = Math.min(recipPop, donorPop);
    const maxPop = Math.max(recipPop, donorPop);
    const balance = Math.max(POPULATION_BALANCE_FLOOR, minPop / maxPop);

    const bilingualFraction = Math.min(0.85, geoOverlap * TERRITORY_TO_BILINGUAL_SCALE * Math.sqrt(balance));
    if (bilingualFraction > 0.02) {
      out[id] = bilingualFraction;
    }
  }

  return out;
}

export function bilingualLinkBetween(
  recipient: Language,
  donorId: string,
): number {
  return recipient.bilingualLinks?.[donorId] ?? 0;
}
