import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createFontAvailability, defineFonts } from '../../typography/src/fonts.ts'
import { analyzeModule, prepareAnalysisProject } from './analysis.ts'
import {
  AnalysisFontInputError,
  readAnalysisFonts,
  validateFontAvailability,
} from './analysis-fonts.ts'
import { createCompiler } from './index.ts'

const fonts = createFontAvailability(
  defineFonts({
    body: {
      family: 'Inter',
      faces: [
        { sources: { web: [{ url: '/Inter.woff2' }], ios: 'assets/Inter.ttf' }, weight: 400 },
      ],
    },
  }),
)
const source = `// 😀 日本語\r\nimport { Text } from '@hozo/core'; import * as stylex from '@stylexjs/stylex';
const styles = stylex.create({ root: { fontFamily: 'Inter', fontWeight: 900 } });
export const App = () => <Text {...stylex.props(styles.root)}>Hello</Text>`

test('existing font facts are validated and cloned, with no platform availability inferred', () => {
  assert.deepEqual(validateFontAvailability(fonts), fonts)
  const copy = validateFontAvailability(fonts)
  assert.notEqual(copy.families[0], fonts.families[0])
  const invalid = [
    null,
    {},
    { families: 'body' },
    { families: [...fonts.families, fonts.families[0]] },
    { families: [{ ...fonts.families[0], id: 'other' }, ...fonts.families] },
    { families: [{ ...fonts.families[0], names: { web: 'Inter' } }] },
    { families: [{ ...fonts.families[0], external: ['windows'] }] },
    { families: [{ ...fonts.families[0], external: ['web', 'web'] }] },
    { families: [{ ...fonts.families[0], external: ['web'] }] },
  ]
  for (const input of invalid) assert.throws(() => validateFontAvailability(input), TypeError)
  for (const change of [
    { platforms: [] },
    { platforms: ['ios', 'ios'] },
    { platforms: ['linux'] },
    { weightFrom: 0 },
    { weightTo: 1001 },
    { weightFrom: 700, weightTo: 400 },
    { weightFrom: 400.5 },
    { style: 'typo' },
  ]) {
    assert.throws(
      () =>
        validateFontAvailability({
          families: [
            {
              ...fonts.families[0],
              faces: [{ ...fonts.families[0]!.faces[0], ...change }],
            },
          ],
        }),
      TypeError,
    )
  }
  assert.deepEqual(validateFontAvailability({ families: [] }), { families: [] })
})

