// src/lib/og/renderOGImage.ts
// Top-level OG image renderer. Composes layout + fonts → SVG → PNG.
// Uses satori for JSX→SVG and @resvg/resvg-js for SVG→PNG.
// Pure pipeline: data in, PNG buffer out. No HTTP concerns.

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ogFonts } from './ogFonts';
import { ogLayout } from './ogLayout';
import type { OGImageData } from './ogLayout';

const WIDTH = 1200;
const HEIGHT = 630;

/** Render a satori element tree to an SVG string. */
async function toSVG(data: OGImageData): Promise<string> {
  const element = ogLayout(data);
  return satori(element as React.ReactNode, {
    width: WIDTH, height: HEIGHT, fonts: ogFonts(),
  });
}

/** Convert an SVG string to a PNG Uint8Array via resvg WASM. */
function toPNG(svg: string): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  });
  return resvg.render().asPng();
}

/** Full pipeline: OGImageData → PNG buffer. */
export async function renderOGImage(data: OGImageData): Promise<Uint8Array> {
  const svg = await toSVG(data);
  return toPNG(svg);
}

export type { OGImageData };
