import assert from 'node:assert/strict'
import test from 'node:test'

import { diagnoseStaticFonts, type FontAvailability } from './font-diagnostics.ts'
import { createCompiler } from './index.ts'

const fonts: FontAvailability = {
  families: [
    {
      id: 'body',
      names: { web: 'Inter', ios: 'InterVariable', android: 'inter' },
      external: [],
      faces: [
        { platforms: ['web', 'ios', 'android'], weightFrom: 400, weightTo: 400, style: 'normal' },
        { platforms: ['web'], weightFrom: 700, weightTo: 700, style: 'italic' },
      ],
    },
  ],
}

test('reports only definite managed-family gaps on Web', () => {
  const output = `
.hz0 {
  font-family: "Inter";
  font-weight: 700;
  font-style: normal;
}
.hz1 { font-family: system-ui; font-weight: 900; }
`
  const diagnostics = diagnoseStaticFonts(output, 'web', fonts, 3, 9)
  assert.deepEqual(
    diagnostics.map(({ code }) => code),
    ['FONT_VARIANT_NOT_REGISTERED'],
  )
  assert.equal(diagnostics[0]?.spanStart, 3)
  assert.match(diagnostics[0]?.message ?? '', /weight 700 and normal/)
})

test('reports platform-specific Native registration and variant gaps', () => {
  const output = `{
  hz0: {
    fontFamily: 'InterVariable',
    fontWeight: '700',
  },
  hz1: {
    fontFamily: 'inter',
    fontWeight: '400',
  },
}`
  const diagnostics = diagnoseStaticFonts(output, 'native', fonts, 0, 10)
  assert.equal(diagnostics.length, 1)
  assert.equal(diagnostics[0]?.code, 'FONT_VARIANT_NOT_REGISTERED')
  assert.match(diagnostics[0]?.message ?? '', /iOS face for weight 700/i)
})

test('skips external platforms and declarations without a known static family', () => {
  const external: FontAvailability = {
    families: [{ ...fonts.families[0]!, external: ['web'] }],
  }
  assert.deepEqual(
    diagnoseStaticFonts(
      '.hz0 {\n  font-family: "Inter";\n  font-weight: 900;\n}',
      'web',
      external,
      0,
      1,
    ),
    [],
  )
  assert.deepEqual(
    diagnoseStaticFonts(
      '.hz0 {\n  font-family: "Unknown";\n  font-weight: 900;\n}',
      'web',
      fonts,
      0,
      1,
    ),
    [],
  )
})

test('createCompiler appends diagnostics to real Web and Native lowering', () => {
  const sharedNames: FontAvailability = {
    families: [{ ...fonts.families[0]!, names: { web: 'Inter', ios: 'Inter', android: 'Inter' } }],
  }
  const source = `
    import { Text } from '@hozo/core'
    import * as stylex from '@stylexjs/stylex'
    const styles = stylex.create({ root: { fontFamily: 'Inter', fontWeight: 900 } })
    export function App() { return <Text {...stylex.props(styles.root)}>Hello</Text> }
  `
  const compiler = createCompiler(undefined, undefined, sharedNames)

  const web = compiler.compile(source)[0]!
  assert.equal(
    web.diagnostics[0]?.code,
    'FONT_VARIANT_NOT_REGISTERED',
    JSON.stringify(web, null, 2),
  )
  assert.equal(
    compiler
      .compileNative(source)[0]
      ?.diagnostics.filter(({ code }) => code === 'FONT_VARIANT_NOT_REGISTERED').length,
    2,
  )
})
