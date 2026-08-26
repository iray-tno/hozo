import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE || 'https://iray-tno.github.io',
  base: process.env.BASE_PATH || '/hozo',
  vite: {
    plugins: [tailwindcss()],
  },
})
