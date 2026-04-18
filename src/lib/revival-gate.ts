// src/lib/revival-gate.ts
// Stage-Gated Revival — single source of truth.
// Imported by: API (revive.ts), components (KeepButton.astro),
//              and client mirror (revival-gate-client.ts).
//
// Rule: revival is mechanically meaningful only when a post is in danger.
// Fresh + fading posts don't need saving. Fossil posts are sealed history.
// Credits: Mike Koch (arch spec §1), Tanya Donska (P1-C), Elon (§mechanics correction)

import type { DecayStage } from './decay-engine';

/** Stages where a reader revival has mechanical meaning. */
const REVIVABLE: ReadonlySet<DecayStage> = new Set(['endangered', 'ghost']);

/** True when a post in this stage can receive a reader revival. */
export function canRevive(stage: DecayStage): boolean {
  return REVIVABLE.has(stage);
}

/** Human-readable gate reason for API error responses. */
export function gateReason(stage: DecayStage): string {
  if (stage === 'fresh' || stage === 'fading') return 'post_not_yet_endangered';
  if (stage === 'fossil') return 'post_is_fossil';
  return 'revival_not_allowed';
}
