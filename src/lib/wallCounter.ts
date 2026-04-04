// src/lib/wallCounter.ts
// Inline script generator for the wall character counter.
// Follows the project's pattern: build-time IIFE, zero dependencies.
// Three decay-themed color states: glowing → fading → fossil.

import { MAX_CHARS } from './wallSubmit';

const THRESHOLD_FADING = 0.64;  // 64% of max
const THRESHOLD_FOSSIL = 0.89;  // 89% of max

/** Returns a minified inline IIFE for the character counter. */
export function wallCounterScript(): string {
  const fadingAt = Math.floor(MAX_CHARS * THRESHOLD_FADING);
  const fossilAt = Math.floor(MAX_CHARS * THRESHOLD_FOSSIL);

  return `(function(){` +
    `var t=document.querySelector('.wall-form-text'),` +
    `c=document.querySelector('.wall-counter');` +
    `if(!t||!c)return;` +
    `function u(){` +
      `var n=t.value.length;` +
      `c.textContent=n+'/'+${MAX_CHARS};` +
      `c.dataset.state=n>${fossilAt}?'fossil':n>${fadingAt}?'fading':'glowing';` +
    `}` +
    `t.addEventListener('input',u);u();` +
  `})()`;
}

// Isolated-run sanity check
export function _testWallCounter(): void {
  const s = wallCounterScript();
  console.assert(s.includes(`/${MAX_CHARS}`), 'max chars in output');
  console.assert(s.includes('fossil'), 'fossil state in output');
  console.assert(s.includes('fading'), 'fading state in output');
  console.assert(s.includes('glowing'), 'glowing state in output');
  console.log('[wallCounter] script OK');
}
