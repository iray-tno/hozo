// `hozo add --diff` and `--update` (RFC 012 §6), against this repository's
// `packages/ui` as the installed version and a made-up older one.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { runAdd } from './add.mjs'
import { untarSources } from './add-upstream.mjs'
import { run } from './index.mjs'

const ui = fileURLToPath(new URL('../../ui/', import.meta.url))
const version = JSON.parse(readFileSync(path.join(ui, 'package.json'), 'utf8')).version
const upstream = (file) => readFileSync(path.join(ui, 'src', file), 'utf8')
const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const OLD = '0.0.1'

// The installed button.tsx, as an older release had it: one class different.
const INSTALLED = upstream('button.tsx')
const BEFORE = INSTALLED.replace('px-4 py-3 text-sm', 'px-4 py-2 text-sm')
assert.notEqual(BEFORE, INSTALLED, 'the fixture changes a line of button.tsx')

const OFFLINE = {
  fetch: async () => {
    throw new Error('offline')
  },
}

function project(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-add-update-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(path.join(root, 'node_modules', '@hozo'), { recursive: true })
  symlinkSync(ui, path.join(root, 'node_modules', '@hozo', 'ui'), 'junction')
  mkdirSync(path.join(root, 'src'))
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'app', dependencies: { '@hozo/ui': version } }),
  )
  return root
}

/** A copy of button.tsx made from the older release, optionally edited since. */
function oldCopy(root, edit = (text) => text) {
  const file = path.join(root, 'src/components/ui/button.tsx')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(
    file,
    `// hozo add: @hozo/ui@${OLD} src/button.tsx sha256:${sha256(BEFORE)}\n${edit(BEFORE)}`,
  )
  return file
}

/** The older release in the project's upstream cache, as a fetch once left it. */
function cache(root, files = { 'src/button.tsx': BEFORE }) {
  for (const [file, text] of Object.entries(files)) {
    const absolute = path.join(root, 'node_modules/.hozo/upstream', `@hozo/ui@${OLD}`, file)
    mkdirSync(path.dirname(absolute), { recursive: true })
    writeFileSync(absolute, text)
  }
}

