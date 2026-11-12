import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runCli } from '@hozo/migration-audit'
import { run } from './index.mjs'

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
const capture = (isTTY = false) => {
  const stream = {
    isTTY,
    output: '',
    write(value) {
      stream.output += value
    },
  }
  return stream
}
const io = () => ({ stdout: capture(), stderr: capture() })

function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-cli-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [file, source] of Object.entries(files)) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, source)
  }
  return root
}

// Stage timings are measured, so two runs differ there and nowhere else.
const withoutTimings = (json) =>
  JSON.stringify(JSON.parse(json), (key, value) => (/durationms$/i.test(key) ? 0 : value))

test('`dry-fit` and its alias write what the deprecated binary writes', async (t) => {
  const root = fixture(t, {
    'src/App.tsx': "import { View } from 'react-native'\nexport const App = () => <View />\n",
  })
  const old = capture()
  await runCli([root, '--format', 'json'], { stdout: old })
  for (const command of ['dry-fit', 'migration-audit']) {
    const streams = io()
    assert.equal(await run([command, root, '--format', 'json'], streams), 0)
    assert.equal(withoutTimings(streams.stdout.output), withoutTimings(old.output), command)
    assert.equal(streams.stderr.output, '')
  }
  const markdown = [capture(true), io()]
  markdown[1].stdout.isTTY = true
  await runCli([root], { stdout: markdown[0] })
  await run(['dry-fit', root], markdown[1])
  const timings = (text) => text.replace(/\d+(?:\.\d+)? ?ms/g, '?ms')
  assert.equal(timings(markdown[1].stdout.output), timings(markdown[0].output))
})

test('exit codes: 1 is findings, 2 is a command that could not run', async (t) => {
  const root = fixture(t, { 'src/App.tsx': 'export const value = ;' })
  const findings = io()
  assert.equal(await run(['dry-fit', root, '--fail-on', 'error', '--format', 'json'], findings), 1)
  assert.match(findings.stderr.output, /^hozo dry-fit: .*current error/)

  for (const [argv, code] of [
    [['dry-fit'], 'missing-checkout'],
    [['dry-fit', root, '--unknown', 'x'], 'unknown-option'],
    [['dry-fit', path.join(root, 'missing')], 'checkout-not-directory'],
    [['squre'], 'unknown-command'],
    [['--verbose'], 'unknown-option'],
    [['init'], 'reserved-command'],
    [['add', 'button'], 'reserved-command'],
  ]) {
    const streams = io()
    assert.equal(await run(argv, streams), 2, argv.join(' '))
    assert.match(streams.stderr.output, new RegExp(`^hozo(?: dry-fit)?: .* \\[${code}\\]\\n$`))
    assert.equal(streams.stdout.output, '', argv.join(' '))
    // With `--format json`, the same reason is on stdout for a caller that
    // reads only stdout.
    const json = io()
    await run([...argv, '--format', 'json'], json)
    assert.equal(JSON.parse(json.stdout.output).error.code, code, argv.join(' '))
  }
})

test('help and version load no command, and the binary sets the exit code', () => {
  // A resolve hook that reports any import of a command's package: `--help`
  // must not load the audit, the compiler and its addon, or navigation.
  const hook = `data:text/javascript,${encodeURIComponent(
    "import { registerHooks } from 'node:module'; registerHooks({ resolve(s, c, next) { if (/migration-audit|@hozo.(compiler|navigation)/.test(s)) process.stderr.write('loaded ' + s + '\\n'); return next(s, c) } })",
  )}`
  for (const argv of [[], ['--help'], ['--version']]) {
    const result = spawnSync(process.execPath, ['--import', hook, cli, ...argv], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stderr, '', argv.join(' '))
  }
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' })
  assert.match(help.stdout, /dry-fit .* \(alias: migration-audit\)/)
  const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' })
  assert.match(version.stdout, /^\d+\.\d+\.\d+/)
  const dryFitHelp = spawnSync(process.execPath, [cli, 'dry-fit', '--help'], { encoding: 'utf8' })
  assert.equal(dryFitHelp.status, 0)
  assert.match(dryFitHelp.stdout, /^Usage:\n {2}hozo dry-fit <checkout> \[options\]/)
  const unknown = spawnSync(process.execPath, [cli, 'squre'], { encoding: 'utf8' })
  assert.equal(unknown.status, 2)
})

// The deprecated binaries' stdout, which `hozo` must reproduce (RFC 011 §4).
const compilerDist = fileURLToPath(new URL('../../compiler/dist/manifest-cli.js', import.meta.url))
const linksDist = fileURLToPath(
  new URL('../../navigation/dist/verification-cli.js', import.meta.url),
)

