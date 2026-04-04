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
  }),
});

export const collections = { blog };
