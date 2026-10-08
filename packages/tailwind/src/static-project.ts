import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_CSS_FILES } from './project.ts'
import { ExecutableStylesheetError } from './static-css.ts'
import { loadTheme, type Theme } from './theme.ts'

type Fact<T> =
  | { status: 'resolved'; value: T; origin: 'explicit' | 'discovered' }
  | { status: 'absent'; reason: string }
  | { status: 'unresolved' | 'unsupported' | 'invalid'; reason: string }

export interface StaticProjectTheme {
  css: Fact<string>
  theme: Fact<Theme>
  stylesheets: { file: string; sha256: string }[]
}

/** Shared discovery/resolution, but without build-time fallback or persistent caches. */
export async function loadStaticProjectTheme(
  root: string,
  css?: string,
): Promise<StaticProjectTheme> {
  root = path.resolve(root)
  const result: StaticProjectTheme = {
    css: { status: 'absent', reason: 'No conventional CSS entry found.' },
    theme: { status: 'absent', reason: 'No conventional CSS entry found.' },
    stylesheets: [],
  }
  for (const name of css === undefined ? DEFAULT_CSS_FILES : [css]) {
    const file = path.resolve(root, name)
    try {
      if (!statSync(file).isFile()) throw new Error('Stylesheet is not a regular file')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (css === undefined && (code === 'ENOENT' || code === 'ENOTDIR')) continue
      const fact = { status: 'invalid' as const, reason: `${file}: ${(error as Error).message}` }
      return { ...result, css: fact, theme: fact }
    }
    result.css = {
      status: 'resolved',
      value: file,
      origin: css === undefined ? 'discovered' : 'explicit',
    }
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch (error) {
      const fact = { status: 'invalid' as const, reason: `${file}: ${(error as Error).message}` }
      return { ...result, css: fact, theme: fact }
    }
    const seen = new Map<string, string>()
    try {
      // Record even an entry whose safety check fails; no partial theme is used.
      seen.set(file, createHash('sha256').update(content).digest('hex'))
      const theme = await loadTheme(content, path.dirname(file), {
        staticOnly: true,
        file,
        onStylesheet: (file, content) => {
          seen.set(file, createHash('sha256').update(content).digest('hex'))
        },
      })
      result.theme = { status: 'resolved', value: theme, origin: result.css.origin }
    } catch (error) {
      result.theme = {
        status: error instanceof ExecutableStylesheetError ? 'unsupported' : 'invalid',
        reason: (error as Error).message,
      }
    }
    result.stylesheets = [...seen].map(([file, sha256]) => ({ file, sha256 }))
    return result
  }
  return result
}
