import path from 'node:path'

import createMDX from '@next/mdx'
import { withHozo } from '@hozo/next'

// `jsx: true` is the whole reason MDX works here. Without it `@mdx-js/mdx`
// folds the page to `_jsx()` calls, which Hozo's parser cannot read --
// it reads JSX syntax, the same syntax it writes back. `@next/mdx` spreads
// `options` straight into the loader, which spreads them into
// `createProcessor`, so the setting arrives intact. `@astrojs/mdx` has no
// equivalent, which is why Astro wants a `.tsx` island instead.
//
// Next then compiles the JSX that leaves Hozo: under webpack the MDX rule
// is `[defaultLoaders.babel, mdxLoader]`, and under Turbopack the rule
// declares `as: '*.tsx'`.
const withMDX = createMDX({ options: { jsx: true } })

export default withMDX(
  withHozo(
    {
      // The workspace root, not this directory. In a pnpm workspace `next`
      // itself is a symlink into the root's `node_modules/.pnpm`, and
      // Turbopack refuses to read anything above the root it is given.
      turbopack: { root: path.resolve(import.meta.dirname, '../..') },
      pageExtensions: ['ts', 'tsx', 'mdx'],
    },
    { css: 'src/theme.css' },
  ),
)
