// src/lib/bloomHaptics.ts
// Haptic choreography for sympathetic cascade on touch devices.
// Primary revival: strong pulse (handled by revivalTouch.ts).
// Sympathetic cascade: diminishing taps synced to stagger timing.
// Respects prefers-reduced-motion. Graceful no-op when unsupported.
// Follows the inline IIFE pattern (see bloomOrchestrator.ts).

const HAPTIC_PRIMARY_MS = 15;
const HAPTIC_SECONDARY_MS = 10;
const MAX_HAPTIC_INDEX = 2;

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function bloomHapticsScript(): string {
  return `(function(){
  var PRIMARY=${HAPTIC_PRIMARY_MS};
  var SECONDARY=${HAPTIC_SECONDARY_MS};
  var MAX_IDX=${MAX_HAPTIC_INDEX};

  document.__bloomHaptics={tap:tap};

  function tap(index){
    if(!canVibrate())return false;
    if(prefersReduced())return false;
    var dur=hapticDur(index);
    if(dur===0)return false;
    return vibrate(dur)
  }

  function canVibrate(){
    return typeof navigator!=='undefined'&&'vibrate'in navigator
  }

  function prefersReduced(){
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function hapticDur(index){
    if(index===0)return PRIMARY;
    if(index<MAX_IDX)return SECONDARY;
    return 0
  }

  function vibrate(ms){
    try{return navigator.vibrate(ms)}
    catch(e){return false}
  }
})();`;
}

// ---------------------------------------------------------------------------
// Sanity check
// ---------------------------------------------------------------------------

export function _testBloomHaptics(): void {
  const script = bloomHapticsScript();

  console.assert(
    script.includes('__bloomHaptics'),
    'exposes haptics API',
  );
  console.assert(
    script.includes('navigator.vibrate'),
    'uses Vibration API',
  );
  console.assert(
    script.includes('prefers-reduced-motion'),
    'respects reduced motion',
  );
  console.assert(
    script.includes(String(HAPTIC_PRIMARY_MS)),
    'uses primary haptic constant',
  );

  console.log('[bloom-haptics] OK — script structure verified');
}
