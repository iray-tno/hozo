// Checks a pull request title against the convention in AGENTS.md.
//
// Several agents and people open pull requests here, and the title becomes the
// subject line on main. A convention nobody checks drifts within a week, so
// this is the check. The allowed scopes are read from the repository rather
// than listed by hand: a new package is a valid scope the moment its directory
// exists, and a deleted one stops being valid the moment it is gone.
//
//   node scripts/check-pr-title.mjs 'fix(compiler): ...'

import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TYPES = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'test',
  'docs',
  'ci',
  'build',
  'chore',
  'revert',
]

// Scopes that name a concern rather than a directory.
export const CROSS_CUTTING_SCOPES = ['repo', 'ci', 'deps', 'docs', 'release', 'decisions', 'rfcs']

const SCOPE_ROOTS = ['packages', 'apps', 'examples', 'crates']

export function allowedScopes(root) {
  const scopes = new Set(CROSS_CUTTING_SCOPES)
  for (const dir of SCOPE_ROOTS) {
    let entries
    try {
      entries = readdirSync(path.join(root, dir), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      // Crates are referred to without their prefix: `parser`, not `hozo_parser`.
      scopes.add(dir === 'crates' ? entry.name.replace(/^hozo_/, '') : entry.name)
    }
  }
  return scopes
}

const PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[^()]+)\))?(?<breaking>!)?: (?<summary>.+)$/

export const MAX_LENGTH = 100

// Returns a list of problems; an empty list means the title is acceptable.
export function checkTitle(title, scopes) {
  const problems = []
  const trimmed = title.trim()
  const match = PATTERN.exec(trimmed)
  if (!match) {
    return [
      `does not match \`type(scope): summary\` — e.g. \`fix(compiler): keep the class when a spread hides it\``,
    ]
  }
  const { type, scope, summary } = match.groups
  if (!TYPES.includes(type)) {
    problems.push(`unknown type \`${type}\`; use one of: ${TYPES.join(', ')}`)
  }
  if (scope !== undefined) {
    for (const part of scope.split(',').map((s) => s.trim())) {
      if (!scopes.has(part)) {
        problems.push(
          `unknown scope \`${part}\`; use a directory name under ${SCOPE_ROOTS.join('/, ')}/ ` +
            `(crates without \`hozo_\`) or one of: ${CROSS_CUTTING_SCOPES.join(', ')}`,
        )
      }
    }
  }
  if (/\.$/.test(summary)) problems.push('the summary ends with a period')
  if (summary.trim() !== summary || summary.length === 0)
    problems.push('the summary is empty or padded')
  if (trimmed.length > MAX_LENGTH) {
    problems.push(
      `${trimmed.length} characters; keep it to ${MAX_LENGTH} so it survives as a subject line`,
    )
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const title = process.argv[2]
  if (!title) {
    console.error('pass the title as the first argument')
    process.exit(2)
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const problems = checkTitle(title, allowedScopes(root))
  if (problems.length > 0) {
    console.error(`pull request title: ${title}\n`)
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('\nThe convention is in AGENTS.md, under "Pull requests".')
    process.exit(1)
  }
  console.log(`pull request title is conventional: ${title}`)
}
