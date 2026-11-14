import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runAdd } from './add.mjs'
import { run } from './index.mjs'

const ui = fileURLToPath(new URL('../../ui/', import.meta.url))
const version = JSON.parse(readFileSync(path.join(ui, 'package.json'), 'utf8')).version
const upstream = (file) => readFileSync(path.join(ui, 'src', file), 'utf8')
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/**
 * A project with this repository's `@hozo/ui` installed (linked, as a
 * workspace or `npm link` installs it) and the given files.
 */
function project(t, files = {}, dependencies = { '@hozo/ui': version }) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-add-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(path.join(root, 'node_modules', '@hozo'), { recursive: true })
  symlinkSync(ui, path.join(root, 'node_modules', '@hozo', 'ui'), 'junction')
  const all = { 'package.json': JSON.stringify({ name: 'app', dependencies }), ...files }
  for (const [file, contents] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), contents)
  }
  return root
}

// No test reaches the network: a registry is a fetch passed in.
const OFFLINE = {
  fetch: async () => {
    throw new Error('offline')
  },
}

const add = (root, ...argv) => addWith(OFFLINE, root, ...argv)

async function addWith(deps, root, ...argv) {
  const io = {
    stdout: {
      output: '',
      write(value) {
        this.output += value
      },
    },
  }
  const result = await runAdd(argv, io, root, deps)
  return { ...result, output: io.stdout.output }
}

/** Every file under `dir`, relative, with its contents and modification time. */
function snapshot(dir) {
  if (!existsSync(dir)) return {}
  const out = {}
  for (const name of readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, name)
    if (statSync(file).isFile()) out[name] = [readFileSync(file, 'utf8'), statSync(file).mtimeMs]
  }
  return out
}

test('the destination: package.json or hozo.json, never both, else src/components/ui', async (t) => {
  const cases = [
    [{ 'package.json': JSON.stringify({ hozo: { components: 'app/ui' } }) }, 'app/ui'],
    [{ 'hozo.json': JSON.stringify({ components: 'lib/ui' }) }, 'lib/ui'],
    [{ 'src/main.tsx': '' }, 'src/components/ui'],
    [{}, 'components/ui'],
  ]
  for (const [files, dir] of cases) {
    const root = project(t, files)
    // A package.json given here replaces the default one; keep @hozo/ui declared.
    if (files['package.json'])
      writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
          ...JSON.parse(files['package.json']),
          dependencies: { '@hozo/ui': version },
        }),
      )
    const result = await add(root, 'button', '--write', '--format', 'json')
    assert.equal(result.exit, 0, dir)
    assert.equal(JSON.parse(result.output).destination.dir, dir)
    assert.ok(existsSync(path.join(root, dir, 'button.tsx')), dir)
  }

  const both = project(t, { 'hozo.json': JSON.stringify({ components: 'lib/ui' }) })
  writeFileSync(
    path.join(both, 'package.json'),
    JSON.stringify({ hozo: { components: 'app/ui' }, dependencies: { '@hozo/ui': version } }),
  )
  const refused = await add(both, 'button', '--write')
  assert.equal(refused.exit, 2)
  assert.equal(refused.error.code, 'config-conflict')
  assert.deepEqual(snapshot(path.join(both, 'app')), {})
  assert.deepEqual(snapshot(path.join(both, 'lib')), {})
})

test('a dry run writes nothing; --write copies the closure with its origin; a second run changes nothing', async (t) => {
  const root = project(t, { 'src/main.tsx': '' })
  const dest = path.join(root, 'src', 'components', 'ui')

  const dry = await add(root, 'date-time-picker')
  assert.equal(dry.exit, 0)
  assert.match(dry.output, /would create\s+src\/components\/ui\/date-time-picker\.tsx/)
  assert.match(dry.output, /Nothing was written/)
  assert.deepEqual(snapshot(dest), {})

  assert.equal((await add(root, 'date-time-picker', '--write')).exit, 0)
  // The component and the relative files it reaches, and nothing else.
  assert.deepEqual(Object.keys(snapshot(dest)).sort(), [
    'calendar-look.ts',
    'date-time-picker.tsx',
    'time-picker.tsx',
  ])
  for (const file of ['date-time-picker.tsx', 'calendar-look.ts', 'time-picker.tsx']) {
    const copied = readFileSync(path.join(dest, file), 'utf8')
    const body = upstream(file)
    assert.equal(
      copied,
      `// hozo add: @hozo/ui@${version} src/${file} sha256:${sha256(body)}\n${body}`,
    )
  }

  // calendar-look.ts, already copied, is not copied twice.
  const before = snapshot(dest)
  const again = await add(root, 'date-time-picker', 'calendar', '--write')
  assert.equal(again.exit, 0)
  assert.match(again.output, /already copied\s+src\/components\/ui\/calendar-look\.ts/)
  const after = snapshot(dest)
  for (const [file, value] of Object.entries(before)) assert.deepEqual(after[file], value, file)
  assert.ok(after['calendar.tsx'])
})

