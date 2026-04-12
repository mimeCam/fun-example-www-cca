// src/lib/og/renderOGImage.ts
// Top-level OG image renderer. Composes layout + fonts → SVG → PNG.
// Uses satori for JSX→SVG and @resvg/resvg-js for SVG→PNG.
// Pure pipeline: data in, PNG buffer out. No HTTP concerns.

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ogFonts } from './ogFonts';
import { ogLayout } from './ogLayout';
import type { OGImageData } from './ogLayout';
import { accountabilityLayout } from './accountabilityLayout';
import type { AccountabilityOGData } from './accountabilityData';
import { battingAverageLayout } from './battingAverageLayout';
import type { BattingAverage } from '../batting-average';
import { auditLayout } from './auditLayout';
import type { AuditOGData } from './auditLayout';

const WIDTH = 1200;
const HEIGHT = 630;

/** Render any satori element tree to an SVG string. */
async function toSVG(element: Record<string, unknown>): Promise<string> {
  return satori(element as React.ReactNode, {
    width: WIDTH, height: HEIGHT, fonts: ogFonts(),
  });
}

/** Convert an SVG string to a PNG Uint8Array via resvg. */
function toPNG(svg: string): Uint8Array {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
  return resvg.render().asPng();
}

/** Legacy decay-aesthetic pipeline: OGImageData → PNG buffer. */
export async function renderOGImage(data: OGImageData): Promise<Uint8Array> {
  return toPNG(await toSVG(ogLayout(data)));
}

/** Accountability-first pipeline: AccountabilityOGData → PNG buffer. */
export async function renderAccountabilityImage(data: AccountabilityOGData): Promise<Uint8Array> {
  return toPNG(await toSVG(accountabilityLayout(data)));
}

/** Batting average share card pipeline: BattingAverage → PNG buffer. */
export async function renderBattingAverageImage(avg: BattingAverage, siteName: string): Promise<Uint8Array> {
  return toPNG(await toSVG(battingAverageLayout(avg, siteName)));
}

/** Conviction audit OG card pipeline: AuditOGData → PNG buffer. */
export async function renderAuditImage(data: AuditOGData): Promise<Uint8Array> {
  return toPNG(await toSVG(auditLayout(data)));
}

export type { OGImageData, AuditOGData };
