// The Tailwind-facing side of Hozo (proposal §6.2): Tailwind is the
// frontend, the Style IR is the internal representation, and this package
// is the boundary. The utility-to-IR translation lives in Rust; what
// belongs here is the part only a JavaScript package can do -- asking
// Tailwind what the project's theme is.

export { preflightCss } from './preflight.ts'
export {
  DEFAULT_CSS_FILES,
  loadProjectClassOrder,
  loadProjectTheme,
  type ProjectThemeOptions,
} from './project.ts'
export {
  loadClassOrder,
  loadTheme,
  type Theme,
  type ThemeColor,
  tailwindPackageDir,
  toHex,
} from './theme.ts'
