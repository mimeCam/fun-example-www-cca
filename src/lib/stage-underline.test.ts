// src/lib/stage-underline.test.ts
//
// Textual parity + WCAG contrast tests for src/styles/stage-underline.css (v149).
//
// The axis is declarative CSS — no runtime. These tests read the stylesheet
// as text and assert the structural invariants Mike's napkin promises
// (§8) plus the one quantitative guardrail Elon demanded (§5 contrast):
//
//   - Every DecayStage appears exactly once as a stage-scoped selector.
//   - Every rule sets text-decoration-{line,color,thickness}, skip-ink,
//     text-underline-offset, and a color-only transition.
//   - Every rule transitions on --stage-{s}-duration + --stage-{s}-ease.
//   - Scope fence: prose anchors only (p, li, h2–h6, blockquote, figcaption
//     descendants; never bare `a`, never chrome tags).
//   - Color-floor mapping: ghost + fossil cite --stage-endangered-border
//     (Mike §5 — not their own darker tokens). Bright stages cite their
//     matching border token verbatim.
//   - forced-colors: active block yields text-decoration-color: LinkText
//     and drops thickness/offset overrides.
//   - prefers-reduced-motion: reduce block sets transition: none.
//   - No hover/active/focus bloat (Tanya §4.3 — resting-state paint only).
//   - No raw hex / rgb / hsl / ms literals — belt vs. compliance guard.
//
//   - Contrast check (Elon §4, Mike §8): resolve each stage's chosen
//     text-decoration-color through --color-decay-{s} OKLCH → linear
//     sRGB → WCAG relative luminance, compare vs --surface-base, and
//     assert ≥ 3:1 for every stage. Catches a regression in tokens.css
//     before it reaches a reader with a screen.
//
// Run:  npx tsx --test src/lib/stage-underline.test.ts
//
// Why no JSDOM / Puppeteer? Mike §8 — cheap parser checks are what
// stage-focus.test.ts already does. Same shape.
//
// Credits: Mike (§napkin test strategy + §5 color-floor), Tanya
//          (§3 curve, §4.3 "no hover", §6 sanctuaries), Elon (WCAG
//          contrast physics), Sid (stage-focus.test.ts template).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { DECAY_STAGES } from './decay-engine.js';
import type { DecayStage } from './decay-engine.js';

// ── Fixture: the stylesheet + tokens, read once ─────────────────────────────

const CSS_PATH    = path.resolve(process.cwd(), 'src/styles/stage-underline.css');
const TOKENS_PATH = path.resolve(process.cwd(), 'src/styles/tokens.css');
const CSS    = fs.readFileSync(CSS_PATH, 'utf-8');
const TOKENS = fs.readFileSync(TOKENS_PATH, 'utf-8');

/** Split off comment blocks so pattern checks don't match docstrings. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

const CODE = stripComments(CSS);

/** The prose scope-fence selector fragment (Tanya §2). */
const SCOPE_FENCE = ':is(p, li, h2, h3, h4, h5, h6, blockquote, figcaption) a';

/** Stage rule header for a given stage. */
function ruleHeader(stage: DecayStage): string {
  return `[data-decay-stage="${stage}"] ${SCOPE_FENCE}`;
}

/** Mike §5 color-floor: ghost + fossil freeze at endangered. */
const COLOR_FLOOR: Record<DecayStage, DecayStage> = {
  fresh: 'fresh',
  fading: 'fading',
  endangered: 'endangered',
  ghost: 'endangered',
  fossil: 'endangered',
};

// ── Literal-set coverage (Mike §napkin) ─────────────────────────────────────

