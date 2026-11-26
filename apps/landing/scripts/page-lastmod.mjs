// When each page's source last changed, for the sitemap's `<lastmod>`.
//
// Google reads `<lastmod>` only while it stays accurate, so a date that is
// not the source's own is worse than none: a shallow clone sees every file
// as last changed in its one commit, and a missing git sees nothing. Both
// give back an empty map, and the sitemap then omits `<lastmod>` instead of
// stating a date it cannot back.
//
// One `git log` over every path, read newest first, rather than one process
// per page: the first date a path appears with is its latest.
import { execFileSync } from 'node:child_process'

/**
 * Parse `git log --format=%x00%cI --name-only` output into the latest commit
 * date for each path it names.
 *
 * @param {string} log
 * @returns {Map<string, string>}
 */
export function parseGitLog(log) {
  const latest = new Map()
  for (const entry of log.split('\0')) {
    const [date, ...files] = entry.trim().split('\n')
    if (!date) continue
    for (const file of files) {
      const name = file.trim()
      if (name && !latest.has(name)) latest.set(name, date)
    }
  }
  return latest
}

/**
 * The last commit date (ISO 8601) of each of `files`, keyed by the path as
 * given, relative to `cwd`. Files git has no history for are left out.
 *
 * @param {string[]} files
 * @param {{ cwd?: string, git?: (args: string[]) => string }} [options]
 * @returns {Map<string, string>}
 */
export function lastModified(files, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const git =
    options.git ??
    ((args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
  const dates = new Map()
  if (files.length === 0) return dates
  try {
    if (git(['rev-parse', '--is-shallow-repository']).trim() !== 'false') return dates
    // Paths in the output are relative to the repository root; ask git where
    // that is so they can be matched back to the paths given.
    const prefix = git(['rev-parse', '--show-prefix']).trim()
    const log = parseGitLog(
      git(['log', '--format=%x00%cI', '--name-only', '--no-renames', '--', ...files]),
    )
    for (const file of files) {
      const date = log.get(`${prefix}${file.replace(/\\/g, '/').replace(/^\.\//, '')}`)
      if (date) dates.set(file, date)
    }
  } catch {
    return new Map()
  }
  return dates
}
