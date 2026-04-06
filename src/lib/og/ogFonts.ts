// src/lib/og/ogFonts.ts
// Font loader for satori OG image renderer.
// Reads system TTF files once, caches buffers in module scope.
// Satori requires raw font data — no CSS @font-face.

import { readFileSync } from 'node:fs';

interface FontEntry {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: 'normal';
}

let cache: FontEntry[] | null = null;

/** Read a TTF file and wrap it for satori. */
function loadFont(path: string, weight: 400 | 700): FontEntry {
  const buf = readFileSync(path);
  return { name: 'sans-serif', data: buf.buffer, weight, style: 'normal' };
}

/** Returns cached font entries for satori. Loaded once per process. */
export function ogFonts(): FontEntry[] {
  if (cache) return cache;
  cache = [
    loadFont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 400),
    loadFont('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 700),
  ];
  return cache;
}
