// `hozo square`'s copies check (RFC 012 §6, §6.1), against this repository's
// `packages/ui` installed in a temporary project.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runAdd } from './add.mjs'
import { run } from './index.mjs'
import { namedTokens } from './square-copies.mjs'

const ui = fileURLToPath(new URL('../../ui/', import.meta.url))
const version = JSON.parse(readFileSync(path.join(ui, 'package.json'), 'utf8')).version
const VITE = `import { defineConfig } from 'vite'
import { hozo } from '@hozo/vite'

export default defineConfig({ plugins: [hozo({ css: 'src/theme.css' })] })
`
const THEME = '@import "tailwindcss";\n@import "@hozo/ui/theme.css";\n'

function project(t, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-square-copies-'))
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
  write('vite.config.ts', VITE)
  write('src/theme.css', THEME)
  for (const [file, contents] of Object.entries(files)) write(file, contents)
  return root
}

const silent = () => ({ output: '', write() {} })

async function add(root, ...argv) {
  await runAdd(argv, { stdout: silent() }, root)
}

async function square(root) {
  const stdout = {
    output: '',
    write(value) {
      this.output += value
    },
  }
  const exit = await run(['square', root, '--setup', '--format', 'json', '--fail-on', 'warning'], {
    stdout,
    stderr: silent(),
  })
  const check = JSON.parse(stdout.output).setup.find(({ id }) => id === 'copies')
  return { exit, check, codes: check.findings.map((finding) => finding.code) }
}

test('the tokens a class string names: through variants, modifiers and !', () => {
  const tokens = namedTokens(
    "const A = 'px-4 bg-hozo-accent hover:bg-hozo-accent-hover/80 !rounded-hozo-control dark:focus-visible:outline-hozo-focus'\n" +
      'const B = `border-t-hozo-border data-hozo-disabled:opacity-50 text-sm`\n' +
      "// data-hozo-disabled is an attribute, and '@hozo/core' a module\nimport { x } from '@hozo/core'\n",
  )
  assert.deepEqual([...tokens.keys()].sort(), [
    'hozo-accent',
    'hozo-accent-hover',
    'hozo-border',
    'hozo-control',
    'hozo-focus',
  ])
})

test('copies and installed components naming only defined tokens pass', async (t) => {
  const root = project(t, { 'src/app.tsx': "import { Card } from '@hozo/ui'\n" })
  await add(root, 'button', '--write')
  const { check } = await square(root)
  assert.equal(check.status, 'passed')
  assert.deepEqual(check.findings, [])
  // The copy, and card.tsx, which the project imports from @hozo/ui.
  assert.match(
    check.summary,
    /^1 copy in src\/components\/ui; \d+ tokens named in 2 component files, checked against src\/theme\.css$/,
  )
})

test('a copy @hozo/ui has moved on from is information, never a failure', async (t) => {
  const root = project(t)
  await add(root, 'button', '--write')
  const file = path.join(root, 'src/components/ui/button.tsx')
  writeFileSync(file, readFileSync(file, 'utf8').replace(`@hozo/ui@${version} `, '@hozo/ui@0.0.1 '))
  const { exit, check, codes } = await square(root)
  assert.deepEqual(codes, ['copy-upstream-newer'])
  assert.equal(check.findings[0].severity, 'info')
  assert.match(check.findings[0].fix, /hozo add --diff button/)
  assert.equal(check.status, 'passed')
  assert.equal(exit, 0)
})

test('a copy naming a token the theme does not define fails', async (t) => {
  const root = project(t)
  await add(root, 'button', '--write')
  const file = path.join(root, 'src/components/ui/button.tsx')
  writeFileSync(file, readFileSync(file, 'utf8').replace('bg-hozo-accent ', 'bg-hozo-brand '))
  const { exit, check, codes } = await square(root)
  assert.deepEqual(codes, ['theme-token-undefined'])
  assert.equal(check.findings[0].path, 'src/components/ui/button.tsx')
  assert.match(check.findings[0].message, /hozo-brand \(bg-hozo-brand\)/)
  assert.equal(exit, 1)
})

test('an installed component naming a token a copied theme lacks fails too', async (t) => {
  // A theme copied before @hozo/ui added a token one of its components uses.
  const old = readFileSync(path.join(ui, 'src/theme.css'), 'utf8').replace(
    /^\s*--color-hozo-accent:.*$/m,
    '',
  )
  const root = project(t, {
    'src/theme.css': '@import "tailwindcss";\n@import "./hozo-theme.css";\n',
    'src/hozo-theme.css': old,
    'src/app.tsx': "import { Button } from '@hozo/ui'\n",
  })
  const { check, codes } = await square(root)
  assert.deepEqual(codes, ['theme-token-undefined'])
  assert.match(check.findings[0].path, /button\.tsx$/)
  assert.match(check.findings[0].message, /hozo-accent \(/)
})

test('a destination set in both package.json and hozo.json is a finding', async (t) => {
  const root = project(t, { 'hozo.json': JSON.stringify({ components: 'lib/ui' }) })
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ ...manifest, hozo: { components: 'app/ui' } }),
  )
  assert.deepEqual((await square(root)).codes, ['add-config-conflict'])
})
