// `hozo add theme` and `--imports` for the stylesheet (RFC 012 §6.1).

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runAdd } from './add.mjs'
import { run } from './index.mjs'

const ui = fileURLToPath(new URL('../../ui/', import.meta.url))
const version = JSON.parse(readFileSync(path.join(ui, 'package.json'), 'utf8')).version
const THEME = readFileSync(path.join(ui, 'src/theme.css'), 'utf8')
const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const ENTRY =
  '@import "tailwindcss";\n@import "@hozo/ui/theme.css";\n\n@theme { --color-brand: red; }\n'
const VITE = `import { defineConfig } from 'vite'
import { hozo } from '@hozo/vite'

export default defineConfig({ plugins: [hozo({ css: 'src/index.css' })] })
`

function project(t, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-add-theme-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, contents) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), contents)
  }
  const packages = ['@hozo/core', '@hozo/vite', '@hozo/ui']
  write(
    'package.json',
    JSON.stringify({ dependencies: Object.fromEntries(packages.map((name) => [name, version])) }),
  )
  for (const name of ['@hozo/core', '@hozo/vite'])
    write(`node_modules/${name}/package.json`, JSON.stringify({ name, version }))
  symlinkSync(ui, path.join(root, 'node_modules', '@hozo', 'ui'), 'junction')
  const all = { 'vite.config.ts': VITE, 'src/index.css': ENTRY, ...files }
  for (const [file, contents] of Object.entries(all)) if (contents !== null) write(file, contents)
  return root
}

function commit(root) {
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.email=test@example.invalid', '-c', 'user.name=test', '-C', root, ...args],
      { stdio: 'ignore' },
    )
  // As a real project has it: otherwise every Git call walks node_modules,
  // which links to the whole of packages/ui.
  writeFileSync(path.join(root, '.gitignore'), 'node_modules\n')
  git('init', '-q')
  git('add', '-A')
  git('commit', '-q', '-m', 'project')
}

async function add(root, ...argv) {
  const io = {
    stdout: {
      output: '',
      write(value) {
        this.output += value
      },
    },
  }
  const result = await runAdd(argv, io, root)
  return { ...result, output: io.stdout.output }
}

async function square(root) {
  const stdout = {
    output: '',
    write(value) {
      this.output += value
    },
  }
  await run(['square', root, '--setup', '--format', 'json'], { stdout, stderr: stdout })
  return JSON.parse(stdout.output).setup
}

const copyOf = (root) => readFileSync(path.join(root, 'src/components/ui/theme.css'), 'utf8')

test('hozo add theme copies theme.css with its origin as a CSS comment', async (t) => {
  const root = project(t)
  const result = await add(root, 'theme', '--write')
  assert.equal(result.exit, 0)
  assert.equal(
    copyOf(root),
    `/* hozo add: @hozo/ui@${version} src/theme.css sha256:${sha256(THEME)} */\n${THEME}`,
  )
  // Without --imports the stylesheet is left as it was, and that is said.
  assert.equal(readFileSync(path.join(root, 'src/index.css'), 'utf8'), ENTRY)
  assert.match(result.output, /still imports @hozo\/ui\/theme\.css/)
  // The copy is a copy like any other.
  const rows = JSON.parse((await add(root, '--list', '--format', 'json')).output).components
  assert.deepEqual(rows.at(-1), {
    name: 'theme',
    file: 'src/components/ui/theme.css',
    version,
    state: 'current',
  })
})

