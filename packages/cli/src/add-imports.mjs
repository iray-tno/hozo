// `hozo add --imports` (RFC 012 §6.1, §8): move what the project imports
// from `@hozo/ui` to its copies, under the write contract. A file it cannot
// edit safely is not edited: the change to make is printed, and the run
// exits 2.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { AddError, posix } from './add.mjs'
import { checkCss } from './square-config.mjs'

const UI_THEME = /@import\s+(?:url\(\s*)?(['"])@hozo\/ui\/theme\.css\1(\s*\))?/g

/** The stylesheet Hozo reads, as `hozo square`'s css check finds it. */
function cssEntry(project) {
  const result = checkCss(project, { names: new Set(['@hozo/ui']) })
  return result.css
}

/**
 * The edit that makes the CSS entry import the copied theme at `copy` (a
 * path relative to the project) instead of `@hozo/ui/theme.css`:
 * `{ file, original, updated }`, or `{ file, same: true }` when it already
 * does. Throws `AddError` with the line to change when it cannot tell.
 */
export function themeImportEdit(project, copy) {
  const entry = cssEntry(project)
  if (!entry)
    throw new AddError(
      `Cannot tell which stylesheet Hozo reads (no single css option or default stylesheet); in it, change @import "@hozo/ui/theme.css" to import ${copy}`,
      'entry-not-found',
    )
  const absolute = path.join(project, entry)
  const original = readFileSync(absolute, 'utf8')
  let specifier = posix(path.relative(path.dirname(absolute), path.join(project, copy)))
  if (!specifier.startsWith('.')) specifier = `./${specifier}`
  const found = [...original.matchAll(UI_THEME)]
  if (found.length === 0) {
    const imports = [...original.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g)]
    if (imports.some(([, target]) => target === specifier)) return { file: entry, same: true }
    throw new AddError(
      `${entry} does not @import "@hozo/ui/theme.css", so there is no line to move; add @import "${specifier}"; after @import "tailwindcss" in it`,
      'entry-not-editable',
    )
  }
  if (found.length > 1)
    throw new AddError(
      `${entry} imports @hozo/ui/theme.css ${found.length} times; change each to @import "${specifier}" by hand`,
      'entry-not-editable',
    )
  const updated = original.replace(
    UI_THEME,
    (_match, quote, close) =>
      `@import ${close ? 'url(' : ''}${quote}${specifier}${quote}${close ?? ''}`,
  )
  return { file: entry, original, updated }
}

/** Whether anything in the project still imports `@hozo/ui`: a source file or the stylesheet. */
export function stillImportsUi(project, sources) {
  for (const file of sources) {
    if (!/\.(?:[cm]?[jt]sx?|css)$/.test(file)) continue
    const absolute = path.join(project, file)
    if (!existsSync(absolute)) continue
    const text = readFileSync(absolute, 'utf8')
    if (/['"]@hozo\/ui(?:\/[^'"]*)?['"]/.test(text)) return file
  }
  return undefined
}
