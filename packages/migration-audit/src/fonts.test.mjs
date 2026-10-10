import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createFontAvailability } from '../../typography/src/fonts.ts'
import {
  AuditInputError,
  compareReports,
  measureRealApp,
  renderRealAppMarkdown,
  runCli,
} from './index.mjs'

const fonts = createFontAvailability({
  body: {
    family: 'Inter',
    faces: [
      {
        sources: {
          web: [{ url: 'https://invalid.example/never-fetch.woff2' }],
          ios: 'assets/not-installed.ttf',
        },
        weight: 400,
      },
    ],
  },
})
const source = `import { Text } from '@hozo/core'; import * as stylex from '@stylexjs/stylex';
const styles = stylex.create({ root: { fontFamily: 'Inter', fontWeight: 900 } });
export const App = () => <Text {...stylex.props(styles.root)}>Hello</Text>`
const stdout = { write() {} }
function fixture(t, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-audit-fonts-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [file, content] of Object.entries(files)) {
    const destination = path.join(root, file)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, content)
  }
  return root
}
function snapshot(root) {
  const records = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile())
        records.push([path.relative(root, file), readFileSync(file).toString('base64')])
    }
  }
  // Windows recursive readdir can follow a junction. The evidence walk must
  // not escape the fixture or loop through the deliberately hostile link.
  visit(root)
  return records.sort(([a], [b]) => a.localeCompare(b))
}

test('CLI/static library font inputs use shared diagnostics and remain byte-for-byte read-only', async (t) => {
  const root = fixture(t, {
    'src/App.tsx': source,
    'fonts.json': JSON.stringify(fonts),
    'app.config.js': `throw new Error('must never run')`,
    'package.json': JSON.stringify({ scripts: { build: 'throw sentinel' } }),
    'pnpm-lock.yaml': 'lockfileVersion: 9.0',
  })
  const before = snapshot(root)
  const report = await runCli(
    [root, '--font-availability', 'fonts.json', '--native-platform', 'ios'],
    { stdout },
  )
  assert.equal(report.analysis.projectFacts.fonts.status, 'resolved')
  assert.equal(report.analysis.projectFacts.fonts.origin, 'explicit')
  assert.deepEqual(report.analysis.projectFacts.fonts.value, fonts)
  assert.equal(report.scope.authoredFiles, 1)
  assert.equal(report.scope.contextModules, 0)
  assert.equal(report.analysis.fontInputs[0].file, 'fonts.json')
  assert.match(report.analysis.fontInputs[0].sha256, /^[a-f0-9]{64}$/)
  assert.equal(report.diagnostics.byCode.FONT_VARIANT_NOT_REGISTERED, 2)
  assert.ok(
    report.findings.every(
      ({ stage, location }) => stage === 'fonts' && location.status === 'authored',
    ),
  )
  assert.ok(report.analysis.stageDurationMs['web:fonts'] >= 0)
  assert.ok(report.analysis.stageDurationMs['native:fonts'] >= 0)
  assert.ok(!report.findings.some(({ message }) => message.includes('android')))
  const markdown = renderRealAppMarkdown(report, { details: true })
  assert.match(markdown, /Static font registration/)
  assert.match(markdown, /No font assets are opened/)
  assert.match(markdown, /FONT\\_VARIANT\\_NOT\\_REGISTERED/)
  const direct = await measureRealApp({ root, nativePlatform: 'ios', fontAvailability: fonts })
  assert.deepEqual(direct.findings, report.findings)
  assert.deepEqual(direct.analysis.fontInputs, [])
  assert.deepEqual(
    snapshot(root),
    before,
    'no font asset reads/registration/build/cache/checkout writes',
  )
})

test('unsupplied fonts stay unknown; external and unlisted families do not acquire unsupported verdicts', async (t) => {
  const root = fixture(t, {
    'src/App.tsx': source,
    'global.css': '@font-face { font-family: "Inter"; src: url("/not-installed.woff2"); }',
  })
  const unknown = await measureRealApp({ root })
  assert.equal(unknown.analysis.projectFacts.fonts.status, 'unresolved')
  assert.ok(!unknown.findings.some(({ code }) => code.startsWith('FONT_')))
  const external = {
    families: [{ ...fonts.families[0], external: ['web', 'ios', 'android'], faces: [] }],
  }
  const report = await measureRealApp({ root, fontAvailability: external })
  assert.ok(!report.findings.some(({ code }) => code.startsWith('FONT_')))
  const unlisted = {
    families: [{ ...fonts.families[0], names: { web: 'Other', ios: 'Other', android: 'Other' } }],
  }
  assert.ok(
    !(await measureRealApp({ root, fontAvailability: unlisted })).findings.some(({ code }) =>
      code.startsWith('FONT_'),
    ),
  )
})