test('`manifest` and `links` write what their deprecated binaries write', (t) => {
  const root = fixture(t, {
    'pkg/src/index.tsx':
      "import { Text } from '@hozo/core'\nexport const Label = () => <Text>Hi</Text>\n",
    'pkg/package.json': JSON.stringify({ exports: { '.': './src/index.tsx' } }),
    'links.json': JSON.stringify({
      outputDirectory: 'static',
      android: [
        {
          packageName: 'com.example.app',
          sha256CertFingerprints: ['0123456789abcdef'.repeat(4)],
        },
      ],
    }),
  })
  const hozo = (...argv) =>
    spawnSync(process.execPath, [cli, ...argv], { cwd: root, encoding: 'utf8' })
  const old = (file, ...argv) =>
    spawnSync(process.execPath, [file, ...argv], { cwd: root, encoding: 'utf8' })
  const notice = (name, stderr) => {
    const [first, ...rest] = stderr.split('\n')
    assert.match(first, new RegExp(`^${name} is deprecated; run \`hozo `))
    return rest.join('\n')
  }

  // Manifest: stale is 1 in both, then written, then current.
  const staleNew = hozo('manifest', 'pkg', '--check')
  const staleOld = old(compilerDist, 'pkg', '--check')
  assert.equal(staleNew.status, 1)
  assert.equal(staleOld.status, 1)
  assert.match(staleNew.stderr, /Run: hozo manifest pkg/)
  assert.match(notice('hozo-manifest', staleOld.stderr), /Run: hozo-manifest pkg/)
  assert.equal(hozo('manifest', 'pkg').status, 0)
  const current = [hozo('manifest', 'pkg', '--check'), old(compilerDist, 'pkg', '--check')]
  assert.deepEqual(
    current.map(({ status }) => status),
    [0, 0],
  )
  assert.equal(current[0].stdout, current[1].stdout)
  assert.equal(hozo('manifest', 'pkg', '--chek').status, 2)

  // Links: the same files, the same lines.
  const written = [hozo('links', '-c', 'links.json'), old(linksDist, '-c', 'links.json')]
  assert.deepEqual(
    written.map(({ status }) => status),
    [0, 0],
  )
  assert.match(written[0].stdout, /^wrote: /)
  assert.equal(written[1].stdout, written[0].stdout.replaceAll('wrote:', 'unchanged:'))
  assert.equal(notice('hozo-links', written[1].stderr), '')
  const checked = [
    hozo('links', '--check', '-c', 'links.json'),
    old(linksDist, '--check', '-c', 'links.json'),
  ]
  assert.equal(checked[0].stdout, checked[1].stdout)
  const bad = hozo('links', '-c', 'missing.json')
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /^hozo links: .* \[config-not-found\]\n$/)
})

test('`explain` reads the shipped catalog, without loading the compiler', () => {
  const catalog = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../compiler/diagnostics.json', import.meta.url)),
      'utf8',
    ),
  )
  // Any import of a command package other than the catalog file itself.
  const hook = `data:text/javascript,${encodeURIComponent(
    "import { registerHooks } from 'node:module'; registerHooks({ resolve(s, c, next) { if (/migration-audit|@hozo.navigation|@hozo.compiler(?!.diagnostics.json)/.test(s)) process.stderr.write('loaded ' + s + '\\n'); return next(s, c) } })",
  )}`
  const explain = (...argv) =>
    spawnSync(process.execPath, ['--import', hook, cli, 'explain', ...argv], { encoding: 'utf8' })

  const one = explain('aria-name-prohibited')
  assert.equal(one.status, 0, one.stderr)
  assert.equal(one.stderr, '')
  const entry = catalog.codes.ARIA_NAME_PROHIBITED
  assert.match(one.stdout, /^ARIA_NAME_PROHIBITED\n\nAn accessible name on an element/)
  assert.ok(one.stdout.includes(entry.example.jsx))
  assert.ok(one.stdout.includes(`Web and Native, warning: ${entry.emitted[0].message}`))

  const json = JSON.parse(explain('ARIA_NAME_PROHIBITED', '--format', 'json').stdout)
  assert.deepEqual(json, { code: 'ARIA_NAME_PROHIBITED', ...entry })

  const list = explain()
  assert.equal(list.status, 0)
  assert.deepEqual(
    list.stdout
      .trim()
      .split('\n')
      .map((line) => line.split(' ')[0]),
    Object.keys(catalog.codes).sort(),
  )

  const unknown = explain('ARIA_NAME', '--format', 'json')
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /Did you mean ARIA_NAME_PROHIBITED.*\[unknown-diagnostic\]\n$/)
  assert.equal(JSON.parse(unknown.stdout).error.code, 'unknown-diagnostic')
  assert.equal(explain('--verbose').status, 2)
})
