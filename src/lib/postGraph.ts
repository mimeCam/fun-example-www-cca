// src/lib/postGraph.ts
// Post-to-post relationship graph — the data layer for the "mini constellation"
// that appears at the end of every blog post. Relationships are declared in
// frontmatter (`constellation` field) and merged bidirectionally so post A
// linking to B automatically means B links back to A.
//
// Deterministic layout is inherited from constellation.ts (hashCode + starPosition).
// Zero dependencies beyond Astro content collections.

import type { CollectionEntry } from 'astro:content';
import { starPosition } from './constellation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostNode {
  slug: string;
  title: string;
  isCurrent: boolean;
}

export interface PostEdge {
  from: string;
  to: string;
  strength: number;  // 0–1, maps to line opacity + stroke width
}

export interface PostGraph {
  nodes: PostNode[];
  edges: PostEdge[];
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/** Extract declared edges from a single post's frontmatter. */
function extractEdges(post: CollectionEntry<'blog'>): PostEdge[] {
  const links = post.data.constellation ?? [];
  return links.map(l => ({
    from: post.slug,
    to: l.slug,
    strength: l.strength,
  }));
}

/** Merge two edges between the same pair — keep the stronger one. */
function edgeKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Build the full bidirectional graph from all posts. */
export function buildGraph(posts: CollectionEntry<'blog'>[]): PostGraph {
  const titleMap = new Map(posts.map(p => [p.slug, p.data.title]));
  const edgeMap = new Map<string, PostEdge>();

  for (const post of posts) {
    for (const edge of extractEdges(post)) {
      const key = edgeKey(edge.from, edge.to);
      const existing = edgeMap.get(key);
      if (!existing || edge.strength > existing.strength) {
        edgeMap.set(key, edge);
      }
    }
  }

  const slugs = new Set<string>();
  for (const e of edgeMap.values()) {
    slugs.add(e.from);
    slugs.add(e.to);
  }

  const nodes: PostNode[] = [...slugs].map(s => ({
    slug: s,
    title: titleMap.get(s) ?? s,
    isCurrent: false,
  }));

  return { nodes, edges: [...edgeMap.values()] };
}

/** Extract the local subgraph around a single post (depth 1). */
export function getLocalGraph(
  slug: string, full: PostGraph,
): PostGraph {
  const neighborSlugs = new Set<string>();
  const localEdges: PostEdge[] = [];

  for (const e of full.edges) {
    if (e.from === slug || e.to === slug) {
      neighborSlugs.add(e.from);
      neighborSlugs.add(e.to);
      localEdges.push(e);
    }
  }

  const nodes = full.nodes
    .filter(n => neighborSlugs.has(n.slug))
    .map(n => ({ ...n, isCurrent: n.slug === slug }));

  return { nodes, edges: localEdges };
}

// ---------------------------------------------------------------------------
// Layout — reuses constellation.ts positioning
// ---------------------------------------------------------------------------

export interface LayoutNode extends PostNode {
  x: number;  // 0–100 viewport percent
  y: number;
}

/** Assign deterministic positions to all nodes in a graph. */
export function layoutGraph(
  graph: PostGraph, salt = 'post',
): { nodes: LayoutNode[]; edges: PostEdge[] } {
  const nodes = graph.nodes.map(n => {
    const { x, y } = starPosition(n.slug, salt);
    return { ...n, x, y };
  });
  return { nodes, edges: graph.edges };
}

// ---------------------------------------------------------------------------
// Isolated-run sanity check
// ---------------------------------------------------------------------------

export function _testPostGraph(): void {
  const fake = (slug: string, links: { slug: string; strength: number }[]) =>
    ({ slug, data: { title: slug, constellation: links } }) as any;

  const posts = [
    fake('a', [{ slug: 'b', strength: 0.8 }]),
    fake('b', [{ slug: 'a', strength: 0.5 }, { slug: 'c', strength: 0.6 }]),
    fake('c', []),
  ];

  const g = buildGraph(posts);
  console.assert(g.nodes.length === 3, `3 nodes, got ${g.nodes.length}`);
  console.assert(g.edges.length === 2, `2 edges, got ${g.edges.length}`);

  const ab = g.edges.find(e => edgeKey(e.from, e.to) === 'a:b');
  console.assert(ab?.strength === 0.8, 'a↔b keeps stronger 0.8');

  const local = getLocalGraph('b', g);
  console.assert(local.nodes.length === 3, 'b sees a and c');
  console.assert(local.edges.length === 2, 'b has 2 edges');

  const center = local.nodes.find(n => n.slug === 'b');
  console.assert(center?.isCurrent === true, 'b is marked current');

  const laid = layoutGraph(local);
  for (const n of laid.nodes) {
    console.assert(n.x >= 8 && n.x <= 92, `x in bounds: ${n.x}`);
    console.assert(n.y >= 8 && n.y <= 92, `y in bounds: ${n.y}`);
  }

  console.log('[postGraph] lib OK — build, local, layout verified');
}
