import { defineCollection } from 'astro:content'
import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'

// Every page lives under `docs/`, so Starlight's routes are `/docs/...` and
// leave the landing's own pages (`/`, `/repl/`, `/tailwind/`, …) alone.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
}