test('a name that is not a component exits 2 with the nearest names', async (t) => {
  const root = project(t)
  const result = await add(root, 'buton')
  assert.equal(result.exit, 2)
  assert.equal(result.error.code, 'unknown-component')
  assert.match(result.error.message, /did you mean button/)
})

test('a file add did not create is not overwritten without --force', async (t) => {
  const root = project(t, { 'src/components/ui/button.tsx': 'export const mine = 1\n' })
  const refused = await add(root, 'button', '--write')
  assert.equal(refused.exit, 2)
  assert.equal(refused.error.code, 'destination-exists')
  assert.equal(
    readFileSync(path.join(root, 'src/components/ui/button.tsx'), 'utf8'),
    'export const mine = 1\n',
  )
  assert.equal((await add(root, 'button', '--write', '--force')).exit, 0)
  assert.match(
    readFileSync(path.join(root, 'src/components/ui/button.tsx'), 'utf8'),
    /^\/\/ hozo add:/,
  )
})

test('an edited copy is left as it is', async (t) => {
  const root = project(t, { 'src/main.tsx': '' })
  await add(root, 'button', '--write')
  const file = path.join(root, 'src/components/ui/button.tsx')
  const edited = `${readFileSync(file, 'utf8')}\nexport const extra = 1\n`
  writeFileSync(file, edited)
  const result = await add(root, 'button', '--write')
  assert.equal(result.exit, 0)
  assert.match(result.output, /already copied \(edited\); left as is/)
  assert.equal(readFileSync(file, 'utf8'), edited)
})

test('packages the copies import that package.json does not declare, with the install command', async (t) => {
  const root = project(t, { 'pnpm-lock.yaml': '' }, { '@hozo/ui': version, '@hozo/core': version })
  const result = await add(root, 'date-picker', '--format', 'json')
  const report = JSON.parse(result.output)
  assert.deepEqual(report.missingPackages, ['@hozo/form'])
  assert.equal(report.install, 'pnpm add @hozo/form')
})

test('callers importing the component from @hozo/ui are listed with the import from the copy', async (t) => {
  const root = project(t, {
    'src/app.tsx': "import { Button, Card } from '@hozo/ui'\n",
    'src/screens/save.tsx':
      "import { Text } from '@hozo/core'\nimport { Button as B, type ButtonProps } from '@hozo/ui'\n",
    'src/other.tsx': "import { Card } from '@hozo/ui'\n",
  })
  const result = await add(root, 'button', '--format', 'json')
  assert.deepEqual(JSON.parse(result.output).callers, [
    {
      file: 'src/app.tsx',
      line: 1,
      names: ['Button'],
      imports: ["import { HozoButton as Button } from './components/ui/button'"],
    },
    {
      file: 'src/screens/save.tsx',
      line: 2,
      names: ['Button', 'ButtonProps'],
      imports: [
        "import { HozoButton as B, type HozoButtonProps as ButtonProps } from '../components/ui/button'",
      ],
    },
  ])
})

test('--list gives each component and the state of each copy', async (t) => {
  const root = project(t, { 'src/main.tsx': '' })
  await add(root, 'button', 'card', 'status', '--write')
  const dest = path.join(root, 'src/components/ui')
  writeFileSync(
    path.join(dest, 'card.tsx'),
    `${readFileSync(path.join(dest, 'card.tsx'), 'utf8')}// mine\n`,
  )
  // Copied from an older @hozo/ui.
  const status = path.join(dest, 'status.tsx')
  writeFileSync(
    status,
    readFileSync(status, 'utf8').replace(`@hozo/ui@${version} `, '@hozo/ui@0.0.1 '),
  )
  const rows = JSON.parse((await add(root, '--list', '--format', 'json')).output).components
  const state = (name) => rows.find((row) => row.name === name)
  assert.deepEqual(state('button'), {
    name: 'button',
    file: 'src/components/ui/button.tsx',
    version,
    state: 'current',
  })
  assert.equal(state('card').state, 'edited')
  assert.equal(state('status').state, 'upstream-newer')
  assert.equal(state('dialog').state, 'not copied')
  // Every component, and only components.
  assert.ok(!rows.some((row) => row.name === 'calendar-look' || row.name === 'index'))
})

test("a component's own name finds the file it is in", async (t) => {
  const root = project(t, { 'src/main.tsx': '' })
  const report = JSON.parse((await add(root, 'badge', 'Checkbox', '--format', 'json')).output)
  assert.deepEqual(
    report.files.map((entry) => entry.upstream),
    ['src/status.tsx', 'src/toggle.tsx'],
  )
})

test('hozo add routes, and its errors are reported like every command', async () => {
  // Routing and argument errors come before the project is read.
  const io = () => {
    const stream = () => ({
      output: '',
      write(value) {
        this.output += value
      },
    })
    return { stdout: stream(), stderr: stream() }
  }
  const help = io()
  assert.equal(await run(['add', '--help'], help), 0)
  assert.match(help.stdout.output, /^Usage: hozo add/)
  const missing = io()
  assert.equal(await run(['add'], missing), 2)
  assert.match(missing.stderr.output, /^hozo add: .* \[missing-argument\]\n$/)
})