test('--imports points the stylesheet at the copy, under the write contract', async (t) => {
  const root = project(t, { 'src/app.tsx': "import { Button } from '@hozo/ui'\n" })
  const dry = await add(root, 'theme', '--imports')
  assert.match(dry.output, /Would rewrite src\/index\.css/)
  assert.match(dry.output, /^ {2}-@import "@hozo\/ui\/theme\.css";$/m)
  assert.match(dry.output, /^ {2}\+@import "\.\/components\/ui\/theme\.css";$/m)

  // Outside Git nothing confirms the stylesheet is committed: nothing is written.
  const refused = await add(root, 'theme', '--imports', '--write')
  assert.equal(refused.error.code, 'uncommitted-changes')
  assert.equal(readFileSync(path.join(root, 'src/index.css'), 'utf8'), ENTRY)
  assert.throws(() => copyOf(root))

  commit(root)
  assert.equal((await add(root, 'theme', '--imports', '--write')).exit, 0)
  assert.equal(
    readFileSync(path.join(root, 'src/index.css'), 'utf8'),
    ENTRY.replace('"@hozo/ui/theme.css"', '"./components/ui/theme.css"'),
  )
  const again = await add(root, 'theme', '--imports', '--write')
  assert.match(again.output, /src\/index\.css already imports src\/components\/ui\/theme\.css/)

  // square reads the copied theme: the stylesheet imports a theme, and the
  // Button the project imports names only tokens it defines.
  const setup = await square(root)
  const check = (id) => setup.find((item) => item.id === id)
  assert.deepEqual(
    check('css').findings.map((finding) => finding.code),
    [],
  )
  assert.equal(check('copies').status, 'passed')
})

test('a stylesheet --imports cannot edit safely gets the line to change, and exit 2', async (t) => {
  const none = project(t, { 'src/index.css': '@import "tailwindcss";\n' })
  const missing = await add(none, 'theme', '--imports')
  assert.equal(missing.error.code, 'entry-not-editable')
  assert.match(missing.error.message, /add @import "\.\/components\/ui\/theme\.css";/)

  const twice = project(t, { 'src/index.css': `${ENTRY}@import '@hozo/ui/theme.css';\n` })
  assert.equal((await add(twice, 'theme', '--imports')).error.code, 'entry-not-editable')

  const unknown = project(t, { 'vite.config.ts': null, 'src/index.css': null })
  assert.equal((await add(unknown, 'theme', '--imports')).error.code, 'entry-not-found')

  const components = project(t)
  assert.equal((await add(components, 'button', '--imports')).error.code, 'not-implemented')
})

test('with the theme copied and nothing importing @hozo/ui, add says it can be removed', async (t) => {
  const root = project(t)
  commit(root)
  const report = JSON.parse(
    (await add(root, 'theme', '--imports', '--write', '--format', 'json')).output,
  )
  assert.equal(report.uiRemovable, true)
  assert.equal(report.stylesheet.action, 'rewrite')

  const used = project(t, { 'src/app.tsx': "import { Card } from '@hozo/ui'\n" })
  commit(used)
  const kept = JSON.parse(
    (await add(used, 'theme', '--imports', '--write', '--format', 'json')).output,
  )
  assert.equal(kept.uiRemovable, undefined)
})

test('--diff and --update work on a copied theme', async (t) => {
  const root = project(t)
  const file = path.join(root, 'src/components/ui/theme.css')
  const before = THEME.replace(
    '--color-hozo-accent: var(--color-indigo-600);',
    '--color-hozo-accent: var(--color-indigo-500);',
  )
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(
    file,
    `/* hozo add: @hozo/ui@0.0.1 src/theme.css sha256:${sha256(before)} */\n${before}`,
  )
  const cache = path.join(root, 'node_modules/.hozo/upstream/@hozo/ui@0.0.1/src/theme.css')
  mkdirSync(path.dirname(cache), { recursive: true })
  writeFileSync(cache, before)
  const diff = await add(root, '--diff', 'theme')
  assert.match(diff.output, /^ {4}-.*indigo-500/m)
  assert.match(diff.output, /^ {4}\+.*indigo-600/m)
  assert.equal((await add(root, '--update', 'theme', '--write', '--force')).exit, 0)
  assert.equal(
    copyOf(root),
    `/* hozo add: @hozo/ui@${version} src/theme.css sha256:${sha256(THEME)} */\n${THEME}`,
  )
})
