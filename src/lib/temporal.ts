// src/lib/temporal.ts
// Shared temporal engine — canonical home for date math and decay computation.
// Consolidates duplicated threshold logic scattered across wall.ts and now.ts.
// Provides client-side live-decay recomputation via inline script.
//
// TODO: wire _testTemporalLib() into a build sanity step

// ---------------------------------------------------------------------------
// Core date math
// ---------------------------------------------------------------------------

/** Number of full days between an ISO date string and a reference date. */
export function daysSince(isoDate: string, now = new Date()): number {
  const ms = now.getTime() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Continuous decay: 0 → 1 over `maxDays`. Clamped to [0, 1]. */
export function decay(
  isoDate: string,
  maxDays: number,
  now = new Date(),
): number {
  return Math.min(1, daysSince(isoDate, now) / maxDays);
}

// ---------------------------------------------------------------------------
// Client-side live-decay script
// ---------------------------------------------------------------------------

/**
 * Inline <script> body that recomputes --decay CSS vars at visit-time
 * for every element carrying `data-posted` and `data-max-days`.
 *
 * Astro usage:
 *   <div data-posted="2026-04-01" data-max-days="30" style="--decay:0.5">
 *   <script set:html={liveDecayScript()} />
 */
export function liveDecayScript(): string {
  return [
    '(function(){',
    '  var n=Date.now();',
    '  document.querySelectorAll("[data-posted][data-max-days]")',
    '    .forEach(function(e){',
    '      var p=new Date(e.dataset.posted).getTime();',
    '      var m=+(e.dataset.maxDays)||30;',
    '      var d=Math.min(1,Math.max(0,(n-p)/864e5)/m);',
    '      e.style.setProperty("--decay",d.toFixed(4));',
    '    });',
    '})();',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testTemporalLib(): void {
  const d = daysSince('2026-01-01', new Date('2026-04-04'));
  console.assert(d === 93, `daysSince: expected 93 got ${d}`);

  const d0 = decay('2026-04-04', 30, new Date('2026-04-04'));
  console.assert(d0 === 0, `same-day decay should be 0, got ${d0}`);

  const d1 = decay('2026-03-05', 30, new Date('2026-04-04'));
  console.assert(d1 === 1, `30/30 decay should be 1, got ${d1}`);

  const mid = decay('2026-03-20', 30, new Date('2026-04-04'));
  console.assert(mid > 0 && mid < 1, 'mid-range decay failed');

  console.log('[temporal] lib OK — daysSince, decay verified');
}
