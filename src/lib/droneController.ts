// src/lib/droneController.ts
// Orchestrates drone playback on the client.
// Generates an inline <script> body (build-time → visit-time)
// that wires Web Audio primitives to the ambient time+season system.
//
// Reads phase from PHASE_RANGES (embedded), season from data-season attr.
// Exposes window.__drone = { toggle() → boolean, playing() → boolean }
// for the DroneToggle button component.
//
// DONE: cross-fade on phase boundary (smooth 4s transition)
// DONE: visibilitychange suspends/resumes AudioContext

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
    `  return{gain:g,stop:function(ms){`,
    `    var n=ctx.currentTime;`,
    `    g.gain.linearRampToValueAtTime(0,n+(ms||p.fadeMs)/1e3);`,
    `    setTimeout(function(){o1.stop();o2.stop()},ms||p.fadeMs+50)`,
    `  }}`,
    `}`,
  ].join('');
}

/** Mood label lookup snippet (compact inline version of droneMoodLabel). */
function labelSnippet(): string {
  const labels: Record<string, string> = {
    'night': 'Deep Night Pulse',
    'dawn': 'First Light Hum',
    'morning': 'Morning Drift',
    'noon': 'Midday Tone',
    'afternoon': 'Warm Afternoon',
    'golden-hour': 'Golden Hour Glow',
    'dusk': 'Twilight Murmur',
    'evening': 'Evening Lull',
  };
  return `var ML=${JSON.stringify(labels)};` +
    `function moodLabel(ph,sn){return(ML[ph]||'Drone')+' \\u00b7 '+sn}`;
}

/** Cross-fade snippet: ramps old drone out, new drone in over FADE_MS. */
function crossfadeSnippet(): string {
  return [
    `var FADE_MS=4000;`,
    `function crossfade(){`,
    `  var np=getPhase(),ns=season();`,
    `  if(np===curPh)return;`,
    `  var old=handle;curPh=np;`,
    `  var n=ctx.currentTime;`,
    `  old.gain.gain.linearRampToValueAtTime(0,n+FADE_MS/1e3);`,
    `  setTimeout(function(){old.stop(0)},FADE_MS+100);`,
    `  handle=mkDrone(ctx,PM[np+'|'+ns])`,
    `}`,
  ].join('');
}

/** Visibility manager: suspend on hide, resume on show, instant-swap if phase shifted. */
function visibilitySnippet(): string {
  return [
    `document.addEventListener('visibilitychange',function(){`,
    `  if(!on||!ctx)return;`,
    `  if(document.hidden){ctx.suspend();return}`,
    `  ctx.resume();`,
    `  var np=getPhase();`,
    `  if(np===curPh)return;`,
    `  if(handle){handle.stop(0);handle=null}`,
    `  curPh=np;`,
    `  handle=mkDrone(ctx,PM[np+'|'+season()])`,
    `})`,
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
    `  ${labelSnippet()}`,
    `  var ctx=null,handle=null,on=false,curPh=null;`,
    `  function season(){`,
    `    return document.documentElement.getAttribute('data-season')||'spring'`,
    `  }`,
    `  function getPhase(){return gp(new Date().getHours(),R)}`,
    `  ${crossfadeSnippet()}`,
    `  function start(){`,
    `    if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();`,
    `    if(ctx.state==='suspended')ctx.resume();`,
    `    curPh=getPhase();`,
    `    handle=mkDrone(ctx,PM[curPh+'|'+season()]);on=true`,
    `  }`,
    `  function stop(){`,
    `    if(handle){handle.stop();handle=null}on=false;curPh=null`,
    `  }`,
    `  setInterval(function(){if(on)crossfade()},60000);`,
    `  ${visibilitySnippet()}`,
    `  window.__drone={`,
    `    toggle:function(){on?stop():start();return on},`,
    `    playing:function(){return on},`,
    `    phase:function(){return curPh},`,
    `    label:function(){return curPh?moodLabel(curPh,season()):null}`,
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
  console.assert(script.includes('crossfade'), 'missing crossfade');
  console.assert(script.includes('FADE_MS'), 'missing fade constant');
  console.assert(script.includes('visibilitychange'), 'missing visibility');
  console.assert(script.includes('moodLabel'), 'missing mood label');
  console.assert(script.includes('phase'), 'missing phase accessor');
  console.assert(script.length > 500, 'script suspiciously short');
  console.log('[droneController] OK — crossfade, visibility, labels wired');
}
