// Tailwind v4 emits utilities in terms of its own custom properties
// (`padding: calc(var(--spacing) * 4)`), so comparing against Hozo's
// resolved pixel values means resolving those first. This reads the real
// `theme.css` shipped in the installed tailwindcss package rather than
// hardcoding a copy, so the numbers can't drift from the version under test.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

export function tailwindPackageDir(): string {
  // `tailwindcss` has no main entry that resolves cleanly here, so locate
  // it via a file that definitely exists in the package root.
  return path.dirname(require.resolve('tailwindcss/theme.css'))
}

export function loadThemeVars(): Map<string, string> {
  const css = readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')
  const vars = new Map<string, string>()
  const re = /^\s*(--[a-z0-9-]+):\s*([^;]+);/gim
  let match: RegExpExecArray | null
  while ((match = re.exec(css))) {
    vars.set(match[1], match[2].trim())
  }
  // Hozo's own register, which has no theme file to be read from.
  //
  // `before:` writes `content: var(--hozo-content)` for the same reason
  // Tailwind writes `var(--tw-content)`: a `::before` with no `content`
  // generates no box. Both are declared with `@property` and an initial
  // value of `""`, so both sides resolve to the same declaration -- but
  // Tailwind's default arrives through `registerDefaults`, read out of its
  // output, and there is nothing equivalent to read Hozo's out of.
  vars.set('--hozo-content', '""')
  return vars
}

export function tailwindVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(tailwindPackageDir(), 'package.json'), 'utf8'))
  return pkg.version
}
