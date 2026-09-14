// Native-only. A module of its own because it is one: nothing else in the
// environment hooks needs the safe-area provider.
export { type HozoSafeAreaInsets, useHozoSafeArea } from '../safe-area.native.ts'
