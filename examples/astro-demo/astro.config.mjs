import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import { hozo } from '@hozo/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  integrations: [react(), mdx()],
  vite: {
    // First: Hozo has to see the source as written, before any other
    // plugin transforms it.
    plugins: [hozo({ css: 'src/theme.css' })],
  },
})
