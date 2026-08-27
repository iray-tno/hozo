import assert from 'node:assert/strict'
import { test } from 'node:test'

import { transformSync } from '@babel/core'
import stylexPlugin from '@stylexjs/babel-plugin'

import { compile, compileNative } from './index.ts'

const source = `import * as stylex from '@stylexjs/stylex'
import { View, Text } from '@hozo/core'

const styles = stylex.create({
  root: {
    padding: 16,
    backgroundColor: '#ff0000',
    flexDirection: 'row',
  },
  selected: {
    opacity: 0.5,
  },
})

export function Card({ selected }: { selected: boolean }) {
  return (
    <View className="m-2" {...stylex.props(styles.root, selected && styles.selected)}>
      <Text>Card</Text>
    </View>
  )
}
`

test('same-file static StyleX joins Tailwind in the Web IR', () => {
  const component = compile(source)[0]
  assert.ok(component)
  assert.doesNotMatch(component.jsx, /stylex\.props/)
  assert.match(component.jsx, /data-hozo-cond-/)
  assert.match(component.css, /margin-top: 8px/)
  assert.match(component.css, /padding-top: 16px/)
  assert.match(component.css, /background-color: #ff0000/)
  assert.match(component.css, /flex-direction: row/)
  assert.match(component.css, /opacity: 0.5/)
})

test('the same StyleX IR lowers to React Native StyleSheet entries', () => {
  const component = compileNative(source)[0]
  assert.ok(component)
  assert.doesNotMatch(component.jsx, /stylex\.props/)
  assert.match(component.jsx, /selected\) && hozoStyles\.hozo0_cond_/)
  assert.match(component.styles, /marginTop: 8/)
  assert.match(component.styles, /paddingTop: 16/)
  assert.match(component.styles, /backgroundColor: '#ff0000'/)
  assert.match(component.styles, /flexDirection: 'row'/)
  assert.match(component.styles, /opacity: 0.5/)
})

test('unsupported StyleX remains available to the official compiler and is named', () => {
  const unsupported = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ root: { transform: 'rotate(10deg)' } })
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const component = compile(unsupported)[0]
  assert.ok(component)
  assert.match(component.jsx, /\.\.\.stylex\.props\(styles\.root\)/)
  assert.equal(component.diagnostics[0]?.code, 'STYLEX_NOT_LOWERED')
})

function declarationMap(declarations: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const declaration of declarations) {
    const split = declaration.indexOf(':')
    const property = declaration.slice(0, split).trim()
    let value = declaration.slice(split + 1).trim()
    value = value.replace(/^(-?)\.(\d)/, (_match, sign: string, digit: string) => `${sign}0.${digit}`)
    const expanded =
      property === 'padding'
        ? ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']
        : property === 'border-radius'
          ? [
              'border-top-left-radius',
              'border-top-right-radius',
              'border-bottom-right-radius',
              'border-bottom-left-radius',
            ]
          : [property]
    for (const name of expanded) result.set(name, value)
  }
  return result
}

test('the supported static property slice agrees with the official StyleX CSS oracle', () => {
  const oracleSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginTop: -2,
    gap: 12,
    width: 240,
    minHeight: 48,
    top: 4,
    backgroundColor: '#ff0000',
    color: '#ffffff',
    opacity: 0.5,
    zIndex: 2,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.5,
    letterSpacing: 0.25,
    overflow: 'hidden',
    textAlign: 'center',
  },
})
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const official = transformSync(oracleSource, {
    filename: '/app/Oracle.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as {
    stylex?: [string, { ltr: string }, number][]
  }
  const officialDeclarations = (metadata.stylex ?? []).map(([, css]) => {
    const body = css.ltr.slice(css.ltr.indexOf('{') + 1, -1)
    return body
  })

  const web = compile(oracleSource)[0]
  assert.ok(web)
  const rule = web.css.match(/\.hozo-0 \{\n([\s\S]*?)\n\}/)?.[1]
  assert.ok(rule)
  const hozoDeclarations = rule
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean)

  assert.deepEqual(
    Object.fromEntries(declarationMap(hozoDeclarations)),
    Object.fromEntries(declarationMap(officialDeclarations)),
  )
})
