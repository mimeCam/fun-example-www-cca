// src/lib/revivalController.ts
// Unified revival entry point — strategy pattern.
// Detects input type (pointer vs touch), delegates to the right strategy.
// Emits: revival:start, revival:progress, revival:success, revival:cancel.
//
// Replaces reviveClient.ts + longPressRevive.ts with a single script.
// Net result: -2 inline scripts in BaseLayout, +1 unified controller.
//
// Migration: coexists with old scripts during testing via data-revival-v2
// feature flag on <body>. When confident, remove old scripts.

import {
  desktopStrategyFragment,
  keyboardHelpersFragment,
  keyboardStrategyFragment,
} from './revivalDesktop';
import { touchStrategyFragment } from './revivalTouch';
import { SESSION_HEADER } from './sessionToken';
import { FP_HEADER } from './visitorFingerprint';

/** Card selector for revival-capable elements. */
const CARD_SELECTOR = '.decay-card[data-pub-date]';

/** Returns a self-executing script for BaseLayout injection. */
export function revivalControllerScript(): string {
  return `(function(){
  var SEL='${CARD_SELECTOR}';
  var _revived={};
  var KB_HOLD=600,KB_TICK=16;

  ${sharedHelpers()}
  ${keyboardHelpersFragment()}
  ${desktopStrategyFragment()}
  ${touchStrategyFragment()}
  ${keyboardStrategyFragment()}
  ${initFragment()}
})();`;
}

/** Shared helper functions used by both strategies. */
function sharedHelpers(): string {
  return `
  function slug(el) {
    var a = el.querySelector('a.post-link');
    if (!a) return null;
    var p = a.getAttribute('href') || '';
    var m = p.match(/\\/blog\\/([^\\/]+)/);
    return m ? m[1] : null;
  }

  function fired(s) {
    return !!_revived[s];
  }

  function mark(s) {
    _revived[s] = 1;
  }

  function emitSuccess(s, count, src) {
    document.dispatchEvent(new CustomEvent('revival:success', {
      detail: { slug: s, newCount: count, source: src }
    }));
  }

  function emitResonance(resonance) {
    if (!resonance || !resonance.length) return;
    document.dispatchEvent(new CustomEvent(
      'revival:local:resonance',
      { detail: { resonance: resonance } }
    ));
  }

  function send(s, src) {
    if (fired(s)) return;
    mark(s);
    var hdrs={'Content-Type':'application/json'};
    if(window.__sessionId)hdrs['${SESSION_HEADER}']=window.__sessionId;
    var promises=[];
    if(window.__powReady)promises.push(window.__powReady);
    else promises.push(Promise.resolve(null));
    if(window.__visitorFp)promises.push(window.__visitorFp);
    else promises.push(Promise.resolve(null));
    Promise.all(promises).then(function(vals){
      if(vals[0])hdrs['x-proof-of-work']=vals[0];
      if(vals[1])hdrs['${FP_HEADER}']=vals[1];
      return fetch('/api/revive',{
        method:'POST',keepalive:true,
        headers:hdrs,
        body:JSON.stringify({slug:s})
      });
    })
    .then(function(r){
      if(r.status===429){
        return r.json().then(function(d){
          if(d&&d.error==='stale-challenge')refreshChallenge();
          return null;
        });
      }
      return r.json();
    })
    .then(function(d){
      if(d&&d.ok){
        emitSuccess(s,d.count,src);
        emitResonance(d.resonance);
      }
    })
    .catch(function(){});
  }

  function refreshChallenge(){
    fetch('/api/challenge').then(function(r){return r.json();})
    .then(function(d){
      if(d&&d.challenge){
        window.__powChallenge=d.challenge;
        window.__powReady=window.__solvePoW(d.challenge);
      }
    }).catch(function(){});
  }`;
}

/** Init fragment — detects input, delegates to strategies. */
function initFragment(): string {
  return `
  function init() {
    var cards = document.querySelectorAll(SEL);
    if (!cards.length) return;
    desktopStrategy(cards, send);
    touchStrategy(cards, send);
    keyboardStrategy(cards, send);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();`;
}
