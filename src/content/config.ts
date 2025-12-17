import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    description: z.string().optional(),
    author: z.string().optional(),
    thumbnail: z.string().optional(),
    tags: z.array(z.string()).optional(),
    featured: z.boolean().optional().default(false), // Article en vedette
    draft: z.boolean().optional().default(false), // Brouillon
  }),
});

export const collections = { blog };