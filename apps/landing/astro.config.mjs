import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import { hozo } from '@hozo/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE || 'https://iray-tno.github.io',
  base: process.env.BASE_PATH || '/hozo',
  integrations: [react(), mdx()],
  vite: {
    // Hozo first, for the reason `examples/login-demo` gives: it has to see
    // the source as written, before any JSX transform.
    // Landing already imports Tailwind v4 in global.css, which ships its own
    // preflight inside `@layer base`. Disabling Hozo's injected preflight prevents
    // unlayered `* { margin: 0; padding: 0; }` from overriding Tailwind utility classes.
    plugins: [hozo({ preflight: false }), tailwindcss()],
  },
})
