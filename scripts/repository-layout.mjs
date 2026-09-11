// The repository layout section of the README, generated rather than written.
//
//   node scripts/repository-layout.mjs          # rewrite the section
//   node scripts/repository-layout.mjs --check  # verify, exit 1 on drift
//
// The list it replaces was missing four packages, an example and two docs
// directories, and every description in it was a hand-written copy of the
// `description` already in that package's `package.json` -- which
// `scripts/package-metadata.mjs` generates and checks. Two copies of one
// sentence, and the one nobody checked was the one in the README.
//
// Everything below is read: the directories from the filesystem, a
// package's line from its `description`, a crate's from the `description`
// in its `Cargo.toml`. Nothing here decides what a thing is for.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const README = path.join(root, 'README.md')
const START = '<!-- generated: repository-layout -->'
const END = '<!-- /generated: repository-layout -->'

/** The manifests that make a directory a member of this repository. */
const MANIFESTS = ['package.json', 'Cargo.toml']

/**
 * The members of a group, which is not the same as the directories in it.
 *
 * A build leaves `dist/` and `node_modules/` behind when a package is
 * renamed or removed, and what is left looks like a member and has nothing
 * to say about itself. `packages/a11y` was one: two output directories and
 * not one tracked file. Skipped rather than failed on, because it is not a
 * missing description -- it is not a package.
 */
const skipped = []
const directories = (group) =>
  readdirSync(path.join(root, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const has = MANIFESTS.some((manifest) => existsSync(path.join(root, group, name, manifest)))
      if (!has) skipped.push(`${group}/${name}`)
      return has
    })
    .sort()

/** A package's own sentence about itself, from the field that publishes it. */
function packageLine(group, name) {
  try {
    const json = JSON.parse(readFileSync(path.join(root, group, name, 'package.json'), 'utf8'))
    return { label: json.name ?? '', description: json.description ?? '' }
  } catch {
    return { label: '', description: '' }
  }
}

/** A crate's, from the field `cargo publish` would use. */
function crateLine(name) {
  try {
    const toml = readFileSync(path.join(root, 'crates', name, 'Cargo.toml'), 'utf8')
    const match = /^description\s*=\s*"(.*)"\s*$/m.exec(toml)
    return { label: '', description: match ? match[1] : '' }
  } catch {
    return { label: '', description: '' }
  }
}

const groups = [
  { dir: 'packages', line: (name) => packageLine('packages', name) },
  { dir: 'crates', line: crateLine },
  { dir: 'apps', line: (name) => packageLine('apps', name) },
  { dir: 'examples', line: (name) => packageLine('examples', name) },
]

const missing = []
const blocks = groups.map(({ dir, line }) => {
  const entries = directories(dir).map((name) => ({ name, ...line(name) }))
  for (const entry of entries) {
    if (!entry.description) missing.push(`${dir}/${entry.name}`)
  }
  // The package name only where it is not just `@hozo/<directory>`. It is
  // the same word twice for most of them, and the ones where it differs --
  // `next-demo` publishing as `@hozo/example-next` -- are the ones worth
  // printing.
  for (const entry of entries) {
    if (entry.label === `@hozo/${entry.name}`) entry.label = ''
  }
  const width = Math.max(...entries.map((entry) => `${entry.name}/`.length))
  const labelWidth = Math.max(...entries.map((entry) => entry.label.length))
  return [
    `${dir}/`,
    ...entries.map((entry) => {
      const slug = `${entry.name}/`.padEnd(width)
      const label = entry.label.padEnd(labelWidth)
      return `  ${slug}  ${label}${label.trim() ? '  — ' : '  '}${entry.description}`.trimEnd()
    }),
  ].join('\n')
})

// `docs/` holds files as well as directories and has no manifest to read
// from, so it is the one part still written here -- named as such rather
// than mixed in with what is derived.
const DOCS = [
  'docs/',
  '  proposal.md      the full design document',
  '  primitives.md    every primitive and what it lowers to, generated',
  '  decisions/       settled questions, with the evidence behind them',
  '  measurements/    what was measured, and against what',
  '  rfcs/            technical specifications and AT verification matrices',
].join('\n')

if (skipped.length > 0) {
  console.log(`not a member of the repository, skipped: ${skipped.join(', ')}`)
}

if (missing.length > 0) {
  console.error(
    'these have no description of their own, so the layout has nothing to print for them:\n',
  )
  for (const entry of missing) console.error(`  - ${entry}`)
  console.error(
    '\nAdd a `description` to the package.json or Cargo.toml. The README used to carry a ' +
      'sentence for each of these, written separately from the one that ships.',
  )
  process.exit(1)
}

const section = [START, '', '```', [...blocks, DOCS].join('\n\n'), '```', '', END].join('\n')

const readme = readFileSync(README, 'utf8')
const from = readme.indexOf(START)
const to = readme.indexOf(END)
if (from === -1 || to === -1) {
  console.error(`README.md has no ${START} / ${END} pair to write between`)
  process.exit(1)
}
const next = readme.slice(0, from) + section + readme.slice(to + END.length)

if (process.argv.includes('--check')) {
  if (readme !== next) {
    console.error(
      'the README repository layout is out of date. Run: node scripts/repository-layout.mjs\n\n' +
        'It is generated from the directories that exist and from what each one says about ' +
        'itself, so a difference means one of those changed and the README did not.',
    )
    process.exit(1)
  }
  console.log('README repository layout is current')
} else {
  writeFileSync(README, next)
  console.log('rewrote the README repository layout')
}
