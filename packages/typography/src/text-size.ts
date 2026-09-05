// The ratio table, kept in a file with no React Native in it.
//
// `ratios.test.ts` checks these against the compiler's copy, and a Node
// test cannot import `index.native.tsx`: React Native ships Flow-typed
// JavaScript that Node will not parse. The table is data either way.

/**
 * How much smaller than the text around it each of these draws.
 *
 * The same table the compiler applies in `crates/hozo_native/src/render.rs`,
 * and `ratios.test.ts` reads that file to check the two still agree. Two
 * copies of a number is how a compiled build and an uncompiled one come
 * to render the same source at different sizes -- which is what the
 * constants these replace were already doing.
 *
 * The values are the browser UA stylesheet's, which is what the Web half
 * of this package renders: `rt` at 50%, `small` at ~85%, `sub`/`sup` at 75%,
 * and h1...h6 at 2, 1.5, 1.17, 1, 0.83, 0.67.
 */
export const TEXT_SIZE_RATIOS = {
  sub: 0.75,
  sup: 0.75,
  small: 0.85,
  rubyText: 0.5,
  heading: [2, 1.5, 1.17, 1, 0.83, 0.67],
} as const
