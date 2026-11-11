import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
