import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { type ManifestCliIO, runManifestCli } from './manifest-command.ts'

function capture() {
  const out = { log: [] as string[], error: [] as string[] }
  const io: ManifestCliIO = {
    log: (message) => out.log.push(message),
    error: (message) => out.error.push(message),
  }
  return { out, io }
}

// RFC 011 §3: `1` is a stale manifest under --check (fix the code), `2` is
// a command that could not run (fix the invocation or the package).
test('`hozo manifest` exits 0 written or current, 1 stale, 2 could not run', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hozo-manifest-command-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'pkg', 'src'), { recursive: true })
  writeFileSync(
    path.join(dir, 'pkg', 'src', 'index.tsx'),
    "import { Text } from '@hozo/core'\nexport const Label = () => <Text>Hi</Text>\n",
  )
  writeFileSync(
    path.join(dir, 'pkg', 'package.json'),
    JSON.stringify({ exports: { '.': './src/index.tsx' } }),
  )

  const stale = capture()
  assert.equal(runManifestCli(['pkg', '--check'], dir, stale.io), 1)
  assert.match(stale.out.error[0]!, /out of date\. Run: hozo manifest pkg$/)

  const written = capture()
  assert.equal(runManifestCli(['pkg'], dir, written.io), 0)
  assert.deepEqual(written.out.log, [`wrote ${path.join('pkg', 'hozo.manifest.json')}`])

  const current = capture()
  assert.equal(runManifestCli(['pkg', '--check'], dir, current.io), 0)
  assert.match(current.out.log[0]!, /is current$/)

  for (const [args, code] of [
    [['pkg', '--chek'], 'unknown-option'],
    [['pkg', '--entry'], 'missing-value'],
    [['pkg', 'other'], 'unexpected-argument'],
    [['missing'], 'invalid-package'],
  ] as const) {
    const failed = capture()
    assert.equal(runManifestCli(args, dir, failed.io), 2, args.join(' '))
    assert.match(failed.out.error[0]!, new RegExp(`^hozo manifest: .* \\[${code}\\]$`))
  }

  // The deprecated binary passes its own name, so its messages stay its own.
  const old = capture()
  assert.equal(runManifestCli(['--help'], dir, old.io, 'hozo-manifest'), 0)
  assert.match(old.out.log[0]!, /^Usage: hozo-manifest /)
})

// #2112: the public command could write only version 1, which gives an app
// no candidates from the package.
test('`hozo manifest --sources` writes version 2, with candidates from those files only', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hozo-manifest-command-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const pkg = path.join(dir, 'pkg')
  mkdirSync(path.join(pkg, 'src', 'nested'), { recursive: true })
  writeFileSync(
    path.join(pkg, 'src', 'index.tsx'),
    // A literal on a primitive compiles away; a class held as a string is
    // what a consumer's build needs a candidate for.
    "import { View } from '@hozo/core'\nconst tones = { a: 'gap-9 text-sm' }\n" +
      'export const Tag = ({ tone }) => <View className={tones[tone]} />\n' +
      "export { Note } from './nested/note'\n",
  )
  writeFileSync(
    path.join(pkg, 'src', 'nested', 'note.tsx'),
    "import { View } from '@hozo/core'\nconst pad = 'p-7'\nexport const Note = () => <View className={pad} />\n",
  )
  // Neither a test nor a declaration is the package's own styling.
  writeFileSync(path.join(pkg, 'src', 'index.test.tsx'), 'const x = "m-11"\n')
  writeFileSync(path.join(pkg, 'src', 'index.d.ts'), 'declare const y: "m-12"\n')
  writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({ exports: { '.': './src/index.tsx' } }),
  )

  const written = capture()
  assert.equal(
    runManifestCli(
      ['pkg', '--sources', 'src/**/*.tsx', '--sources', 'src/**/*.ts', '--compiled-by-consumer'],
      dir,
      written.io,
    ),
    0,
    written.out.error.join('\n'),
  )
  const manifest = JSON.parse(readFileSync(path.join(pkg, 'hozo.manifest.json'), 'utf8'))
  assert.equal(manifest.version, 2)
  assert.equal(manifest.compiledByConsumer, true)
  assert.equal(manifest.owners, null)
  for (const name of ['gap-9', 'text-sm', 'p-7'])
    assert.ok(manifest.candidates.includes(name), name)
  for (const name of ['m-11', 'm-12']) assert.ok(!manifest.candidates.includes(name), name)
  // `exports` anchors what `textForwarding` keys on, and declares no owner.
  assert.deepEqual(
    manifest.exports,
    Object.keys(manifest.textForwarding).map((name) => ({ name, owners: [] })),
  )

  // --check compares the version 2 text, and the flags are part of it.
  const current = capture()
  assert.equal(
    runManifestCli(
      [
        'pkg',
        '--check',
        '--sources',
        'src/**/*.tsx',
        '--sources',
        'src/**/*.ts',
        '--compiled-by-consumer',
      ],
      dir,
      current.io,
    ),
    0,
  )
  const withoutSources = capture()
  assert.equal(runManifestCli(['pkg', '--check'], dir, withoutSources.io), 1)

  // Built output: the same command, said of the files that are published.
  mkdirSync(path.join(pkg, 'dist'))
  writeFileSync(path.join(pkg, 'dist', 'index.js'), 'export const cls = "rounded-3xl"\n')
  const compiled = capture()
  assert.equal(runManifestCli(['pkg', '--sources', 'dist/**/*.js'], dir, compiled.io), 0)
  const fromDist = JSON.parse(readFileSync(path.join(pkg, 'hozo.manifest.json'), 'utf8'))
  assert.equal(fromDist.compiledByConsumer, false)
  assert.deepEqual(fromDist.candidates, ['rounded-3xl'])

  for (const [args, code, message] of [
    [['pkg', '--compiled-by-consumer'], 'missing-sources', /needs --sources/],
    [['pkg', '--sources'], 'missing-value', /--sources requires a glob/],
    [['pkg', '--sources', 'lib/**/*.js'], 'invalid-package', /matched no files/],
  ] as const) {
    const failed = capture()
    assert.equal(runManifestCli(args, dir, failed.io), 2, args.join(' '))
    assert.match(failed.out.error[0]!, new RegExp(`\\[${code}\\]$`))
    assert.match(failed.out.error[0]!, message)
  }
})
