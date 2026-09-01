// SVG, re-exported from `react-native-svg` under the names it and the
// specification give them.
//
// A separate entry point, and that is the whole point of the file. The
// first version put these at the bottom of `index.native.ts`, with a
// comment claiming a project that never writes `<Svg>` would never reach
// them. That was wrong in the plainest way: `export … from` runs when the
// module is imported, so every native import of `@hozo/runtime` loaded
// `react-native-svg`, and an optional peer dependency that is loaded
// unconditionally is not optional. A project without it would have failed
// on the first component it rendered.
//
// Here, the module is reached only when the compiler emits an import from
// it, which it does only for a file that uses an SVG element.
//
// `Text` arrives as `SvgText`. Generated files already import `Text` from
// `react-native` -- the compiler inserts one around any bare string,
// because a raw string outside a `Text` crashes on that platform -- and
// two bindings of one name in a file neither of them wrote is not a
// collision anyone could be expected to debug.
export {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Svg,
  Text as SvgText,
  Use,
} from 'react-native-svg'
