// src/lib/bloomHaptics.ts
// Haptic choreography for sympathetic cascade on touch devices.
// Primary revival: strong pulse (handled by revivalTouch.ts).
// Sympathetic cascade: diminishing taps synced to stagger timing.
// The haptic pattern IS the cascade rhythm — indexed by position.
// Respects prefers-reduced-motion. Graceful no-op when unsupported.
// Follows the inline IIFE pattern (see bloomOrchestrator.ts).

/** First sympathetic bloom: decisive medium pulse. */
const HAPTIC_PRIMARY_MS = 18;

/** Second sympathetic bloom: lighter echo. */
const HAPTIC_SECONDARY_MS = 12;

/** Third sympathetic bloom: faintest whisper. */
const HAPTIC_TERTIARY_MS = 6;

/** Beyond this index: silence. Diminishing returns. */
const MAX_HAPTIC_INDEX = 3;

// ---------------------------------------------------------------------------
// Inline IIFE generator
// ---------------------------------------------------------------------------

export function bloomHapticsScript(): string {
  return `(function(){
  var PATTERN=[${HAPTIC_PRIMARY_MS},${HAPTIC_SECONDARY_MS},${HAPTIC_TERTIARY_MS}];
  var MAX_IDX=${MAX_HAPTIC_INDEX};
  var supported=null;

  document.__bloomHaptics={tap:tap,singlePulse:singlePulse};

  function tap(index){
    if(!canVibrate())return false;
    if(prefersReduced())return false;
    var dur=hapticDur(index);
    if(dur===0)return false;
    return vibrate(dur)
  }

  function singlePulse(){
    if(!canVibrate())return false;
    return vibrate(PATTERN[0])
  }

  function canVibrate(){
    if(supported!==null)return supported;
    supported=typeof navigator!=='undefined'&&'vibrate'in navigator;
    return supported
  }

  function prefersReduced(){
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function hapticDur(index){
    if(index>=MAX_IDX)return 0;
    return PATTERN[index]||0
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
    script.includes('singlePulse'),
    'exposes singlePulse for reduced-motion a11y',
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
    script.includes('PATTERN'),
    'uses indexed haptic pattern array',
  );
  console.assert(
    script.includes(String(HAPTIC_PRIMARY_MS)),
    'uses primary haptic constant',
  );
  console.assert(
    script.includes(String(HAPTIC_TERTIARY_MS)),
    'uses tertiary haptic constant',
  );

  console.log('[bloom-haptics] OK — script structure verified');
}
