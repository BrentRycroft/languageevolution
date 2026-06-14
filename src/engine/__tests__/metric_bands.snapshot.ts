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

// Captured 2026-06-13 from `RUN_SLOW=1 vitest realism_scorecard` (single-lineage,
// 200 gens). G0 is behavior-neutral, so these are the current/correct values.
// Values verified reproducible across two consecutive runs (identical JSON).
// NB: english.regularShare is intentionally OMITTED — its actuationShare has no
// matching events over the single lineage (total=0 → NaN), so it cannot be banded;
// an unbanded metric is simply skipped by the gate.
export const METRIC_BANDS: Record<string, Partial<Record<MetricId, MetricBand>>> = {
  pie: {
    swadesh1000: { value: 0.7666666666666667, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.5111111111111111, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.2696629213483146, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 38, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 2.4299065420560746, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.02524271844660194, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.06832577293217407, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.12233009708737864, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.23495145631067962, ...DEFAULT_BANDS.homophonyRate },
  },
  bantu: {
    swadesh1000: { value: 0.313953488372093, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.47674418604651164, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.4186046511627907, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 35, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 3.7330960854092528, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.011472275334608031, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.06832577293217407, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.0965583173996176, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.14053537284894838, ...DEFAULT_BANDS.homophonyRate },
  },
  romance: {
    swadesh1000: { value: 0.32954545454545453, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.4318181818181818, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.3181818181818182, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 28, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 4.6957928802588995, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.005551700208188758, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.09586654743460335, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.004163775156141568, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.11172796668979876, ...DEFAULT_BANDS.homophonyRate },
  },
  germanic: {
    swadesh1000: { value: 0.32954545454545453, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.2159090909090909, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.1590909090909091, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 30, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 3.3870967741935485, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.013461538461538462, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.06832577293217407, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.0019230769230769232, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.19230769230769232, ...DEFAULT_BANDS.homophonyRate },
  },
  tokipona: {
    swadesh1000: { value: 0.45, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.6833333333333333, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.6666666666666666, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 20, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 6.005747126436781, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.021052631578947368, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.09998925637154628, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.20669856459330144, ...DEFAULT_BANDS.voicelessStopShare },
    regularShare: { value: 1, ...DEFAULT_BANDS.regularShare },
    homophonyRate: { value: 0.22679425837320574, ...DEFAULT_BANDS.homophonyRate },
  },
  english: {
    swadesh1000: { value: 0.8588235294117647, ...DEFAULT_BANDS.swadesh1000 },
    swadesh2500: { value: 0.788235294117647, ...DEFAULT_BANDS.swadesh2500 },
    swadesh5000: { value: 0.6235294117647059, ...DEFAULT_BANDS.swadesh5000 },
    invSize: { value: 46, ...DEFAULT_BANDS.invSize },
    sizeRatio: { value: 2.8219178082191783, ...DEFAULT_BANDS.sizeRatio },
    colexRate: { value: 0.00977729494839761, ...DEFAULT_BANDS.colexRate },
    antonymCosine: { value: 0.17236665672995974, ...DEFAULT_BANDS.antonymCosine },
    voicelessStopShare: { value: 0.0043454644215100485, ...DEFAULT_BANDS.voicelessStopShare },
    // regularShare omitted (NaN over the single lineage — see header).
    homophonyRate: { value: 0.12112982074959261, ...DEFAULT_BANDS.homophonyRate },
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
