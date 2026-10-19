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
  const content = readFileSync(require.resolve('tailwindcss/preflight.css'), 'utf8')
  return `@layer base {\n${resolveThemeCalls(content)}\n}`
}

/**
 * `--theme(--name, fallback)` replaced by its fallback.
 *
 * The file is Tailwind source, not CSS: `--theme()` is a function only
 * Tailwind's compiler evaluates. Shipped as it is, a browser reads the
 * declaration as invalid and drops it, so `html` lost its sans-serif and
 * `code` its monospace, and the page fell back to the browser's serif with
 * no error anywhere (#1089).
 *
 * The fallback is what Tailwind itself writes when the theme does not
 * define the variable. Hozo writes no theme variables to the page -- its
 * `font-sans` is a literal stack -- so nothing would ever define one, and a
 * `var(--default-font-family, ...)` would be the same value with a lookup
 * in front of it.
 */
export function resolveThemeCalls(css: string): string {
  const open = '--theme('
  let out = ''
  let at = 0
  for (let start = css.indexOf(open); start !== -1; start = css.indexOf(open, at)) {
    let depth = 1
    let end = start + open.length
    for (; end < css.length && depth > 0; end++) {
      if (css[end] === '(') depth++
      else if (css[end] === ')') depth--
    }
    if (depth > 0) throw new Error(`unclosed --theme( in tailwindcss/preflight.css`)
    const args = css.slice(start + open.length, end - 1)
    const comma = args.indexOf(',')
    if (comma === -1) {
      throw new Error(`--theme(${args.trim()}) in tailwindcss/preflight.css has no fallback`)
    }
    out +=
      css.slice(at, start) +
      args
        .slice(comma + 1)
        .trim()
        .replace(/\s+/g, ' ')
    at = end
  }
  return out + css.slice(at)
}
