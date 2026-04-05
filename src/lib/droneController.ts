// src/lib/droneController.ts
// Orchestrates drone playback on the client.
// Generates an inline <script> body (build-time → visit-time)
// that wires Web Audio primitives to the ambient time+season system.
//
// Reads phase from PHASE_RANGES (embedded), season from data-season attr.
// Exposes window.__drone = { toggle() → boolean, playing() → boolean }
// for the DroneToggle button component.
//
// TODO: cross-fade on phase boundary (currently stops + restarts)
// TODO: listen for visibilitychange to suspend/resume AudioContext

import { PHASE_RANGES } from './timeAmbient';
import { ANCHORS } from './seasonal';
import { droneParamsFor } from './dronePresets';
import type { TimePhase } from './timeAmbient';
import type { SeasonName } from './seasonal';

/** All 32 phase×season param combos, pre-baked at build time. */
function prebakedParams(): string {
  const phases: TimePhase[] = [
    'night','dawn','morning','noon',
    'afternoon','golden-hour','dusk','evening',
  ];
  const seasons: SeasonName[] = ['winter','spring','summer','autumn'];
  const map: Record<string, object> = {};
  for (const p of phases) {
    for (const s of seasons) {
      map[`${p}|${s}`] = droneParamsFor(p, s);
    }
  }
  return JSON.stringify(map);
}

/** Inline-friendly phase resolver (same logic as timeAmbient). */
function phaseSnippet(): string {
  return `function gp(h,R){` +
    `var m=R.find(function(x){return h>=x[0]&&h<=x[1]});` +
    `return m?m[2]:'noon'}`;
}

/** Compact Web Audio drone engine (subset of droneEngine.ts). */
function engineSnippet(): string {
  return [
    `function dbG(db){return Math.pow(10,db/20)}`,
    `function mkDrone(ctx,p){`,
    `  var o1=ctx.createOscillator(),o2=ctx.createOscillator();`,
    `  o1.type='sine';o2.type='sine';`,
    `  o1.frequency.value=p.baseFreq;`,
    `  o2.frequency.value=p.baseFreq+p.beatFreq;`,
    `  var f=ctx.createBiquadFilter();`,
    `  f.type='lowpass';f.frequency.value=p.filterHz;f.Q.value=0.7;`,
    `  var g=ctx.createGain();g.gain.value=0;`,
    `  var t=ctx.currentTime;`,
    `  g.gain.linearRampToValueAtTime(dbG(p.gainDb),t+p.fadeMs/1e3);`,
    `  o1.connect(f);o2.connect(f);f.connect(g);g.connect(ctx.destination);`,
    `  o1.start();o2.start();`,
    `  return{stop:function(ms){`,
    `    var n=ctx.currentTime;`,
    `    g.gain.linearRampToValueAtTime(0,n+(ms||p.fadeMs)/1e3);`,
    `    setTimeout(function(){o1.stop();o2.stop()},ms||p.fadeMs+50)`,
    `  }}`,
    `}`,
  ].join('');
}

/** Returns a self-contained inline <script> body for drone control. */
export function droneControllerScript(): string {
  const ranges = JSON.stringify(PHASE_RANGES);
  const params = prebakedParams();
  return [
    `(function(){`,
    `  var R=${ranges},PM=${params};`,
    `  ${phaseSnippet()}`,
    `  ${engineSnippet()}`,
    `  var ctx=null,handle=null,on=false;`,
    `  function season(){`,
    `    return document.documentElement.getAttribute('data-season')||'spring'`,
    `  }`,
    `  function resolve(){`,
    `    var ph=gp(new Date().getHours(),R);`,
    `    return PM[ph+'|'+season()]`,
    `  }`,
    `  function start(){`,
    `    if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();`,
    `    if(ctx.state==='suspended')ctx.resume();`,
    `    handle=mkDrone(ctx,resolve());on=true`,
    `  }`,
    `  function stop(){`,
    `    if(handle){handle.stop();handle=null}on=false`,
    `  }`,
    `  window.__drone={`,
    `    toggle:function(){on?stop():start();return on},`,
    `    playing:function(){return on}`,
    `  };`,
    `})();`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check (see inplace-testing-howto.md)
// ---------------------------------------------------------------------------

export function _testDroneController(): void {
  const script = droneControllerScript();
  console.assert(script.includes('AudioContext'), 'missing AudioContext');
  console.assert(script.includes('__drone'), 'missing window.__drone');
  console.assert(script.includes('toggle'), 'missing toggle method');
  console.assert(script.includes('mkDrone'), 'missing engine function');
  console.assert(script.includes('data-season'), 'missing season read');
  console.assert(script.length > 200, 'script suspiciously short');
  console.log('[droneController] OK — script generated, all markers present');
}
