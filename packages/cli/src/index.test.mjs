import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  // must not load the audit, and with it the compiler addon.
  const hook = `data:text/javascript,${encodeURIComponent(
    "import { registerHooks } from 'node:module'; registerHooks({ resolve(s, c, next) { if (s.includes('migration-audit')) process.stderr.write('loaded ' + s + '\\n'); return next(s, c) } })",
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
