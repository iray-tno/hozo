// The file walk under project discovery, on tinyglobby and `ignore`.
//
// It was globby, which reaches `braces` through fast-glob and micromatch.
// `braces` has an unpatched High advisory (GHSA-vfj7-8cjw-p6xm), so every
// project that installed @hozo/compiler failed a High audit on Hozo's
// account (#934, #946). tinyglobby (fdir and picomatch, nothing below them)
// is what Vite already depends on, so a Vite project gains nothing new.
//
// The gitignore half is globby 14's own, carried over as it was rather than
// improved, so the files a project contributes do not change with the
// dependency: every `.gitignore` under `cwd` (not inside `node_modules`,
// `flow-typed`, `coverage` or `.git`), each pattern joined to the directory
// its file is in, and the lot handed to `ignore` at once.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ignore from 'ignore'
import { globSync } from 'tinyglobby'

/** Where globby looked for ignore files, so the same ones are found. */
const IGNORE_FILE_EXCLUDES = [
  '**/node_modules/**',
  '**/flow-typed/**',
  '**/coverage/**',
  '**/.git/**',
]

const toPosix = (file: string) => file.split(path.sep).join('/')

/**
 * A pattern from a `.gitignore` in `base` (relative to `cwd`), as globby
 * wrote it: joined to its directory, the negation kept in front.
 */
function withBase(pattern: string, base: string): string {
  return pattern.startsWith('!')
    ? `!${path.posix.join(base, pattern.slice(1))}`
    : path.posix.join(base, pattern)
}

/**
 * A test for whether a path is ignored by the `.gitignore` files at or
 * below `cwd`. `exclude` keeps their search out of the trees the walk itself
 * skips, as globby passed the walk's `ignore` on.
 */
export function gitIgnoredSync(
  cwd: string,
  exclude: readonly string[] = [],
): (file: string) => boolean {
  return ignoredBy(cwd, ignoreFilesBelow(cwd, exclude))
}

/**
 * The same test for the files at or below `root`, when the repository's
 * `.gitignore` chain starts higher, at `gitRoot`.
 *
 * Only the `.gitignore` in `gitRoot` and in each directory down to `root`,
 * and those at or below `root`, can match a path under `root`: every
 * pattern is joined to its own directory, so one in a sibling directory
 * names only paths under that sibling. Reading those alone gives the same
 * answer as `gitIgnoredSync(gitRoot)` for every file under `root`, without
 * walking the whole repository for `.gitignore` files -- in a monorepo
 * that walk crossed every other package and build directory (Rust's
 * `target/`, say), twice per Vite build.
 */
export function inheritedGitIgnoredSync(gitRoot: string, root: string): (file: string) => boolean {
  const top = path.resolve(gitRoot)
  const ancestors: string[] = []
  for (let dir = path.dirname(path.resolve(root)); ; dir = path.dirname(dir)) {
    ancestors.unshift(path.join(dir, '.gitignore'))
    if (dir === top || dir === path.dirname(dir)) break
  }
  return ignoredBy(gitRoot, [
    ...ancestors.filter((file) => existsSync(file)),
    ...ignoreFilesBelow(root, []),
  ])
}

function ignoreFilesBelow(cwd: string, exclude: readonly string[]): string[] {
  return globSync('**/.gitignore', {
    cwd,
    absolute: true,
    dot: true,
    ignore: [...exclude, ...IGNORE_FILE_EXCLUDES],
  })
}

/** Every pattern in `files`, each joined to its file's directory under `cwd`. */
function ignoredBy(cwd: string, files: readonly string[]): (file: string) => boolean {
  const patterns = files.flatMap((file) => {
    const base = toPosix(path.relative(cwd, path.dirname(file)))
    return readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => withBase(line, base))
  })
  const matcher = ignore().add(patterns)
  const root = path.resolve(cwd)
  return (file) => {
    const relative = path.relative(root, path.resolve(root, file))
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false
    return matcher.ignores(toPosix(relative))
  }
}

export interface WalkOptions {
  cwd: string
  ignore?: readonly string[]
  /** Leave out what the `.gitignore` files at or below `cwd` ignore. */
  gitignore?: boolean
}

/**
 * Files matching `patterns` under `cwd`, as absolute paths. Directory
 * symlinks are not followed, so a pnpm link or a temporary checkout cannot
 * turn one project's walk into another's; a bare directory name expands to
 * everything in it, as globby did.
 */
export function walkFiles(patterns: readonly string[], options: WalkOptions): string[] {
  const exclude = options.ignore ?? []
  const files = globSync([...patterns], {
    cwd: options.cwd,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    expandDirectories: true,
    ignore: [...exclude],
  })
  const unique = [...new Set(files.map((file) => path.resolve(file)))]
  if (!options.gitignore) return unique
  const ignored = gitIgnoredSync(options.cwd, exclude)
  return unique.filter((file) => !ignored(file))
}
