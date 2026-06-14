/**
 * Metric-stability snapshot bands (G0). The re-bakeable regression baseline that
 * replaces byte-identity: each metric must stay within `band` of `value`
 * (absolute if `absolute`, else relative fraction). Update a `value` DELIBERATELY
 * (with a dated comment) when a change legitimately moves a metric — same
 * discipline as the old hash re-bakes, but tolerant to small drift.
 *
 * `value`s captured 2026-xx-xx from `RUN_SLOW=1 vitest realism_scorecard` (G0 is
 * behavior-neutral, so the captured values are the current/correct ones).
 */
export type MetricId =
  | "swadesh1000" | "swadesh2500" | "swadesh5000"
  | "invSize" | "sizeRatio" | "colexRate" | "antonymCosine"
  | "voicelessStopShare" | "regularShare" | "homophonyRate";

export interface MetricBand {
  /** Recorded reference value (captured; see header). */
  value: number;
  /** Half-width of the tolerance band. Absolute units if `absolute`, else a relative fraction. */
  band: number;
  absolute: boolean;
}

/** Default band per metric type (used when filling the snapshot below). */
export const DEFAULT_BANDS: Record<MetricId, { band: number; absolute: boolean }> = {
  swadesh1000: { band: 0.05, absolute: true },
  swadesh2500: { band: 0.05, absolute: true },
  swadesh5000: { band: 0.05, absolute: true },
  invSize: { band: 4, absolute: true },
  sizeRatio: { band: 0.3, absolute: true },
  colexRate: { band: 0.05, absolute: true },
  antonymCosine: { band: 0.15, absolute: true },
  voicelessStopShare: { band: 0.05, absolute: true },
  regularShare: { band: 0.15, absolute: false },
  homophonyRate: { band: 0.05, absolute: true },
};

// RE-BAKED 2026-06-14 for G1 (geometric meaning inventory): the inventory shifted
// from the hand ~1,800-concept list to the 2,423-concept embedding vocabulary, so
// the Swadesh-retention curve and several lexical metrics moved DELIBERATELY. Values
// captured from `RUN_SLOW=1 vitest realism_scorecard` (single-lineage, 200 gens);
// per-machine reproducibility is guaranteed by reproducibility.test.ts, so a single
// capture is the reproducible value. (Original G0 capture was 2026-06-13.)
// NB: tokipona.regularShare is intentionally OMITTED — its actuationShare has no
// matching events over the single lineage (total=0 → NaN), so it cannot be banded;
// an unbanded metric is simply skipped by the gate. (Under G0 this NaN preset was
// english; the inventory shift moved it to tokipona.)
export const METRIC_BANDS: Record<string, Partial<Record<MetricId, MetricBand>>> = {
  pie: {
    swadesh1000: { value: 0.872093023255814, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.5647058823529412, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.34523809523809523, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 39, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 2.3154205607476634, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.0163098878695209, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.09998925637154628, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.02854230377166157, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.24464831804281345, ...DEFAULT_BANDS.homophonyRate },
  },
  bantu: {
    swadesh1000: { value: 0.38372093023255816, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.313953488372093, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.12048192771084337, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 32, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 3.2562277580071175, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.01425438596491228, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.12536328650698708, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.06359649122807018, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.07236842105263158, ...DEFAULT_BANDS.homophonyRate },
  },
  romance: {
    swadesh1000: { value: 0.5795454545454546, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.27586206896551724, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.20930232558139536, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 32, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 4.705501618122978, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.014522821576763486, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.20323259572415425, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.1970954356846473, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.11618257261410789, ...DEFAULT_BANDS.homophonyRate },
  },
  germanic: {
    swadesh1000: { value: 0.26744186046511625, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.27906976744186046, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.16455696202531644, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 34, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 3.0161290322580645, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.00646551724137931, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.12536328650698708, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.11099137931034483, ...DEFAULT_BANDS.homophonyRate },
  },
  tokipona: {
    swadesh1000: { value: 0.5172413793103449, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.603448275862069, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.5178571428571429, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 12, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 4.551724137931035, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.022727272727272728, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.2181647040201299, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.23484848484848486, ...DEFAULT_BANDS.voicelessStopShare },
    // regularShare omitted (NaN over the single lineage — see header).
    homophonyRate: { value: 0.29292929292929293, ...DEFAULT_BANDS.homophonyRate },
  },
  english: {
    swadesh1000: { value: 0.8235294117647058, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.7647058823529411, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.5529411764705883, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 45, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 2.8051750380517504, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.004915346805024577, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.16335616932406205, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.3489896231567449, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.2080830147460404, ...DEFAULT_BANDS.homophonyRate },
  },
};

export function bandFor(presetId: string, metric: MetricId): MetricBand | undefined {
  return METRIC_BANDS[presetId]?.[metric];
}

export function withinBand(actual: number, b: MetricBand): boolean {
  if (!Number.isFinite(actual)) return false;
  const half = b.absolute ? b.band : Math.abs(b.value) * b.band;
  return actual >= b.value - half && actual <= b.value + half;
}
