// The write contract every `hozo` command that edits files follows (RFC 011
// §3.4): a dry run unless `--write`, and `--write` refuses to overwrite a
// file Git has no copy of, or to write outside Git, unless `--force`. The
// rule `hozo dry-fit --fix` has (`@hozo/migration-audit`'s `fix.mjs`).

import { execFileSync } from 'node:child_process'

/**
 * Of `files` (paths relative to `project`), the ones whose current content
 * Git has no copy of: changed since the last commit, or untracked. `null`
 * when `project` is not in a Git checkout.
 */
export function unrecorded(project, files) {
  try {
    const git = (args) =>
      execFileSync('git', ['--no-optional-locks', '-C', project, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .split('\0')
        .filter(Boolean)
    const changed = git(['status', '--porcelain', '-z', '--', ...files]).map((entry) =>
      entry.slice(3),
    )
    const tracked = new Set(git(['ls-files', '-z', '--', ...files]))
    return new Set([...changed, ...files.filter((file) => !tracked.has(file))])
  } catch {
    return null
  }
}

/**
 * The refusal for overwriting `files`, or `undefined` when they may be
 * overwritten: every one committed, or `force`.
 */
export function overwriteRefusal(project, files, force) {
  if (force || files.length === 0) return undefined
  const dirty = unrecorded(project, files)
  if (dirty === null)
    return '--write needs a Git checkout to confirm the files it overwrites are committed; pass --force to write anyway'
  const blocked = files.filter((file) => dirty.has(file))
  if (blocked.length === 0) return undefined
  return `--write would overwrite work Git has no copy of (uncommitted changes, or an untracked file) in ${blocked.join(', ')}; commit them or pass --force`
}
