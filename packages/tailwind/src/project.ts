import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { loadClassOrder, loadTheme, type Theme, tailwindPackageDir } from './theme.ts'

export const DEFAULT_CSS_FILES = [
  'global.css',
  'src/global.css',
  'app/global.css',
  'src/index.css',
  'src/styles.css',
  'src/app.css',
  'app/globals.css',
] as const

export interface ProjectThemeOptions {
  /** Tailwind entry stylesheet, relative to the project root. */
  css?: string
  /** Receives actionable theme discovery and parsing diagnostics. */
  warn?: (message: string) => void
}

const cache = new Map<string, Promise<Theme | undefined>>()

/** Finds and loads one project's Tailwind theme consistently in every bundler. */
export function loadProjectTheme(
  projectRoot: string,
  options: ProjectThemeOptions = {},
): Promise<Theme | undefined> {
  const root = path.resolve(projectRoot)
  const key = `${root}\u0000${options.css ?? ''}`
  let pending = cache.get(key)
  if (!pending) {
    pending = load(root, options.css, options.warn)
    cache.set(key, pending)
  }
  return pending
}

/**
 * One project's candidates, in the order Tailwind would write them.
 *
 * Found the same way the theme is, and for the same reason: a project's
 * `@theme` can add breakpoints, so the order is a fact about the project
 * and not about Tailwind alone. Falls back to Tailwind's own stylesheet
 * when the project has none, which is what the utilities are resolved
 * against in that case too.
 */
export async function loadProjectClassOrder(
  projectRoot: string,
  candidates: readonly string[],
  options: ProjectThemeOptions = {},
): Promise<string[]> {
  if (candidates.length === 0) return []
  const root = path.resolve(projectRoot)
  const names = options.css ? [options.css] : DEFAULT_CSS_FILES
  for (const relative of names) {
    const file = path.resolve(root, relative)
    if (!existsSync(file)) continue
    try {
      return await loadClassOrder(readFileSync(file, 'utf8'), path.dirname(file), candidates)
    } catch {
      // Reported already by `loadProjectTheme`, which reads the same file
      // and runs first. Falling through to the defaults keeps one warning
      // per broken stylesheet rather than two.
      break
    }
  }
  const dir = tailwindPackageDir()
  return loadClassOrder('@import "tailwindcss";', dir, candidates)
}

async function load(
  projectRoot: string,
  configured: string | undefined,
  warn: ((message: string) => void) | undefined,
): Promise<Theme | undefined> {
  const candidates = configured ? [configured] : DEFAULT_CSS_FILES
  for (const relative of candidates) {
    const file = path.resolve(projectRoot, relative)
    if (!existsSync(file)) continue
    try {
      return await loadTheme(readFileSync(file, 'utf8'), path.dirname(file))
    } catch (error) {
      warn?.(
        `[hozo] couldn't read the theme from ${relative}, so utilities resolve against ` +
          `Tailwind's defaults: ${(error as Error).message}`,
      )
      return undefined
    }
  }
  if (configured) {
    warn?.(
      `[hozo] no stylesheet at ${configured}, so utilities resolve against Tailwind's defaults`,
    )
  }
  return undefined
}