describe('stage-underline.css — every DecayStage is painted', () => {
  for (const stage of DECAY_STAGES) {
    test(`contains the ${stage} stage rule header`, () => {
      assert.ok(
        CODE.includes(ruleHeader(stage)),
        `missing rule header for ${stage}`,
      );
    });
  }

  test('each stage rule header appears exactly once outside @media', () => {
    const noMedia = CODE.replace(/@media[^{]+\{[\s\S]*?\n\}/g, '');
    for (const stage of DECAY_STAGES) {
      const hits = noMedia.split(ruleHeader(stage)).length - 1;
      assert.equal(hits, 1, `${stage} rule header should appear once, got ${hits}`);
    }
  });
});

// ── Per-stage property contract (Tanya §3, §3.3, §3.4, §5) ──────────────────

/** Extract the declaration block for a stage rule. */
function blockFor(stage: DecayStage): string {
  const header = ruleHeader(stage);
  const start = CODE.indexOf(header);
  assert.notEqual(start, -1, `header not found for ${stage}`);
  const end = CODE.indexOf('}', start);
  return CODE.slice(start, end);
}

describe('stage-underline.css — every stage sets the full paint ramp', () => {
  const REQUIRED = [
    'text-decoration-line: underline',
    'text-decoration-thickness:',
    'text-decoration-skip-ink: auto',
    'text-underline-offset:',
    'text-decoration-color:',
    'transition:',
  ];
  for (const stage of DECAY_STAGES) {
    for (const prop of REQUIRED) {
      test(`${stage} declares ${prop}`, () => {
        assert.ok(blockFor(stage).includes(prop),
          `${stage} block missing ${prop}`);
      });
    }
  }
});

// ── Thickness ramp — em only (Tanya §3.3, Mike §5 — "em for thickness") ─────

describe('stage-underline.css — thickness uses em, offset uses px', () => {
  for (const stage of DECAY_STAGES) {
    test(`${stage} thickness is in em`, () => {
      const block = blockFor(stage);
      const m = /text-decoration-thickness:\s*([0-9.]+)em/.exec(block);
      assert.ok(m, `${stage} thickness must be an em value`);
    });
    test(`${stage} underline-offset is in px`, () => {
      const block = blockFor(stage);
      const m = /text-underline-offset:\s*([0-9]+)px/.exec(block);
      assert.ok(m, `${stage} underline-offset must be a px value`);
    });
  }
});

// ── Color-floor contract (Mike §5 — the novel bit of this axis) ─────────────

describe('stage-underline.css — color-floor freezes ghost + fossil', () => {
  for (const stage of DECAY_STAGES) {
    test(`${stage} cites var(--stage-${COLOR_FLOOR[stage]}-border)`, () => {
      const want = `text-decoration-color: var(--stage-${COLOR_FLOOR[stage]}-border)`;
      assert.ok(blockFor(stage).includes(want),
        `${stage} must use ${want}`);
    });
  }

  test('no speculative --stage-*-underline-* token was invented', () => {
    assert.doesNotMatch(
      CODE,
      /--stage-[a-z]+-underline-[a-z-]+/,
      'zero-new-tokens — reuse existing --stage-*-border',
    );
  });
});

// ── Tempo contract (Tanya §5 — color-only transition on stage duration) ─────

describe('stage-underline.css — transitions color only, on stage tempo', () => {
  for (const stage of DECAY_STAGES) {
    test(`${stage} transitions text-decoration-color on stage tempo`, () => {
      const block = blockFor(stage);
      const want = `transition: text-decoration-color var(--stage-${stage}-duration) var(--stage-${stage}-ease)`;
      assert.ok(block.includes(want),
        `${stage} transition should be: ${want}`);
    });
    test(`${stage} does NOT transition geometry`, () => {
      const block = blockFor(stage);
      const transitionLine = /transition:[^;]+;/.exec(block)?.[0] ?? '';
      for (const geom of ['thickness', 'offset', 'width']) {
        assert.ok(!transitionLine.includes(geom),
          `${stage} must not transition ${geom} — baseline wobble`);
      }
    });
  }
});

// ── Accessibility sanctuaries (Tanya §6, Mike §6) ───────────────────────────

describe('stage-underline.css — accessibility sanctuary blocks', () => {
  test('forced-colors block yields text-decoration-color: LinkText', () => {
    const m = CODE.match(/@media\s*\(\s*forced-colors:\s*active\s*\)\s*\{[\s\S]*?\n\}/);
    assert.ok(m, 'forced-colors block missing');
    assert.ok(m![0].includes('text-decoration-color: LinkText'),
      'forced-colors must yield text-decoration-color: LinkText');
    assert.ok(m![0].includes('text-decoration-thickness: auto'),
      'forced-colors must drop thickness override');
    assert.ok(m![0].includes('text-underline-offset: auto'),
      'forced-colors must drop offset override');
  });

  test('reduced-motion block drops the transition', () => {
    const m = CODE.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?\n\}/);
    assert.ok(m, 'prefers-reduced-motion block missing');
    assert.ok(/transition:\s*none/.test(m![0]),
      'reduced-motion must set transition: none');
  });
});

// ── Scope-fence integrity (Tanya §2, §4.3) ──────────────────────────────────

