// src/lib/variants.ts
// Seasonal Post Variants — makes blog content shift based on time, celestial
// state, and post age. Pure functions + inline script generator.
// No dependencies. Graceful no-JS fallback (variants stay hidden).
//
// Conditions: 8 time phases, 3 celestial states, 3 age tiers.
// Reuses logic from timeAmbient.ts, celestialWitness.ts, temporal.ts.

import { hourToPhase, type TimePhase, PHASE_RANGES } from './timeAmbient';
import { hourToWitnessState, type WitnessState, STATE_RANGES } from './celestialWitness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Every keyword accepted by data-when on a .variant element. */
export type VariantWhen =
  | TimePhase          // night, dawn, morning, noon, afternoon, golden-hour, dusk, evening
  | WitnessState       // sun, moon, asleep
  | 'fresh'            // post < 30 days old
  | 'aged'             // post 30–179 days old
  | 'fossil';          // post 180+ days old

export interface VariantContext {
  phase: TimePhase;
  witness: WitnessState;
  ageTier: 'fresh' | 'aged' | 'fossil';
}

// ---------------------------------------------------------------------------
// Age tier resolution
// ---------------------------------------------------------------------------

const AGE_THRESHOLDS: [number, VariantContext['ageTier']][] = [
  [180, 'fossil'],
  [ 30, 'aged'],
  [  0, 'fresh'],
];

/** Buckets days-since-publish into fresh / aged / fossil. */
export function ageTier(days: number): VariantContext['ageTier'] {
  const match = AGE_THRESHOLDS.find(([min]) => days >= min);
  return match ? match[1] : 'fresh';
}

// ---------------------------------------------------------------------------
// Condition resolution
// ---------------------------------------------------------------------------

/** Returns true if `when` matches the current context. */
export function resolveCondition(when: string, ctx: VariantContext): boolean {
  if (when === ctx.phase) return true;
  if (when === ctx.witness) return true;
  if (when === ctx.ageTier) return true;
  return false;
}

/** Builds a full VariantContext from the visitor's hour and post age. */
export function buildContext(hour: number, daysSincePost: number): VariantContext {
  return {
    phase: hourToPhase(hour),
    witness: hourToWitnessState(hour),
    ageTier: ageTier(daysSincePost),
  };
}

// ---------------------------------------------------------------------------
// Inline script generator — runs at visit time, toggles .variant visibility
// ---------------------------------------------------------------------------

/**
 * Returns a self-contained <script> body that evaluates all .variant elements.
 * Expects the post container to carry data-pub-date="<ISO string>".
 *
 * Astro usage:
 *   <article data-pub-date={post.data.pubDate.toISOString()}>
 *   <script set:html={variantScript()} />
 */
export function variantScript(): string {
  const phases = JSON.stringify(PHASE_RANGES);
  const states = JSON.stringify(STATE_RANGES);
  return [
    `(function(){`,
    `  var a=document.querySelector('[data-pub-date]');`,
    `  if(!a)return;`,
    `  var h=new Date().getHours();`,
    // resolve phase
    `  var P=${phases};`,
    `  var pm=P.find(function(r){return h>=r[0]&&h<=r[1]});`,
    `  var phase=pm?pm[2]:'noon';`,
    // resolve witness
    `  var S=${states};`,
    `  var sm=S.find(function(r){return h>=r[0]&&h<=r[1]});`,
    `  var witness=sm?sm[2]:'moon';`,
    // resolve age tier
    `  var pub=new Date(a.dataset.pubDate).getTime();`,
    `  var days=Math.max(0,Math.floor((Date.now()-pub)/864e5));`,
    `  var tier=days>=180?'fossil':days>=30?'aged':'fresh';`,
    // toggle variants
    `  a.querySelectorAll('.variant').forEach(function(el){`,
    `    var w=el.dataset.when||'';`,
    `    var on=(w===phase||w===witness||w===tier);`,
    `    el.setAttribute('data-active',on?'true':'false');`,
    `  });`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testVariants(): void {
  const ctx = buildContext(2, 100);
  console.assert(ctx.phase === 'night', 'hour 2 should be night');
  console.assert(ctx.witness === 'asleep', 'hour 2 should be asleep');
  console.assert(ctx.ageTier === 'aged', '100 days should be aged');

  console.assert(resolveCondition('night', ctx), 'night should match');
  console.assert(resolveCondition('asleep', ctx), 'asleep should match');
  console.assert(resolveCondition('aged', ctx), 'aged should match');
  console.assert(!resolveCondition('morning', ctx), 'morning should not match');
  console.assert(!resolveCondition('fresh', ctx), 'fresh should not match');

  console.assert(ageTier(0) === 'fresh', '0 days = fresh');
  console.assert(ageTier(29) === 'fresh', '29 days = fresh');
  console.assert(ageTier(30) === 'aged', '30 days = aged');
  console.assert(ageTier(180) === 'fossil', '180 days = fossil');

  const s = variantScript();
  console.assert(s.includes('data-active'), 'script should toggle data-active');
  console.log('[variants] OK — conditions, tiers, script verified');
}
