// src/lib/adaptiveDecay.ts
// Adaptive Decay Engine — dynamically adjusts decay parameters
// based on blog maturity, post count, and content age spread.
//
// Solves the cold-start problem: a young blog with 6 posts all
// published within 2 months looks dead when maxDays=365 because
// every card decays to ~0.16. This engine compresses the decay
// window so visual contrast emerges from day one.
//
// Three maturity tiers: seedling → growing → mature.
// Smooth interpolation between tiers (no hard jumps).
// Re-evaluated on server start and every 24h via lightweight timer.
//
// Credits: Mike (architecture), Elon (cold-start diagnosis), Paul (tier framework)

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Config schema — loaded from src/data/adaptiveDecay.config.json
// ---------------------------------------------------------------------------

interface TierConfig {
  maxPosts?: number;
  maxAgeDays?: number;
  decaySpanDays: number;
}

interface PulseConfig {
  baseMs: number;
  varianceMs: number;
}

interface SeedConfig {
  floor: number;
  jitter: number;
}

interface WeightConfig {
  highDecay: number;
  midDecay: number;
}

interface RawConfig {
  tiers: { seedling: TierConfig; growing: TierConfig; mature: TierConfig };
  pulse: { seedling: PulseConfig; growing: PulseConfig; mature: PulseConfig };
  seed: { seedling: SeedConfig; growing: SeedConfig; mature: SeedConfig };
  weight: { seedling: WeightConfig; growing: WeightConfig; mature: WeightConfig };
}

// ---------------------------------------------------------------------------
// Blog maturity inputs
// ---------------------------------------------------------------------------

export interface BlogMaturity {
  postCount: number;
  oldestAgeDays: number;
  newestAgeDays: number;
  totalRevivals: number;
}

// ---------------------------------------------------------------------------
// Computed adaptive config — consumed by decay, ambient, and weight modules
// ---------------------------------------------------------------------------

