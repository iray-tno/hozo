import assert from 'node:assert/strict'
import { test } from 'node:test'

import { transformSync } from '@babel/core'
import stylexPlugin from '@stylexjs/babel-plugin'

import { createCompiler } from './index.ts'
import { lowerModule } from './lower.ts'

/** Every test names its files relative to this, as a project does. */
const ROOT = ''

const filename = '/app/Card.tsx'
const compiler = createCompiler()
const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'

const styles = stylex.create({
  root: { color: 'red' },
})

export function Card() {
  return <View className="p-4" {...stylex.props(styles.root)}>Card</View>
}
`

function officialStylex(code: string): string {
  const result = transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  assert.ok(result?.code)
  return result.code
}

test('StyleX before Hozo cannot preserve JSX last-wins styling semantics', () => {
  const stylexFirst = officialStylex(source)
  assert.match(stylexFirst, /className="p-4" className="[^" ]+"/)

  const hozoSecond = lowerModule(stylexFirst, filename, filename, compiler, ROOT)
  assert.ok(hozoSecond)

  // The source JSX says the second className replaces the first. Once both
  // are just attributes, however, Hozo compiles its known Tailwind class and
  // carries StyleX's hash beside it. The result now applies both styles and
  // is therefore deterministic but not the program React would have rendered
  // without Hozo.
  assert.match(hozoSecond.css, /padding-top: 16px/)
  assert.match(hozoSecond.code, /className="hozo-view hozo-[a-z0-9]+-r0-0 [^" ]+"/)
})

test('Hozo before StyleX consumes the spread and is the safe ordering', () => {
  const hozoFirst = lowerModule(source, filename, filename, compiler, ROOT)
  assert.ok(hozoFirst)
  const stylexSecond = officialStylex(hozoFirst.code)

  // Hozo reads the same-file static StyleX value into IR and removes the
  // spread from its JSX. The official compiler then sees an unused create,
  // eliminates it, and has no second className left to overwrite Hozo.
  assert.match(stylexSecond, /className="hozo-view hozo-[a-z0-9]+-r0-0"/)
  assert.doesNotMatch(stylexSecond, /stylex\.props|className="[^"]+" className=/)
  assert.match(hozoFirst.css, /padding-top: 16px/)
  assert.match(hozoFirst.css, /color: red/)
})

test('a mixed rule gives the official transform only its residual declarations', () => {
  const mixed = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'

const styles = stylex.create({
  root: { padding: 16, scrollbarColor: 'red blue' },
})

export const Card = () => <View {...stylex.props(styles.root)} />
`
  const hozoFirst = lowerModule(mixed, filename, filename, compiler, ROOT)
  assert.ok(hozoFirst)
  assert.match(hozoFirst.css, /padding-top: 16px/)
  assert.match(hozoFirst.code, /__hozo0: \{ scrollbarColor: 'red blue' \}/)
  assert.doesNotMatch(hozoFirst.code, /className=.*styles\.root/)

  const stylexSecond = officialStylex(hozoFirst.code)
  assert.match(stylexSecond, /const _styles = \{\s+__hozo0:/)
  assert.match(stylexSecond, /stylex\.props\(_styles\.__hozo0\)\.className/)
  assert.doesNotMatch(stylexSecond, /root:|padding: 16/)
  assert.doesNotMatch(stylexSecond, /className="[^"]+" className=/)
})