describe('stage-underline.css — scope fence never widens', () => {
  test('no bare `a` rule outside the prose fence', () => {
    // Every stage header includes :is(…) a. No stage rule may target bare a.
    const bareA = /\[data-decay-stage="[a-z]+"\]\s+a\b/;
    assert.doesNotMatch(CODE, bareA,
      'bare [data-decay-stage] a would paint nav chrome');
  });

  test('no hover / active / focus pseudo is painted', () => {
    // Tanya §4.3 — resting-state only. No hover thickening, no focus flip.
    for (const pseudo of [':hover', ':active', ':focus', ':focus-visible']) {
      assert.ok(!CODE.includes(pseudo),
        `underline axis must not paint ${pseudo} — it is resting-state only`);
    }
  });

  test('no chrome tags in the selector list', () => {
    const forbidden = ['button', 'summary', 'input', 'textarea', 'nav', 'code', 'pre'];
    const selectorLines = CODE.split('\n').filter(l => l.includes('[data-decay-stage'));
    const joined = selectorLines.join(' ');
    for (const tag of forbidden) {
      assert.ok(!new RegExp(`\\b${tag}\\b`).test(joined),
        `scope fence must not list ${tag}`);
    }
  });
});

// ── No raw-value leaks (belt-and-braces vs. compliance guard) ───────────────

describe('stage-underline.css — zero raw color / duration leaks', () => {
  test('no hex colors', () => {
    assert.doesNotMatch(CODE, /#[0-9a-fA-F]{3,8}\b/);
  });
  test('no rgb/rgba/hsl/hsla literals', () => {
    assert.doesNotMatch(CODE, /\b(rgba?|hsla?)\s*\(/);
  });
  test('no raw ms/s duration in transition lines', () => {
    for (const line of CODE.split('\n')) {
      if (!/transition\s*:/i.test(line)) continue;
      assert.doesNotMatch(line, /\b\d+\.?\d*(ms|s)\b/,
        `raw duration leaked into: ${line.trim()}`);
    }
  });
});

// ── WCAG contrast guardrail (Elon §4, Mike §8) ──────────────────────────────
//
// Pure arithmetic. No `culori`, no new dependency. OKLCH → linear sRGB
// (Björn Ottosson's M1/M2 matrices), then WCAG 1.4.11 relative luminance.

/** Parse --color-decay-{stage}: oklch(L% C H) from tokens.css. */
function parseOklch(stage: DecayStage): { L: number; C: number; H: number } {
  const re = new RegExp(`--color-decay-${stage}:\\s*oklch\\(\\s*(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s*\\)`);
  const m = re.exec(TOKENS);
  assert.ok(m, `--color-decay-${stage} not found in tokens.css`);
  return { L: parseFloat(m![1]) / 100, C: parseFloat(m![2]), H: parseFloat(m![3]) };
}

/** Parse --surface-base: #hex from tokens.css. */
function parseSurfaceBase(): { r: number; g: number; b: number } {
  const m = /--surface-base:\s*#([0-9a-fA-F]{6})/.exec(TOKENS);
  assert.ok(m, '--surface-base #hex not found in tokens.css');
  const hex = m![1];
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

/** OKLCH → OKLab (polar → rect). */
function oklchToOklab(c: { L: number; C: number; H: number }) {
  const hRad = (c.H * Math.PI) / 180;
  return { L: c.L, a: c.C * Math.cos(hRad), b: c.C * Math.sin(hRad) };
}

/** OKLab → linear sRGB (Ottosson 2020). */
function oklabToLinearSrgb(lab: { L: number; a: number; b: number }) {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return {
    r:  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

/** sRGB gamma channel → linear. WCAG 2.x formula. */
function gammaToLinear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear sRGB triple → WCAG relative luminance Y. */
function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

/** OKLCH → WCAG relative luminance (via linear sRGB). */
function oklchLuminance(c: { L: number; C: number; H: number }): number {
  return relativeLuminance(oklabToLinearSrgb(oklchToOklab(c)));
}

/** Hex sRGB → WCAG relative luminance. */
function hexLuminance(rgb: { r: number; g: number; b: number }): number {
  return relativeLuminance({
    r: gammaToLinear(rgb.r), g: gammaToLinear(rgb.g), b: gammaToLinear(rgb.b),
  });
}

/** WCAG contrast ratio between two luminance values. */
function contrast(y1: number, y2: number): number {
  const [hi, lo] = y1 > y2 ? [y1, y2] : [y2, y1];
  return (hi + 0.05) / (lo + 0.05);
}

describe('stage-underline.css — WCAG 1.4.11 contrast holds for every stage', () => {
  const bgY = hexLuminance(parseSurfaceBase());

  for (const stage of DECAY_STAGES) {
    test(`${stage} underline vs --surface-base is ≥ 3:1`, () => {
      const colorStage = COLOR_FLOOR[stage];
      const fgY  = oklchLuminance(parseOklch(colorStage));
      const ratio = contrast(fgY, bgY);
      assert.ok(ratio >= 3.0,
        `${stage} → --stage-${colorStage}-border fails WCAG 1.4.11: ${ratio.toFixed(2)}:1`);
    });
  }
});