test('font facts, input hashes and policy changes invalidate baseline/CI rather than resolving warnings', async (t) => {
  const root = fixture(t, { 'src/App.tsx': source, 'fonts.json': JSON.stringify(fonts) })
  const before = await measureRealApp({ root, fontAvailabilityFile: 'fonts.json' })
  const file = path.join(root, 'baseline.json')
  writeFileSync(file, JSON.stringify(before))
  const args = [
    root,
    '--font-availability',
    'fonts.json',
    '--compare',
    file,
    '--fail-on',
    'new-errors',
  ]
  const same = await runCli(args, { stdout })
  assert.equal(same.comparison.status, 'comparable')
  assert.equal(same.comparison.findings.continued.length, before.findings.length)
  assert.equal(same.failurePolicy.status, 'passed')
  writeFileSync(path.join(root, 'fonts.json'), `${JSON.stringify(fonts)}\n`)
  const edited = await runCli(args, { stdout })
  assert.equal(edited.comparison.status, 'not-comparable')
  assert.equal(edited.failurePolicy.status, 'blocked')
  assert.equal(edited.comparison.findings.resolved.length, 0)
  const supplied = await measureRealApp({ root, fontAvailability: fonts })
  const changed = structuredClone(fonts)
  changed.families[0].faces[0].weightTo = 1000
  const different = await measureRealApp({ root, fontAvailability: changed })
  assert.equal(compareReports(different, supplied).status, 'not-comparable')
  assert.equal(compareReports(supplied, await measureRealApp({ root })).status, 'not-comparable')
  const legacy = structuredClone(before)
  delete legacy.analysis.fontAnalysisPolicy
  delete legacy.analysis.fontInputs
  assert.equal(compareReports(before, legacy).status, 'not-comparable')
  legacy.analysis.fontAnalysisPolicy = 'unknown-future-font-policy'
  assert.notEqual(compareReports(legacy, legacy).status, 'comparable')
  const malformed = structuredClone(before)
  malformed.analysis.projectFacts.fonts.value = { families: [null] }
  writeFileSync(file, JSON.stringify(malformed))
  await assert.rejects(() => runCli(args, { stdout }), AuditInputError)
})

test('explicit missing/malformed/executable/outside font data fails concisely before output, never executes', async (t) => {
  const root = fixture(t, {
    'src/App.tsx': source,
    'broken.json': '{',
    'wrong.json': JSON.stringify({ body: { family: 'Inter' } }),
    'fonts.mjs': `import { writeFileSync } from 'node:fs'; writeFileSync('executed', 'bad'); throw new Error('must never execute')`,
  })
  const outside = mkdtempSync(path.join(tmpdir(), 'hozo-audit-font-outside-'))
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  const before = snapshot(root)
  for (const fontAvailabilityFile of [
    'missing.json',
    'broken.json',
    'wrong.json',
    'fonts.mjs',
    '../outside.json',
    'linked/font.json',
    '',
  ]) {
    await assert.rejects(
      () =>
        runCli(
          [
            root,
            '--font-availability',
            fontAvailabilityFile,
            '--output',
            path.join(root, 'report.json'),
          ],
          { stdout },
        ),
      AuditInputError,
    )
  }
  await assert.rejects(
    () => measureRealApp({ root, fontAvailability: { families: [null] } }),
    AuditInputError,
  )
  await assert.rejects(
    () => measureRealApp({ root, fontAvailabilityFile: 'missing.json', fontAvailability: fonts }),
    /not both/,
  )
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url))
  const executable = spawnSync(process.execPath, [cli, root, '--font-availability', 'fonts.mjs'], {
    encoding: 'utf8',
    cwd: root,
  })
  assert.equal(executable.status, 1)
  assert.match(
    executable.stderr,
    /^hozo-migration-audit: Cannot assess explicit font availability:/,
  )
  assert.doesNotMatch(executable.stderr, /\n\s+at /)
  assert.deepEqual(snapshot(root), before)
})
