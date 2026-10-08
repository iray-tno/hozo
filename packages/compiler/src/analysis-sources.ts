import { lstatSync } from 'node:fs'
import path from 'node:path'
import { discoverSources } from './project.ts'

const AUDIT_EXCLUDE = [
  '**/*.d.{ts,mts}',
  '**/.hg/**',
  '**/.svn/**',
  '**/.cache/**',
  '**/.test-build/**',
  '**/artifacts/**',
]

export function sourcePlatform(file: string): 'shared' | 'web' | 'native' {
  if (/\.web\.[^.]+$/.test(file)) return 'web'
  return /\.(?:native|ios|android)\.[^.]+$/.test(file) ? 'native' : 'shared'
}

/** Read-only inventory, sharing the integration walk but not its persistent cache. */
export function discoverAnalysisSources(
  root: string,
  options: { source?: string | string[]; include?: string[]; exclude?: string[] } = {},
) {
  const explicit = options.source !== undefined
  const directories = explicit
    ? typeof options.source === 'string'
      ? [options.source]
      : options.source!
    : ['src', 'app']
  const found: { directory: string; files: string[] }[] = []
  if (!Array.isArray(directories) || directories.length === 0)
    throw new Error('source must name directories')
  const exclude = [...AUDIT_EXCLUDE, ...(options.exclude ?? [])]
  const own = discoverSources(root, { include: options.include, exclude, packages: [] })
  const inside = (file: string) => {
    const relative = path.relative(root, file)
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  }
  for (const directory of directories) {
    const absolute = path.resolve(root, directory)
    if (!inside(absolute)) throw new Error(`Source must stay within checkout: ${directory}`)
    // Explicit roots must not bypass the walk's no-directory-symlinks contract.
    let current = absolute
    let valid = true
    for (;;) {
      try {
        const stat = lstatSync(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) valid = false
      } catch {
        valid = false
      }
      if (current === root) break
      current = path.dirname(current)
    }
    if (!valid) {
      if (explicit)
        throw new Error(`Source is not a real directory: ${directory}; use --source <directory>`)
      continue
    }
    const prefix = path.relative(root, absolute).replaceAll('\\', '/')
    const files = own.filter((file) => file.startsWith(`${absolute}${path.sep}`))
    if (files.length) found.push({ directory: prefix || '.', files })
  }
  if (!explicit && !found.length) {
    found.push({ directory: '.', files: own })
  }
  const files = [...new Set(found.flatMap((entry) => entry.files))].sort()
  if (!files.length)
    throw new Error('No JS/TS source files found; use --source <directory> or --include <glob>')
  // This pool can support imported graph facts without joining the authored
  // denominator. Only graph-requested files are subsequently read/registered.
  const pool = discoverSources(root, { exclude: AUDIT_EXCLUDE })
  const selectedDirectories = found.map(({ directory }) => path.resolve(root, directory))
  const inventory = discoverSources(root, {
    include: options.include,
    exclude: AUDIT_EXCLUDE.filter((glob) => !glob.startsWith('**/*.d.')),
    packages: [],
  })
  const included = new Set(files)
  const excludedFiles = inventory
    .filter(
      (file) =>
        !included.has(file) &&
        selectedDirectories.some((directory) => file.startsWith(`${directory}${path.sep}`)),
    )
    .map((file) => ({
      file,
      reason: /\.d\.(?:ts|mts)$/.test(file) ? 'declaration-only' : 'authored-exclusion',
    }))
  return {
    directories: found.map((entry) => entry.directory),
    files,
    contextCandidates: [...new Set([...files, ...pool])].sort(),
    excludedFiles,
  }
}
