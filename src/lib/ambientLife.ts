// src/lib/ambientLife.ts
// Ambient Life Engine — makes the blog feel alive even with zero visitors.
//
// Three layers:
//   Seed   — on startup, ensure every post has a minimum revival count
//   Pulse  — periodic phantom SSE events (ephemeral, not persisted)
//   Fade   — scale phantom activity down as real readers arrive
//
// Now powered by Adaptive Decay Engine — pulse intervals, seed floors,
// and weight thresholds all adjust dynamically based on blog maturity.
// Config refreshes every 24h via a lightweight post-directory scan.
//
// Zero new dependencies. Plugs into existing collectiveMemory + heartbeat.

import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { broadcast, connectionCount } from './heartbeat';
import { getRevivalCounts, incrementRevival } from './collectiveMemory';
import { computeAgeAwareSeeds } from './ambientLife.seed';
import { pickWeightedSlug, decayFactor } from './ambientLife.weight';
import type { WeightedPost } from './ambientLife.weight';
import {
  computeAdaptiveConfig,
  initAdaptiveConfig,
  stopRefresh,
  getAdaptiveConfig,
  nextRhythmMultiplier,
} from './adaptiveDecay';
import type { BlogMaturity, AdaptiveDecayConfig } from './adaptiveDecay';

// ---------------------------------------------------------------------------
// Legacy config — fallback only if adaptive system fails
// ---------------------------------------------------------------------------

interface LegacyConfig {
  fadeThresholds: number[];
  fadeMultipliers: number[];
  enabled: boolean;
}

function loadLegacyConfig(): LegacyConfig {
  const p = resolve(process.cwd(), 'src/data/ambientLife.config.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Post discovery — reads slugs + pubDates from content directory
// ---------------------------------------------------------------------------

interface PostMeta {
  slug: string;
  pubDate: Date;
  ageDays: number;
}

function discoverPosts(): PostMeta[] {
  const dir = contentDir();
  const now = new Date();
  return listMarkdownFiles(dir).map(f => parsePostMeta(dir, f, now));
}

function contentDir(): string {
  return resolve(process.cwd(), 'src/content/blog');
}

function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir).filter(f => f.endsWith('.md'));
}

function parsePostMeta(dir: string, file: string, now: Date): PostMeta {
  const slug = file.replace(/\.md$/, '');
  const raw = readFileSync(resolve(dir, file), 'utf-8');
  const pubDate = extractPubDate(raw);
  const ageDays = daysBetween(pubDate, now);
  return { slug, pubDate, ageDays };
}

function extractPubDate(raw: string): Date {
  const match = raw.match(/^pubDate:\s*(.+)$/m);
  return match ? new Date(match[1].trim()) : new Date();
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Blog maturity snapshot — inputs for Adaptive Decay Engine
// ---------------------------------------------------------------------------

function snapshotMaturity(posts: PostMeta[]): BlogMaturity {
  if (posts.length === 0) return emptyMaturity();
  const ages = posts.map(p => p.ageDays);
  const counts = safeRevivalTotal();
  return {
    postCount: posts.length,
    oldestAgeDays: Math.max(...ages),
    newestAgeDays: Math.min(...ages),
    totalRevivals: counts,
  };
}

function emptyMaturity(): BlogMaturity {
  return { postCount: 0, oldestAgeDays: 0, newestAgeDays: 0, totalRevivals: 0 };
}

function safeRevivalTotal(): number {
  try {
    const m = getRevivalCounts();
    let total = 0;
    m.forEach(v => { total += v; });
    return total;
  } catch { return 0; }
}

// ---------------------------------------------------------------------------
// Seed Layer — ensure minimum revival counts on startup (age-aware)
// ---------------------------------------------------------------------------

function runSeedLayer(posts: PostMeta[], cfg: AdaptiveDecayConfig): void {
  const counts = getRevivalCounts();
  const postData = posts.map(p => ({ slug: p.slug, ageDays: p.ageDays }));
  const ops = computeAgeAwareSeeds(postData, counts, cfg.seedFloor, cfg.seedJitter, cfg.maxDays);
  ops.forEach(op => applySeeds(op.slug, op.incrementBy));
}

function applySeeds(slug: string, times: number): void {
  for (let i = 0; i < times; i++) incrementRevival(slug);
}

// ---------------------------------------------------------------------------
// Fade Layer — scale phantom activity by real connection count
// ---------------------------------------------------------------------------

function activityMultiplier(legacy: LegacyConfig): number {
  const real = connectionCount();
  const { fadeThresholds: t, fadeMultipliers: m } = legacy;
  if (real >= t[0]) return m[0];
  if (real >= t[1]) return m[1];
  if (real >= t[2]) return m[2];
  return m[3];
}

// ---------------------------------------------------------------------------
// Pulse Layer — organic rhythm instead of uniform random
// ---------------------------------------------------------------------------

function buildWeightedPosts(posts: PostMeta[]): WeightedPost[] {
  const now = new Date();
  return posts.map(p => ({ slug: p.slug, decayFactor: decayFactor(p.pubDate, now) }));
}

function emitPulse(posts: PostMeta[], legacy: LegacyConfig): void {
  const rhythm = nextRhythmMultiplier();
  if (Math.random() > activityMultiplier(legacy) * rhythm) return;

  const slug = pickWeightedSlug(buildWeightedPosts(posts));
  if (!slug) return;

  const count = getRevivalCounts().get(slug) ?? 0;
  broadcast({ slug, count, ts: Date.now(), phantom: true });
}

function jitteredDelay(base: number, variance: number): number {
  return base + Math.random() * variance;
}

// ---------------------------------------------------------------------------
// Pulse scheduler — reads fresh adaptive config each tick
// ---------------------------------------------------------------------------

let pulseTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePulse(posts: PostMeta[], legacy: LegacyConfig): void {
  const cfg = getAdaptiveConfig();
  const base = cfg?.pulseBaseMs ?? 60000;
  const variance = cfg?.pulseVarianceMs ?? 30000;
  const delay = jitteredDelay(base, variance);

  pulseTimer = setTimeout(() => {
    emitPulse(posts, legacy);
    schedulePulse(posts, legacy);
  }, delay);
}

function stopPulse(): void {
  if (pulseTimer) clearTimeout(pulseTimer);
  pulseTimer = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let started = false;

/** Start the Ambient Life Engine. Idempotent — safe to call multiple times. */
export function startAmbientLife(): void {
  if (started) return;
  started = true;

  const legacy = loadLegacyConfig();
  if (!legacy.enabled) return;

  const posts = discoverPosts();
  if (posts.length === 0) return;

  const maturity = snapshotMaturity(posts);
  initAdaptiveConfig(maturity, () => snapshotMaturity(discoverPosts()));

  const cfg = getAdaptiveConfig();
  if (cfg) runSeedLayer(posts, cfg);

  schedulePulse(posts, legacy);
}

/** Stop the engine (for graceful shutdown). */
export function stopAmbientLife(): void {
  stopPulse();
  stopRefresh();
  started = false;
}
