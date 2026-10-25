import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { orderingHash } from './ordering.ts'
import { DEFAULT_CSS_FILES, type ProjectThemeOptions } from './project.ts'
import { captureTailwindStylesheet, tailwindPackageDir } from './theme.ts'

/** @internal One read-only stylesheet/theme epoch for either backend.
 * Replacing it must also replace the compiler/session and invalidate their
 * outputs. Watch both imports and discovery paths, including absent entries:
 * creating an earlier conventional entry can change which stylesheet wins.
 * This does not install a watcher or silently fall back on broken project CSS.
 */
export async function loadProjectTailwindSnapshot(
  projectRoot: string,
  options: Pick<ProjectThemeOptions, 'css'> = {},
) {
  const root = path.resolve(projectRoot)
  const paths = (options.css === undefined ? DEFAULT_CSS_FILES : [options.css]).map((name) =>
    path.resolve(root, name),
  )
  let entry: string | undefined
  for (const file of paths) {
    try {
      if (!statSync(file).isFile()) throw new Error(`Stylesheet is not a regular file: ${file}`)
      entry = file
      break
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (options.css === undefined && (code === 'ENOENT' || code === 'ENOTDIR')) continue
      throw error
    }
  }
  const base = entry ? path.dirname(entry) : tailwindPackageDir()
  const file = entry ?? path.join(base, '<entry>')
  const css = entry ? readFileSync(entry, 'utf8') : '@import "tailwindcss";'
  const captured = await captureTailwindStylesheet(css, base, file)
  const watchFiles = Object.freeze(
    [...new Set([...paths, ...captured.stylesheets.map((sheet) => sheet.file)])]
      .filter((dependency) => entry !== undefined || dependency !== file)
      .sort(),
  )
  const fingerprint = orderingHash(
    JSON.stringify({
      schema: 1,
      tailwindVersion: captured.tailwindVersion,
      entry: entry ?? null,
      stylesheets: captured.stylesheets,
    }),
  )
  return Object.freeze({
    ...captured,
    entry: entry ?? null,
    fingerprint,
    watchFiles,
  })
}

export type ProjectTailwindSnapshot = Awaited<ReturnType<typeof loadProjectTailwindSnapshot>>
