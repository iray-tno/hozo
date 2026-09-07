import path from 'node:path'
import { withHozo } from '@hozo/next'
import createMDX from '@next/mdx'

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
      // Where this build writes, so that two of them in this package do
      // not share one directory.
      //
      // `build` and `test` here both run `next build`, and turbo starts
      // them together -- `test` depends on `^build`, its dependencies'
      // builds, not its own. Next refuses the second with "Another next
      // build process is already running", and the pair that did not
      // collide was worse: `test` begins by deleting `.next`, which is
      // the artifact `build` just wrote.
      //
      // An environment variable rather than a flag because `next build`
      // has none for this; the config is the only place Next reads it.
      distDir: process.env.HOZO_NEXT_DIST_DIR ?? '.next',
    },
    { css: 'src/theme.css' },
  ),
)