test('explicit JSON reads are bounded, fresh and hashed; executable/outside input is never loaded', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-static-fonts-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'fonts.json')
  writeFileSync(file, JSON.stringify(fonts))
  const loaded = readAnalysisFonts(root, { fontAvailabilityFile: 'fonts.json' })
  assert.equal(loaded.fact.status, 'resolved')
  assert.deepEqual(loaded.inputs, [
    { file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') },
  ])
  writeFileSync(file, `${JSON.stringify(fonts)}\n`)
  assert.notEqual(
    readAnalysisFonts(root, { fontAvailabilityFile: 'fonts.json' }).inputs[0]!.sha256,
    loaded.inputs[0]!.sha256,
  )
  assert.equal(readAnalysisFonts(root, {}).fact.status, 'unresolved')
  for (const selection of ['missing.json', 'config.mjs', '../outside.json', '.', ''])
    assert.throws(
      () => readAnalysisFonts(root, { fontAvailabilityFile: selection }),
      AnalysisFontInputError,
    )
  assert.throws(
    () => readAnalysisFonts(root, { fontAvailability: fonts, fontAvailabilityFile: 'fonts.json' }),
    /not both/,
  )
  mkdirSync(path.join(root, 'real'))
  writeFileSync(path.join(root, 'real/fonts.json'), JSON.stringify(fonts))
  symlinkSync(
    path.join(root, 'real'),
    path.join(root, 'inside'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  assert.equal(
    readAnalysisFonts(root, { fontAvailabilityFile: 'inside/fonts.json' }).fact.status,
    'resolved',
  )
  symlinkSync(
    tmpdir(),
    path.join(root, 'outside'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  assert.throws(
    () => readAnalysisFonts(root, { fontAvailabilityFile: 'outside/fonts.json' }),
    /links must stay inside/,
  )
})

test('canonical font diagnostics follow requested backends and filename-selected Native platforms', () => {
  const options = { compiler: createCompiler(), file: 'App.tsx', root: '', fontAvailability: fonts }
  const web = analyzeModule(source, { ...options, targets: ['web'] })
  assert.equal(web.findings.length, 1)
  assert.equal(web.findings[0]!.code, 'FONT_VARIANT_NOT_REGISTERED')
  assert.equal(web.findings[0]!.stage, 'fonts')
  assert.equal(web.findings[0]!.location.status, 'authored')
  assert.match(web.findings[0]!.message, /web face/)
  const ios = analyzeModule(source, { ...options, targets: ['native'], file: 'App.ios.tsx' })
  assert.equal(ios.findings.length, 1)
  assert.match(ios.findings[0]!.message, /ios face/)
  const android = analyzeModule(source, { ...options, targets: ['native'] })
  assert.equal(android.findings.length, 1)
  assert.equal(android.findings[0]!.code, 'FONT_FAMILY_NOT_REGISTERED')
  assert.match(android.findings[0]!.message, /no android source/)
  const both = analyzeModule(source, {
    ...options,
    targets: ['web', 'native'],
    nativePlatform: 'ios',
  })
  assert.equal(
    both.findings.length,
    2,
    'one actual finding per selected backend, not both Native platforms',
  )
  const external = validateFontAvailability({
    families: [{ ...fonts.families[0], faces: [], external: ['web', 'ios', 'android'] }],
  })
  assert.deepEqual(
    analyzeModule(source, { ...options, fontAvailability: external, targets: ['web', 'native'] })
      .findings,
    [],
  )
  assert.deepEqual(
    analyzeModule(source, { ...options, fontAvailability: undefined, targets: ['web', 'native'] })
      .findings,
    [],
  )
})

test('project preparation retains explicit font facts once without executing registration code', async () => {
  const context = await prepareAnalysisProject(
    {
      root: '/project',
      authoredSources: [{ file: '/project/App.tsx', source }],
      fontAvailability: fonts,
    },
    async () => ({
      css: { status: 'absent', reason: 'no CSS' },
      theme: { status: 'absent', reason: 'no CSS' },
      stylesheets: [],
    }),
  )
  assert.equal(context.projectFacts.fonts.status, 'resolved')
  assert.deepEqual(context.compilerInputs.fontAvailability, fonts)
  assert.deepEqual(context.fontInputs, [])
  assert.notEqual(context.compilerInputs.fontAvailability, fonts)
})

test('font finding coordinates are honest after module rewriting and absent from unrelated families', () => {
  const rewritten = `import { Platform } from 'react-native'; export const os = Platform.OS;\n${source}`
  const result = analyzeModule(rewritten, {
    compiler: createCompiler(),
    file: 'App.tsx',
    root: '',
    fontAvailability: fonts,
    nativePlatform: 'ios',
    targets: ['web', 'native'],
  })
  const findings = result.findings.filter(({ code }) => code.startsWith('FONT_'))
  assert.equal(findings.length, 2)
  assert.equal(findings.find(({ backend }) => backend === 'web')!.location.status, 'unmapped')
  assert.equal(findings.find(({ backend }) => backend === 'native')!.location.status, 'authored')
  const unknown = analyzeModule(source.replaceAll("'Inter'", "'Other'"), {
    compiler: createCompiler(),
    file: 'App.tsx',
    root: '',
    fontAvailability: fonts,
    targets: ['web', 'native'],
  })
  assert.ok(!unknown.findings.some(({ code }) => code.startsWith('FONT_')))
})