/** A gzipped tarball with `files` under `package/`, as npm packs one. */
function tarball(files) {
  const blocks = []
  for (const [name, text] of Object.entries(files)) {
    const body = Buffer.from(text)
    const header = Buffer.alloc(512)
    header.write(`package/${name}`, 0)
    header.write('0000644\0', 100)
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('0', 156)
    header.write('ustar\0', 257)
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

/** A registry holding the older release; records what was asked of it. */
function registry(files) {
  const asked = []
  return {
    asked,
    fetch: async (url) => {
      asked.push(url)
      if (url.endsWith(`@hozo%2fui/${OLD}`))
        return Response.json({ dist: { tarball: 'https://registry.test/ui.tgz' } })
      if (url === 'https://registry.test/ui.tgz') return new Response(tarball(files))
      return new Response('', { status: 404 })
    },
    registry: 'https://registry.test/',
  }
}

async function add(root, deps, ...argv) {
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

function git(root, ...args) {
  execFileSync(
    'git',
    ['-c', 'user.email=test@example.invalid', '-c', 'user.name=test', '-C', root, ...args],
    { stdio: 'ignore' },
  )
}

test('the tarball reader takes package/src from a tarball', () => {
  const files = untarSources(
    tarball({ 'src/button.tsx': 'a\n', 'package.json': '{}', 'src/deep/x.ts': 'b\n' }),
  )
  assert.deepEqual(Object.fromEntries(files), { 'src/button.tsx': 'a\n', 'src/deep/x.ts': 'b\n' })
})

test("--diff: upstream's change since the copy, from the cache", async (t) => {
  const root = project(t)
  oldCopy(root)
  cache(root)
  const result = await add(root, OFFLINE, '--diff', 'button')
  assert.equal(result.exit, 0)
  assert.match(
    result.output,
    new RegExp(`button\\.tsx  upstream-newer \\(copied from ${OLD}, installed ${version}\\)`),
  )
  assert.match(result.output, /^ {4}-.*px-4 py-2 text-sm/m)
  assert.match(result.output, /^ {4}\+.*px-4 py-3 text-sm/m)
  assert.doesNotMatch(result.output, /The project's edits/)
})

test('--diff: an edited copy shows both sides, with the old release fetched once', async (t) => {
  const root = project(t)
  oldCopy(root, (text) => text.replace('font-semibold', 'font-bold'))
  const remote = registry({ 'src/button.tsx': BEFORE })
  const report = JSON.parse(
    (await add(root, remote, '--diff', 'button', '--format', 'json')).output,
  )
  const [entry] = report.files
  assert.equal(entry.state, 'edited, upstream-newer')
  assert.match(entry.upstreamDiff, /^\+.*px-4 py-3 text-sm/m)
  assert.match(entry.projectDiff, /^-.*font-semibold/m)
  assert.match(entry.projectDiff, /^\+.*font-bold/m)
  assert.doesNotMatch(entry.projectDiff, /py-3/, "the project's diff holds only the project's edit")
  assert.equal(remote.asked.length, 2)

  // Kept: the next run asks nothing.
  await add(root, OFFLINE, '--diff', 'button')
  assert.ok(
    existsSync(path.join(root, 'node_modules/.hozo/upstream', `@hozo/ui@${OLD}`, 'src/button.tsx')),
  )
})

test('--diff: without the old release, the two-way comparison, and why', async (t) => {
  const root = project(t)
  oldCopy(root)
  const [entry] = JSON.parse(
    (await add(root, OFFLINE, '--diff', 'button', '--format', 'json')).output,
  ).files
  assert.equal(entry.unavailable, 'offline')
  assert.match(entry.projectDiff, /^-.*px-4 py-3/m)
  assert.match(entry.projectDiff, /^\+.*px-4 py-2/m)
})

test('--diff: a copy that dropped a state class says so', async (t) => {
  const root = project(t)
  await add(root, OFFLINE, 'button', '--write')
  const file = path.join(root, 'src/components/ui/button.tsx')
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll(' focus-visible:outline-2', ''))
  const [entry] = JSON.parse(
    (await add(root, OFFLINE, '--diff', 'button', '--format', 'json')).output,
  ).files
  assert.equal(entry.state, 'edited')
  assert.deepEqual(entry.removed, ['focus-visible:outline-2'])
})

test('--update: an unedited copy is replaced, under the write contract', async (t) => {
  const root = project(t)
  const file = oldCopy(root)
  cache(root)
  const dry = await add(root, OFFLINE, '--update', 'button')
  assert.equal(dry.exit, 0)
  assert.match(dry.output, /would update\s+src\/components\/ui\/button\.tsx/)
  assert.match(readFileSync(file, 'utf8'), new RegExp(`@hozo/ui@${OLD} `))

  // Outside Git, nothing confirms the copy is committed.
  const refused = await add(root, OFFLINE, '--update', 'button', '--write')
  assert.equal(refused.exit, 2)
  assert.equal(refused.error.code, 'uncommitted-changes')

  git(root, 'init', '-q')
  git(root, 'add', 'src')
  git(root, 'commit', '-q', '-m', 'copy')
  assert.equal((await add(root, OFFLINE, '--update', 'button', '--write')).exit, 0)
  assert.equal(
    readFileSync(file, 'utf8'),
    `// hozo add: @hozo/ui@${version} src/button.tsx sha256:${sha256(INSTALLED)}\n${INSTALLED}`,
  )
  // A second run changes nothing.
  const again = await add(root, OFFLINE, '--update', 'button', '--write')
  assert.match(again.output, /left as is\s+src\/components\/ui\/button\.tsx {2}current/)
})

test('--update: an edited copy is shown, not merged, and exits 2; --force replaces it', async (t) => {
  const root = project(t)
  const file = oldCopy(root, (text) => `${text}export const mine = 1\n`)
  cache(root)
  const edited = readFileSync(file, 'utf8')
  const refused = await add(root, OFFLINE, '--update', 'button', '--write')
  assert.equal(refused.exit, 2)
  assert.equal(refused.error.code, 'edited-copy')
  assert.match(refused.output, /\+export const mine = 1/)
  assert.match(refused.output, /Not updated/)
  assert.equal(readFileSync(file, 'utf8'), edited)

  assert.equal((await add(root, OFFLINE, '--update', 'button', '--write', '--force')).exit, 0)
  assert.doesNotMatch(readFileSync(file, 'utf8'), /mine/)
})

test('--update: a file the closure gained is created; a detached one is left alone', async (t) => {
  const root = project(t)
  await add(root, OFFLINE, 'date-picker', '--write')
  const dir = path.join(root, 'src/components/ui')
  unlinkSync(path.join(dir, 'calendar-look.ts'))
  writeFileSync(path.join(dir, 'date-picker.tsx'), 'export const detached = 1\n')
  const result = await add(root, OFFLINE, '--update', 'date-picker', '--write', '--force')
  assert.equal(result.exit, 0)
  assert.match(result.output, /created\s+src\/components\/ui\/calendar-look\.ts/)
  assert.match(result.output, /left as is\s+src\/components\/ui\/date-picker\.tsx {2}detached/)
  assert.equal(
    readFileSync(path.join(dir, 'date-picker.tsx'), 'utf8'),
    'export const detached = 1\n',
  )
})

test('hozo add --update reports a refusal once on stdout, and the reason on stderr', async (t) => {
  const root = project(t)
  oldCopy(root, (text) => `${text}// mine\n`)
  cache(root)
  const stream = () => ({
    output: '',
    write(value) {
      this.output += value
    },
  })
  const io = { stdout: stream(), stderr: stream() }
  const cwd = process.cwd()
  process.chdir(root)
  try {
    assert.equal(await run(['add', '--update', 'button', '--format', 'json'], io), 2)
  } finally {
    process.chdir(cwd)
  }
  // One JSON document: the report, not the report and an error object.
  assert.equal(JSON.parse(io.stdout.output).files[0].state, 'edited, upstream-newer')
  assert.match(io.stderr.output, /^hozo add: .* \[edited-copy\]\n$/)
})
