// src/lib/atmosphere.ts
// Client-side atmosphere controller.
// Single source of truth for body[data-atmosphere] — grep this file to audit all stage changes.
// Runs on DOMContentLoaded and on every Astro page-load (View Transitions).
//
// Architecture: Michael Koch · UX: Tanya Donska · 2026-04-11

export type AtmosphereStage =
  | 'fresh' | 'endangered' | 'entombed' | 'risen' | 'verdict'
  | 'gold'                  // seal ceremony in progress (hold → POST in flight)
  | 'vindicated';           // receipt landed — hash etched, consequence complete

/** Maps river StageFilter → AtmosphereStage. Centralised — never inline this. */
const RIVER_TO_ATMOSPHERE: Record<string, AtmosphereStage> = {
  live:      'fresh',
  endangered:'endangered',
  graveyard: 'entombed',
  all:       'fresh',
};

/** Single mutation point for body[data-atmosphere]. No other code sets this. */
export function applyAtmosphere(stage: AtmosphereStage, disputed = false): void {
  document.body.dataset.atmosphere = stage;
  document.body.dataset.disputed   = String(disputed);
}

/** Read current atmosphere from body — already set SSR-side; safe on first paint. */
function readAtmosphereFromBody(): AtmosphereStage {
  const current = document.body.dataset.atmosphere as AtmosphereStage | undefined;
  return current ?? 'fresh';
}

/** Map river filter active pill to AtmosphereStage. */
function stageFromActivePill(pill: HTMLElement | null): AtmosphereStage {
  const riverStage = pill?.dataset.stage ?? 'live';
  return RIVER_TO_ATMOSPHERE[riverStage] ?? 'fresh';
}

/** Observe river filter pill changes via MutationObserver — decoupled from filter internals. */
function watchRiverFilter(): void {
  const filter = document.querySelector('.river-filter');
  if (!filter) return;
  const observer = new MutationObserver(() => {
    const active = filter.querySelector<HTMLElement>('[aria-pressed="true"]');
    applyAtmosphere(stageFromActivePill(active));
  });
  observer.observe(filter, { attributes: true, subtree: true });
}

/** Boot: re-apply atmosphere from current body attr; re-attach observer after navigation. */
function boot(): void {
  applyAtmosphere(readAtmosphereFromBody());
  watchRiverFilter();
}

// Astro's page-load event fires after every View Transition navigation.
document.addEventListener('astro:page-load', boot);
