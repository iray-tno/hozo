// `--fix`: write the Web build's own react-native import move back to source.
//
// The build already moves `Platform`, `Keyboard` and the other runtime APIs
// Hozo owns from `react-native` to `@hozo/rn-compat`, invisibly and on the
// Web only. This makes that move visible in the source, using the compiler's
// own pass (`reactNativeImportFix`) rather than a second table, so the diff
// shown here and the audit's import decisions cannot disagree (#1053).
//
// Dry run unless `--write`: a codemod that edits on first use teaches people
// not to run it. `--write` refuses to touch a file with uncommitted changes,
// because then the only record of what the file was is the codemod's memory.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { reactNativeImportFix, sourcePlatform } from '@hozo/compiler/analysis'

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function lineAt(text, offset) {
  let line = 1
  for (let index = text.indexOf('\n'); index !== -1 && index < offset; ) {
    line += 1
    index = text.indexOf('\n', index + 1)
  }
  return line
}

function lines(block) {
  const parts = block.split('\n')
  if (parts.at(-1) === '') parts.pop()
  return parts
}

/**
 * A unified diff with no context lines, one hunk per moved declaration.
 * No context because two moved declarations are often adjacent, and
 * overlapping context would make hunks that no tool applies; `git apply
 * --unidiff-zero` takes this as written.
 */
export function unifiedDiff(file, original, edits) {
  const hunks = []
  let shift = 0
  for (const edit of [...edits].sort((a, b) => a.spanStart - b.spanStart)) {
    const start = original.lastIndexOf('\n', edit.spanStart - 1) + 1
    const newline = original.indexOf('\n', edit.spanEnd)
    const end = newline === -1 ? original.length : newline + 1
    const before = lines(original.slice(start, end))
    const after = lines(
      original.slice(start, edit.spanStart) + edit.replacement + original.slice(edit.spanEnd, end),
    )
    const oldStart = lineAt(original, start)
    hunks.push(
      `@@ -${oldStart},${before.length} +${oldStart + shift},${after.length} @@`,
      ...before.map((line) => `-${line}`),
      ...after.map((line) => `+${line}`),
    )
    shift += after.length - before.length
  }
  return [`--- a/${file}`, `+++ b/${file}`, ...hunks].join('\n')
}

/**
 * The build's edits, fitted to a file someone will read. The build ends each
 * replacement with a newline and leaves the one after the declaration, which
 * costs nothing in a bundle and leaves a stray blank line in source; and it
 * writes `\n` whatever the file uses. Whitespace only: the imports are the
 * compiler's.
 */
export function sourceEdits(original, edits) {
  const crlf = original.includes('\r\n')
  return edits.map((edit) => {
    let replacement = edit.replacement
    if (replacement.endsWith('\n') && /^\r?\n/.test(original.slice(edit.spanEnd)))
      replacement = replacement.slice(0, -1)
    if (crlf) replacement = replacement.replace(/\r?\n/g, '\r\n')
    return { spanStart: edit.spanStart, spanEnd: edit.spanEnd, replacement }
  })
}

function applyEdits(original, edits) {
  let code = original
  for (const edit of [...edits].sort((a, b) => b.spanStart - a.spanStart))
    code = code.slice(0, edit.spanStart) + edit.replacement + code.slice(edit.spanEnd)
  return code
}

/** What `--fix` would do to each selected file, without writing anything. */
export function planImportFix(root, files) {
  return files.map((absolute) => {
    const file = relative(root, absolute)
    // The build moves imports for the Web only, and a Native-only file never
    // reaches it. Moving them there would be a change the build never made.
    if (sourcePlatform(absolute) === 'native') return { file, absolute, status: 'native-only' }
    const original = readFileSync(absolute, 'utf8')
    try {
      const fix = reactNativeImportFix(original, absolute)
      if (fix.code === original) return { file, absolute, status: 'unchanged' }
      const edits = sourceEdits(original, fix.edits)
      const moved = fix.decisions
        .filter((decision) => decision.disposition === 'rewritten-to-hozo')
        .map((decision) => decision.imported)
      return {
        file,
        absolute,
        status: 'changed',
        original,
        code: applyEdits(original, edits),
        edits,
        moved,
      }
    } catch (error) {
      return { file, absolute, status: 'failed', reason: error.message.split('\n')[0] }
    }
  })
}

function dirtyFiles(root, files) {
  try {
    const output = execFileSync(
      'git',
      [
        '--no-optional-locks',
        '-c',
        'core.fsmonitor=false',
        '-C',
        root,
        'status',
        '--porcelain',
        '-z',
        '--',
        ...files,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return new Set(
      output
        .split('\0')
        .filter(Boolean)
        .map((entry) => entry.slice(3)),
    )
  } catch {
    return null
  }
}

function declaresRnCompat(root) {
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    return ['dependencies', 'devDependencies', 'peerDependencies'].some(
      (field) => manifest[field]?.['@hozo/rn-compat'],
    )
  } catch {
    return false
  }
}

export class FixRefusedError extends Error {}

/**
 * Prints the plan as a diff and a summary, and with `write` applies it.
 * Returns the plan, with `written` set on each file that was written.
 */
export function runImportFix(root, files, { write = false, force = false, stdout }) {
  const plan = planImportFix(root, files)
  const changed = plan.filter((entry) => entry.status === 'changed')
  if (write && !force && changed.length > 0) {
    const dirty = dirtyFiles(
      root,
      changed.map((entry) => entry.file),
    )
    if (dirty === null)
      throw new FixRefusedError(
        '--write needs a Git checkout to confirm the files are committed; pass --force to write anyway',
      )
    const blocked = changed.filter((entry) => dirty.has(entry.file))
    if (blocked.length > 0)
      throw new FixRefusedError(
        `--write would overwrite uncommitted changes in ${blocked.map((entry) => entry.file).join(', ')}; commit them or pass --force`,
      )
  }
  for (const entry of changed) {
    stdout.write(`${unifiedDiff(entry.file, entry.original, entry.edits)}\n`)
    if (write) {
      writeFileSync(entry.absolute, entry.code)
      entry.written = true
    }
  }
  const count = (status) => plan.filter((entry) => entry.status === status).length
  const summary = [
    '',
    `${write ? 'Wrote' : 'Would change'} ${changed.length} of ${plan.length} files: React Native APIs Hozo owns move to @hozo/rn-compat.`,
    `Unchanged: ${count('unchanged')}. Native-only, left as is: ${count('native-only')}.`,
  ]
  for (const entry of plan.filter((item) => item.status === 'failed'))
    summary.push(`Not parsed, left as is: ${entry.file}: ${entry.reason}`)
  if (changed.length > 0 && !declaresRnCompat(root))
    summary.push(
      "Add @hozo/rn-compat to the application's dependencies; the moved imports need it.",
    )
  if (changed.length > 0 && !write)
    summary.push('Nothing was written. Run again with --write to apply.')
  summary.push(
    "Components (Pressable, TextInput, View, ...) are not moved: on Native, @hozo/core has its own components rather than React Native's.",
  )
  stdout.write(`${summary.join('\n')}\n`)
  return plan
}
