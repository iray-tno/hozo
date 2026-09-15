// The closing section of every published package's README, generated.
//
//   node scripts/package-readmes.mjs          # write
//   node scripts/package-readmes.mjs --check  # verify, exit 1 on drift
//
// A README is what npm shows for a package, and it is baked into each
// published version: a wrong or missing pointer stays on that version's
// page until the next release. Someone who lands on `@hozo/primitives` from
// a search needs to learn two things the package's own text has no reason to
// say -- what Hozo is, and that an application normally installs
// `@hozo/core` -- and eighteen hand-kept copies of that paragraph would be
// eighteen chances to drift. So it is written here once, from the same
// constants `package.json` is generated from, and checked.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PACKAGE_NAMES, REPOSITORY, SITE } from './package-metadata.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const START = '<!-- generated: package-footer -->'
const END = '<!-- /generated: package-footer -->'

const footer = [
  START,
  '',
  '---',
  '',
  `Part of [Hozo](${SITE}), a Rust-powered universal UI compiler and accessibility-first layer ` +
    'for React Native. Most applications install ' +
    '[`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see ' +
    `[Getting started](${REPOSITORY}#getting-started). Source and issues: ` +
    `[github.com/iray-tno/hozo](${REPOSITORY}).`,
  '',
  END,
].join('\n')

/** A README with the footer in place: replaced between markers, else appended. */
export function withFooter(text) {
  const from = text.indexOf(START)
  const to = text.indexOf(END)
  if (from === -1 || to === -1) return `${text.trimEnd()}\n\n${footer}\n`
  return text.slice(0, from) + footer + text.slice(to + END.length)
}

const check = process.argv.includes('--check')
const problems = []
for (const name of PACKAGE_NAMES) {
  const file = path.join(root, 'packages', name, 'README.md')
  if (!existsSync(file)) {
    problems.push(`packages/${name} has no README.md`)
    continue
  }
  const current = readFileSync(file, 'utf8')
  const expected = withFooter(current)
  if (current === expected) continue
  if (check) problems.push(`packages/${name}/README.md footer is out of date`)
  else writeFileSync(file, expected)
}

if (problems.length > 0) {
  console.error('package READMEs drifted -- rerun node scripts/package-readmes.mjs:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(
  `${check ? 'package README footers are current' : 'wrote package README footers'} (${PACKAGE_NAMES.length} packages)`,
)
