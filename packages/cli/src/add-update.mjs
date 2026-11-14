// `hozo add --diff <component>` and `hozo add --update <component>` (RFC 012
// §6): what changed upstream since a copy was made, what the project
// changed, and replacing a copy the project has not edited.
//
// An edited copy is never merged. `--update` prints the comparison and exits
// 2, the write contract's answer to a change it cannot make safely; `--force`
// overwrites it.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { AddError, closure, header, origin, posix } from './add.mjs'
import { upstreamAt } from './add-upstream.mjs'
import { unifiedDiff } from './text-diff.mjs'

/**
 * The state variants the look of an interactive component is built around
 * (RFC 012 §8): a copy that drops one loses, say, its focus ring.
 */
const STATE_CLASS = /(?<![\w-])(?:focus-visible|disabled|aria-[\w-]+|data-[\w-]+):[^\s'"`]+/g

function removedStateClasses(from, to) {
  const kept = new Set(to.match(STATE_CLASS) ?? [])
  return [...new Set(from.match(STATE_CLASS) ?? [])].filter((name) => !kept.has(name)).sort()
}

/** Files Git has no copy of: changed since the last commit, or untracked. `null` outside Git. */
function unrecorded(project, files) {
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
 * Each file of the named components' closure, as the installed `@hozo/ui`
 * has it, against the project's copy.
 */
async function compare(project, ui, dest, names, options) {
  const files = []
  for (const name of names)
    for (const file of closure(ui, name).files) if (!files.includes(file)) files.push(file)
  const versions = new Map()
  const at = async (version) => {
    if (!versions.has(version))
      versions.set(version, await upstreamAt(project, ui, version, options))
    return versions.get(version)
  }
  const entries = []
  for (const file of files) {
    const target = posix(path.join(dest, file))
    const absolute = path.join(project, target)
    const installed = readFileSync(path.join(ui.root, 'src', file), 'utf8')
    const entry = { file: target, upstream: `src/${file}`, installed: ui.version }
    entries.push(entry)
    if (!existsSync(absolute)) {
      entry.state = 'not copied'
      entry.text = header(ui.version, file, installed) + installed
      continue
    }
    const current = readFileSync(absolute, 'utf8')
    const recorded = origin(current)
    if (!recorded) {
      entry.state = 'detached'
      continue
    }
    const body = current.slice(current.indexOf('\n') + 1)
    entry.version = recorded.version
    entry.edited = recorded.edited
    entry.newer = recorded.version !== ui.version
    entry.state =
      [entry.edited && 'edited', entry.newer && 'upstream-newer'].filter(Boolean).join(', ') ||
      'current'
    entry.text = header(ui.version, file, installed) + installed
    const old = entry.newer ? await at(recorded.version) : { read: () => installed }
    const original = old.read?.(recorded.file)
    const label = (version) => `@hozo/ui@${version}/${recorded.file}`
    if (original !== undefined) {
      entry.upstreamDiff = unifiedDiff(
        label(recorded.version),
        label(ui.version),
        original,
        installed,
      )
      entry.projectDiff = unifiedDiff(label(recorded.version), target, original, body)
      entry.removed = removedStateClasses(original, body)
    } else {
      // The two-way comparison it can make: the project's file against
      // today's upstream, both sides' changes in one.
      entry.unavailable = old.reason ?? `${recorded.file} is not in @hozo/ui@${recorded.version}`
      entry.projectDiff = unifiedDiff(label(ui.version), target, installed, body)
      entry.removed = removedStateClasses(installed, body)
    }
  }
  return entries
}

function describe(entry) {
  const out = [
    `${entry.file}  ${entry.state}${entry.version ? ` (copied from ${entry.version}, installed ${entry.installed})` : ''}`,
  ]
  const indent = (text) => text.trimEnd().replace(/^/gm, '    ')
  if (entry.unavailable)
    out.push(
      `  @hozo/ui@${entry.version} is not available (${entry.unavailable}); compared with ${entry.installed} instead, so upstream's changes and the project's are in one diff:`,
      indent(entry.projectDiff || '(no difference)'),
    )
  else if (entry.state !== 'not copied' && entry.state !== 'detached') {
    if (entry.newer)
      out.push(
        `  Upstream, ${entry.version} → ${entry.installed}:`,
        indent(entry.upstreamDiff || '(no change to this file)'),
      )
    if (entry.edited) out.push("  The project's edits:", indent(entry.projectDiff))
  }
  if (entry.removed?.length)
    out.push(
      `  Note: the copy no longer has ${entry.removed.join(', ')}. These state classes are part of the component's look (a focus ring, a disabled state); check that removing them was meant.`,
    )
  return out.join('\n')
}

const json = (entries) => entries.map(({ text, ...entry }) => entry)

export async function runDiff(project, ui, dest, names, options, io) {
  const entries = await compare(project, ui, dest, names, options)
  if (options.format === 'json')
    io.stdout.write(
      `${JSON.stringify({ schemaVersion: 1, upstream: { package: '@hozo/ui', version: ui.version }, files: json(entries) }, null, 2)}\n`,
    )
  else io.stdout.write(`${entries.map(describe).join('\n\n')}\n`)
  return { exit: 0 }
}

/**
 * Replace each unedited copy with the installed upstream; create a file the
 * closure gained; leave a detached file alone. An edited copy stops the run
 * with exit 2 unless `--force`.
 */
export async function runUpdate(project, ui, dest, names, options, io) {
  const entries = await compare(project, ui, dest, names, options)
  for (const entry of entries)
    entry.action =
      entry.state === 'not copied'
        ? 'create'
        : entry.state === 'detached' || !entry.newer
          ? 'none'
          : entry.edited && !options.force
            ? 'refuse'
            : 'replace'
  const refused = entries.filter((entry) => entry.action === 'refuse')
  const replaced = entries.filter((entry) => entry.action === 'replace')
  if (options.write && !options.force && refused.length === 0 && replaced.length > 0) {
    const dirty = unrecorded(
      project,
      replaced.map((entry) => entry.file),
    )
    const blocked = dirty === null ? replaced : replaced.filter((entry) => dirty.has(entry.file))
    if (blocked.length > 0)
      throw new AddError(
        dirty === null
          ? '--update --write needs a Git checkout to confirm the copies are committed; pass --force to write anyway'
          : `--write would overwrite work Git has no copy of (uncommitted changes, or an untracked file) in ${blocked.map((entry) => entry.file).join(', ')}; commit them or pass --force`,
        'uncommitted-changes',
      )
  }
  const write = options.write && refused.length === 0
  if (write)
    for (const entry of entries.filter(
      (item) => item.action === 'create' || item.action === 'replace',
    )) {
      const absolute = path.join(project, entry.file)
      mkdirSync(path.dirname(absolute), { recursive: true })
      writeFileSync(absolute, entry.text)
    }

  if (options.format === 'json')
    io.stdout.write(
      `${JSON.stringify({ schemaVersion: 1, upstream: { package: '@hozo/ui', version: ui.version }, written: write, files: json(entries) }, null, 2)}\n`,
    )
  else {
    const verbs = {
      create: write ? 'created' : 'would create',
      replace: write ? 'updated' : 'would update',
      none: 'left as is',
      refuse: 'edited; not updated',
    }
    const lines = entries.map(
      (entry) =>
        `  ${verbs[entry.action].padEnd(20)} ${entry.file}  ${entry.state}${entry.version ? ` (from ${entry.version})` : ''}`,
    )
    lines.unshift(`@hozo/ui@${ui.version} → ${dest}`, '')
    for (const entry of refused) lines.push('', describe(entry))
    if (refused.length > 0)
      lines.push(
        '',
        `Not updated: ${refused.length === 1 ? 'this copy has' : 'these copies have'} the project's edits, and add does not merge them. Bring upstream's changes in by hand, or pass --force to replace ${refused.length === 1 ? 'it' : 'them'} with @hozo/ui@${ui.version}.`,
      )
    else if (
      !options.write &&
      entries.some((entry) => entry.action === 'create' || entry.action === 'replace')
    )
      lines.push('', 'Nothing was written. Run again with --write to apply.')
    io.stdout.write(`${lines.join('\n')}\n`)
  }
  if (refused.length > 0)
    return {
      exit: 2,
      error: {
        message: `${refused.map((entry) => entry.file).join(', ')} ${refused.length === 1 ? 'has' : 'have'} the project's edits; not updated (--force replaces)`,
        code: 'edited-copy',
      },
      reported: true,
    }
  return { exit: 0 }
}
