// src/content/config.ts
// Astro content collection schema — single source of truth for all frontmatter.
// Add new fields here; Zod validates at build time, broken posts fail loudly.

import { defineCollection, z } from 'astro:content';

/**
 * Verdict tokens for a conviction belief statement (Tanya §5 — ConvictionPanel).
 * 'abandoned' added alongside ConvictionVerdict type in decay-engine.ts — Mike §4.1
 */
const verdictEnum = z.enum(['still-true', 'wrong', 'evolved', 'unaudited', 'abandoned']);

/**
 * Falsifiable prediction with pre-committed resolution criteria — Prediction Vault feature.
 * verdict is null at publish; sealed by admin via POST /api/seal-prediction.
 * id must be stable after publish — it is the foreign key for predictions_ledger.
 */
const predictionSchema = z.object({
  id:                   z.string(),
  claim:                z.string(),
  resolution_criteria:  z.string(),
  resolution_deadline:  z.coerce.date(),
  verdict:              z.enum(['correct', 'incorrect', 'partial']).nullable().default(null),
});

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string().optional(),
    badge: z.string().optional(), // editorial tone phrase — see openloop/badge-guide.md
    mood: z.string().optional(),  // article atmosphere — see lib/mood-engine.ts for valid values
    lifespan: z.number().positive().optional(), // post lifespan in days (default: 365)
    coverImage: z.string().optional(),          // path relative to /public, e.g. /images/covers/hello-world.jpg
    echo: z.object({
      text: z.string(),   // curated sentence from the echoed post
      from: z.string(),   // slug of the source post (e.g. "hello-world")
    }).optional(),
    constellation: z.array(z.object({
      slug: z.string(),          // slug of the related post
      strength: z.number().min(0).max(1).default(0.5),
    })).optional(),
    // --- Constellation pipeline: post → star ---
    constellationName: z.string().optional(),     // group name, e.g. "first light"
    starName: z.string().optional(),              // display label in star field
    magnitude: z.number().min(1).max(5).default(3).optional(), // visual weight
    // --- Author conviction notes (P0 — Tanya §5) ---
    // Max 5 beliefs. Verdict = author's current stance. Anti-bloat: keep it honest.
    convictions: z.array(z.object({
      belief: z.string(),
      verdict: verdictEnum.default('unaudited'),
      note: z.string().optional(),   // brief update — why it changed
    })).max(5).optional(),
    // --- Resolution deadline (Mike §deadline-enforcer) ---
    // ISO date the author publicly commits to sealing a verdict by.
    // If deadline passes with no sealed verdict → auto-sealed as 'abandoned' by /api/deadline-sweep.
    // Absence = no commitment. Presence = public accountability contract.
    resolution_deadline: z.date().optional(),
    // --- Prediction Vault (Mike §Prediction-Vault) ---
    // Falsifiable claims with pre-defined criteria. Verdict sealed by admin, never self-reported.
    // prediction.id values are immutable after publish — treat like post slugs.
    predictions: z.array(predictionSchema).optional(),
  }),
});

export const collections = { blog };
