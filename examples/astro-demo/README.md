# Hozo + Astro

Astro builds with Vite, so Hozo's Vite plugin is all it takes. Put `hozo()` first in `vite.plugins`:

```js
vite: { plugins: [hozo({ css: 'src/theme.css' })] }
```

- `src/components/Welcome.tsx` is static. The page gets its HTML and CSS and no JavaScript for it.
- `src/components/Counter.tsx` has state, so `index.astro` renders it with `client:load`.
- `src/pages/notes.mdx` uses primitives inline.
- `tsconfig.json` sets `"jsx": "react-jsx"`. Astro's preset leaves JSX to Astro, and without this the `.tsx` components fail with `React is not defined`.

`pnpm test` builds the site and checks those three promises against the output: the static component reached no client chunk, the island has one, and the MDX page shipped no script.

The [Astro guide](https://iray-tno.github.io/hozo/docs/getting-started/astro/) has the rest.
