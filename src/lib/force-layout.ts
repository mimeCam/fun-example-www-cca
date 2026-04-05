// src/lib/force-layout.ts
// Minimal force-directed layout: proximity = relatedness.
// Runs at build time — zero client JS. No dependencies.
// Attractive force between related nodes, repulsive between all.
//
// TODO: add cluster centroids for 200+ node scalability
// TODO: adaptive iteration count based on energy delta

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

interface ForceConfig {
  pad: number;       // viewport edge padding (percent)
  attract: number;   // attraction multiplier
  repulse: number;   // repulsion multiplier
  damping: number;   // velocity damping per tick
  ticks: number;     // simulation iterations
}

const DEFAULTS: ForceConfig = {
  pad: 10, attract: 0.6, repulse: 1.2, damping: 0.85, ticks: 80,
};

/** Clamp a value to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Euclidean distance, floored to avoid division by zero. */
function dist(a: LayoutNode, b: LayoutNode): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
}

/** Seed initial positions deterministically from id hash. */
function seedPosition(id: string, pad: number): { x: number; y: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  h = Math.abs(h);
  const range = 100 - pad * 2;
  return { x: pad + (h % range), y: pad + ((h >> 8) % range) };
}

/**
 * Run force-directed layout. Returns positioned nodes.
 * @param ids        node identifiers
 * @param scoreFn    relatedness score (0–1) between two ids
 * @param partial    optional config overrides
 */
export function forceLayout(
  ids: string[],
  scoreFn: (a: string, b: string) => number,
  partial?: Partial<ForceConfig>,
): LayoutNode[] {
  const cfg = { ...DEFAULTS, ...partial };
  const nodes: LayoutNode[] = ids.map(id => ({ id, ...seedPosition(id, cfg.pad) }));
  const vx = new Float64Array(ids.length);
  const vy = new Float64Array(ids.length);

  for (let t = 0; t < cfg.ticks; t++) {
    const temp = 1 - t / cfg.ticks; // cooling schedule

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = dist(nodes[i], nodes[j]);
        const dx = (nodes[j].x - nodes[i].x) / d;
        const dy = (nodes[j].y - nodes[i].y) / d;
        const rel = scoreFn(nodes[i].id, nodes[j].id);

        // Attract related nodes, repulse all
        const fa = rel * cfg.attract * temp;
        const fr = cfg.repulse * temp / (d * d);
        const fx = dx * (fa - fr);
        const fy = dy * (fa - fr);

        vx[i] += fx; vy[i] += fy;
        vx[j] -= fx; vy[j] -= fy;
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      nodes[i].x = clamp(nodes[i].x + vx[i], cfg.pad, 100 - cfg.pad);
      nodes[i].y = clamp(nodes[i].y + vy[i], cfg.pad, 100 - cfg.pad);
      vx[i] *= cfg.damping;
      vy[i] *= cfg.damping;
    }
  }

  return nodes;
}
