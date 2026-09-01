// Tailwind's base layer, read from the installed package rather than kept
// as a copy here.
//
// Hozo compiles Tailwind's utilities and, until this file, shipped nothing
// underneath them. That is not a gap a project notices: every class it
// asked for is present, and what is missing are rules nobody named. The
// symptoms read as component bugs -- images overflowing their container,
// SVGs sitting on the text baseline, links in browser blue -- because
// Tailwind's utilities are authored *against* Preflight. `text-xl` assumes
// `h2` has no size of its own; `w-full` on an `<img>` assumes
// `max-width: 100%` is already there.
//
// This repository's own demo supplied one by hand and it had drifted
// within days: 26 selectors against the real file's 32, and the six
// missing ones were exactly the ones that showed. Hence reading the file.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * The contents of `tailwindcss/preflight.css`.
 *
 * Resolved through this package, which depends on `tailwindcss` already --
 * so an application gets the base layer without declaring Tailwind itself,
 * the same way it gets the theme.
 */
export function preflightCss(): string {
  return readFileSync(require.resolve('tailwindcss/preflight.css'), 'utf8')
}
