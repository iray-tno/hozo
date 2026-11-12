import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { run } from './index.mjs'
import { satisfies } from './range.mjs'

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
const capture = () => {
  const stream = {
    output: '',
    write(value) {
      stream.output += value
    },
  }
  return stream
}

/**
 * A project directory: `package.json` plus installed packages, each given as
 * `'node_modules/<name>': manifest`. Nothing is installed for real; the
 * setup checks read manifests only.
 */
function project(t, manifest, packages = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-square-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest))
  for (const [location, contents] of Object.entries(packages)) {
    const directory = path.join(root, location)
    mkdirSync(directory, { recursive: true })
    const name = location.split('node_modules/').at(-1)
    writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', ...contents }),
    )
  }
  return root
}

async function square(root, ...argv) {
  const io = { stdout: capture(), stderr: capture() }
  const exit = await run(['square', root, '--format', 'json', ...argv], io)
  const report = JSON.parse(io.stdout.output)
  return {
    exit,
    report,
    stderr: io.stderr.output,
    check: (id) => report.setup.find((c) => c.id === id),
  }
}

const codes = (check) => check.findings.map((finding) => finding.code)

test('a project whose setup is in order passes, and says what it checked', async (t) => {
  const root = project(
    t,
    { dependencies: { '@hozo/core': '^0.4.0', 'react-native': '0.88.1', react: '19.2.0' } },
    {
      'node_modules/@hozo/core': {
        version: '0.4.0',
        dependencies: { '@hozo/engine': '0.4.0' },
        peerDependencies: { react: '^19.0.0', 'react-native': '>=0.87' },
        peerDependenciesMeta: { 'react-native': { optional: true } },
      },
      'node_modules/@hozo/engine': { version: '0.4.0' },
      'node_modules/react': { version: '19.2.0' },
      'node_modules/react-native': { version: '0.88.1' },
    },
  )
  const { exit, report } = await square(root)
  assert.equal(exit, 0)
  assert.equal(report.schemaVersion, 1)
  assert.deepEqual(
    report.setup.map(({ id, status, summary }) => [id, status, summary]),
    [
      ['versions', 'passed', '0.4.0 (2 packages)'],
      ['peers', 'passed', '2 installed peers checked'],
    ],
  )
  assert.equal(report.code.status, 'skipped')

  // The text report names each check and the totals.
  const io = { stdout: capture(), stderr: capture() }
  assert.equal(await run(['square', root], io), 0)
  assert.match(io.stdout.output, /^ {2}pass {2}Every @hozo\/\* package is at one version: 0\.4\.0/m)
  assert.match(io.stdout.output, /\n0 errors, 0 warnings\.\n$/)
})

test('versions: a package left behind, a nested copy, and one not installed', async (t) => {
  const root = project(
    t,
    { dependencies: { '@hozo/core': '0.4.0', '@hozo/ui': '0.3.0', '@hozo/vite': '0.4.0' } },
    {
      'node_modules/@hozo/core': { version: '0.4.0' },
      // `ui` brings its own older `core`: two versions in one bundle.
      'node_modules/@hozo/ui': { version: '0.3.0', dependencies: { '@hozo/core': '0.3.0' } },
      'node_modules/@hozo/ui/node_modules/@hozo/core': { version: '0.3.0' },
      // A private workspace package under the scope is not released with them.
      'node_modules/@hozo/example': { version: '0.0.0', private: true },
    },
  )
  const { exit, report, stderr, check } = await square(root)
  assert.equal(exit, 1)
  assert.match(stderr, /^hozo square: 3 setup findings at or above error\.\n$/)
  const versions = check('versions')
  assert.equal(versions.status, 'failed')
  assert.deepEqual(codes(versions), ['not-installed', 'version-mismatch', 'version-mismatch'])
  assert.match(versions.findings[0].message, /^@hozo\/vite is in package\.json but not installed/)
  const nested = versions.findings.find((finding) => finding.package === '@hozo/core')
  assert.match(nested.message, /required by @hozo\/ui/)
  assert.equal(nested.fix, 'Install every @hozo/* package at 0.4.0')
  assert.equal(report.failurePolicy.exitCode, 1)
})

test('peers: out of range, a required one missing, an unreadable range', async (t) => {
  const root = project(
    t,
    { dependencies: { '@hozo/core': '0.4.0', '@hozo/media': '0.4.0' } },
    {
      'node_modules/@hozo/core': {
        version: '0.4.0',
        peerDependencies: { react: '^19.0.0', 'react-native': '>=0.87' },
        peerDependenciesMeta: { 'react-native': { optional: true } },
      },
      'node_modules/@hozo/media': {
        version: '0.4.0',
        peerDependencies: { 'expo-video': '>=58.0.13 <59', 'expo-audio': 'latest' },
        peerDependenciesMeta: {
          'expo-video': { optional: true },
          'expo-audio': { optional: true },
        },
      },
      'node_modules/react-native': { version: '0.86.2' },
      'node_modules/expo-video': { version: '57.0.5' },
      'node_modules/expo-audio': { version: '58.0.11' },
    },
  )
  const { exit, check } = await square(root)
  assert.equal(exit, 1)
  const peers = check('peers')
  assert.deepEqual(codes(peers).sort(), [
    'peer-missing',
    'peer-out-of-range',
    'peer-out-of-range',
    'unreadable-range',
  ])
  const messages = peers.findings.map((finding) => finding.message)
  assert.ok(messages.includes("react-native 0.86.2 is outside @hozo/core's range >=0.87"))
  assert.ok(messages.includes("expo-video 57.0.5 is outside @hozo/media's range >=58.0.13 <59"))
  assert.ok(messages.includes('@hozo/core needs react ^19.0.0, which is not installed'))

  // `--fail-on none` still reports; a warning alone fails only `--fail-on warning`.
  assert.equal((await square(root, '--fail-on', 'none')).exit, 0)
})

