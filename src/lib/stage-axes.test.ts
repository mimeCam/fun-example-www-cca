// src/lib/stage-axes.test.ts
//
// Textual + shape parity tests for src/lib/stage-axes.ts (v150a).
//
// The module is the canonical axis literal for the decay grammar. Both
// the docs page (`/api/docs`) and the compliance guard consume it. The
// tests below enforce three invariants:
//
//   1. Freeze: STAGE_AXES.length === 7, DECAY_STAGES.length === 5 (again).
//   2. Wire to disk: every axis maps to a file that exists on disk.
//   3. Dense grid: every (axis, stage) cell has non-empty token refs +
//      an example element kind; the 7 × 5 = 35 combinations are present
//      with no gaps and no duplicates.
//
// Also verifies a parser contract the compliance guard relies on: the
// `STAGE_AXES` tuple can be extracted with a simple regex (the exact
// same technique used for DECAY_STAGES in check-token-compliance.ts).
//
// Run:  npx tsx --test src/lib/stage-axes.test.ts
//
// Credits: Mike (§5.7 test plan), Tanya (§3.4 cell anatomy), Elon
//          (axis-inventory enforcement), Sid (stage-focus.test.ts
//          template). AGENTS.md (freeze).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  STAGE_AXES,
  AXIS_TO_CSS_FILE,
  STAGE_FILE_EXEMPT,
  axisStageExample,
  stageAxisGrid,
  cellAnchorId,
  rowAnchorId,
  stageAnchorId,
  cellCitationLabel,
  cellCitationPayload,
} from './stage-axes.js';
import type { Axis } from './stage-axes.js';
import { DECAY_STAGES } from './decay-engine.js';

// ── 1 · Freeze ─────────────────────────────────────────────────────────────

describe('stage-axes — literal sets are frozen', () => {
  test('STAGE_AXES.length === 7', () => {
    assert.equal(STAGE_AXES.length, 7);
  });

  test('DECAY_STAGES.length === 5 (re-assertion of the engine freeze)', () => {
    assert.equal(DECAY_STAGES.length, 5);
  });

  test('STAGE_AXES order is the semantic grouping', () => {
    assert.deepEqual(
      [...STAGE_AXES],
      ['typography', 'border', 'tempo', 'selection', 'drag-highlight', 'focus', 'underline'],
    );
  });

  test('no duplicates in STAGE_AXES', () => {
    assert.equal(new Set(STAGE_AXES).size, STAGE_AXES.length);
  });
});

// ── 2 · Axis → file mapping exists on disk ─────────────────────────────────

describe('stage-axes — AXIS_TO_CSS_FILE targets real files', () => {
  for (const axis of STAGE_AXES) {
    test(`${axis} maps to a file that exists on disk`, () => {
      const rel = AXIS_TO_CSS_FILE[axis];
      assert.ok(rel, `${axis} missing from AXIS_TO_CSS_FILE`);
      const abs = path.resolve(process.cwd(), rel);
      assert.ok(fs.existsSync(abs), `${axis} → missing file: ${rel}`);
    });
  }

  test('every axis has a mapping (no gaps)', () => {
    for (const axis of STAGE_AXES) {
      assert.ok(axis in AXIS_TO_CSS_FILE, `no mapping for ${axis}`);
    }
  });
});

// ── 3 · Every stage-*.css file is accounted for ────────────────────────────

describe('stage-axes — stage-*.css inventory is complete', () => {
  const STYLES_DIR = path.resolve(process.cwd(), 'src/styles');

  function stageCssFiles(): string[] {
    return fs.readdirSync(STYLES_DIR)
      .filter(f => /^stage-[a-z-]+\.css$/.test(f))
      .filter(f => !STAGE_FILE_EXEMPT.includes(f));
  }

  test('every non-exempt stage-*.css on disk is an AXIS_TO_CSS_FILE value', () => {
    const values = new Set(Object.values(AXIS_TO_CSS_FILE));
    for (const f of stageCssFiles()) {
      const rel = `src/styles/${f}`;
      assert.ok(values.has(rel), `no axis maps to ${rel} — add one to STAGE_AXES or exempt it`);
    }
  });
});

// ── 4 · axisStageExample — dense, non-empty, well-typed ────────────────────

describe('stage-axes — axisStageExample(axis, stage) shape', () => {
  const TOKEN_RE = /^--[a-z][a-z0-9-]+$/;

  for (const axis of STAGE_AXES) {
    for (const stage of DECAY_STAGES) {
      test(`${axis} × ${stage} has non-empty tokenRefs + exampleElement`, () => {
        const cell = axisStageExample(axis as Axis, stage);
        assert.ok(Array.isArray(cell.tokenRefs), 'tokenRefs is array');
        assert.ok(cell.tokenRefs.length > 0, 'tokenRefs not empty');
        assert.ok(cell.exampleElement.length > 0, 'exampleElement not empty');
        for (const ref of cell.tokenRefs) {
          assert.match(ref, TOKEN_RE, `token ref malformed: ${ref}`);
        }
      });
    }
  }
});