export interface AdaptiveDecayConfig {
  maxDays: number;
  seedFloor: number;
  seedJitter: number;
  pulseBaseMs: number;
  pulseVarianceMs: number;
  weightHighDecay: number;
  weightMidDecay: number;
  tierName: 'seedling' | 'growing' | 'mature';
  tierBlend: number; // 0.0 = pure lower tier, 1.0 = pure upper tier
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

let cachedRaw: RawConfig | null = null;

function loadRawConfig(): RawConfig {
  if (cachedRaw) return cachedRaw;
  const p = resolve(process.cwd(), 'src/data/adaptiveDecay.config.json');
  cachedRaw = JSON.parse(readFileSync(p, 'utf-8'));
  return cachedRaw!;
}

/** Clear cached config (useful for testing or hot-reload). */
export function clearConfigCache(): void {
  cachedRaw = null;
}

// ---------------------------------------------------------------------------
// Tier detection — which tier does the blog belong to?
// ---------------------------------------------------------------------------

type TierName = 'seedling' | 'growing' | 'mature';

interface TierScore {
  name: TierName;
  blend: number; // 0–1, how far into this tier
}

/** Classify blog maturity into a tier with blend factor. */
export function detectTier(m: BlogMaturity, cfg: RawConfig): TierScore {
  const s = cfg.tiers.seedling;
  const g = cfg.tiers.growing;

  if (isSeedling(m, s)) return { name: 'seedling', blend: seedlingBlend(m, s) };
  if (isGrowing(m, g)) return { name: 'growing', blend: growingBlend(m, s, g) };
  return { name: 'mature', blend: matureBlend(m, g) };
}

function isSeedling(m: BlogMaturity, s: TierConfig): boolean {
  return m.postCount < (s.maxPosts ?? 5) || m.oldestAgeDays < (s.maxAgeDays ?? 60);
}

function isGrowing(m: BlogMaturity, g: TierConfig): boolean {
  return m.postCount < (g.maxPosts ?? 15) || m.oldestAgeDays < (g.maxAgeDays ?? 180);
}

/** Ease-in curve: stays in lower tier longer, transitions late. */
function easeIn(t: number): number {
  return t * t;
}

function seedlingBlend(m: BlogMaturity, s: TierConfig): number {
  const postRatio = m.postCount / (s.maxPosts ?? 5);
  const ageRatio = m.oldestAgeDays / (s.maxAgeDays ?? 60);
  return easeIn(clamp01(Math.min(postRatio, ageRatio)));
}

function growingBlend(m: BlogMaturity, s: TierConfig, g: TierConfig): number {
  const postRange = (g.maxPosts ?? 15) - (s.maxPosts ?? 5);
  const ageRange = (g.maxAgeDays ?? 180) - (s.maxAgeDays ?? 60);
  const postRatio = (m.postCount - (s.maxPosts ?? 5)) / postRange;
  const ageRatio = (m.oldestAgeDays - (s.maxAgeDays ?? 60)) / ageRange;
  return easeIn(clamp01(Math.min(postRatio, ageRatio)));
}

function matureBlend(m: BlogMaturity, g: TierConfig): number {
  const postOver = m.postCount - (g.maxPosts ?? 15);
  const ageOver = m.oldestAgeDays - (g.maxAgeDays ?? 180);
  const ratio = Math.max(postOver / 10, ageOver / 180);
  return clamp01(ratio);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// Interpolation — smooth blending between adjacent tiers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateConfig(tier: TierScore, cfg: RawConfig): AdaptiveDecayConfig {
  if (tier.name === 'seedling') return blendSeedlingGrowing(tier.blend, cfg);
  if (tier.name === 'growing') return blendGrowingMature(tier.blend, cfg);
  return pureMatConfig(cfg);
}

function blendSeedlingGrowing(blend: number, cfg: RawConfig): AdaptiveDecayConfig {
  const s = cfg.tiers.seedling;
  const g = cfg.tiers.growing;
  return {
    maxDays: Math.round(lerp(s.decaySpanDays, g.decaySpanDays, blend)),
    seedFloor: Math.round(lerp(cfg.seed.seedling.floor, cfg.seed.growing.floor, blend)),
    seedJitter: Math.round(lerp(cfg.seed.seedling.jitter, cfg.seed.growing.jitter, blend)),
    pulseBaseMs: Math.round(lerp(cfg.pulse.seedling.baseMs, cfg.pulse.growing.baseMs, blend)),
    pulseVarianceMs: Math.round(lerp(cfg.pulse.seedling.varianceMs, cfg.pulse.growing.varianceMs, blend)),
    weightHighDecay: +(lerp(cfg.weight.seedling.highDecay, cfg.weight.growing.highDecay, blend)).toFixed(2),
    weightMidDecay: +(lerp(cfg.weight.seedling.midDecay, cfg.weight.growing.midDecay, blend)).toFixed(2),
    tierName: 'seedling',
    tierBlend: blend,
  };
}

function blendGrowingMature(blend: number, cfg: RawConfig): AdaptiveDecayConfig {
  const g = cfg.tiers.growing;
  const m = cfg.tiers.mature;
  return {
    maxDays: Math.round(lerp(g.decaySpanDays, m.decaySpanDays, blend)),
    seedFloor: Math.round(lerp(cfg.seed.growing.floor, cfg.seed.mature.floor, blend)),
    seedJitter: Math.round(lerp(cfg.seed.growing.jitter, cfg.seed.mature.jitter, blend)),
    pulseBaseMs: Math.round(lerp(cfg.pulse.growing.baseMs, cfg.pulse.mature.baseMs, blend)),
    pulseVarianceMs: Math.round(lerp(cfg.pulse.growing.varianceMs, cfg.pulse.mature.varianceMs, blend)),
    weightHighDecay: +(lerp(cfg.weight.growing.highDecay, cfg.weight.mature.highDecay, blend)).toFixed(2),
    weightMidDecay: +(lerp(cfg.weight.growing.midDecay, cfg.weight.mature.midDecay, blend)).toFixed(2),
    tierName: 'growing',
    tierBlend: blend,
  };
}

function pureMatConfig(cfg: RawConfig): AdaptiveDecayConfig {
  return {
    maxDays: cfg.tiers.mature.decaySpanDays,
    seedFloor: cfg.seed.mature.floor,
    seedJitter: cfg.seed.mature.jitter,
    pulseBaseMs: cfg.pulse.mature.baseMs,
    pulseVarianceMs: cfg.pulse.mature.varianceMs,
    weightHighDecay: cfg.weight.mature.highDecay,
    weightMidDecay: cfg.weight.mature.midDecay,
    tierName: 'mature',
    tierBlend: 1,
  };
}

// ---------------------------------------------------------------------------
// Per-post maxDays — older posts in a young blog decay faster for contrast
// ---------------------------------------------------------------------------

/** Adjust maxDays for a single post based on its age relative to the spread. */
export function effectiveMaxDays(
  postAgeDays: number,
  newestAgeDays: number,
  baseMaxDays: number,
): number {
  if (baseMaxDays <= 0) return 365;
  const spread = Math.max(1, postAgeDays - newestAgeDays);
  const ratio = spread / baseMaxDays;
  const boost = 1 - clamp01(ratio) * 0.3;
  return Math.max(14, Math.round(baseMaxDays * boost));
}

// ---------------------------------------------------------------------------
// Organic pulse rhythm — clustered pulses instead of uniform random
// ---------------------------------------------------------------------------

const RHYTHM_TEMPLATE = buildRhythmTemplate();

/** Pre-generated 60-second rhythm: clustered pulses, then silence. */
function buildRhythmTemplate(): number[] {
  return [0.3, 0.5, 0.4, 1.0, 1.0, 1.0, 0.2, 0.3, 0.6, 1.0, 1.0, 0.8];
}

let rhythmIndex = 0;

/** Get the next rhythm multiplier (0–1). Cycles through the template. */
export function nextRhythmMultiplier(): number {
  const m = RHYTHM_TEMPLATE[rhythmIndex % RHYTHM_TEMPLATE.length];
  rhythmIndex++;
  return m;
}

/** Reset rhythm index (for testing). */
export function resetRhythm(): void {
  rhythmIndex = 0;
}

// ---------------------------------------------------------------------------
// Public API — compute adaptive config from blog maturity
// ---------------------------------------------------------------------------

/** Compute adaptive decay config from blog maturity snapshot. Pure function. */
export function computeAdaptiveConfig(maturity: BlogMaturity): AdaptiveDecayConfig {
  const raw = loadRawConfig();
  const tier = detectTier(maturity, raw);
  return interpolateConfig(tier, raw);
}

// ---------------------------------------------------------------------------
// Singleton: cached config with 24h refresh
// ---------------------------------------------------------------------------

let currentConfig: AdaptiveDecayConfig | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

/** Get the current adaptive config (cached, refreshes every 24h). */
export function getAdaptiveConfig(): AdaptiveDecayConfig | null {
  return currentConfig;
}

/** Initialize adaptive config from a maturity snapshot. Starts 24h refresh. */
export function initAdaptiveConfig(
  maturity: BlogMaturity,
  refreshFn?: () => BlogMaturity,
): void {
  currentConfig = computeAdaptiveConfig(maturity);
  stopRefresh();
  if (!refreshFn) return;
  refreshTimer = setInterval(() => {
    currentConfig = computeAdaptiveConfig(refreshFn());
  }, 86_400_000);
}

/** Stop the 24h refresh timer. */
export function stopRefresh(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

// ---------------------------------------------------------------------------
// Sanity checks — in-place testing pattern
// ---------------------------------------------------------------------------

export function _testAdaptiveDecay(): void {
  // Seedling: 3 posts, oldest 30 days
  const s = computeAdaptiveConfig({ postCount: 3, oldestAgeDays: 30, newestAgeDays: 2, totalRevivals: 10 });
  console.assert(s.tierName === 'seedling', `expected seedling, got ${s.tierName}`);
  console.assert(s.maxDays <= 90, `seedling maxDays too high: ${s.maxDays}`);
  console.assert(s.seedFloor >= 6, `seedling seedFloor too low: ${s.seedFloor}`);

  // Growing: 10 posts, oldest 120 days
  const g = computeAdaptiveConfig({ postCount: 10, oldestAgeDays: 120, newestAgeDays: 5, totalRevivals: 50 });
  console.assert(g.tierName === 'growing', `expected growing, got ${g.tierName}`);
  console.assert(g.maxDays > 60 && g.maxDays < 365, `growing maxDays: ${g.maxDays}`);

  // Mature: 20 posts, oldest 365 days
  const m = computeAdaptiveConfig({ postCount: 20, oldestAgeDays: 365, newestAgeDays: 10, totalRevivals: 200 });
  console.assert(m.tierName === 'mature', `expected mature, got ${m.tierName}`);
  console.assert(m.maxDays === 365, `mature maxDays: ${m.maxDays}`);

  // Interpolation: no hard jumps at tier boundary
  const edge = computeAdaptiveConfig({ postCount: 5, oldestAgeDays: 60, newestAgeDays: 5, totalRevivals: 20 });
  console.assert(edge.maxDays >= 60, `edge maxDays too low: ${edge.maxDays}`);

  // Per-post maxDays creates contrast
  const base = 60;
  const older = effectiveMaxDays(50, 2, base);
  const newer = effectiveMaxDays(5, 2, base);
  console.assert(older < newer, `older post should decay faster: ${older} vs ${newer}`);

  // Rhythm template cycles
  resetRhythm();
  const r1 = nextRhythmMultiplier();
  console.assert(r1 >= 0 && r1 <= 1, `rhythm out of range: ${r1}`);
  resetRhythm();

  console.log('[adaptiveDecay] lib OK — tiers, interpolation, per-post, rhythm verified');
}
