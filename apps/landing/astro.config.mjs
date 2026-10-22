import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import starlight from '@astrojs/starlight'
import { hozo } from '@hozo/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE || 'https://iray-tno.github.io',
  base: process.env.BASE_PATH || '/hozo',
  // Starlight turns on prefetch for every page unless told otherwise, which
  // puts a script on pages whose point is that they ship none (check-build).
  prefetch: false,
  integrations: [
    // Before mdx(): Starlight adds its own only when none is listed, and
    // the landing's pages need the one configured here either way.
    starlight({
      title: 'Hozo',
      description:
        'A Rust-powered universal UI compiler and accessibility-first layer for React Native.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/iray-tno/hozo' }],
      editLink: { baseUrl: 'https://github.com/iray-tno/hozo/edit/main/apps/landing/' },
      // The landing owns the site's 404 and its home page; Starlight owns /docs.
      disable404Route: true,
      components: {
        Head: './src/components/DocsHead.astro',
        SiteTitle: './src/components/DocsSiteTitle.astro',
        Footer: './src/components/DocsFooter.astro',
      },
      customCss: ['./src/styles/docs.css'],
      sidebar: [
        { label: 'Overview', link: '/docs/' },
        {
          label: 'Getting started',
          items: [{ autogenerate: { directory: 'docs/getting-started' } }],
        },
        { label: 'Guides', items: [{ autogenerate: { directory: 'docs/guides' } }] },
        {
          label: 'Graphics & Media',
          items: [{ autogenerate: { directory: 'docs/graphics-and-media' } }],
        },
        { label: 'Components', items: [{ autogenerate: { directory: 'docs/components' } }] },
        { label: 'Reference', items: [{ autogenerate: { directory: 'docs/reference' } }] },
        {
          label: 'Migration & Case Studies',
          items: [{ autogenerate: { directory: 'docs/migration' } }],
        },
        { label: 'Concepts', items: [{ autogenerate: { directory: 'docs/concepts' } }] },
        { label: 'Troubleshooting', link: '/docs/troubleshooting/' },
        { label: 'What Hozo does not do yet', link: '/docs/status/' },
        // The rest of the site, so /docs is not a dead end: the landing's
        // own header is not on these pages.
        {
          label: 'Explore',
          items: [
            { label: 'Home', link: '/' },
            { label: 'REPL', link: '/repl/' },
            { label: 'Conformance Matrix', link: '/conformance/' },
            { label: 'Storybook', link: '/storybook/' },
            { label: 'Tailwind, compiled', link: '/tailwind/' },
            { label: 'StyleX, compiled', link: '/stylex/' },
            { label: 'Universal SVG', link: '/svg/' },
            { label: '2D Canvas', link: '/canvas/' },
            { label: 'Three.js', link: '/three/' },
          ],
        },
      ],
    }),
    react(),
    mdx(),
  ],
  vite: {
    // Hozo first, for the reason `examples/login-demo` gives: it has to see
    // the source as written, before any JSX transform.
    // Landing already imports Tailwind v4 in global.css, which ships its own
    // preflight, so Hozo's would be a second copy of it.
    plugins: [hozo({ preflight: false, css: 'src/styles/hozo-theme.css' }), tailwindcss()],
    // /tailwind/ compiles its sample at build time. Bundled, the compiler
    // looks for its native addon beside the bundle instead of its package.
    environments: { prerender: { resolve: { external: ['@hozo/compiler'] } } },
  },
})
