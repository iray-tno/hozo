/**
 * The Native entry point, which so far has nothing of its own to say.
 *
 * Every export here is date arithmetic on plain records: no DOM, no
 * `react-native`, and no platform behind it to differ. The file exists
 * because the package's `exports` map names a `react-native` condition,
 * and a condition pointing at a missing file is a resolution error rather
 * than a fallback.
 *
 * It stops being a forward when the components land -- `calendar.native.tsx`
 * renders a React Native grid where `calendar.tsx` renders a DOM one, and
 * this file is where that split is declared.
 */
export * from './index.ts'
