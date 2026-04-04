// src/lib/shimmer.ts
// Shimmer accents during dissolve transitions at time-phase boundaries.
// Pure CSS @keyframes on ::after pseudo — zero JS animation runtime.
// Hooks into dissolve.ts LIMINALS. Three presets, three boundaries.
//
// Design: Tanya Donska — "a shimmer is a whisper of light, not a shout."
// Architecture: Michael Koch — one function, three presets, done.

export type ShimmerType = 'sweep' | 'pulse' | 'veil';

export interface ShimmerConfig {
  keyframeName: string;
  duration: number;   // ms
  delay: number;      // ms after dissolve Phase 1 starts
  peakOpacity: number; // 0–1, kept under 0.06
}

// ---------------------------------------------------------------------------
// Presets — one per visual accent type
// ---------------------------------------------------------------------------

const PRESETS: Record<ShimmerType, ShimmerConfig> = {
  sweep: {
    keyframeName: 'shimmer-sweep',
    duration: 2800,
    delay: 2000,
    peakOpacity: 0.055,
  },
  pulse: {
    keyframeName: 'shimmer-pulse',
    duration: 2400,
    delay: 2200,
    peakOpacity: 0.04,
  },
  veil: {
    keyframeName: 'shimmer-veil',
    duration: 2600,
    delay: 1800,
    peakOpacity: 0.05,
  },
};

/** Map of boundary keys to their shimmer type (null = no shimmer). */
const BOUNDARY_SHIMMERS: Record<string, ShimmerType | null> = {
  'dusk→evening':        'sweep', // the hero transition
  'night→dawn':          'pulse',
  'golden-hour→dusk':    'veil',
};

/** Returns shimmer config for a boundary, or null if none. */
export function shimmerForKey(key: string): ShimmerConfig | null {
  const type = BOUNDARY_SHIMMERS[key];
  return type ? PRESETS[type] : null;
}

/** Full preset map for serialization into inline script. */
export function shimmerPresetsJSON(): string {
  return JSON.stringify(PRESETS);
}

/** Boundary→type map for serialization into inline script. */
export function shimmerMapJSON(): string {
  return JSON.stringify(BOUNDARY_SHIMMERS);
}

// ---------------------------------------------------------------------------
// Inline script generator — triggers shimmer CSS class during dissolve
// ---------------------------------------------------------------------------

export function shimmerScript(): string {
  return [
    `(function(){`,
    `  var SM=${shimmerMapJSON()},SP=${shimmerPresetsJSON()};`,
    `  var tint=document.querySelector('.ambient-time-tint');`,
    `  if(!tint)return;`,
    `  window.__shimmer=function(key){`,
    `    var type=SM[key];if(!type)return;`,
    `    var cfg=SP[type];if(!cfg)return;`,
    `    tint.classList.add('shimmer-active','shimmer-'+type);`,
    `    setTimeout(function(){`,
    `      tint.classList.remove('shimmer-active','shimmer-'+type);`,
    `    },cfg.duration);`,
    `  };`,
    `  if(location.search.indexOf('shimmer=preview')>-1){`,
    `    var keys=Object.keys(SM).filter(function(k){return SM[k]});`,
    `    keys.forEach(function(k,i){`,
    `      setTimeout(function(){window.__shimmer(k)},i*5000);`,
    `    });`,
    `  }`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testShimmer(): void {
  const dusk = shimmerForKey('dusk→evening');
  console.assert(dusk?.keyframeName === 'shimmer-sweep', 'dusk→evening = sweep');
  console.assert(shimmerForKey('morning→noon') === null, 'silent = null');

  const script = shimmerScript();
  console.assert(script.includes('shimmer-active'), 'script adds class');
  console.assert(script.includes('shimmer=preview'), 'preview mode present');

  console.log('[shimmer] OK — presets verified, preview mode wired');
}
