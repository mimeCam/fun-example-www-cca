// src/lib/ambientLife.ts
// Ambient Life Engine — makes the blog feel alive even with zero visitors.
//
// Three layers:
//   Seed   — on startup, ensure every post has a minimum revival count
//   Pulse  — periodic phantom SSE events (ephemeral, not persisted)
//   Fade   — scale phantom activity down as real readers arrive
//
// Zero new dependencies. Plugs into existing collectiveMemory + heartbeat.

import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { broadcast, connectionCount } from './heartbeat';
import { getRevivalCounts, incrementRevival } from './collectiveMemory';
import { computeSeeds } from './ambientLife.seed';
import { pickWeightedSlug, decayFactor } from './ambientLife.weight';
import type { WeightedPost } from './ambientLife.weight';

// ---------------------------------------------------------------------------
// Config (loaded once from JSON)
// ---------------------------------------------------------------------------

interface AmbientConfig {
  seedFloor: number;
  seedJitter: number;
  pulseIntervalMs: number;
  pulseVarianceMs: number;
  fadeThresholds: number[];
  fadeMultipliers: number[];
  enabled: boolean;
}

function loadConfig(): AmbientConfig {
  const p = resolve(process.cwd(), 'src/data/ambientLife.config.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Post discovery — reads slugs + pubDates from content directory
// ---------------------------------------------------------------------------

interface PostMeta {
  slug: string;
  pubDate: Date;
}

function discoverPosts(): PostMeta[] {
  const dir = contentDir();
  return listMarkdownFiles(dir).map(f => parsePostMeta(dir, f));
}

function contentDir(): string {
  return resolve(process.cwd(), 'src/content/blog');
}

function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir).filter(f => f.endsWith('.md'));
}

function parsePostMeta(dir: string, file: string): PostMeta {
  const slug = file.replace(/\.md$/, '');
  const raw = readFileSync(resolve(dir, file), 'utf-8');
  const pubDate = extractPubDate(raw);
  return { slug, pubDate };
}

function extractPubDate(raw: string): Date {
  const match = raw.match(/^pubDate:\s*(.+)$/m);
  return match ? new Date(match[1].trim()) : new Date();
}

// ---------------------------------------------------------------------------
// Seed Layer — ensure minimum revival counts on startup
// ---------------------------------------------------------------------------

function runSeedLayer(posts: PostMeta[], cfg: AmbientConfig): void {
  const counts = getRevivalCounts();
  const slugs = posts.map(p => p.slug);
  const ops = computeSeeds(slugs, counts, cfg.seedFloor, cfg.seedJitter);
  ops.forEach(op => applySeeds(op.slug, op.incrementBy));
}

function applySeeds(slug: string, times: number): void {
  for (let i = 0; i < times; i++) incrementRevival(slug);
}

// ---------------------------------------------------------------------------
// Fade Layer — scale phantom activity by real connection count
// ---------------------------------------------------------------------------

function activityMultiplier(cfg: AmbientConfig): number {
  const real = connectionCount();
  const { fadeThresholds: t, fadeMultipliers: m } = cfg;
  if (real >= t[0]) return m[0]; // 3+ real → off
  if (real >= t[1]) return m[1]; // 2 real  → 25%
  if (real >= t[2]) return m[2]; // 1 real  → 50%
  return m[3];                   // alone   → full
}

// ---------------------------------------------------------------------------
// Pulse Layer — periodic phantom revival broadcasts
// ---------------------------------------------------------------------------

function buildWeightedPosts(posts: PostMeta[]): WeightedPost[] {
  const now = new Date();
  return posts.map(p => ({
    slug: p.slug,
    decayFactor: decayFactor(p.pubDate, now),
  }));
}

function emitPulse(posts: PostMeta[], cfg: AmbientConfig): void {
  if (Math.random() > activityMultiplier(cfg)) return;

  const slug = pickWeightedSlug(buildWeightedPosts(posts));
  if (!slug) return;

  const count = getRevivalCounts().get(slug) ?? 0;
  broadcast({ slug, count, ts: Date.now(), phantom: true });
}

function jitteredDelay(base: number, variance: number): number {
  return base + Math.random() * variance;
}

// ---------------------------------------------------------------------------
// Pulse scheduler — self-scheduling with jittered intervals
// ---------------------------------------------------------------------------

let pulseTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePulse(posts: PostMeta[], cfg: AmbientConfig): void {
  const delay = jitteredDelay(cfg.pulseIntervalMs, cfg.pulseVarianceMs);
  pulseTimer = setTimeout(() => {
    emitPulse(posts, cfg);
    schedulePulse(posts, cfg);
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

  const cfg = loadConfig();
  if (!cfg.enabled) return;

  const posts = discoverPosts();
  if (posts.length === 0) return;

  runSeedLayer(posts, cfg);
  schedulePulse(posts, cfg);
}

/** Stop the engine (for graceful shutdown). */
export function stopAmbientLife(): void {
  stopPulse();
  started = false;
}
