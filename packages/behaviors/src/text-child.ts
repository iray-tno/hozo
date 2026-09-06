// The Web half, which the browser already is.
//
// A string inside a `<div>` is a text node and there is nothing to fix, so
// this returns what it was given. It exists for the same reason
// `disclosure.tsx` and `ruby.tsx` do: a package resolves `@hozo/runtime`'s
// types through the Web entry whichever platform it is building for, so a
// name the native halves import has to be nameable here or `@hozo/core`
// cannot compile.
//
// `.ts` rather than `.tsx`, since there is no JSX in it -- and that
// matters for `@hozo/behaviors`'s own tests, which run through Node's type
// stripping and have no JSX transform.

import type { ReactNode } from 'react'

/** Identity. See above, and `text-child.native.tsx` for the real one. */
export function hozoTextChildren(children: ReactNode): ReactNode {
  return children
}