// ── 5 · Grid: dense 7 × 5 cross product ────────────────────────────────────

describe('stage-axes — stageAxisGrid enumerates 7 × 5 = 35 cells', () => {
  test('grid length matches STAGE_AXES × DECAY_STAGES', () => {
    assert.equal(stageAxisGrid().length, STAGE_AXES.length * DECAY_STAGES.length);
  });

  test('grid cells are unique (axis, stage) pairs', () => {
    const keys = stageAxisGrid().map(e => `${e.axis}:${e.stage}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  test('every (axis, stage) appears in the grid', () => {
    const keys = new Set(stageAxisGrid().map(e => `${e.axis}:${e.stage}`));
    for (const axis of STAGE_AXES) {
      for (const stage of DECAY_STAGES) {
        assert.ok(keys.has(`${axis}:${stage}`), `missing ${axis}:${stage}`);
      }
    }
  });
});

// ── 6 · Anchor id helpers ──────────────────────────────────────────────────

describe('stage-axes — anchor helpers produce stable ids', () => {
  test('cellAnchorId(axis, stage) format', () => {
    assert.equal(cellAnchorId('typography', 'fossil'), 'axis-typography-stage-fossil');
    assert.equal(cellAnchorId('drag-highlight', 'fresh'), 'axis-drag-highlight-stage-fresh');
  });

  test('rowAnchorId(axis) format', () => {
    assert.equal(rowAnchorId('focus'), 'axis-focus');
  });

  test('stageAnchorId(stage) format', () => {
    assert.equal(stageAnchorId('endangered'), 'stages-endangered');
  });
});

// ── 6b · Citation helpers (v150b, copy-cell-anchor) ────────────────────────

describe('stage-axes — cellCitationLabel is a stable human-readable tag', () => {
  test('uses U+00D7 multiplication sign (not "x" or "*")', () => {
    const label = cellCitationLabel('typography', 'endangered');
    assert.equal(label, 'typography × endangered');
    assert.ok(label.includes('×'), 'must contain U+00D7');
    assert.ok(!/[x*]/.test(label), 'must not contain x or *');
  });

  test('renders dashed axis names verbatim', () => {
    assert.equal(cellCitationLabel('drag-highlight', 'fresh'), 'drag-highlight × fresh');
  });

  test('every (axis, stage) produces a non-empty single-line label', () => {
    for (const axis of STAGE_AXES) {
      for (const stage of DECAY_STAGES) {
        const label = cellCitationLabel(axis as Axis, stage);
        assert.ok(label.length > 0, `empty label for ${axis}:${stage}`);
        assert.ok(!label.includes('\n'), `newline in label for ${axis}:${stage}`);
      }
    }
  });
});

describe('stage-axes — cellCitationPayload is the single-line clipboard string', () => {
  const ORIGIN = 'https://a.getsven.com';

  test('format is `label · origin/api/docs#cellAnchorId` (single line)', () => {
    const out = cellCitationPayload('typography', 'endangered', ORIGIN);
    assert.equal(
      out,
      'typography × endangered · https://a.getsven.com/api/docs#axis-typography-stage-endangered',
    );
    assert.ok(!out.includes('\n'), 'payload must be single line (Elon §4.1)');
  });

  test('uses U+00B7 middle dot as separator', () => {
    const out = cellCitationPayload('border', 'fresh', ORIGIN);
    assert.ok(out.includes(' · '), 'must use " · " separator');
  });

  test('reuses cellAnchorId verbatim (one source of truth)', () => {
    for (const axis of STAGE_AXES) {
      for (const stage of DECAY_STAGES) {
        const out = cellCitationPayload(axis as Axis, stage, ORIGIN);
        assert.ok(
          out.endsWith(`#${cellAnchorId(axis as Axis, stage)}`),
          `payload must end with #${cellAnchorId(axis as Axis, stage)}`,
        );
      }
    }
  });

  test('does not duplicate the trailing slash of origin', () => {
    // Callers pass window.location.origin — no trailing slash by spec.
    const out = cellCitationPayload('focus', 'fossil', ORIGIN);
    assert.ok(!out.includes('//api/docs'), 'no double slash in path');
  });
});

// ── 7 · Parser contract (for check-token-compliance.ts) ────────────────────

describe('stage-axes — source is parser-friendly for the compliance guard', () => {
  const SRC = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/stage-axes.ts'),
    'utf-8',
  );

  test('STAGE_AXES tuple parses via the simple regex the guard uses', () => {
    const re = /export\s+const\s+STAGE_AXES\s*=\s*\[([\s\S]+?)\]\s*as\s+const/;
    const m = re.exec(SRC);
    assert.ok(m, 'guard regex could not find STAGE_AXES');
    const parsed = m![1]
      .split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    assert.deepEqual(parsed, [...STAGE_AXES]);
  });
});
