// scripts/lib/astro-style-blocks.ts
//
// Shared helper for prebuild guards that scan CSS inside .astro <style>
// blocks. One parser, two consumers: the token-compliance guard and the
// v152 motion-sanctuary guard. Polymorphism IS a killer — this module
// exists only because the second real consumer arrived (Mike napkin §4
// "extract the scanner when the second consumer is real").
//
// Pure functions — no I/O, no globals. The caller reads the file.
// Line numbers are 1-based and relative to the whole .astro source so
// diagnostics point at the right line in an editor.
//
// Credits: Mike (napkin §4 — second-consumer promotion), Sid — 2026-04-22.

export interface StyleBlock {
  /** 1-based line number in the parent .astro file of the block's first content line. */
  startLine: number;
  /** Lines of the block's inner text (no <style> / </style> tags). */
  lines: string[];
}

/**
 * Extract every `<style ...>...</style>` block from a .astro source.
 * Block contents retain their original relative line indexing so each
 * scanner can map a hit back to a whole-file line number with:
 *     absoluteLine = block.startLine + innerLineIndex
 */
export function extractStyleBlocks(source: string): StyleBlock[] {
  const out: StyleBlock[] = [];
  const re = /<style[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const startOffset = m.index + m[0].length;
    const endTag = source.indexOf('</style>', startOffset);
    if (endTag < 0) continue;
    const before = source.slice(0, startOffset);
    const startLine = before.split('\n').length;
    const block = source.slice(startOffset, endTag);
    out.push({ startLine, lines: block.split('\n') });
  }
  return out;
}
