// The ratio table, kept in a file with no React Native in it.
//
// `ratios.test.ts` checks these against the compiler's copy, and a Node
// test cannot import `index.native.tsx`: React Native ships Flow-typed
// JavaScript that Node will not parse. The table is data either way.

/**
 * How much smaller than the text around it each of these draws.
 *
 * The same table the compiler applies in `crates/hozo_native/src/text.rs`,
 * and `ratios.test.ts` reads that file to check the two still agree. Two
 * copies of a number is how a compiled build and an uncompiled one come
 * to render the same source at different sizes -- which is what the
 * constants these replace were already doing.
 *
 * These are the numbers a project shipping Tailwind's preflight renders,
 * which is what `preflight: 'auto'` gives anything using Tailwind. The
 * bare user agent is a second set -- `small`, `sub` and `sup` are all
 * `smaller`, about 0.8333 -- and the compiler picks between the two from
 * the resolved `preflight` option. These components cannot: they are
 * ordinary React with no build to ask, so they hold the common case and
 * `ratios.test.ts` says what that costs (#315).
 *
 * `small` was 0.85 here and in the compiler, and 0.85 is neither number.
 * Measured in headless Chrome at bases 16, 20 and 32: 0.80 with the
 * reset, 0.8333 without it.
 */
export const TEXT_SIZE_RATIOS = {
  sub: 0.75,
  sup: 0.75,
  small: 0.8,
  rubyText: 0.5,
  heading: [2, 1.5, 1.17, 1, 0.83, 0.67],
} as const