test('an optional peer that is absent is not a finding', async (t) => {
  const root = project(
    t,
    { dependencies: { '@hozo/core': '0.4.0' } },
    {
      'node_modules/@hozo/core': {
        version: '0.4.0',
        peerDependencies: { 'react-native': '>=0.87' },
        peerDependenciesMeta: { 'react-native': { optional: true } },
      },
    },
  )
  const { exit, check } = await square(root, '--fail-on', 'warning')
  assert.equal(exit, 0)
  assert.equal(check('peers').summary, '0 installed peers checked')
})

// npm and pnpm link a workspace package into `node_modules`; its real
// directory has its own devDependencies, which a published install would not.
test('a linked workspace package is checked against the project, not its devDependencies', async (t) => {
  const root = project(
    t,
    { dependencies: { '@hozo/media': '0.4.0', 'expo-video': '58.0.13' } },
    {
      'workspace/media': {
        name: '@hozo/media',
        version: '0.4.0',
        peerDependencies: { 'expo-video': '>=58 <59', vite: '^8.0.0' },
        peerDependenciesMeta: { 'expo-video': { optional: true } },
      },
      // The linked package's own devDependencies.
      'workspace/media/node_modules/expo-video': { version: '57.0.5' },
      'workspace/media/node_modules/vite': { version: '8.1.0' },
      'node_modules/expo-video': { version: '58.0.13' },
    },
  )
  try {
    mkdirSync(path.join(root, 'node_modules', '@hozo'), { recursive: true })
    symlinkSync(
      path.join(root, 'workspace', 'media'),
      path.join(root, 'node_modules', '@hozo', 'media'),
      'junction',
    )
  } catch (error) {
    if (error.code === 'EPERM') return t.skip('links unavailable')
    throw error
  }
  const { exit, check } = await square(root)
  // `expo-video` is the project's 58; `vite`, required and reachable only
  // beside the source, comes from there (Astro's case).
  assert.equal(exit, 0, JSON.stringify(check('peers').findings))
  assert.equal(check('peers').summary, '2 installed peers checked')
})

test('a project that cannot be checked exits 2 with a reason', async (t) => {
  const plain = project(t, { dependencies: { react: '19.2.0' } })
  const io = { stdout: capture(), stderr: capture() }
  assert.equal(await run(['square', plain], io), 2)
  assert.match(
    io.stderr.output,
    /has no @hozo\/\* dependency.*run `hozo dry-fit .*\[not-a-hozo-project\]\n$/,
  )

  const empty = mkdtempSync(path.join(tmpdir(), 'hozo-square-empty-'))
  t.after(() => rmSync(empty, { recursive: true, force: true }))
  for (const [argv, code] of [
    [[empty], 'missing-package-json'],
    [[path.join(empty, 'missing')], 'project-not-directory'],
    [[empty, '--fail-on', 'sometimes'], 'invalid-option'],
    [[empty, '--format'], 'missing-value'],
    [[empty, '--verbose'], 'unknown-option'],
    [[empty, empty], 'unexpected-argument'],
  ]) {
    const streams = { stdout: capture(), stderr: capture() }
    assert.equal(await run(['square', ...argv], streams), 2, argv.join(' '))
    assert.match(
      streams.stderr.output,
      new RegExp(`^hozo square: .* \\[${code}\\]\\n$`),
      argv.join(' '),
    )
  }
  const doctor = { stdout: capture(), stderr: capture() }
  assert.equal(await run(['doctor', '--help'], doctor), 0)
  assert.match(doctor.stdout.output, /^Usage: hozo square /)
})

test('square loads no compiler, so a broken install still gets its setup report', async (t) => {
  const root = project(t, { dependencies: { '@hozo/compiler': '0.4.0' } })
  const hook = `data:text/javascript,${encodeURIComponent(
    "import { registerHooks } from 'node:module'; registerHooks({ resolve(s, c, next) { if (/migration-audit|@hozo.(compiler|navigation)/.test(s)) process.stderr.write('loaded ' + s + '\\n'); return next(s, c) } })",
  )}`
  const result = spawnSync(process.execPath, ['--import', hook, cli, 'square', root], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(
    result.stdout,
    /@hozo\/compiler is in package\.json but not installed \[not-installed\]/,
  )
  assert.equal(result.stderr, 'hozo square: 1 setup finding at or above error.\n')
})

test('version ranges: the forms peer dependencies use', () => {
  const cases = [
    ['0.87.1', '>=0.87', true],
    ['0.86.9', '>=0.87', false],
    ['0.87.0-rc.1', '>=0.87', true],
    ['19.2.0', '^19.0.0', true],
    ['20.0.0', '^19.0.0', false],
    ['0.88.0', '^0.87', false],
    ['0.0.4', '^0.0.3', false],
    ['1.2.9', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['58.0.13', '>=57.0.5 <58', false],
    ['57.9.0', '>=57.0.5 <58', true],
    ['4.0.0', '>=4', true],
    ['1.0.0', '*', true],
    ['2.1.0', '1.x || 2', true],
    ['1.3.0', '>1.2', true],
    ['1.2.5', '>1.2', false],
    ['1.2.5', '<=1.2', true],
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '=1.2.3', false],
  ]
  for (const [version, range, expected] of cases)
    assert.equal(satisfies(version, range), expected, `${version} in ${range}`)
  assert.equal(satisfies('1.0.0', 'latest'), undefined)
  assert.equal(satisfies('1.0.0', '1.0.0 - 2.0.0'), undefined)
  assert.equal(satisfies('workspace', '^1'), undefined)
})
