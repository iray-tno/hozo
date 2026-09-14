// Native-only: on the Web these conditions are CSS media queries and need
// no script. Importing this installs the shared platform subscriptions,
// which is why `hooks.native.js` is the package's one declared side effect.
export {
  useHozoBreakpoint,
  useHozoDark,
  useHozoEnvironment,
  useHozoViewport,
  useHozoWidthAtLeast,
} from '../hooks.native.ts'
