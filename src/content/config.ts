// src/content/config.ts
// Astro content collection schema — single source of truth for all frontmatter.
// Add new fields here; Zod validates at build time, broken posts fail loudly.
//
// TODO: add author, tags, coverImage fields as the blog evolves

import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string().optional(),
    badge: z.string().optional(), // editorial tone phrase — see openloop/badge-guide.md
    mood: z.string().optional(),  // article atmosphere — see lib/mood-engine.ts for valid values
    variants: z.boolean().optional(), // opt-in: post content shifts with time/celestial/age
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
  }),
});

export const collections = { blog };
